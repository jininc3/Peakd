/**
 * Daily LP/RR movement for the leaderboard.
 *
 * The leaderboard shows every player, so this cannot live on the device the way
 * the mobile app's AsyncStorage baseline does — that only ever knew the signed-in
 * user's own numbers. The baseline is stored per user per game instead, and the
 * delta is computed server-side wherever fresh stats are written.
 *
 * A "day" is UTC, matching the scheduled snapshot (06:00/18:00 UTC). Each write
 * measures against a baseline held on gameStats/{game}: within a day that is the
 * figure the day opened on, and when the day rolls over the previous day's
 * closing figure carries forward. Every write also stores `lastPoints`, which is
 * what makes that carry-forward possible.
 *
 * The carry-forward matters because the job only runs twice a day: resetting the
 * baseline to the current value each morning made the first reading of every day
 * a mandatory 0, so the whole column read as "no movement" from 06:00 until
 * 18:00 UTC. Only a genuinely first-ever write reports 0 now.
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
  /** LP/RR moved since the start of the UTC day. */
  dailyGain: number;
  baselineDay: string;
  /**
   * The value today is measured from, written back by dailyDeltaFields.
   *
   * On a day roll-over this is the previous day's *closing* figure, not the
   * current one — that is what makes the first reading of a day report real
   * overnight movement instead of a mandatory zero.
   */
  baselinePoints: number;
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
      | {baselineDay?: string; baselinePoints?: number; lastPoints?: number}
      | undefined;

    // Same day: measure against the baseline already set this morning.
    if (data?.baselineDay === today && typeof data?.baselinePoints === "number") {
      return {
        dailyGain: current - data.baselinePoints,
        baselineDay: today,
        baselinePoints: data.baselinePoints,
      };
    }

    // A new day. Yesterday's closing figure becomes today's baseline, so the
    // first reading of the day reports what actually changed overnight rather
    // than resetting to zero and leaving the column blank until the next run.
    if (typeof data?.lastPoints === "number") {
      return {
        dailyGain: current - data.lastPoints,
        baselineDay: today,
        baselinePoints: data.lastPoints,
      };
    }

    // Nothing to compare against — a first-ever write for this user and game.
    return {dailyGain: 0, baselineDay: today, baselinePoints: current};
  } catch (error) {
    logger.warn(`Daily delta lookup failed for ${userId}/${game}:`, error);
    return {dailyGain: 0, baselineDay: today, baselinePoints: current};
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
    // Decided in updateDailyDelta: today's own baseline while the day runs,
    // yesterday's closing figure on the first write of a new one.
    baselinePoints: delta.baselinePoints,
    // Every write records where the day currently stands, so tomorrow's first
    // reading has something to measure against.
    lastPoints: ladderPoints(game, rank, points),
  };
}
