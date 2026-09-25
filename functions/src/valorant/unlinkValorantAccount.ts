/**
 * Unlink Valorant Account Cloud Function
 *
 * This function removes the Valorant account and stats from the user's profile.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {archiveFields} from "../users/rankCardArchive";
import * as logger from "firebase-functions/logger";

export interface UnlinkValorantAccountResponse {
  success: boolean;
  message: string;
}

/**
 * Unlink a Valorant account from the user's profile
 *
 * @param request - Callable request containing auth
 * @returns Response indicating success or failure
 */
export const unlinkValorantAccountFunction = onCall(
  {
    invoker: "public",
  },
  async (request): Promise<UnlinkValorantAccountResponse> => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to unlink a Valorant account"
      );
    }

    const userId = request.auth.uid;

    try {
      logger.info(`User ${userId} is unlinking their Valorant account`);

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

      // Check if Valorant account is linked
      if (!userData?.valorantAccount) {
        throw new HttpsError(
          "failed-precondition",
          "No Valorant account is currently linked"
        );
      }

      const valorantAccount = userData.valorantAccount;

      // Create account identifier to release the claim
      const accountId = `valorant:${valorantAccount.gameName}#${valorantAccount.tag}#${valorantAccount.region}`;

      // Remove from linkedAccounts collection to free up the account
      const linkedAccountRef = db.collection("linkedAccounts").doc(accountId);
      await linkedAccountRef.delete();

      logger.info(`Released account claim: ${accountId}`);

      // Off the profile, but archived rather than deleted: a relink of the
      // same account restores the stats (see users/rankCardArchive).
      await userRef.update({
        ...archiveFields("valorant", valorantAccount, userData.valorantStats),
        valorantAccount: admin.firestore.FieldValue.delete(),
        valorantStats: admin.firestore.FieldValue.delete(),
      });

      logger.info(`Successfully unlinked Valorant account for user ${userId}`);

      return {
        success: true,
        message: "Valorant account unlinked successfully",
      };
    } catch (error) {
      logger.error("Error unlinking Valorant account:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Failed to unlink Valorant account. Please try again later."
      );
    }
  }
);
