/**
 * Get League of Legends Stats Cloud Function
 *
 * This function fetches League of Legends player statistics from Riot API and caches them in Firestore.
 * Implements auto-refresh if data is older than 3 hours.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
  getSummonerByPuuid,
  getRankedStats,
  getChampionMastery,
  getTotalMasteryScore,
} from "./riotApi";
import {GetStatsResponse, UserRiotStats} from "../types/riot";

// Cache duration: 3 hours in milliseconds
const CACHE_DURATION_MS = 3 * 60 * 60 * 1000;

/**
 * Check if cached data is still fresh
 */
function isCacheFresh(lastUpdated: admin.firestore.Timestamp): boolean {
  const now = Date.now();
  const lastUpdatedMs = lastUpdated.toMillis();
  return (now - lastUpdatedMs) < CACHE_DURATION_MS;
}

/**
 * Calculate win rate percentage
 */
function calculateWinRate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100 * 100) / 100; // Round to 2 decimals
}

/**
 * Update peak rank if current rank is higher
 */
async function updatePeakRank(
  userId: string,
  currentTier: string,
  currentRank: string,
  currentStats: UserRiotStats
): Promise<void> {
  const rankOrder: {[key: string]: number} = {
    "IRON": 1,
    "BRONZE": 2,
    "SILVER": 3,
    "GOLD": 4,
    "PLATINUM": 5,
    "EMERALD": 6,
    "DIAMOND": 7,
    "MASTER": 8,
    "GRANDMASTER": 9,
    "CHALLENGER": 10,
  };

  const divisionOrder: {[key: string]: number} = {
    "IV": 1,
    "III": 2,
    "II": 3,
    "I": 4,
  };

  const currentRankValue = rankOrder[currentTier] || 0;
  const currentDivisionValue = divisionOrder[currentRank] || 0;

  // If no peak rank, set current as peak
  if (!currentStats.peakRank) {
    const db = admin.firestore();
    await db.collection("users").doc(userId).update({
      "riotStats.peakRank": {
        tier: currentTier,
        rank: currentRank,
        season: "2025", // Update this based on current season
        achievedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
    return;
  }

  const peakRankValue = rankOrder[currentStats.peakRank.tier] || 0;
  const peakDivisionValue = divisionOrder[currentStats.peakRank.rank] || 0;

  // Compare ranks
  const isHigherRank = currentRankValue > peakRankValue ||
    (currentRankValue === peakRankValue && currentDivisionValue > peakDivisionValue);

  if (isHigherRank) {
    const db = admin.firestore();
    await db.collection("users").doc(userId).update({
      "riotStats.peakRank": {
        tier: currentTier,
        rank: currentRank,
        season: "2025",
        achievedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
    logger.info(`Updated peak rank for user ${userId}: ${currentTier} ${currentRank}`);
  }
}

/**
 * Get League of Legends stats (with caching and auto-refresh)
 *
 * @param request - Callable request containing data and auth
 * @returns Response with stats and cache status
 */
export const getLeagueStatsFunction = onCall(
  {
    invoker: "public",
    secrets: ["RIOT_API_KEY"],
  },
  async (request): Promise<GetStatsResponse> => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to get Riot stats"
      );
    }

    const userId = request.auth.uid;
    const data = request.data as {forceRefresh?: boolean};
    const {forceRefresh = false} = data;

    try {
      logger.info(`User ${userId} is fetching League stats (forceRefresh: ${forceRefresh})`);

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

      // Check if Riot account is linked
      if (!userData?.riotAccount || !userData.riotAccount.puuid) {
        throw new HttpsError(
          "failed-precondition",
          "No Riot account linked. Please link your account first."
        );
      }

      const {puuid, region} = userData.riotAccount;

      // Check if we have cached stats and they're fresh
      const cachedStats = userData.riotStats as UserRiotStats | undefined;
      if (cachedStats && cachedStats.lastUpdated && !forceRefresh) {
        if (isCacheFresh(cachedStats.lastUpdated)) {
          logger.info(`Returning cached League stats for user ${userId}`);
          return {
            success: true,
            message: "Stats retrieved from cache",
            stats: cachedStats,
            cached: true,
          };
        }
      }

      logger.info(`Fetching fresh League stats from Riot API for user ${userId}`);

      // Fetch fresh data from Riot API
      const [summonerData, rankedStats, topChampions, masteryScore] = await Promise.all([
        getSummonerByPuuid(puuid, region),
        getRankedStats(puuid, region),
        getChampionMastery(puuid, region, 3),
        getTotalMasteryScore(puuid, region),
      ]);

      // Process ranked stats — solo/duo only (flex queue intentionally ignored)
      const soloQueue = rankedStats.find((q) => q.queueType === "RANKED_SOLO_5x5");

      // Initialize peak rank - if no cached peak and we have solo queue data, use current rank
      let initialPeakRank = cachedStats?.peakRank;
      if (!initialPeakRank && soloQueue) {
        initialPeakRank = {
          tier: soloQueue.tier,
          rank: soloQueue.rank,
          season: "2025",
          achievedAt: admin.firestore.Timestamp.now(),
        };
      } else if (!initialPeakRank) {
        initialPeakRank = {
          tier: "UNRANKED",
          rank: "",
          season: "2025",
          achievedAt: admin.firestore.Timestamp.now(),
        };
      }

      const stats: UserRiotStats = {
        puuid,
        summonerLevel: summonerData.summonerLevel,
        profileIconId: summonerData.profileIconId,
        rankedSolo: soloQueue ? {
          tier: soloQueue.tier,
          rank: soloQueue.rank,
          leaguePoints: soloQueue.leaguePoints,
          wins: soloQueue.wins,
          losses: soloQueue.losses,
          winRate: calculateWinRate(soloQueue.wins, soloQueue.losses),
        } : {
          tier: "UNRANKED",
          rank: "",
          leaguePoints: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
        },
        topChampions: topChampions.map((champ) => ({
          championId: champ.championId,
          championLevel: champ.championLevel,
          championPoints: champ.championPoints,
        })),
        totalMasteryScore: masteryScore,
        lastUpdated: admin.firestore.Timestamp.now(),
        peakRank: initialPeakRank,
      };

      // Update peak rank if applicable
      if (soloQueue) {
        await updatePeakRank(userId, soloQueue.tier, soloQueue.rank, stats);
        // Re-fetch to get updated peak rank
        const updatedDoc = await userRef.get();
        const updatedData = updatedDoc.data();
        if (updatedData?.riotStats?.peakRank) {
          stats.peakRank = updatedData.riotStats.peakRank;
        }
      }

      // Store in Firestore
      await userRef.update({
        riotStats: stats,
      });

      // Also update gameStats subcollection for leaderboard access
      const gameStatsRef = userRef.collection("gameStats").doc("league");
      const currentRank = soloQueue ? `${soloQueue.tier} ${soloQueue.rank}` : "Unranked";
      const lp = soloQueue ? soloQueue.leaguePoints : 0;

      await gameStatsRef.set({
        currentRank,
        lp,
        dailyGain: 0, // Can be calculated based on previous data if needed
        lastUpdated: admin.firestore.Timestamp.now(),
      }, {merge: true});

      logger.info(`Successfully updated Riot stats for user ${userId}`);

      return {
        success: true,
        message: "Stats updated successfully",
        stats,
        cached: false,
      };
    } catch (error) {
      logger.error("Error fetching Riot stats:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      // If we have cached data, return it even if stale
      const db = admin.firestore();
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      const cachedStats = userData?.riotStats as UserRiotStats | undefined;

      if (cachedStats) {
        logger.info(`Returning stale cached stats due to API error for user ${userId}`);
        return {
          success: true,
          message: "Showing cached stats (Riot API unavailable)",
          stats: cachedStats,
          cached: true,
        };
      }

      throw new HttpsError(
        "internal",
        "Failed to fetch Riot stats. Please try again later."
      );
    }
  }
);
