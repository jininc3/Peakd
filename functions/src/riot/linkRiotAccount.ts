/**
 * Link Riot Account Cloud Function
 *
 * This function verifies a Riot account exists and links it to the user's profile.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {getAccountByRiotId} from "./riotApi";
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

      const accountData = {
        puuid: riotAccount.puuid,
        gameName: riotAccount.gameName,
        tagLine: riotAccount.tagLine,
        region: region.toLowerCase(),
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
      }, { merge: true });

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
