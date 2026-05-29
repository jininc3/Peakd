/**
 * Cloud Function: Match duo queue entries
 * Triggered when a new duo queue document is created.
 * Finds another searching user for the same game and creates a match.
 */

import * as admin from "firebase-admin";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {logger} from "firebase-functions/v2";
import {getRankDistance, getTierRange} from "../utils/rankMatcher";

export const onDuoQueueCreated = onDocumentCreated(
  "duoQueue/{docId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No data associated with the event");
      return;
    }

    const newEntry = snapshot.data();
    const newEntryRef = snapshot.ref;
    const newUserId = newEntry.userId;
    const game = newEntry.game;
    const mode = newEntry.mode || "duo";

    logger.info(`Duo queue entry created: ${newUserId} searching for ${game} (${mode})`);

    const db = admin.firestore();

    try {
      // Find another user searching for the same game
      const candidatesQuery = db
        .collection("duoQueue")
        .where("status", "==", "searching")
        .where("game", "==", game)
        .where("mode", "==", mode);

      const candidatesSnapshot = await candidatesQuery.get();

      // Filter out self, filter by rank proximity, sort by closest rank
      const currentRank = newEntry.currentRank || null;
      const tierRange = getTierRange(game);

      const candidates = candidatesSnapshot.docs
        .filter((doc) => doc.data().userId !== newUserId)
        .filter((doc) => {
          // LFG mode: no rank restriction (match anyone)
          if (mode === "lfg") return true;
          // Duo mode: existing rank proximity filter
          const candidateRank = doc.data().currentRank || null;
          if (!currentRank || !candidateRank) return true;
          return getRankDistance(game, currentRank, candidateRank) <= tierRange;
        })
        .sort((a, b) => {
          const distA = getRankDistance(game, currentRank, a.data().currentRank);
          const distB = getRankDistance(game, currentRank, b.data().currentRank);
          return distA - distB;
        });

      const candidate = candidates[0] || null;

      if (!candidate) {
        logger.info(`No match found for ${newUserId}, staying in queue`);
        return;
      }

      const candidateData = candidate.data();
      const candidateRef = candidate.ref;

      // Use a transaction to atomically create the match
      await db.runTransaction(async (transaction) => {
        // Re-read both documents inside the transaction
        const freshNewEntry = await transaction.get(newEntryRef);
        const freshCandidate = await transaction.get(candidateRef);

        // Verify both are still searching
        if (
          !freshNewEntry.exists ||
          freshNewEntry.data()?.status !== "searching"
        ) {
          logger.info(`New entry ${newUserId} is no longer searching`);
          return;
        }
        if (
          !freshCandidate.exists ||
          freshCandidate.data()?.status !== "searching"
        ) {
          logger.info(
            `Candidate ${candidateData.userId} is no longer searching`
          );
          return;
        }

        // Create the match document
        const matchRef = db.collection("duoMatches").doc();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 1000); // 30 seconds

        const matchData = {
          game: game,
          mode: mode,
          user1Id: newUserId,
          user2Id: candidateData.userId,
          user1Card: {
            userId: newEntry.userId,
            username: newEntry.username,
            avatar: newEntry.avatar || null,
            inGameIcon: newEntry.inGameIcon || null,
            inGameName: newEntry.inGameName || null,
            currentRank: newEntry.currentRank || null,
            mainRole: newEntry.mainRole || null,
            mainAgent: newEntry.mainAgent || null,
          },
          user2Card: {
            userId: candidateData.userId,
            username: candidateData.username,
            avatar: candidateData.avatar || null,
            inGameIcon: candidateData.inGameIcon || null,
            inGameName: candidateData.inGameName || null,
            currentRank: candidateData.currentRank || null,
            mainRole: candidateData.mainRole || null,
            mainAgent: candidateData.mainAgent || null,
          },
          user1Accepted: false,
          user2Accepted: false,
          status: "pending",
          expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        transaction.set(matchRef, matchData);

        // Update both queue entries
        transaction.update(newEntryRef, {
          status: "matched",
          matchedWith: candidateData.userId,
          matchId: matchRef.id,
        });

        transaction.update(candidateRef, {
          status: "matched",
          matchedWith: newUserId,
          matchId: matchRef.id,
        });

        logger.info(
          `Match created: ${matchRef.id} between ${newUserId} and ${candidateData.userId}`
        );
      });
    } catch (error) {
      logger.error("Error processing duo queue:", error);
      throw error;
    }
  }
);
