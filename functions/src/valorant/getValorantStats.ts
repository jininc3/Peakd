/**
 * Get Valorant Stats Cloud Function (using Henrik's API)
 *
 * This function fetches comprehensive Valorant statistics for the authenticated user.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {recordRankSnapshotIfChanged} from "../rankHistory/recordRankSnapshot";
import {
  getValorantMMR,
  getValorantAccountByRiotId,
  getValorantMatches,
} from "./valorantApi";

export interface MatchHistoryEntry {
  matchId: string;
  agent: string;
  kills: number;
  deaths: number;
  assists: number;
  won: boolean;
  map: string;
  gameStart: number; // Unix timestamp in seconds
  playedAt: number; // Unix timestamp in milliseconds (for match history consumers)
  score: string; // e.g., "13-7"
  placement?: number; // Player's rank out of 10 by combat score (1st = highest)
  currentRank?: string; // Player's rank at the time of this match, e.g., "Gold 3"
}

export interface ValorantStats {
  gameName: string;
  tag: string;
  region: string;
  accountLevel: number;
  card?: {
    small: string;
    large: string;
    wide: string;
    id: string;
  };
  currentRank: string; // e.g., "Gold 3"
  rankRating: number; // RR (Rank Rating)
  mmr: number; // MMR
  peakRank?: {
    tier: string; // e.g., "Diamond 2"
    season: string;
  };
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  matchHistory?: MatchHistoryEntry[]; // Last 5 matches
  mostPlayedAgent?: string; // Most played agent from recent matches
  lastUpdated: any;
}

export interface GetValorantStatsResponse {
  success: boolean;
  message: string;
  stats?: ValorantStats;
  cached?: boolean;
}

/**
 * Get Valorant stats for the current user
 *
 * @param request - Callable request containing data and auth
 * @returns Response with success status and Valorant stats
 */
