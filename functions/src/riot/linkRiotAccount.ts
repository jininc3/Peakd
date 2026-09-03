/**
 * Link Riot Account Cloud Function
 *
 * This function verifies a Riot account exists and links it to the user's profile.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {getAccountByRiotId, getRankedStats,
  getAccountRegion,
} from "./riotApi";
import {LinkAccountRequest, LinkAccountResponse} from "../types/riot";

/**
 * Link a Riot account to the user's profile
 *
 * @param request - Callable request containing data and auth
 * @returns Response with success status and account data
 */
export const linkRiotAccountFunction = onCall(
  {
    invoker: "public",
    secrets: ["RIOT_API_KEY"],
  },
  async (request): Promise<LinkAccountResponse> => {
    // Log request details for debugging
    logger.info("linkRiotAccount called", {
      hasAuth: !!request.auth,
      authUid: request.auth?.uid,
      rawRequest: !!request.rawRequest,
    });

    // Check authentication - request.auth is automatically populated by Firebase
    if (!request.auth) {
      logger.error("No auth in request");
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to link a Riot account. Please ensure you are logged in."
      );
    }

    const userId = request.auth.uid;
    logger.info("Authenticated user:", userId);
    const data = request.data as LinkAccountRequest;
    const {gameName, tagLine, region = "euw1"} = data;

    // Validate input
    if (!gameName || !tagLine) {
      throw new HttpsError(
        "invalid-argument",
        "Game Name and Tag Line are required"
      );
    }

    // Trim and validate format
    const cleanGameName = gameName.trim();
    const cleanTagLine = tagLine.trim();

    if (cleanGameName.length < 3 || cleanGameName.length > 16) {
      throw new HttpsError(
        "invalid-argument",
        "Game Name must be between 3 and 16 characters"
      );
    }

    if (cleanTagLine.length < 2 || cleanTagLine.length > 5) {
      throw new HttpsError(
        "invalid-argument",
        "Tag Line must be between 2 and 5 characters"
      );
    }

    try {
      logger.info(`User ${userId} is linking Riot account: ${cleanGameName}#${cleanTagLine}`);

      const db = admin.firestore();

      // Create account identifier for claim checking
      const accountId = `riot:${cleanGameName}#${cleanTagLine}`;

      // Check if account is already claimed by another user
      const linkedAccountRef = db.collection("linkedAccounts").doc(accountId);
      const linkedAccountDoc = await linkedAccountRef.get();

      if (linkedAccountDoc.exists) {
        const linkedData = linkedAccountDoc.data();
        if (linkedData && linkedData.userId !== userId) {
          logger.warn(`Account ${accountId} already linked to user ${linkedData.userId}`);
          throw new HttpsError(
            "already-exists",
            "This Riot account is already linked to another Peakd profile. Please unlink it from the other profile first, or contact support if you believe this is an error."
          );
        }
        logger.info(`Account ${accountId} already linked to current user, allowing re-link`);
      }

      // Verify account exists via Riot API
      const riotAccount = await getAccountByRiotId(
        cleanGameName,
        cleanTagLine,
        region
      );

      logger.info(`Account verified: ${riotAccount.puuid}`);

      // Store in Firestore
      const userRef = db.collection("users").doc(userId);

      // Switching to a different Riot account: the League LP graph must not
      // carry on from the previous account's snapshots, so clear them (and
      // release the old account's claim) before linking the new one.
      const existingDoc = await userRef.get();
      // Linking legitimately happens BEFORE the account exists: building a rank
      // card is the first step of signup, and OAuth users are authenticated
      // from the start of the wizard. So we create the doc when missing — but
      // flag it `signupComplete: false`, because a bare set({merge:true}) used
      // to leave a doc holding only riotAccount (no username, no createdAt)
      // that the app then treated as a real account. commitSignup flips the
      // flag; anything still false is an abandoned signup, not a user.
      const isNewProfile = !existingDoc.exists;
      if (isNewProfile) {
        logger.info(`Creating placeholder profile for ${userId} (rank card built pre-signup)`);
      }
      const previousAccount = existingDoc.data()?.riotAccount;
      const isSwitchingAccount =
        !!previousAccount?.puuid && previousAccount.puuid !== riotAccount.puuid;
      if (isSwitchingAccount) {
        logger.info(
          `User ${userId} switching Riot account ${previousAccount.puuid} -> ${riotAccount.puuid}; resetting League rank history`
        );
        const oldClaimId = `riot:${previousAccount.gameName}#${previousAccount.tagLine}`;
        if (oldClaimId !== accountId) {
          await db.collection("linkedAccounts").doc(oldClaimId).delete().catch(() => undefined);
        }
        const historyRef = userRef.collection("rankHistory");
        // Loop in pages — a batch tops out at 500 writes.
        for (;;) {
          const page = await historyRef.where("game", "==", "league").limit(400).get();
          if (page.empty) break;
          const batch = db.batch();
          page.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          if (page.size < 400) break;
        }
      }

      // The region the user picked is a hint, not a fact. PUUIDs are
      // region-scoped ciphertext, so storing a wrong pick permanently pairs the
      // PUUID with a platform that cannot decrypt it — every later
      // summoner/league/mastery call then fails with a 400 "Exception
      // decrypting", while linking itself still succeeds (account-v1 is
      // regionally routed and never sees the mismatch). Ask Riot where the
      // account actually lives and store that instead; fall back to the pick
      // only if the lookup fails.
      const resolvedRegion =
        (await getAccountRegion(riotAccount.puuid, "lol", region)) ??
        region.toLowerCase();
      if (resolvedRegion !== region.toLowerCase()) {
        logger.info(
          `Region corrected for user ${userId}: picked ${region.toLowerCase()}, actual ${resolvedRegion}`
        );
      }

      const accountData = {
        puuid: riotAccount.puuid,
        gameName: riotAccount.gameName,
        tagLine: riotAccount.tagLine,
        region: resolvedRegion,
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Claim the account in linkedAccounts collection
      await linkedAccountRef.set({
        userId: userId,
        accountType: "riot",
        gameName: riotAccount.gameName,
        tagLine: riotAccount.tagLine,
        puuid: riotAccount.puuid,
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await userRef.set({
        riotAccount: accountData,
        // Stale stats belong to the previous account; getLeagueStats refills them.
        ...(isSwitchingAccount ? {riotStats: admin.firestore.FieldValue.delete()} : {}),
        // Only stamped when creating: never downgrade a completed account.
        ...(isNewProfile
          ? {
            signupComplete: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          }
          : {}),
      }, {merge: true});

      // Seed the graph with the new account's current LP so it doesn't sit
      // empty until the next daily snapshot. Best-effort: a failure here must
      // not fail the link itself.
      if (isSwitchingAccount || !previousAccount?.puuid) {
        try {
          const ranked = await getRankedStats(riotAccount.puuid, resolvedRegion);
          const solo = ranked.find((q) => q.queueType === "RANKED_SOLO_5x5");
          if (solo) {
            await userRef.collection("rankHistory").add({
              game: "league",
              puuid: riotAccount.puuid,
              value: solo.leaguePoints,
              rank: `${solo.tier} ${solo.rank}`,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        } catch (err) {
          logger.warn(`Initial LP snapshot failed for user ${userId}:`, err);
        }
      }

      logger.info(`Successfully linked Riot account for user ${userId}`);

      return {
        success: true,
        message: "Riot account linked successfully!",
        account: accountData as any,
      };
    } catch (error) {
      logger.error("Error linking Riot account:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Failed to link Riot account. Please try again."
      );
    }
  }
);
