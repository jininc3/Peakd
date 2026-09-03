/**
 * One-shot repair for Riot accounts stored against the wrong platform.
 *
 * Region used to be taken from a dropdown the user picked at link time and
 * stored as-is. PUUIDs are region-scoped ciphertext, so a wrong pick pairs the
 * PUUID with a platform that cannot decrypt it: every summoner / league /
 * mastery call then returns 400 "Exception decrypting", forever. Linking still
 * succeeded, because account-v1 is regionally routed and never sees the
 * mismatch — which is why this went unnoticed.
 *
 * The same 400 also appears after an API key rotation: PUUIDs are encrypted per
 * key, so every stored PUUID becomes unreadable when the key changes. That case
 * is repaired by re-minting the PUUID from the stored Riot ID, which is not
 * encrypted and survives rotation.
 *
 * linkRiotAccount now resolves the real region up front, and both getLeagueStats
 * and the daily snapshot repair themselves on the mismatch error. This exists to
 * fix every broken account at once, without waiting for each user to open the app.
 *
 * Admin-only and idempotent: accounts already on the right platform are counted
 * and skipped, so it is safe to re-run.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {getRankedStats, getAccountRegion} from "./riotApi";
import {remintRiotAccount} from "./repairAccount";

const ADMIN_IDS = ["VljkZhdkF3gCQI0clVkbQ0XCIxp1"];

// Same pacing as the daily snapshot, to stay inside Riot's rate limit.
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000;

interface RepairRow {
  userId: string;
  from: string;
  to: string;
  /** Which repair was applied: a wrong platform, or a key-orphaned PUUID. */
  fix: "region" | "puuid";
}

export interface RepairRiotRegionsResponse {
  success: boolean;
  scanned: number;
  healthy: number;
  repaired: number;
  unresolved: number;
  dryRun: boolean;
  changes: RepairRow[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const repairRiotRegionsFunction = onCall(
  {
    invoker: "public",
    secrets: ["RIOT_API_KEY"],
    timeoutSeconds: 540,
    maxInstances: 1,
  },
  async (request): Promise<RepairRiotRegionsResponse> => {
    if (!request.auth || !ADMIN_IDS.includes(request.auth.uid)) {
      throw new HttpsError("permission-denied", "Admin only");
    }

    // Default to a dry run: the caller sees what would change before anything
    // is written.
    const dryRun = (request.data as {dryRun?: boolean})?.dryRun !== false;

    const db = admin.firestore();
    const snapshot = await db.collection("users").get();
    const candidates = snapshot.docs
      .map((doc) => ({id: doc.id, riotAccount: doc.data()?.riotAccount}))
      .filter((u) => u.riotAccount?.puuid && u.riotAccount?.region);

    let healthy = 0;
    let repaired = 0;
    let unresolved = 0;
    const changes: RepairRow[] = [];

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (user) => {
        const {puuid, region} = user.riotAccount;
        try {
          // Cheapest proof the pairing works: if this succeeds, the stored
          // region decrypts the PUUID and there is nothing to fix.
          await getRankedStats(puuid, region);
          healthy++;
        } catch (error) {
          const mismatch =
            error instanceof HttpsError && error.message === "REGION_MISMATCH";
          if (!mismatch) {
            // A different failure (rate limit, outage) isn't a region problem;
            // leave the account alone rather than guessing.
            unresolved++;
            return;
          }

          const corrected = await getAccountRegion(puuid, "lol", region);
          if (corrected && corrected !== region) {
            changes.push({userId: user.id, from: region, to: corrected, fix: "region"});
            if (!dryRun) {
              await db.collection("users").doc(user.id)
                .update({"riotAccount.region": corrected});
            }
            repaired++;
            return;
          }

          // Region is already right, so the PUUID itself is unreadable — it was
          // minted under a different API key. Re-mint it from the Riot ID.
          if (dryRun) {
            changes.push({userId: user.id, from: "stale puuid", to: "re-mint", fix: "puuid"});
            repaired++;
            return;
          }

          const remade = await remintRiotAccount(user.id, user.riotAccount);
          if (!remade) {
            logger.warn(`Could not repair user ${user.id}`);
            unresolved++;
            return;
          }
          changes.push({userId: user.id, from: "stale puuid", to: remade.region, fix: "puuid"});
          repaired++;
        }
      }));

      if (i + BATCH_SIZE < candidates.length) await sleep(BATCH_DELAY_MS);
    }

    logger.info(
      `Riot region repair (${dryRun ? "dry run" : "applied"}): ` +
      `${candidates.length} scanned, ${healthy} healthy, ` +
      `${repaired} repaired, ${unresolved} unresolved.`
    );

    return {
      success: true,
      scanned: candidates.length,
      healthy,
      repaired,
      unresolved,
      dryRun,
      changes,
    };
  }
);
