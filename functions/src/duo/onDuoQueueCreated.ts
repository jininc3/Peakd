/**
 * Cloud Function: Match duo queue entries
 * Triggered when a new duo queue document is created.
 * Finds another searching user for the same game and creates a match.
 */

import * as admin from "firebase-admin";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {logger} from "firebase-functions/v2";
import {getRankDistance, getTierRange} from "../utils/rankMatcher";

/** A full team in both games. KEEP IN SYNC with TEAM_SIZE in Peakd-web lib/lfgService.ts. */
const TEAM_SIZE = 5;

/**
 * How many players an entry queues as. Find team is for filling the last
 * spot in a five: a four-stack needing a fifth writes `partySize` 4, a solo
 * willing to be that fifth writes 1 (Peakd-web). A duo is always one, and
 * entries without the field count as one.
 */
function partySizeOf(data: FirebaseFirestore.DocumentData, mode: string): number {
  if (mode !== "lfg") return 1;
  const n = Math.round(Number(data.partySize) || 1);
  return Math.min(Math.max(n, 1), TEAM_SIZE - 1);
}

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
    const partySize = partySizeOf(newEntry, mode);

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
          // LFG mode: no rank restriction. A four-stack and a solo, and
          // only that — two solos would be a duo, not a team.
          if (mode === "lfg") {
            const other = partySizeOf(doc.data(), mode);
            return Math.max(partySize, other) === TEAM_SIZE - 1 &&
              partySize + other === TEAM_SIZE;
          }
          // Duo mode: existing rank proximity filter
          const candidateRank = doc.data().currentRank || null;
          if (!currentRank || !candidateRank) return true;
          return getRankDistance(game, currentRank, candidateRank) <= tierRange;
        })
        .sort((a, b) => {
          // LFG: every candidate left completes the five equally; keep the
          // query's order.
          if (mode === "lfg") return 0;
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
            partySize,
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
            partySize: partySizeOf(candidateData, mode),
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
