/**
 * Leaderboard snapshot.
 *
 * The website's global boards (Leaderboards, Lobbies' board picker, the
 * landing page's climb board) used to read the whole users collection — up to
 * 1000 documents — in every visitor's browser, on every load. This writes the
 * few fields those boards use, for every public user with a linked game, into
 * one document, leaderboardSnapshots/users, so a board is a single read.
 *
 * Every 10 minutes. The website patches the viewer's own row in live, so a
 * player who has just refreshed their rank still sees it straight away.
 *
 * The fields are copied as stored, not turned into rows here: the website
 * builds the rows (lib/leaderboardService.ts, toLeaderboardPlayer) exactly as
 * it does from user documents, so the two can't drift apart.
 */

import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

/** Firestore's document limit is 1 MiB; stay well under it. */
const MAX_BYTES = 900 * 1024;

type Data = Record<string, unknown>;

/** Only the named keys of an object, dropping missing ones; undefined if none. */
function pick(obj: unknown, keys: string[]): Data | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const out: Data = {};
  for (const k of keys) {
    const v = (obj as Data)[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

const TREND = ["dailyGain", "dailyGainDay", "trendRank", "trendPoints", "trendAsOf"];

/** The board's view of one user, or null if they can't appear on any board. */
function boardFields(id: string, u: Data): Data | null {
  if (u.isPrivate || typeof u.username !== "string" || !u.username) return null;
  const riotStats = u.riotStats as Data | undefined;
  const entry: Data = {
    id,
    username: u.username,
    avatar: u.avatar,
    hiddenRankCards: u.hiddenRankCards,
    riotAccount: pick(u.riotAccount, ["gameName", "tagLine"]),
    riotStats: riotStats ?
      {
        ...pick(riotStats, TREND),
        rankedSolo: pick(riotStats.rankedSolo, ["tier", "rank", "leaguePoints", "wins", "losses"]),
      } :
      undefined,
    valorantAccount: pick(u.valorantAccount, ["gameName", "tag"]),
    valorantStats: pick(u.valorantStats, [
      "currentRank", "rankRating", "gameName", "tagLine", "wins", "losses", ...TREND,
    ]),
  };
  if (!entry.riotAccount && !entry.riotStats && !entry.valorantAccount && !entry.valorantStats) return null;
  // Firestore rejects undefined values.
  for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];
  return entry;
}

export const buildLeaderboardSnapshot = onSchedule(
  {
    schedule: "every 10 minutes",
    timeZone: "UTC",
    maxInstances: 1,
    timeoutSeconds: 120,
  },
  async () => {
    const db = admin.firestore();
    const snap = await db.collection("users").get();
    const users: Data[] = [];
    for (const d of snap.docs) {
      const entry = boardFields(d.id, d.data());
      if (entry) users.push(entry);
    }

    // Too big for one document: write none, marked so, and the website
    // falls back to reading user documents (an arbitrary cut would leave
    // players off the board). Time to split it by game, or keep top N.
    const bytes = users.reduce((n, u) => n + JSON.stringify(u).length + 64, 0);
    if (bytes > MAX_BYTES) {
      logger.error(`Leaderboard snapshot too big (${bytes} bytes for ${users.length} users); website falls back.`);
      await db.doc("leaderboardSnapshots/users").set({
        users: [],
        count: 0,
        tooBig: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    await db.doc("leaderboardSnapshots/users").set({
      users,
      count: users.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`Leaderboard snapshot: ${users.length} users from ${snap.size} docs.`);
  },
);
