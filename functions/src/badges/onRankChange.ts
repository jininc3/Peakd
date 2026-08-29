/**
 * Triggered when `users/{uid}/gameStats/{game}` is written.
 *
 * Checks for: first_blood, win_streak, loss_streak, new_heights,
 * tier_breaker, the rank-tier ladder (bronze_tier ... top_1_percent),
 * hot_streak.
 */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import {
  db,
  grantBadge,
  parseTier,
  rankScore,
  tierValue,
} from "./helpers";
import { RANK_TIER_LADDER } from "./badgeLadder";
import * as admin from "firebase-admin";

/**
 * Mirror the baseline onto the public users/{uid} doc.
 *
 * The authoritative copy at users/{uid}/badgeMeta/baseline_{game} has no
 * Firestore rules match, so the client cannot read it — that doc is this
 * function's grant gate and nothing else. The client needs the same numbers to
 * render the earned/verified split (including on logged-out profiles), and
 * users/{uid} is already `allow read: if true`, so it goes there too.
 *
 * That copy is display-only and user-writable: never gate a grant on it.
 */
async function writeBaselineMirror(
  uid: string,
  game: "valorant" | "league",
  tierValueNum: number,
  rank: string,
  score: number
): Promise<void> {
  await db.doc(`users/${uid}`).set(
    {
      badgeBaselines: {
        [game]: {
          tierValue: tierValueNum,
          rank,
          rankScore: score,
          at: admin.firestore.Timestamp.now(),
        },
      },
    },
    { merge: true }
  );
}

/**
 * Highest baseline tier across every game, for gating the shared ladder.
 *
 * Tier badges are one-per-user rather than per-game, so the bar for "did they
 * climb this here" has to be the best rank they arrived with in ANY game.
 */
async function highestBaselineTier(uid: string, fallback: number): Promise<number> {
  let best = fallback;
  for (const g of ["valorant", "league"] as const) {
    const snap = await db.doc(`users/${uid}/badgeMeta/baseline_${g}`).get();
    const tv: number = snap.exists ? (snap.data()?.tierValue ?? -1) : -1;
    if (tv > best) best = tv;
  }
  return best;
}