export const getValorantStatsFunction = onCall(
  {
    invoker: "public",
    secrets: ["HENRIK_API_KEY"],
  },
  async (request): Promise<GetValorantStatsResponse> => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to view Valorant stats"
      );
    }

    const userId = request.auth.uid;
    const {forceRefresh = false} = request.data;

    try {
      const db = admin.firestore();
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found");
      }

      const userData = userDoc.data();
      const valorantAccount = userData?.valorantAccount;

      if (!valorantAccount) {
        throw new HttpsError(
          "failed-precondition",
          "No Valorant account linked. Please link your Valorant account first."
        );
      }

      const {gameName: storedName, tag: rawTag, region} = valorantAccount;
      // Ensure tag is a string (might be stored as number in Firestore)
      const storedTag = String(rawTag || "");
      // Henrik API sometimes returns empty name/tag; if stored values are empty,
      // the user needs to re-link so the fallback in valorantApi can fix it
      if (!storedName || !storedTag) {
        throw new HttpsError(
          "failed-precondition",
          "Your Valorant account data is incomplete. Please unlink and re-link your account."
        );
      }
      const gameName = storedName;
      const tag = storedTag;

      // Check cache (stats updated in last 3 hours)
      const cachedStats = userData?.valorantStats;
      const cacheTime = cachedStats?.lastUpdated?.toDate();
      const cacheAge = cacheTime ? Date.now() - cacheTime.getTime() : Infinity;
      const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

      // Also check if matchHistory is missing or empty (old cache format)
      const hasMatchHistory = cachedStats?.matchHistory && Array.isArray(cachedStats.matchHistory) && cachedStats.matchHistory.length > 0;

      if (!forceRefresh && cachedStats && cacheAge < CACHE_TTL && hasMatchHistory) {
        logger.info(`Returning cached Valorant stats for user ${userId}`);
        return {
          success: true,
          message: "Valorant stats retrieved from cache",
          stats: cachedStats,
          cached: true,
        };
      }

      // If cache is missing matchHistory, log it
      if (cachedStats && !hasMatchHistory) {
        logger.info(`Cache missing matchHistory, fetching fresh data for user ${userId}`);
      }

      logger.info(`Fetching fresh Valorant stats for user ${userId}: ${gameName}#${tag}`);

      // Fetch fresh data from Henrik's API
      // Fetch 15 matches to calculate most played agent, but only show 5 in history
      const [accountData, mmrData, matchesData] = await Promise.all([
        getValorantAccountByRiotId(gameName, tag),
        getValorantMMR(region, gameName, tag),
        getValorantMatches(region, gameName, tag, 15), // Get last 15 matches for agent calculation
      ]);

      // Get seasonal stats from MMR data
      let wins = 0;
      let totalGames = 0;
      let losses = 0;

      // Get the current season's stats from by_season data
      if (mmrData.by_season && Object.keys(mmrData.by_season).length > 0) {
        // Find the most recent season that has actual data (not undefined)
        // Sort by episode and act number properly (e10a6 > e9a3)
        const seasonsWithData = Object.keys(mmrData.by_season)
          .filter(season => {
            const data = mmrData.by_season[season];
            return data && data.number_of_games !== undefined && data.number_of_games > 0;
          })
          .sort((a, b) => {
            // Extract episode and act numbers (e.g., "e10a6" -> episode=10, act=6)
            const parseSeasonCode = (code: string) => {
              const match = code.match(/e(\d+)a(\d+)/);
              if (!match) return { episode: 0, act: 0 };
              return {
                episode: parseInt(match[1], 10),
                act: parseInt(match[2], 10),
              };
            };

            const aData = parseSeasonCode(a);
            const bData = parseSeasonCode(b);

            // Sort by episode first, then act
            if (aData.episode !== bData.episode) {
              return aData.episode - bData.episode;
            }
            return aData.act - bData.act;
          });

        if (seasonsWithData.length > 0) {
          // Get the latest season with data
          const currentSeason = seasonsWithData[seasonsWithData.length - 1];
          const seasonData = mmrData.by_season[currentSeason];

          wins = seasonData.wins || 0;
          totalGames = seasonData.number_of_games || 0;
          losses = totalGames - wins;

          logger.info(`Current season ${currentSeason} stats: ${wins}W ${losses}L (${totalGames} total games)`);
        }
      }

      const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;

      // Process match history
      logger.info(`Raw matches data length: ${matchesData?.length || 0}`);
      const allMatches = matchesData.map((match): MatchHistoryEntry | null => {
        // Validate match has required metadata
        // Note: API returns 'matchid' (no underscore), not 'match_id'
        if (!match?.metadata?.matchid || !match?.players?.all_players || !match?.teams) {
          return null;
        }

        // Find the player in this match
        // Convert tags to strings for comparison (API returns string, Firestore might store number)
        const player = match.players.all_players.find(
          (p: any) => p.name?.toLowerCase() === gameName.toLowerCase() && String(p.tag).toLowerCase() === tag.toLowerCase()
        );

        if (!player || !player.stats || !player.team || !player.character) {
          return null;
        }

        // Determine if player won
        const playerTeam = player.team.toLowerCase(); // "red" or "blue"
        const teamData = playerTeam === "red" ? match.teams.red : match.teams.blue;
        if (!teamData) {
          return null;
        }
        const won = teamData.has_won ?? false;

        // Build score string
        const redRounds = match.teams.red?.rounds_won ?? 0;
        const blueRounds = match.teams.blue?.rounds_won ?? 0;
        const score = playerTeam === "red"
          ? `${redRounds}-${blueRounds}`
          : `${blueRounds}-${redRounds}`;

        // Calculate player's placement (rank out of 10 by combat score)
        const sortedPlayers = [...match.players.all_players]
          .sort((a, b) => (b.stats?.score ?? 0) - (a.stats?.score ?? 0));
        const placement = sortedPlayers.findIndex(
          (p) => p.name?.toLowerCase() === gameName.toLowerCase() && String(p.tag).toLowerCase() === tag.toLowerCase()
        ) + 1;

        const gameStart = match.metadata.game_start ?? Math.floor(Date.now() / 1000);
        return {
          matchId: match.metadata.matchid,
          agent: player.character,
          kills: player.stats.kills ?? 0,
          deaths: player.stats.deaths ?? 0,
          assists: player.stats.assists ?? 0,
          won,
          map: match.metadata.map ?? "Unknown",
          gameStart,
          playedAt: gameStart * 1000,
          score,
          placement: placement > 0 ? placement : undefined,
          currentRank: player.currenttier_patched || undefined,
        };
      }).filter((entry): entry is MatchHistoryEntry => entry !== null);

      // Calculate most played agent from all matches
      const agentCounts: { [agent: string]: number } = {};
      allMatches.forEach((match) => {
        if (match.agent) {
          agentCounts[match.agent] = (agentCounts[match.agent] || 0) + 1;
        }
      });

      // Find the most played agent
      let mostPlayedAgent: string | undefined;
      let maxCount = 0;
      for (const [agent, count] of Object.entries(agentCounts)) {
        if (count > maxCount) {
          maxCount = count;
          mostPlayedAgent = agent;
        }
      }

      logger.info(`Most played agent: ${mostPlayedAgent} (${maxCount} games)`);

      // Keep the last 10 matches for display (duo card detail shows up to 10)
      const matchHistory = allMatches.slice(0, 10);

      logger.info(`Processed match history length: ${matchHistory.length}`);
      if (matchHistory.length > 0) {
        logger.info(`First match: ${JSON.stringify(matchHistory[0])}`);
      }

      // Build stats object - ensure no undefined values for Firestore
      const stats: ValorantStats = {
        gameName: accountData.name ?? gameName,
        tag: accountData.tag ?? tag,
        region,
        accountLevel: accountData.account_level ?? 0,
        currentRank: mmrData.current_data?.currenttierpatched ?? "Unranked",
        rankRating: mmrData.current_data?.ranking_in_tier ?? 0,
        mmr: mmrData.current_data?.elo ?? 0,
        gamesPlayed: totalGames,
        wins,
        losses,
        winRate: parseFloat(winRate.toFixed(2)),
        matchHistory,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp() as any,
      };

      // Only add optional fields if they have values (Firestore doesn't accept undefined)
      if (accountData.card) {
        stats.card = accountData.card;
      }
      if (mmrData.highest_rank?.patched_tier && mmrData.highest_rank?.season) {
        stats.peakRank = {
          tier: mmrData.highest_rank.patched_tier,
          season: mmrData.highest_rank.season,
        };
      }
      if (mostPlayedAgent) {
        stats.mostPlayedAgent = mostPlayedAgent;
      }

      // Cache the stats in Firestore
      await userRef.update({
        valorantStats: stats,
      });

      // Fresh data from Henrik: append to the rank progression graph if RR or
      // rank moved since the last snapshot (best-effort).
      if (stats.currentRank && stats.currentRank !== "Unranked") {
        await recordRankSnapshotIfChanged(userId, {
          game: "valorant",
          value: stats.rankRating,
          rank: stats.currentRank,
        }).catch((err) => logger.warn("Valorant rank snapshot failed:", err));
      }

      // Also update gameStats subcollection for leaderboard access
      const gameStatsRef = userRef.collection("gameStats").doc("valorant");
      await gameStatsRef.set({
        currentRank: stats.currentRank,
        rr: stats.rankRating,
        dailyGain: 0, // Can be calculated based on previous data if needed
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      logger.info(`Successfully fetched Valorant stats for user ${userId}`);

      return {
        success: true,
        message: "Valorant stats retrieved successfully",
        stats,
        cached: false,
      };
    } catch (error: any) {
      logger.error("Error fetching Valorant stats:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      // Include the actual error message for debugging
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      logger.error("Detailed error:", errorMessage);

      throw new HttpsError(
        "internal",
        `Failed to fetch Valorant stats: ${errorMessage}`
      );
    }
  }
);
