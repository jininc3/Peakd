/**
 * Get TFT Stats Cloud Function
 *
 * This function fetches TFT (Teamfight Tactics) player statistics from Riot API and caches them in Firestore.
 * Implements auto-refresh if data is older than 3 hours.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
  getSummonerByPuuid,
  getTftSummonerByPuuid,
  getTftRankedStats,
} from "./riotApi";
import {GetTftStatsResponse, UserTftStats} from "../types/riot";

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
 * Get TFT stats (with caching and auto-refresh)
 *
 * @param request - Callable request containing data and auth
 * @returns Response with stats and cache status
 */
export const getTftStatsFunction = onCall(
  {
    invoker: "public",
    secrets: ["RIOT_API_KEY"],
  },
  async (request): Promise<GetTftStatsResponse> => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to get TFT stats"
      );
    }

    const userId = request.auth.uid;
    const data = request.data as {forceRefresh?: boolean};
    const {forceRefresh = false} = data;

    try {
      logger.info('User ' + userId + ' is fetching TFT stats (forceRefresh: ' + forceRefresh + ')');

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
      const cachedStats = userData.tftStats as UserTftStats | undefined;
      if (cachedStats && cachedStats.lastUpdated && !forceRefresh) {
        if (isCacheFresh(cachedStats.lastUpdated)) {
          logger.info('Returning cached TFT stats for user ' + userId);
          return {
            success: true,
            message: "Stats retrieved from cache",
            stats: cachedStats,
            cached: true,
          };
        }
      }

      logger.info('Fetching fresh TFT stats from Riot API for user ' + userId);

      // The TFT league endpoint is legacy: it wants a summoner ID, not a PUUID.
      // The TFT summoner response usually carries that id, so prefer it and
      // only fall back to the LoL summoner endpoint (the id is account-wide)
      // when Riot omits it — saving a round trip in the common case.
      const tftSummonerData = await getTftSummonerByPuuid(puuid, region);

      let summonerId = tftSummonerData.id;
      if (!summonerId) {
        logger.info("TFT summoner response carried no id; falling back to LoL summoner");
        const lolSummonerData = await getSummonerByPuuid(puuid, region);
        summonerId = lolSummonerData.id;
      }

      if (!summonerId) {
        logger.error("Neither TFT nor LoL summoner endpoint returned a summoner ID");
        throw new HttpsError(
          "internal",
          "Unable to fetch summoner ID from Riot API"
        );
      }

      // Fetch TFT ranked stats using the resolved summoner ID
      let rankedTft = null;
      let rankedDoubleUp = null;

      try {
        const rankedStats = await getTftRankedStats(summonerId, region);
        rankedTft = rankedStats.find((q) => q.queueType === "RANKED_TFT");
        rankedDoubleUp = rankedStats.find((q) => q.queueType === "RANKED_TFT_DOUBLE_UP");
        logger.info('Successfully fetched TFT ranked stats!');
      } catch (error) {
        logger.error('Failed to fetch TFT ranked stats:', error);
        // Continue anyway - we'll return profile data even if ranked stats fail
      }

      // Helper function to calculate win rate
      const calculateWinRate = (wins: number, losses: number): number => {
        const total = wins + losses;
        if (total === 0) return 0;
        return Math.round((wins / total) * 100 * 100) / 100;
      };

      const stats: UserTftStats = {
        puuid,
        summonerLevel: tftSummonerData.summonerLevel,
        profileIconId: tftSummonerData.profileIconId,
        rankedTft: rankedTft ? {
          tier: rankedTft.tier,
          rank: rankedTft.rank,
          leaguePoints: rankedTft.leaguePoints,
          wins: rankedTft.wins,
          losses: rankedTft.losses,
          winRate: calculateWinRate(rankedTft.wins, rankedTft.losses),
        } : {
          tier: "UNRANKED",
          rank: "",
          leaguePoints: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
        },
        rankedDoubleUp: rankedDoubleUp ? {
          tier: rankedDoubleUp.tier,
          rank: rankedDoubleUp.rank,
          leaguePoints: rankedDoubleUp.leaguePoints,
          wins: rankedDoubleUp.wins,
          losses: rankedDoubleUp.losses,
          winRate: calculateWinRate(rankedDoubleUp.wins, rankedDoubleUp.losses),
        } : {
          tier: "UNRANKED",
          rank: "",
          leaguePoints: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
        },
        lastUpdated: admin.firestore.Timestamp.now(),
        peakRank: cachedStats?.peakRank || {
          tier: "UNRANKED",
          rank: "",
          season: "2025",
          achievedAt: admin.firestore.Timestamp.now(),
        },
      };

      // Store in Firestore
      await userRef.update({
        tftStats: stats,
      });

      logger.info('Successfully updated TFT stats for user ' + userId);

      return {
        success: true,
        message: "Stats updated successfully",
        stats,
        cached: false,
      };
    } catch (error) {
      logger.error("Error fetching TFT stats:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      // If we have cached data, return it even if stale
      const db = admin.firestore();
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      const cachedStats = userData?.tftStats as UserTftStats | undefined;

      if (cachedStats) {
        logger.info('Returning stale cached TFT stats due to API error for user ' + userId);
        return {
          success: true,
          message: "Showing cached stats (Riot API unavailable)",
          stats: cachedStats,
          cached: true,
        };
      }

      throw new HttpsError(
        "internal",
        "Failed to fetch TFT stats. Please try again later."
      );
    }
  }
);
