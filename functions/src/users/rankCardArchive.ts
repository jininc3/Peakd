/**
 * What happens to a game's data when its rank card is unlinked, and how a
 * relink gets it back.
 *
 * Unlinking used to delete the account and its stats outright, so relinking
 * the same account started over: League's peak rank (tracked here, not by
 * Riot) was gone for good, and the rank card came back empty until a refresh.
 * Now the unlink moves both into users/{uid}.archivedRankCards.{game}, out of
 * everything that reads the live fields — rank cards, progress, leaderboards —
 * and a relink of the SAME account restores them.
 *
 * Rank history (users/{uid}/rankHistory) is never touched by an unlink, so
 * the progress graph also carries on after a same-account relink. Linking a
 * DIFFERENT account after an unlink is a switch: that game's history is
 * cleared, as a direct switch already did, so the new account's graph doesn't
 * continue from the old one's.
 */

import * as admin from "firebase-admin";

export type ArchivedGame = "league" | "valorant";

export interface ArchivedRankCard {
  account: Record<string, unknown>;
  stats: Record<string, unknown> | null;
  unlinkedAt: admin.firestore.Timestamp;
}

/** Fields to write, alongside deleting the live ones, to archive a game on unlink. */
export function archiveFields(
  game: ArchivedGame,
  account: Record<string, unknown>,
  stats: Record<string, unknown> | undefined
): Record<string, unknown> {
  return {
    [`archivedRankCards.${game}`]: {
      account,
      stats: stats ?? null,
      unlinkedAt: admin.firestore.Timestamp.now(),
    },
  };
}

export function readArchive(
  userData: admin.firestore.DocumentData | undefined,
  game: ArchivedGame
): ArchivedRankCard | undefined {
  const archived = userData?.archivedRankCards?.[game];
  return archived?.account ? (archived as ArchivedRankCard) : undefined;
}

/** Deletes a game's rank history — for a switch to a different account. */
export async function clearRankHistory(
  userRef: admin.firestore.DocumentReference,
  game: ArchivedGame
): Promise<void> {
  const historyRef = userRef.collection("rankHistory");
  // In pages — a batch tops out at 500 writes.
  for (;;) {
    const page = await historyRef.where("game", "==", game).limit(400).get();
    if (page.empty) break;
    const batch = userRef.firestore.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < 400) break;
  }
}

/** Drops `undefined` values, which Firestore rejects. */
export function withoutUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