export const onRankChange = onDocumentWritten(
  "users/{uid}/gameStats/{game}",
  async (event) => {
    const uid = event.params.uid;
    const game = event.params.game as "valorant" | "league";
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();
    if (!after) return;

    const currentRank: string | undefined = after.currentRank;
    const prevRank: string | undefined = before?.currentRank;
    const wins: number = after.wins ?? 0;
    const losses: number = after.losses ?? 0;
    const prevWins: number = before?.wins ?? 0;
    const prevLosses: number = before?.losses ?? 0;
    const points: number = after.lp ?? after.rr ?? 0;
    const prevPoints: number = before?.lp ?? before?.rr ?? 0;

    // ── first_blood: first ranked win after linking ──
    if (wins > 0 && prevWins === 0) {
      await grantBadge(uid, "first_blood", game, game);
    }

    // ── win_streak / loss_streak: 5 consecutive wins or losses ──
    // We track streaks via a helper subcollection doc
    const streakRef = db.doc(`users/${uid}/badgeMeta/streak_${game}`);
    const streakSnap = await streakRef.get();
    const streakData = streakSnap.exists ? streakSnap.data()! : { winStreak: 0, lossStreak: 0 };

    let winStreak = streakData.winStreak ?? 0;
    let lossStreak = streakData.lossStreak ?? 0;

    const winsGained = wins - prevWins;
    const lossesGained = losses - prevLosses;

    if (winsGained > 0 && lossesGained === 0) {
      winStreak += winsGained;
      lossStreak = 0;
    } else if (lossesGained > 0 && winsGained === 0) {
      lossStreak += lossesGained;
      winStreak = 0;
    } else {
      // Mixed results — reset both
      winStreak = 0;
      lossStreak = 0;
    }

    await streakRef.set({ winStreak, lossStreak }, { merge: true });

    if (winStreak >= 5) {
      await grantBadge(uid, "win_streak", game, game);
    }
    if (lossStreak >= 5) {
      await grantBadge(uid, "loss_streak", game, game);
    }

    if (!currentRank) return;

    const currentScore = rankScore(game, currentRank, points);
    const prevScore = rankScore(game, prevRank, prevPoints);

    // ── new_heights: new all-time peak rank ──
    const peakRef = db.doc(`users/${uid}/badgeMeta/peak_${game}`);
    const peakSnap = await peakRef.get();
    const prevPeak: number = peakSnap.exists ? (peakSnap.data()!.peakScore ?? 0) : 0;

    if (currentScore > prevPeak) {
      await peakRef.set({ peakScore: currentScore, peakRank: currentRank });
      // Only grant if this isn't the first time we've recorded a rank
      if (prevPeak > 0) {
        await grantBadge(uid, "new_heights", game, game);
      }
    }

    // ── tier_breaker: break into a new tier ──
    if (prevRank && currentRank) {
      const prevTier = parseTier(prevRank);
      const currentTier = parseTier(currentRank);
      if (prevTier && currentTier && prevTier !== currentTier && currentScore > prevScore) {
        await grantBadge(uid, "tier_breaker", game, game);
      }
    }

    // ── Rank-tier ladder, gated on the baseline ──
    //
    // Previously this granted every tier at or below the current one on the
    // first write, so a Radiant linking for the first time instantly "earned"
    // Bronze through Immortal. Nothing was achieved: the badges described a
    // state they already had. A badge for state is a label; a badge for a
    // transition we witnessed is an achievement.
    //
    // So: the first rank we ever see for a game is recorded as the baseline
    // and grants nothing. After that, a tier badge is granted only when the
    // player climbs ABOVE that baseline — something they did here. Tiers at or
    // below it are rendered client-side as "verified standing" from this same
    // baseline, so they stay visible on the profile without being claimed as
    // achievements, and no badge doc is written for them.
    //
    // This generalises the guard new_heights already uses above (prevPeak > 0).
    const currentTierValue = tierValue(game, currentRank);
    const baselineRef = db.doc(`users/${uid}/badgeMeta/baseline_${game}`);
    const baselineSnap = await baselineRef.get();

    if (!baselineSnap.exists) {
      // First rank on record for this game — imported standing, not a climb.
      await baselineRef.set({
        tierValue: currentTierValue,
        rankScore: currentScore,
        rank: currentRank,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
      await writeBaselineMirror(uid, game, currentTierValue, currentRank, currentScore);
    } else {
      const stored = baselineSnap.data() ?? {};
      const storedTier: number = stored.tierValue ?? -1;

      // Ladder badges are shared across games, so gate on the HIGHEST baseline
      // of any game. Otherwise a League Gold player who later links Valorant
      // Diamond would retro-earn Platinum as if they had climbed it here.
      const baseTier = await highestBaselineTier(uid, storedTier);

      for (const { badgeId, minTierValue } of RANK_TIER_LADDER) {
        if (currentTierValue >= minTierValue && minTierValue > baseTier) {
          await grantBadge(uid, badgeId, game, game);
        }
      }
    }

    // ── hot_streak: climb 2+ ranks in a single week ──
    // Check rank history from last 7 days
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const historySnap = await db
      .collection(`users/${uid}/rankHistory`)
      .where("game", "==", game)
      .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(oneWeekAgo))
      .orderBy("timestamp", "asc")
      .get();

    if (!historySnap.empty) {
      const entries = historySnap.docs.map((d) => d.data());
      const oldestRank = entries[0]?.rank as string | undefined;
      if (oldestRank && currentRank) {
        const oldScore = rankScore(game, oldestRank, 0);
        const newScore = rankScore(game, currentRank, 0);
        // rankScore packs as tier*10000 + division*1000 + points, so 2000 is
        // two DIVISIONS, not the two full ranks the badge promises ("climb 2+
        // ranks in a single week"). A division jump is common in a week; a
        // two-tier jump is the achievement. 2 tiers = 20000.
        if (newScore - oldScore >= 20000) {
          await grantBadge(uid, "hot_streak", game, game);
        }
      }
    }
  }
);
