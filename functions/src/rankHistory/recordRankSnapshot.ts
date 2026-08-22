/**
 * Write a rankHistory entry for a user/game, but only when the rank or
 * LP/RR differs from the most recent stored entry. Called from the scheduled
 * snapshot job and from every fresh stats fetch, so the progression graph
 * reflects changes as soon as they're seen without piling up duplicates.
 */

import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

export type SnapshotGame = "league" | "valorant";

export interface RankSnapshotInput {
  game: SnapshotGame;
  /** LP (League) or RR (Valorant) within the current tier. */
  value: number;
  /** Display rank, e.g. "GOLD II" or "Diamond 1". */
  rank: string;
  /** Account identity, so history can be attributed after a re-link. */
  puuid?: string;
}

/**
 * @returns true if a new entry was written.
 */
export async function recordRankSnapshotIfChanged(
  userId: string,
  input: RankSnapshotInput
): Promise<boolean> {
  const db = admin.firestore();
  const historyRef = db.collection("users").doc(userId).collection("rankHistory");

  const latest = await historyRef
    .where("game", "==", input.game)
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();

  if (!latest.empty) {
    const prev = latest.docs[0].data();
    const unchanged =
      prev.value === input.value &&
      prev.rank === input.rank &&
      (!input.puuid || !prev.puuid || prev.puuid === input.puuid);
    if (unchanged) return false;
  }

  await historyRef.add({
    game: input.game,
    value: input.value,
    rank: input.rank,
    ...(input.puuid ? {puuid: input.puuid} : {}),
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.debug(`Recorded ${input.game} rank snapshot for ${userId}: ${input.rank} ${input.value}`);
  return true;
}
