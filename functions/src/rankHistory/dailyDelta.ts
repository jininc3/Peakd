/**
 * Daily LP/RR movement for the leaderboard.
 *
 * The leaderboard shows every player, so this cannot live on the device the way
 * the mobile app's AsyncStorage baseline does — that only ever knew the signed-in
 * user's own numbers. The baseline is stored per user per game instead, and the
 * delta is computed server-side wherever fresh stats are written.
 *
 * A "day" is UTC, matching the scheduled snapshot (06:00/18:00 UTC). The first
 * write of a new day becomes that day's baseline and reports a delta of 0; every
 * later write that day measures against it.
 *
 * Tier changes are handled by comparing total ladder position rather than raw
 * LP, so promoting GOLD I 90 -> PLATINUM IV 10 reads as a gain, not -80.
 */

import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

export type DeltaGame = "league" | "valorant";

const LEAGUE_TIERS: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5,
  DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9,
};
const VALORANT_TIERS: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4,
  DIAMOND: 5, ASCENDANT: 6, IMMORTAL: 7, RADIANT: 8,
};
// Division ordering differs by game and must not share a table: League counts
// DOWN in Roman numerals (IV lowest -> I highest), Valorant counts UP in Arabic
// (1 lowest -> 3 highest). A shared map makes League "I" and Valorant "1"
// collide, which silently mis-scores every Valorant promotion.
const LEAGUE_DIVISIONS: Record<string, number> = {IV: 0, III: 1, II: 2, I: 3};
const VALORANT_DIVISIONS: Record<string, number> = {"1": 0, "2": 1, "3": 2};

/** UTC day key, e.g. "2026-09-03". */
export function utcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Absolute ladder position, so deltas stay meaningful across promotions.
 * Each division is treated as 100 LP wide, which is exact below Master and a
 * reasonable approximation above it (where divisions don't exist and LP simply
 * accumulates).
 */
export function ladderPoints(game: DeltaGame, rank: string | undefined, points: number): number {
  if (!rank) return points;
  const [tierRaw, divRaw] = rank.split(" ");
  const isLeague = game === "league";
  const tiers = isLeague ? LEAGUE_TIERS : VALORANT_TIERS;
  const tier = tiers[(tierRaw ?? "").toUpperCase()];
  if (tier === undefined) return points;
  const divisions = isLeague ? LEAGUE_DIVISIONS : VALORANT_DIVISIONS;
  const div = divisions[(divRaw ?? "").toUpperCase()] ?? 0;
  // League has 4 divisions per tier, Valorant 3 — using one stride for both
  // would leave a phantom gap in Valorant's ladder.
  const perTier = isLeague ? 4 : 3;
  return (tier * perTier + div) * 100 + points;
}

export interface DailyDeltaResult {
  /** LP/RR moved today. 0 on the first write of a new day. */
  dailyGain: number;
  baselineDay: string;
}

/**
 * Update a user's daily baseline for `game` and return today's movement.
 *
 * Best-effort: a failure returns a zero delta rather than taking down the stats
 * write that called it.
 */
export async function updateDailyDelta(
  userId: string,
  game: DeltaGame,
  rank: string | undefined,
  points: number
): Promise<DailyDeltaResult> {
  const today = utcDayKey();
  const current = ladderPoints(game, rank, points);

  try {
    const ref = admin.firestore()
      .collection("users").doc(userId)
      .collection("gameStats").doc(game);

    const snap = await ref.get();
    const data = snap.data() as
      | {baselineDay?: string; baselinePoints?: number}
      | undefined;

    // New day, or no baseline yet: today starts here.
    if (data?.baselineDay !== today || typeof data?.baselinePoints !== "number") {
      return {dailyGain: 0, baselineDay: today};
    }

    return {dailyGain: current - data.baselinePoints, baselineDay: today};
  } catch (error) {
    logger.warn(`Daily delta lookup failed for ${userId}/${game}:`, error);
    return {dailyGain: 0, baselineDay: today};
  }
}

/**
 * Fields to mirror onto the USER document.
 *
 * The global leaderboard reads user docs in one query and never touches the
 * gameStats subcollection; fetching a subdoc per player would add a read per
 * row. Mirroring the delta up to the parent keeps the board a single query.
 */
export function dailyDeltaUserFields(
  game: DeltaGame,
  delta: DailyDeltaResult
): Record<string, unknown> {
  const key = game === "league" ? "riotStats" : "valorantStats";
  return {
    [`${key}.dailyGain`]: delta.dailyGain,
    [`${key}.dailyGainDay`]: delta.baselineDay,
  };
}

/**
 * Fields to merge into gameStats/{game} alongside the caller's own updates.
 * Kept as a helper so every writer stores the baseline identically.
 */
export function dailyDeltaFields(
  game: DeltaGame,
  rank: string | undefined,
  points: number,
  delta: DailyDeltaResult
): Record<string, unknown> {
  return {
    dailyGain: delta.dailyGain,
    baselineDay: delta.baselineDay,
    // Re-stamped only when the day rolls over, so the rest of the day measures
    // against this morning's number.
    ...(delta.dailyGain === 0
      ? {baselinePoints: ladderPoints(game, rank, points)}
      : {}),
  };
}
