/**
 * Cloud Function: Delete Own Account
 *
 * Deletes all Firestore data, Storage files, linked accounts, and Firebase Auth
 * for the authenticated user. Mirrors the mobile deleteAccountService cleanup.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";
import {
  deleteUserPosts,
  deleteStorageFolder,
  deleteFollowRelationships,
  deleteNotificationsAboutUser,
  deleteSubcollection,
  deleteUserChats,
  deleteByQuery,
  deleteUserFromParties,
  deleteUserDuoData,
} from "./deleteAllAccounts";

export const deleteAccountFunction = onCall(
  {invoker: "public", timeoutSeconds: 300, memory: "512MiB"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const userId = request.auth.uid;
    const db = admin.firestore();
    const storage = admin.storage().bucket();

    logger.info(`Starting account deletion for user ${userId}`);

    try {
      // 1. Delete user's posts and their subcollections
      await deleteUserPosts(db, storage, userId);

      // 2. Delete user profile images from storage
      await deleteStorageFolder(storage, `profile-pictures/${userId}`);
      await deleteStorageFolder(storage, `cover-photos/${userId}`);
      await deleteStorageFolder(storage, `posts/${userId}`);

      // 3. Delete follow relationships in other users' subcollections
      await deleteFollowRelationships(db, userId);

      // 4. Delete notifications about this user in other users
      await deleteNotificationsAboutUser(db, userId);

      // 5. Delete user subcollections
      const subcollections = [
        "notifications", "followers", "following",
        "searchHistory", "gameStats", "followRequests",
      ];
      for (const sub of subcollections) {
        await deleteSubcollection(db, `users/${userId}/${sub}`);
      }

      // 6. Delete user's chats and messages
      await deleteUserChats(db, userId);

      // 7. Delete linked accounts
      await deleteByQuery(db, "linkedAccounts", "userId", userId);

      // 8. Delete parties created by user, remove from others
      await deleteUserFromParties(db, userId);

      // 9. Delete duo data
      await deleteUserDuoData(db, userId);

      // 10. Delete user document
      await db.doc(`users/${userId}`).delete();

      // 11. Delete Firebase Auth account
      try {
        await admin.auth().deleteUser(userId);
      } catch (authErr: any) {
        if (authErr.code !== "auth/user-not-found") {
          logger.warn(`Failed to delete auth for ${userId}:`, authErr);
        }
      }

      logger.info(`Account deletion completed for user ${userId}`);
      return {success: true};
    } catch (error) {
      logger.error(`Error deleting account for ${userId}:`, error);
      throw new HttpsError(
        "internal",
        "Failed to delete account. Please try again."
      );
    }
  }
);
