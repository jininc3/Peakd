/**
 * Triggered when `users/{userId}/profileViewers/{viewerId_date}` is created.
 *
 * The client writes one marker doc per (viewer, day) pair — see
 * lib/profileService.ts `recordProfileView`. This increments the parent
 * user's `profileViews` counter via the Admin SDK, which bypasses security
 * rules, so the count can't be spoofed by a direct client write.
 */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { db } from "./helpers";

export const onProfileView = onDocumentCreated(
  "users/{userId}/profileViewers/{markerId}",
  async (event) => {
    const { userId } = event.params;
    await db.doc(`users/${userId}`).update({
      profileViews: admin.firestore.FieldValue.increment(1),
    });
  }
);
