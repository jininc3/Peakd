/**
 * Cloud Function: Delete All User Accounts (Admin Only)
 *
 * Deletes all Firestore data, Storage files, and Firebase Auth accounts
 * for every user in the system. Only callable by hardcoded admin user IDs.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";

const ADMIN_IDS = ["VljkZhdkF3gCQI0clVkbQ0XCIxp1"];

export const deleteAllAccountsFunction = onCall(
  {invoker: "public", timeoutSeconds: 540, memory: "1GiB"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    if (!ADMIN_IDS.includes(request.auth.uid)) {
      throw new HttpsError("permission-denied", "Admin access required.");
    }

    const db = admin.firestore();
    const storage = admin.storage().bucket();
    const callerUid = request.auth.uid;

    // Get all user documents
    const usersSnapshot = await db.collection("users").get();
    const userIds = usersSnapshot.docs.map((doc) => doc.id);

    logger.info(`Starting deletion of ${userIds.length} accounts`);

    let deletedCount = 0;
    let errorCount = 0;

    // Delete non-admin users first, admin last
    const sortedIds = userIds.filter((id) => id !== callerUid);
    sortedIds.push(callerUid);

    for (const userId of sortedIds) {
      try {
        logger.info(`Deleting user ${userId} (${deletedCount + 1}/${userIds.length})`);

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

        deletedCount++;
      } catch (error) {
        logger.error(`Error deleting user ${userId}:`, error);
        errorCount++;
      }
    }

    logger.info(
      `Deletion complete: ${deletedCount} deleted, ${errorCount} errors`
    );

    return {
      success: true,
      deletedCount,
      errorCount,
      totalUsers: userIds.length,
    };
  }
);

// --- Helper functions ---

export async function deleteSubcollection(
  db: admin.firestore.Firestore,
  path: string
): Promise<void> {
  const snapshot = await db.collection(path).get();
  if (snapshot.empty) return;

  const batchSize = 500;
  let batch = db.batch();
  let count = 0;

  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    count++;
    if (count >= batchSize) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

export async function deleteByQuery(
  db: admin.firestore.Firestore,
  collectionName: string,
  field: string,
  value: string
): Promise<void> {
  const snapshot = await db
    .collection(collectionName)
    .where(field, "==", value)
    .get();
  if (snapshot.empty) return;

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

export async function deleteUserPosts(
  db: admin.firestore.Firestore,
  bucket: any,
  userId: string
): Promise<void> {
  const postsSnapshot = await db
    .collection("posts")
    .where("userId", "==", userId)
    .get();

  for (const postDoc of postsSnapshot.docs) {
    const data = postDoc.data();

    // Delete subcollections
    await deleteSubcollection(db, `posts/${postDoc.id}/likes`);
    await deleteSubcollection(db, `posts/${postDoc.id}/comments`);

    // Delete media files
    const urls = data.mediaUrls || (data.mediaUrl ? [data.mediaUrl] : []);
    if (data.thumbnailUrl) urls.push(data.thumbnailUrl);
    for (const url of urls) {
      await deleteStorageFileByUrl(bucket, url);
    }

    await postDoc.ref.delete();
  }
}

export async function deleteStorageFileByUrl(
  bucket: any,
  url: string
): Promise<void> {
  try {
    if (!url || !url.includes("firebase")) return;
    // Extract path from Firebase Storage URL
    const decodedUrl = decodeURIComponent(url);
    const match = decodedUrl.match(/\/o\/(.+?)(\?|$)/);
    if (match && match[1]) {
      const file = bucket.file(match[1]);
      const [exists] = await file.exists();
      if (exists) await file.delete();
    }
  } catch {
    // Ignore - file may not exist
  }
}

export async function deleteStorageFolder(
  bucket: any,
  prefix: string
): Promise<void> {
  try {
    const [files] = await bucket.getFiles({prefix});
    await Promise.all(files.map((file: any) => file.delete()));
  } catch {
    // Ignore - folder may not exist
  }
}

export async function deleteFollowRelationships(
  db: admin.firestore.Firestore,
  userId: string
): Promise<void> {
  // Remove this user from other users' followers lists
  const followingSnapshot = await db
    .collection(`users/${userId}/following`)
    .get();
  for (const followDoc of followingSnapshot.docs) {
    const targetId = followDoc.id;
    const ref = db.doc(`users/${targetId}/followers/${userId}`);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      await db.doc(`users/${targetId}`).update({
        followersCount: admin.firestore.FieldValue.increment(-1),
      }).catch(() => {});
    }
  }

  // Remove this user from other users' following lists
  const followersSnapshot = await db
    .collection(`users/${userId}/followers`)
    .get();
  for (const followerDoc of followersSnapshot.docs) {
    const followerId = followerDoc.id;
    const ref = db.doc(`users/${followerId}/following/${userId}`);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      await db.doc(`users/${followerId}`).update({
        followingCount: admin.firestore.FieldValue.increment(-1),
      }).catch(() => {});
    }
  }
}

export async function deleteNotificationsAboutUser(
  db: admin.firestore.Firestore,
  userId: string
): Promise<void> {
  try {
    const snapshot = await db
      .collectionGroup("notifications")
      .where("fromUserId", "==", userId)
      .get();
    if (snapshot.empty) return;

    const batchSize = 500;
    let batch = db.batch();
    let count = 0;
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      count++;
      if (count >= batchSize) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  } catch {
    // Ignore permission errors
  }
}

export async function deleteUserChats(
  db: admin.firestore.Firestore,
  userId: string
): Promise<void> {
  const chatsSnapshot = await db
    .collection("chats")
    .where("participants", "array-contains", userId)
    .get();

  for (const chatDoc of chatsSnapshot.docs) {
    await deleteSubcollection(db, `chats/${chatDoc.id}/messages`);
    await chatDoc.ref.delete();
  }
}

export async function deleteUserFromParties(
  db: admin.firestore.Firestore,
  userId: string
): Promise<void> {
  // Delete parties created by user
  const createdSnapshot = await db
    .collection("parties")
    .where("createdBy", "==", userId)
    .get();
  for (const partyDoc of createdSnapshot.docs) {
    await partyDoc.ref.delete();
  }

  // Remove user from parties they're a member of
  const memberSnapshot = await db
    .collection("parties")
    .where("members", "array-contains", userId)
    .get();
  for (const partyDoc of memberSnapshot.docs) {
    const data = partyDoc.data();
    await partyDoc.ref.update({
      members: (data.members || []).filter((id: string) => id !== userId),
      memberDetails: (data.memberDetails || []).filter(
        (m: any) => m.userId !== userId
      ),
      pendingInvites: (data.pendingInvites || []).filter(
        (i: any) => i.userId !== userId
      ),
      challengeParticipants: (data.challengeParticipants || []).filter(
        (id: string) => id !== userId
      ),
      startingStats: (data.startingStats || []).filter(
        (s: any) => s.userId !== userId
      ),
    });
  }
}

export async function deleteUserDuoData(
  db: admin.firestore.Firestore,
  userId: string
): Promise<void> {
  const batch = db.batch();
  for (const game of ["valorant", "league"]) {
    batch.delete(db.doc(`duoCards/${userId}_${game}`));
    batch.delete(db.doc(`duoPosts/${userId}_${game}`));
    batch.delete(db.doc(`duoQueue/${userId}_${game}`));
  }
  await batch.commit();

  // Delete duo matches
  const q1 = await db
    .collection("duoMatches")
    .where("user1Id", "==", userId)
    .get();
  const q2 = await db
    .collection("duoMatches")
    .where("user2Id", "==", userId)
    .get();

  const matchBatch = db.batch();
  [...q1.docs, ...q2.docs].forEach((doc) => matchBatch.delete(doc.ref));
  if (q1.docs.length + q2.docs.length > 0) {
    await matchBatch.commit();
  }
}
