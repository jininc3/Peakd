/**
 * Triggered when `users/{uid}/gameStats/{game}` is written.
 *
 * Checks mutual leaderboard for: rival, dethrone, untouchable
 *
 * This runs alongside onRankChange but focuses on relative position
 * among mutual followers rather than the user's own rank.
 */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { db, grantBadge, rankScore } from "./helpers";

interface LeaderboardEntry {
  userId: string;
  rank: string | undefined;
  points: number;
  score: number;
}

async function getMutualIds(userId: string): Promise<string[]> {
  const [followersSnap, followingSnap] = await Promise.all([
    db.collection(`users/${userId}/followers`).get(),
    db.collection(`users/${userId}/following`).get(),
  ]);
  const followers = new Set(followersSnap.docs.map((d) => d.id));
  return followingSnap.docs.map((d) => d.id).filter((id) => followers.has(id));
}

async function buildLeaderboard(
  userIds: string[],
  game: "valorant" | "league"
): Promise<LeaderboardEntry[]> {
  const entries: LeaderboardEntry[] = [];

  await Promise.all(
    userIds.map(async (uid) => {
      const statsSnap = await db.doc(`users/${uid}/gameStats/${game}`).get();
      let rank: string | undefined;
      let points = 0;

      if (statsSnap.exists) {
        const data = statsSnap.data()!;
        rank = data.currentRank;
        points = data.lp ?? data.rr ?? 0;
      } else {
        // Fallback to user doc
        const userSnap = await db.doc(`users/${uid}`).get();
        if (!userSnap.exists) return;
        const u = userSnap.data()!;
        if (game === "valorant") {
          rank = u.valorantStats?.currentRank;
          points = u.valorantStats?.rankRating ?? 0;
        } else {
          const rs = u.riotStats?.rankedSolo;
          if (rs?.tier) {
            rank = `${rs.tier}${rs.rank ? " " + rs.rank : ""}`;
            points = rs.leaguePoints ?? 0;
          }
        }
      }

      entries.push({
        userId: uid,
        rank,
        points,
        score: rankScore(game, rank, points),
      });
    })
  );

  entries.sort((a, b) => b.score - a.score);
  return entries;
}

export const onLeaderboardChange = onDocumentWritten(
  "users/{uid}/gameStats/{game}",
  async (event) => {
    const uid = event.params.uid;
    const game = event.params.game as "valorant" | "league";
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;

    const mutualIds = await getMutualIds(uid);
    if (mutualIds.length === 0) return;

    const allIds = [uid, ...mutualIds];

    // Build current leaderboard
    const board = await buildLeaderboard(allIds, game);
    const myIndex = board.findIndex((e) => e.userId === uid);
    if (myIndex < 0) return;

    const myPosition = myIndex + 1; // 1-based
    const prevScore = rankScore(game, before?.currentRank, before?.lp ?? before?.rr ?? 0);
    const currScore = board[myIndex].score;

    // ── rival: overtake someone (score improved and position is better than it would have been) ──
    if (currScore > prevScore && myPosition < board.length) {
      // Check if anyone who was ahead is now behind
      const belowMe = board.slice(myIndex + 1);
      const overtook = belowMe.some((e) => e.score < currScore && e.score >= prevScore);
      if (overtook) {
        await grantBadge(uid, "rival", game);
      }
    }

    // ── dethrone: take #1 from someone else ──
    if (myPosition === 1 && board.length >= 2) {
      // We're #1 now. Were we #1 before?
      // If our previous score was less than whoever is now #2, we just took #1
      const secondPlace = board[1];
      if (prevScore <= secondPlace.score) {
        await grantBadge(uid, "dethrone", game);
      }
    }

    // ── untouchable: hold #1 for 7 consecutive days ──
    if (myPosition === 1) {
      const metaRef = db.doc(`users/${uid}/badgeMeta/leaderboard_${game}`);
      const metaSnap = await metaRef.get();
      const now = Date.now();

      if (metaSnap.exists) {
        const data = metaSnap.data()!;
        const firstAt: number = data.firstAtTopMs ?? now;
        const daysDiff = (now - firstAt) / (1000 * 60 * 60 * 24);
        if (daysDiff >= 7) {
          await grantBadge(uid, "untouchable", game);
        }
        // Update last checked timestamp
        await metaRef.update({ lastCheckedMs: now });
      } else {
        await metaRef.set({ firstAtTopMs: now, lastCheckedMs: now });
      }
    } else {
      // Not #1 — reset the counter
      const metaRef = db.doc(`users/${uid}/badgeMeta/leaderboard_${game}`);
      await metaRef.delete().catch(() => {});
    }
  }
);
