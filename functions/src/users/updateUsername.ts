/**
 * Cloud Function: Update username across all denormalized locations
 *
 * When a user changes their username, this function updates it in:
 * - users/{userId} (main document)
 * - posts (where userId matches)
 * - posts/{postId}/comments (where userId matches)
 * - posts/{postId}/likes/{userId}
 * - users/{anyUser}/followers/{userId}
 * - users/{anyUser}/following/{userId} (followingUsername)
 * - users/{userId}/following/{anyUser} (these are other users, skip)
 * - chats (participantDetails)
 * - users/{anyUser}/notifications (fromUserId matches)
 * - duoPosts (where userId matches)
 * - parties (memberDetails and challengeInvites where userId matches)
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";

/** Matches the website's (Peakd-web settings/account/username), KEEP IN SYNC. */
const COOLDOWN_DAYS = 15;

export const updateUsernameFunction = onCall(
  {invoker: "public"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to change username."
      );
    }

    const uid = request.auth.uid;
    const {newUsername} = request.data as {newUsername: string};

    if (!newUsername || typeof newUsername !== "string") {
      throw new HttpsError("invalid-argument", "New username is required.");
    }

    // Validate username format: the website's sign-up and rename rule
    // (Peakd-web USERNAME_RE), KEEP IN SYNC.
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(newUsername)) {
      throw new HttpsError(
        "invalid-argument",
        "Username must be 3-20 characters: letters, numbers and underscores."
      );
    }

    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User document not found.");
    }

    const userData = userDoc.data()!;
    const oldUsername = userData.username;

    // Cooldown since the last change. The website records it as
    // usernameChangedAt and this function as lastUsernameChange; whichever
    // is later counts, and both are written below.
    const changedAt = [userData.lastUsernameChange, userData.usernameChangedAt]
      .map((t) => (t && typeof t.toDate === "function" ? t.toDate() as Date : null))
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (changedAt) {
      const lastChange = changedAt;
      const now = new Date();
      const daysSince = Math.floor(
        (now.getTime() - lastChange.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince < COOLDOWN_DAYS) {
        const daysRemaining = COOLDOWN_DAYS - daysSince;
        throw new HttpsError(
          "failed-precondition",
          `You can change your username again in ${daysRemaining} ` +
          `day${daysRemaining === 1 ? "" : "s"}.`
        );
      }
    }

    // Check if new username is same as current
    if (oldUsername === newUsername) {
      throw new HttpsError(
        "invalid-argument",
        "New username must be different from current username."
      );
    }

    // Check username availability (case-insensitive)
    const usernameQuery = await db
      .collection("users")
      .where("usernameLower", "==", newUsername.toLowerCase())
      .get();

    for (const doc of usernameQuery.docs) {
      if (doc.id !== uid) {
        throw new HttpsError(
          "already-exists",
          "This username is already taken."
        );
      }
    }

    logger.info(`Updating username for ${uid}: ${oldUsername} -> ${newUsername}`);

    // 1. Update the main user document
    await userRef.update({
      username: newUsername,
      usernameLower: newUsername.toLowerCase(),
      lastUsernameChange: admin.firestore.FieldValue.serverTimestamp(),
      usernameChangedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Update posts where userId matches
    const postsQuery = await db
      .collection("posts")
      .where("userId", "==", uid)
      .get();

    const postBatches = chunkArray(postsQuery.docs, 400);
    for (const chunk of postBatches) {
      const batch = db.batch();
      for (const postDoc of chunk) {
        batch.update(postDoc.ref, {username: newUsername});
      }
      await batch.commit();
    }

    // 3. Update comments across all posts
    // We need to query collectionGroup for comments by this user
    const commentsQuery = await db
      .collectionGroup("comments")
      .where("userId", "==", uid)
      .get();

    const commentBatches = chunkArray(commentsQuery.docs, 400);
    for (const chunk of commentBatches) {
      const batch = db.batch();
      for (const commentDoc of chunk) {
        batch.update(commentDoc.ref, {username: newUsername});
      }
      await batch.commit();
    }

    // 4. Update likes across all posts
    const likesQuery = await db
      .collectionGroup("likes")
      .where("userId", "==", uid)
      .get();

    const likeBatches = chunkArray(likesQuery.docs, 400);
    for (const chunk of likeBatches) {
      const batch = db.batch();
      for (const likeDoc of chunk) {
        batch.update(likeDoc.ref, {username: newUsername});
      }
      await batch.commit();
    }

    // 5. Update follower records (where this user is a follower of someone)
    const followerQuery = await db
      .collectionGroup("followers")
      .where("followerId", "==", uid)
      .get();

    const followerBatches = chunkArray(followerQuery.docs, 400);
    for (const chunk of followerBatches) {
      const batch = db.batch();
      for (const followerDoc of chunk) {
        batch.update(followerDoc.ref, {followerUsername: newUsername});
      }
      await batch.commit();
    }

    // 6. Update following records (where someone is following this user)
    const followingQuery = await db
      .collectionGroup("following")
      .where("followingId", "==", uid)
      .get();

    const followingBatches = chunkArray(followingQuery.docs, 400);
    for (const chunk of followingBatches) {
      const batch = db.batch();
      for (const followingDoc of chunk) {
        batch.update(followingDoc.ref, {followingUsername: newUsername});
      }
      await batch.commit();
    }

    // 7. Update chats where this user is a participant
    const chatsQuery = await db
      .collection("chats")
      .where("participants", "array-contains", uid)
      .get();

    const chatBatches = chunkArray(chatsQuery.docs, 400);
    for (const chunk of chatBatches) {
      const batch = db.batch();
      for (const chatDoc of chunk) {
        batch.update(chatDoc.ref, {
          [`participantDetails.${uid}.username`]: newUsername,
        });
      }
      await batch.commit();
    }

    // 8. Update notifications sent by this user
    const notificationsQuery = await db
      .collectionGroup("notifications")
      .where("fromUserId", "==", uid)
      .get();

    const notifBatches = chunkArray(notificationsQuery.docs, 400);
    for (const chunk of notifBatches) {
      const batch = db.batch();
      for (const notifDoc of chunk) {
        batch.update(notifDoc.ref, {fromUsername: newUsername});
      }
      await batch.commit();
    }

    // 9. Update duo posts
    const duoPostsQuery = await db
      .collection("duoPosts")
      .where("userId", "==", uid)
      .get();

    const duoBatches = chunkArray(duoPostsQuery.docs, 400);
    for (const chunk of duoBatches) {
      const batch = db.batch();
      for (const duoDoc of chunk) {
        batch.update(duoDoc.ref, {username: newUsername});
      }
      await batch.commit();
    }

    // 10. Update parties where this user is a member
    const partiesQuery = await db.collection("parties").get();
    const partyBatches = chunkArray(partiesQuery.docs, 400);
    for (const chunk of partyBatches) {
      const batch = db.batch();
      let hasUpdates = false;
      for (const partyDoc of chunk) {
        const partyData = partyDoc.data();
        // The name is copied into memberDetails and into any challenge's
        // invites; both are rewritten in the one update.
        const update: Record<string, unknown> = {};
        for (const field of ["memberDetails", "challengeInvites"]) {
          const list = partyData[field];
          if (!Array.isArray(list)) continue;
          if (!list.some((m: {userId?: string}) => m?.userId === uid)) continue;
          update[field] = list.map((m: {userId?: string}) =>
            m?.userId === uid ? {...m, username: newUsername} : m
          );
        }
        if (Object.keys(update).length > 0) {
          batch.update(partyDoc.ref, update);
          hasUpdates = true;
        }
      }
      if (hasUpdates) {
        await batch.commit();
      }
    }

    logger.info(
      `Successfully updated username for ${uid} across all collections`
    );

    return {success: true, newUsername};
  }
);

/**
 * Split an array into chunks for batched writes (Firestore limit is 500)
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
