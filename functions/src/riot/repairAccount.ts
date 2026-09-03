/**
 * Repair a stored Riot account after an API key rotation.
 *
 * PUUIDs are encrypted per API key. Rotating RIOT_API_KEY therefore orphans
 * every PUUID minted under the old key: each one becomes ciphertext the new key
 * cannot read, and every summoner / league / mastery / match call for that user
 * fails with 400 "Bad Request - Exception decrypting" — on regional AND platform
 * hosts alike, which is what distinguishes this from a routing mistake.
 *
 * gameName + tagLine are NOT encrypted, so they survive a rotation. Looking the
 * account up by Riot ID mints a fresh PUUID under the current key, which is the
 * repair.
 *
 * Called from the paths that touch a stored PUUID, so an account heals the first
 * time anyone loads it rather than staying broken until someone notices.
 */

import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {getAccountByRiotId, getAccountRegion} from "./riotApi";

export interface RepairedAccount {
  puuid: string;
  region: string;
}

/**
 * Re-mint a user's PUUID from their stored Riot ID and persist it.
 *
 * @returns the repaired identity, or null when it can't be resolved (no stored
 * Riot ID, or the account no longer exists) — callers should then surface the
 * original error rather than retrying.
 */
export async function remintRiotAccount(
  userId: string,
  riotAccount: {gameName?: string; tagLine?: string; region?: string} | undefined
): Promise<RepairedAccount | null> {
  const gameName = riotAccount?.gameName;
  const tagLine = riotAccount?.tagLine;
  const storedRegion = riotAccount?.region ?? "euw1";

  // Without a Riot ID there is nothing key-independent to look up. This is why
  // gameName/tagLine are stored alongside the PUUID rather than derived from it.
  if (!gameName || !tagLine) {
    logger.warn(`Cannot re-mint PUUID for ${userId}: no stored Riot ID`);
    return null;
  }

  try {
    const account = await getAccountByRiotId(gameName, tagLine, storedRegion);
    if (!account?.puuid) return null;

    // The rotation is also a chance to confirm the platform, since a wrong one
    // produces an indistinguishable 400.
    const region =
      (await getAccountRegion(account.puuid, "lol", storedRegion)) ?? storedRegion;

    await admin.firestore().collection("users").doc(userId).update({
      "riotAccount.puuid": account.puuid,
      "riotAccount.region": region,
      "riotAccount.repairedAt": admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(
      `Re-minted PUUID for ${userId} (${gameName}#${tagLine}), region ${region}`
    );
    return {puuid: account.puuid, region};
  } catch (error) {
    logger.warn(`Failed to re-mint PUUID for ${userId}:`, error);
    return null;
  }
}
