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

// Each tier's absolute floor in LP/RR, not an index: tiers are not all the same
// width, so a shared stride cannot place them. Divisioned tiers are as wide as
// they have divisions (League 4x100, Valorant 3x100); Master and above have no
// divisions and are 100 wide, since LP there accumulates on a single rung.
// Getting this wrong inflates every delta that crosses the Master boundary.
const LEAGUE_TIERS: Record<string, number> = {
  IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600,
  EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 2900,
  CHALLENGER: 3000,
};
const VALORANT_TIERS: Record<string, number> = {
  IRON: 0, BRONZE: 300, SILVER: 600, GOLD: 900, PLATINUM: 1200,
  DIAMOND: 1500, ASCENDANT: 1800, IMMORTAL: 2100, RADIANT: 2400,
};
// Division ordering differs by game and must not share a table: League counts
// DOWN in Roman numerals (IV lowest -> I highest), Valorant counts UP in Arabic
// (1 lowest -> 3 highest). A shared map makes League "I" and Valorant "1"
// collide, which silently mis-scores every Valorant promotion.
const LEAGUE_DIVISIONS: Record<string, number> = {IV: 0, III: 1, II: 2, I: 3};
const VALORANT_DIVISIONS: Record<string, number> = {"1": 0, "2": 1, "3": 2};
// Tiers with no divisions, where LP/RR simply accumulates. league-v4 still
// reports rank "I" for all three, so without this they score as division I and
// pick up a phantom +300 — a Master player demoting to DIAMOND I read as -377
// instead of the ~-25 they actually lost. Valorant's apex tier arrives with no
// division at all and already falls through to 0, but is named here so the
// ladder doesn't depend on that happening to be true. Immortal is NOT apex:
// current acts split it into Immortal 1/2/3.
const LEAGUE_APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const VALORANT_APEX_TIERS = new Set(["RADIANT"]);

/** UTC day key, e.g. "2026-09-03". */
export function utcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Absolute ladder position, so deltas stay meaningful across promotions.
 *
 * A rank scores as its tier floor plus its division (100 LP wide) plus LP. The
 * floors come from LEAGUE_TIERS/VALORANT_TIERS and already account for each
 * tier's real width, so crossing a tier boundary costs exactly the LP it
 * should: DIAMOND I 100 -> MASTER 0 is a promotion worth 0, not 300.
 */
export function ladderPoints(game: DeltaGame, rank: string | undefined, points: number): number {
  if (!rank) return points;
  const [tierRaw, divRaw] = rank.split(" ");
  const isLeague = game === "league";
  const tiers = isLeague ? LEAGUE_TIERS : VALORANT_TIERS;
  const tierFloor = tiers[(tierRaw ?? "").toUpperCase()];
  if (tierFloor === undefined) return points;
  const divisions = isLeague ? LEAGUE_DIVISIONS : VALORANT_DIVISIONS;
  const apex = isLeague ? LEAGUE_APEX_TIERS : VALORANT_APEX_TIERS;
  const div = apex.has((tierRaw ?? "").toUpperCase())
    ? 0
    : divisions[(divRaw ?? "").toUpperCase()] ?? 0;
  return tierFloor + div * 100 + points;
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
