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
      await grantBadge(uid, "first_blood", game);
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
      await grantBadge(uid, "win_streak", game);
    }
    if (lossStreak >= 5) {
      await grantBadge(uid, "loss_streak", game);
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
        await grantBadge(uid, "new_heights", game);
      }
    }

    // ── tier_breaker: break into a new tier ──
    if (prevRank && currentRank) {
      const prevTier = parseTier(prevRank);
      const currentTier = parseTier(currentRank);
      if (prevTier && currentTier && prevTier !== currentTier && currentScore > prevScore) {
        await grantBadge(uid, "tier_breaker", game);
      }
    }

    // ── Rank-tier ladder: grant every tier badge at or below the current
    //    tier. grantBadge() is idempotent, so this is safe to re-run on
    //    every rank change (including the very first write on link) —
    //    a Challenger linking for the first time gets the Challenger-level
    //    badge (top_1_percent) plus every lower tier they've genuinely
    //    already surpassed, all in one pass. ──
    const currentTierValue = tierValue(game, currentRank);
    for (const { badgeId, minTierValue } of RANK_TIER_LADDER) {
      if (currentTierValue >= minTierValue) {
        await grantBadge(uid, badgeId, game);
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
        // 2 full rank divisions = 2000 in our scoring (each div = 1000)
        if (newScore - oldScore >= 2000) {
          await grantBadge(uid, "hot_streak", game);
        }
      }
    }
  }
);
