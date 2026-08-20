/**
 * Get Recent Matches Cloud Function
 *
 * Fetches the last 5 ranked match results (win/loss) for a given user.
 * Supports both League of Legends (Riot match-v5) and Valorant (Henrik matches API).
 * Accepts a targetUserId so it can be called for any user's duo card, not just the authenticated user.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {getRecentMatchIds, getMatchById} from "./riotApi";
import {getValorantMatches} from "../valorant/valorantApi";

export interface RecentMatchResult {
  won: boolean;
  // Valorant-specific fields
  agent?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  map?: string;
  score?: string;
  playedAt?: number; // Unix timestamp in milliseconds
  placement?: number; // Player's rank out of 10 by combat score
  // League-specific fields
  champion?: string;
  championId?: number;
}

export interface GetRecentMatchesRequest {
  targetUserId: string;
  game: "league" | "valorant";
  count?: number;
}

export interface GetRecentMatchesResponse {
  success: boolean;
  matches: RecentMatchResult[];
  message?: string;
}

export const getRecentMatchesFunction = onCall(
  {
    invoker: "public",
    secrets: ["RIOT_API_KEY", "HENRIK_API_KEY"],
  },
  async (request): Promise<GetRecentMatchesResponse> => {
    const {targetUserId, game, count} = request.data as GetRecentMatchesRequest;

    if (!targetUserId || !game) {
      throw new HttpsError(
        "invalid-argument",
        "targetUserId and game are required"
      );
    }

    const matchCount = count && count > 0 ? Math.min(count, 20) : 5;

    try {
      const db = admin.firestore();
      const userDoc = await db.collection("users").doc(targetUserId).get();

      if (!userDoc.exists) {
        return {
          success: true,
          matches: [],
          message: "User not found",
        };
      }

      const userData = userDoc.data();

      if (game === "league") {
        return await getLeagueRecentMatches(userData, matchCount);
      } else {
        return await getValorantRecentMatches(userData, matchCount);
      }
    } catch (error) {
      logger.error("Error fetching recent matches:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      // Return empty matches gracefully instead of crashing
      return {
        success: true,
        matches: [],
        message: "Could not fetch match history",
      };
    }
  }
);

async function getLeagueRecentMatches(userData: any, count: number): Promise<GetRecentMatchesResponse> {
  const riotAccount = userData?.riotAccount;

  if (!riotAccount?.puuid) {
    return {
      success: true,
      matches: [],
      message: "No Riot account linked",
    };
  }

  const {puuid, region} = riotAccount;

  // Step 1: Get last N ranked match IDs
  const matchIds = await getRecentMatchIds(puuid, region, count);

  if (!matchIds || matchIds.length === 0) {
    return {
      success: true,
      matches: [],
      message: "No recent matches found",
    };
  }

  // Step 2: Fetch each match detail and extract win/loss for this player
  const matches: RecentMatchResult[] = [];

  for (const matchId of matchIds) {
    try {
      const matchData = await getMatchById(matchId, region);
      const participant = matchData?.info?.participants?.find(
        (p: any) => p.puuid === puuid
      );

      if (participant) {
        matches.push({
          won: participant.win === true,
          champion: participant.championName,
          championId: participant.championId,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          playedAt: matchData?.info?.gameEndTimestamp ?? matchData?.info?.gameCreation,
        });
      }
    } catch (err) {
      logger.warn(`Failed to fetch match ${matchId}:`, err);
      // Skip this match but continue with the rest
    }
  }

  return {
    success: true,
    matches,
  };
}

async function getValorantRecentMatches(userData: any, count: number): Promise<GetRecentMatchesResponse> {
  const valorantAccount = userData?.valorantAccount;

  if (!valorantAccount) {
    return {
      success: true,
      matches: [],
      message: "No Valorant account linked",
    };
  }

  const {gameName, tag, region} = valorantAccount;

  // Henrik API returns matches with team win/loss info
  const henrikMatches = await getValorantMatches(region, gameName, tag, count);

  if (!henrikMatches || henrikMatches.length === 0) {
    return {
      success: true,
      matches: [],
      message: "No recent matches found",
    };
  }

  // Extract detailed match info for each match
  const matches: RecentMatchResult[] = henrikMatches.map((match) => {
    const player = match.players.all_players.find(
      (p) => p.name.toLowerCase() === gameName.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
    );

    if (!player) {
      // Fallback: can't determine team, default to red team
      const redRounds = match.teams.red?.rounds_won ?? 0;
      const blueRounds = match.teams.blue?.rounds_won ?? 0;
      return {
        won: match.teams.red.has_won,
        map: match.metadata?.map,
        score: `${redRounds}-${blueRounds}`,
        playedAt: match.metadata?.game_start,
      };
    }

    const playerTeam = player.team.toLowerCase(); // "red" or "blue"
    const won = playerTeam === "red" ? match.teams.red.has_won : match.teams.blue.has_won;
    const redRounds = match.teams.red?.rounds_won ?? 0;
    const blueRounds = match.teams.blue?.rounds_won ?? 0;
    const score = playerTeam === "red"
      ? `${redRounds}-${blueRounds}`
      : `${blueRounds}-${redRounds}`;

    // Calculate player's placement (rank out of 10 by combat score)
    const sortedPlayers = [...match.players.all_players]
      .sort((a, b) => (b.stats?.score ?? 0) - (a.stats?.score ?? 0));
    const placementIndex = sortedPlayers.findIndex(
      (p) => p.name?.toLowerCase() === gameName.toLowerCase() && String(p.tag).toLowerCase() === tag.toLowerCase()
    );
    const placement = placementIndex >= 0 ? placementIndex + 1 : undefined;

    return {
      won,
      agent: player.character,
      kills: player.stats?.kills,
      deaths: player.stats?.deaths,
      assists: player.stats?.assists,
      map: match.metadata?.map,
      score,
      playedAt: match.metadata?.game_start,
      placement,
    };
  });

  return {
    success: true,
    matches,
  };
}
