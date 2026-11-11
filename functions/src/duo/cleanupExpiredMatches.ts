/**
 * Scheduled function that runs every minute to clean up expired pending matches.
 * If a match is pending past its expiresAt, marks it as expired.
 * Re-queues users who accepted but whose partner timed out.
 */

import * as admin from "firebase-admin";
import {onSchedule} from "firebase-functions/v2/scheduler";

export const cleanupExpiredMatchesScheduled = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "America/Los_Angeles",
  },
  async () => {
    console.log("Checking for expired pending matches...");

    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    try {
      const expiredMatches = await db
        .collection("duoMatches")
        .where("status", "==", "pending")
        .where("expiresAt", "<", now)
        .get();

      if (expiredMatches.empty) {
        console.log("No expired matches found");
        return;
      }

      for (const matchDoc of expiredMatches.docs) {
        const data = matchDoc.data();

        // Mark match as expired
        await matchDoc.ref.update({status: "expired"});

        // Clean up queue entries
        const queue1Ref = db.collection("duoQueue").doc(`${data.user1Id}_${data.game}`);
        const queue2Ref = db.collection("duoQueue").doc(`${data.user2Id}_${data.game}`);
        await Promise.all([
          queue1Ref.delete().catch(() => {}),
          queue2Ref.delete().catch(() => {}),
        ]);

        // Re-queue users who accepted (the other person timed out)
        if (data.user1Accepted === true && data.user2Accepted !== true) {
          await requeueUser(db, data.user1Id, data.game, data.user1Card, data.mode || "duo");
        }
        if (data.user2Accepted === true && data.user1Accepted !== true) {
          await requeueUser(db, data.user2Id, data.game, data.user2Card, data.mode || "duo");
        }

        console.log(`Expired match ${matchDoc.id}`);
      }

      console.log(`Processed ${expiredMatches.size} expired matches`);
    } catch (error) {
      console.error("Error cleaning up expired matches:", error);
    }
  }
);

async function requeueUser(
  db: admin.firestore.Firestore,
  userId: string,
  game: string,
  cardData: any,
  mode: string = "duo",
) {
  const queueRef = db.collection("duoQueue").doc(`${userId}_${game}`);
  await queueRef.set({
    userId,
    game,
    mode,
    status: "searching",
    matchedWith: null,
    matchId: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    username: cardData.username || "",
    avatar: cardData.avatar || null,
    inGameIcon: cardData.inGameIcon || null,
    inGameName: cardData.inGameName || null,
    currentRank: cardData.currentRank || null,
    mainRole: cardData.mainRole || null,
    mainAgent: cardData.mainAgent || null,
    lookingFor: cardData.lookingFor || null,
    peakRank: cardData.peakRank || null,
    region: cardData.region || null,
    partySize: cardData.partySize || 1,
  });
  console.log(`Re-queued user ${userId} for ${game}`);
}
