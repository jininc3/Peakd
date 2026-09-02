/**
 * Henrik's Valorant API Integration
 *
 * This module provides functions to interact with Henrik's unofficial Valorant API.
 * Documentation: https://docs.henrikdev.xyz/valorant
 */

import axios from "axios";
import * as logger from "firebase-functions/logger";
import {HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";

// Define the secret for Henrik API key
const henrikApiKey = defineSecret("HENRIK_API_KEY");

const HENRIK_API_BASE = "https://api.henrikdev.xyz/valorant";

/**
 * Account data from Henrik's API
 */
export interface HenrikAccount {
  name: string;
  tag: string;
  region: string;
  account_level: number;
  card: {
    small: string;
    large: string;
    wide: string;
    id: string;
  };
}

/**
 * MMR data from Henrik's API (V2)
 */
export interface HenrikMMRData {
  current_data: {
    currenttierpatched: string; // e.g., "Gold 3"
    ranking_in_tier: number; // RR (Rank Rating)
    elo: number; // MMR
    games_needed_for_rating: number;
  };
  highest_rank: {
    patched_tier: string; // e.g., "Diamond 2"
    season: string; // e.g., "e4a3"
  };
  by_season: {
    [season: string]: {
      wins: number;
      number_of_games: number;
      final_rank: number;
      final_rank_patched: string;
      act_rank_wins?: Array<{
        patched_tier: string;
        tier: number;
      }>;
    };
  };
}

/**
 * Match data from Henrik's API
 */
export interface HenrikMatch {
  metadata: {
    matchid: string; // Note: API returns 'matchid' without underscore
    map: string;
    game_start: number; // Unix timestamp in seconds
    game_length: number; // Duration in seconds
    mode: string;
  };
  players: {
    all_players: Array<{
      name: string;
      tag: string;
      team: string; // "Red" or "Blue"
      character: string; // Agent name (e.g., "Jett", "Sova")
      stats: {
        kills: number;
        deaths: number;
        assists: number;
        score: number;
        headshots: number;
        bodyshots: number;
        legshots: number;
      };
      currenttier_patched?: string; // Rank at time of match
    }>;
  };
  teams: {
    red: {
      has_won: boolean;
      rounds_won: number;
      rounds_lost: number;
    };
    blue: {
      has_won: boolean;
      rounds_won: number;
      rounds_lost: number;
    };
  };
}

/**
 * Get Valorant account by Riot ID using Henrik's API
 *
 * @param gameName - Valorant in-game name
 * @param tag - Valorant tag
 * @returns Account information
 */
export async function getValorantAccountByRiotId(
  gameName: string,
  tag: string
): Promise<HenrikAccount> {
  try {
    const url = `${HENRIK_API_BASE}/v1/account/${encodeURIComponent(gameName)}/${tag}`;

    const headers: any = {};
    const apiKey = henrikApiKey.value();
    if (apiKey) {
      headers["Authorization"] = apiKey;
    }

    const response = await axios.get(url, { headers });

    if (response.data.status !== 200) {
      logger.error("Henrik API error:", response.data);
      throw new HttpsError(
        "not-found",
        `Account not found: ${gameName}#${tag}`
      );
    }

    const accountData = response.data.data;
    // Henrik API sometimes returns empty name/tag (Riot privacy changes)
    // Fall back to the user-provided values
    if (!accountData.name) accountData.name = gameName;
    if (!accountData.tag) accountData.tag = tag;
    return accountData;
  } catch (error: any) {
    if (error instanceof HttpsError) {
      throw error;
    }

    if (error.response?.status === 404) {
      throw new HttpsError(
        "not-found",
        `Account not found: ${gameName}#${tag}`
      );
    }

    if (error.response?.status === 429) {
      throw new HttpsError(
        "resource-exhausted",
        "Rate limit exceeded. Please try again later."
      );
    }

    logger.error("Error fetching Valorant account:", error);
    throw new HttpsError(
      "internal",
      "Failed to fetch Valorant account from Henrik's API"
    );
  }
}

/**
 * Get Valorant MMR/rank data using Henrik's API
 *
 * @param region - Valorant region
 * @param gameName - Valorant in-game name
 * @param tag - Valorant tag
 * @returns MMR and rank information
 */
export async function getValorantMMR(
  region: string,
  gameName: string,
  tag: string
): Promise<HenrikMMRData> {
  try {
    const url = `${HENRIK_API_BASE}/v2/mmr/${region}/${encodeURIComponent(gameName)}/${tag}`;

    const headers: any = {};
    const apiKey = henrikApiKey.value();
    if (apiKey) {
      headers["Authorization"] = apiKey;
    }

    const response = await axios.get(url, { headers });

    if (response.data.status !== 200) {
      logger.error("Henrik API error:", response.data);
      throw new HttpsError(
        "not-found",
        "Rank data not found for this account"
      );
    }

    return response.data.data;
  } catch (error: any) {
    if (error instanceof HttpsError) {
      throw error;
    }

    if (error.response?.status === 404) {
      throw new HttpsError(
        "not-found",
        "Rank data not found for this account"
      );
    }

    if (error.response?.status === 429) {
      throw new HttpsError(
        "resource-exhausted",
        "Rate limit exceeded. Please try again later."
      );
    }

    logger.error("Error fetching Valorant MMR:", error);
    throw new HttpsError(
      "internal",
      "Failed to fetch Valorant rank data from Henrik's API"
    );
  }
}

/**
 * Get Valorant match history using Henrik's API
 *
 * @param region - Valorant region
 * @param gameName - Valorant in-game name
 * @param tag - Valorant tag
 * @param size - Number of matches to fetch (default: 20)
 * @returns Match history
 */
export async function getValorantMatches(
  region: string,
  gameName: string,
  tag: string,
  size: number = 20
): Promise<HenrikMatch[]> {
  try {
    const url = `${HENRIK_API_BASE}/v3/matches/${region}/${encodeURIComponent(gameName)}/${tag}?mode=competitive&size=${size}`;

    const headers: any = {};
    const apiKey = henrikApiKey.value();
    if (apiKey) {
      headers["Authorization"] = apiKey;
    }

    const response = await axios.get(url, { headers });

    if (response.data.status !== 200) {
      logger.error("Henrik API error:", response.data);
      return [];
    }

    return response.data.data;
  } catch (error: any) {
    if (error.response?.status === 429) {
      throw new HttpsError(
        "resource-exhausted",
        "Rate limit exceeded. Please try again later."
      );
    }

    logger.error("Error fetching Valorant matches:", error);
    // Return empty array instead of throwing - matches are optional
    return [];
  }
}
