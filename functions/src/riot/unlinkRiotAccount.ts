/**
 * Unlink Riot Account Cloud Function
 *
 * This function removes the Riot account and stats from the user's profile.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {archiveFields} from "../users/rankCardArchive";
import * as logger from "firebase-functions/logger";

export interface UnlinkAccountResponse {
  success: boolean;
  message: string;
}

/**
 * Unlink a Riot account from the user's profile
 *
 * @param request - Callable request containing auth
 * @returns Response indicating success or failure
 */
export const unlinkRiotAccountFunction = onCall(
  {
    invoker: "public",
  },
  async (request): Promise<UnlinkAccountResponse> => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to unlink a Riot account"
      );
    }

    const userId = request.auth.uid;

    try {
      logger.info(`User ${userId} is unlinking their Riot account`);

      const db = admin.firestore();
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError(
          "not-found",
          "User not found"
        );
      }

      const userData = userDoc.data();

      // Check if Riot account is linked
      if (!userData?.riotAccount) {
        throw new HttpsError(
          "failed-precondition",
          "No Riot account is currently linked"
        );
      }

      const riotAccount = userData.riotAccount;

      // Create account identifier to release the claim
      const accountId = `riot:${riotAccount.gameName}#${riotAccount.tagLine}`;

      // Remove from linkedAccounts collection to free up the account
      const linkedAccountRef = db.collection("linkedAccounts").doc(accountId);
      await linkedAccountRef.delete();

      logger.info(`Released account claim: ${accountId}`);

      // Off the profile, but archived rather than deleted: a relink of the
      // same account restores the stats — League's peak rank is tracked here,
      // not by Riot, so deleting it lost it for good.
      await userRef.update({
        ...archiveFields("league", riotAccount, userData.riotStats),
        riotAccount: admin.firestore.FieldValue.delete(),
        riotStats: admin.firestore.FieldValue.delete(),
      });

      logger.info(`Successfully unlinked Riot account for user ${userId}`);

      return {
        success: true,
        message: "Riot account unlinked successfully",
      };
    } catch (error) {
      logger.error("Error unlinking Riot account:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Failed to unlink Riot account. Please try again later."
      );
    }
  }
);
