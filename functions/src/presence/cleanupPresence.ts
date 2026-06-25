/**
 * Scheduled function that runs every 5 minutes to clean up stale presence entries.
 * Marks users as offline if their lastSeen timestamp is older than 5 minutes.
 */

import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore} from "firebase-admin/firestore";

export const cleanupPresenceScheduled = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/Los_Angeles",
  },
  async () => {
    console.log("Cleaning up stale presence entries...");

    const db = getFirestore();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    try {
      const staleEntries = await db
        .collection("presence")
        .where("online", "==", true)
        .where("lastSeen", "<", fiveMinutesAgo)
        .get();

      if (staleEntries.empty) {
        console.log("No stale presence entries found");
        return;
      }

      const batch = db.batch();
      for (const doc of staleEntries.docs) {
        batch.update(doc.ref, {online: false});
      }
      await batch.commit();

      console.log(`Marked ${staleEntries.size} users as offline`);
    } catch (error) {
      console.error("Error cleaning up presence:", error);
    }
  }
);
