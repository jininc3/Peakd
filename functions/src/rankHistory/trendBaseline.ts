/**
 * Where a player stood a few days ago, for the overtake arrows on the web's
 * leaderboard and lobby standings.
 *
 * Positions depend on the board — the global board, someone's friends, a
 * lobby's members — so a single "moved up 2" can't be stored per player.
 * What can be is the player's own rank as of TREND_DAYS ago: every board then
 * ranks its players by that and by today's rank, and the difference between
 * the two orders is who overtook whom. Mirrored onto the user doc beside
 * dailyGain, so boards read it with the data they already load.
 *
 * Stored as the raw rank and LP/RR rather than a score, so the web scores
 * then and now with the same function it ranks the board by.
 */

import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

export type TrendGame = "league" | "valorant";

/** How far back the arrows look. Matches TREND_DAYS on the web. */
export const TREND_DAYS = 3;

/**
 * User-doc fields holding the player's rank as of TREND_DAYS ago: the last
 * rankHistory snapshot at or before then. Snapshots are only written when the
 * rank changes, so that entry is still their standing at the cutoff.
 *
 * With no snapshot that old (linked this week), or one from a different
 * account (re-linked since), the fields are cleared: the web leaves such a
 * player out of the comparison rather than inventing a starting point.
 *
 * Best-effort, like the daily delta: a failure clears nothing and returns no
 * fields, rather than taking down the stats write that called it.
 */
export async function trendBaselineUserFields(
  userId: string,
  game: TrendGame,
  puuid?: string
): Promise<Record<string, unknown>> {
  const key = game === "league" ? "riotStats" : "valorantStats";
  const cutoff = new Date(Date.now() - TREND_DAYS * 24 * 60 * 60 * 1000);

  try {
    const snap = await admin.firestore()
      .collection("users").doc(userId)
      .collection("rankHistory")
      .where("game", "==", game)
      .where("timestamp", "<=", admin.firestore.Timestamp.fromDate(cutoff))
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    const entry = snap.empty ? null : snap.docs[0].data();
    const sameAccount = !puuid || !entry?.puuid || entry.puuid === puuid;
    if (!entry || !sameAccount || typeof entry.rank !== "string" || typeof entry.value !== "number") {
      const del = admin.firestore.FieldValue.delete();
      return {
        [`${key}.trendRank`]: del,
        [`${key}.trendPoints`]: del,
        [`${key}.trendAsOf`]: del,
      };
    }

    return {
      [`${key}.trendRank`]: entry.rank,
      [`${key}.trendPoints`]: entry.value,
      // When this was worked out: the web ignores a baseline that hasn't been
      // refreshed recently, since "3 days ago" drifts older with every day
      // the player's stats go unfetched.
      [`${key}.trendAsOf`]: admin.firestore.Timestamp.now(),
    };
  } catch (error) {
    logger.warn(`Trend baseline lookup failed for ${userId}/${game}:`, error);
    return {};
  }
}
