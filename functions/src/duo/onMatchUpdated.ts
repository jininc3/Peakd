/**
 * Cloud Function: Handle duo match accept/decline
 * Triggered when a duoMatches document is updated.
 * Checks if both users accepted, or if one declined, and handles accordingly.
 */

import * as admin from "firebase-admin";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {logger} from "firebase-functions/v2";

export const onDuoMatchUpdated = onDocumentUpdated(
  "duoMatches/{matchId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) {
      return;
    }

    // Only process pending matches
    if (after.status !== "pending") {
      return;
    }

    const matchId = event.params.matchId;
    const db = admin.firestore();
    const matchRef = db.collection("duoMatches").doc(matchId);

    // Check if both users accepted
    if (after.user1Accepted === true && after.user2Accepted === true) {
      logger.info(`Both users accepted match ${matchId}`);
      await matchRef.update({status: "active"});

      // Clean up queue entries
      const queue1Ref = db.collection("duoQueue").doc(`${after.user1Id}_${after.game}`);
      const queue2Ref = db.collection("duoQueue").doc(`${after.user2Id}_${after.game}`);
      await Promise.all([
        queue1Ref.delete().catch(() => {}),
        queue2Ref.delete().catch(() => {}),
      ]);

      return;
    }

    // When a user declines, log it but keep the match "pending" until
    // the timer expires. The cleanupExpiredMatches scheduler will handle
    // status change, re-queuing the acceptor, and cleaning up queue entries.
    if (after.user1Accepted === "declined" && before.user1Accepted !== "declined") {
      logger.info(`User1 (${after.user1Id}) declined match ${matchId} — waiting for timer`);

      // If both have now responded (both declined, or one accepted + one declined), no need to wait
      if (after.user2Accepted === "declined") {
        logger.info(`Both users declined match ${matchId}`);
        // Still let the timer run — cleanupExpiredMatches will handle it
      }
      return;
    }

    if (after.user2Accepted === "declined" && before.user2Accepted !== "declined") {
      logger.info(`User2 (${after.user2Id}) declined match ${matchId} — waiting for timer`);

      if (after.user1Accepted === "declined") {
        logger.info(`Both users declined match ${matchId}`);
      }
      return;
    }
  }
);

