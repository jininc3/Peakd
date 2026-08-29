import * as admin from "firebase-admin";
import {db} from "./db";

export {db};

type BadgeId = string;

/**
 * Grant a badge idempotently — skips if already earned.
 *
 * Returns true only on a FIRST grant, so callers can treat it as "this is new"
 * (notifications, etc). Re-granting an existing badge in a different game is
 * not new: it adds that game to `games` and still returns false.
 *
 * `games` exists so a badge earned in a second game stays visible. Badge docs
 * are keyed by badgeId alone, so Valorant Gold and League Gold share one doc;
 * without this the second climb would be silently swallowed. The client renders
 * the array as game pips, falling back to `context` for docs written before
 * this field existed.
 */
export async function grantBadge(
  userId: string,
  badgeId: BadgeId,
  context?: string,
  game?: "valorant" | "league"
): Promise<boolean> {
  const ref = db.doc(`users/${userId}/badges/${badgeId}`);
  const snap = await ref.get();

  if (snap.exists) {
    // Already held — record the additional game, but this is not a new badge.
    if (game && !(snap.data()?.games ?? []).includes(game)) {
      await ref.set(
        { games: admin.firestore.FieldValue.arrayUnion(game) },
        { merge: true }
      );
    }
    return false;
  }

  await ref.set({
    badgeId,
    earnedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(context ? { context } : {}),
    ...(game ? { games: [game] } : {}),
  });
  return true;
}

export async function hasBadge(
  userId: string,
  badgeId: BadgeId
): Promise<boolean> {
  const snap = await db.doc(`users/${userId}/badges/${badgeId}`).get();
  return snap.exists;
}

// ── Rank tier utilities (mirrors client-side leaderboardService / lobbyService) ──

const LEAGUE_TIER_VALUE: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5,
  DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9,
};

const VALORANT_TIER_VALUE: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4,
  DIAMOND: 5, ASCENDANT: 6, IMMORTAL: 7, RADIANT: 8,
};

const DIVISION_VALUE: Record<string, number> = {
  IV: 0, III: 1, II: 2, I: 3, "1": 0, "2": 1, "3": 2,
};

export function parseTier(rank: string): string {
  return rank.split(" ")[0]?.toUpperCase() ?? "";
}

/**
 * Ladder position of a rank's tier (Iron=0 ... Challenger/Radiant=8-9),
 * independent of division/points. Used to grant the full rank-tier badge
 * ladder (bronze_tier, silver_tier, ... top_1_percent) up to and including
 * whatever tier the player currently holds.
 */
export function tierValue(game: "valorant" | "league", rank: string): number {
  const tier = parseTier(rank);
  const tierMap = game === "league" ? LEAGUE_TIER_VALUE : VALORANT_TIER_VALUE;
  return tierMap[tier] ?? -1;
}

export function rankScore(
  game: "valorant" | "league",
  rank: string | undefined,
  points: number
): number {
  if (!rank) return -1;
  const parts = rank.split(" ");
  const div = parts[1]?.toUpperCase() ?? "";
  const tv = tierValue(game, rank);
  if (tv < 0) return -1;
  const divValue = DIVISION_VALUE[div] ?? 0;
  return tv * 10000 + divValue * 1000 + points;
}
