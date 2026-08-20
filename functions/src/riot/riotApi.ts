/**
 * Riot API Helper Functions
 *
 * This module provides helper functions to interact with the Riot Games API.
 * All functions handle rate limiting, errors, and return properly typed responses.
 */

import axios, {AxiosError} from "axios";
import {HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {
  RiotAccount,
  SummonerData,
  RankedStats,
  ChampionMastery,
  TftSummonerData,
  TftLeagueEntry,
} from "../types/riot";

// Get API key from environment variables (Functions v2)
const getRiotApiKey = (): string => {
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    throw new Error("Riot API key not configured. Please set RIOT_API_KEY environment variable.");
  }
  return apiKey;
};


// Regional routing values
const REGIONAL_ROUTING: {[key: string]: string} = {
  "euw1": "europe",
  "eun1": "europe",
  "tr1": "europe",
  "ru": "europe",
  "na1": "americas",
  "br1": "americas",
  "la1": "americas",
  "la2": "americas",
  "kr": "asia",
  "jp1": "asia",
  "oc1": "sea",
  "ph2": "sea",
  "sg2": "sea",
  "th2": "sea",
  "tw2": "sea",
  "vn2": "sea",
};

/**
 * Get regional routing value for account API
 */
function getRegionalRouting(region: string): string {
  return REGIONAL_ROUTING[region.toLowerCase()] || "europe";
}

/**
 * Handle Riot API errors
 */
function handleRiotError(error: AxiosError, context: string): never {
  logger.error(`Riot API Error (${context}):`, error.response?.data || error.message);

  if (error.response) {
    const status = error.response.status;
    if (status === 404) {
      throw new HttpsError(
        "not-found",
        "Account not found. Please check the Game Name and Tag."
      );
    } else if (status === 403) {
      throw new HttpsError(
        "permission-denied",
        "API key is invalid or expired."
      );
    } else if (status === 429) {
      throw new HttpsError(
        "resource-exhausted",
        "Rate limit exceeded. Please try again in a moment."
      );
    } else {
      throw new HttpsError(
        "internal",
        `Riot API error: ${status}`
      );
    }
  }

  throw new HttpsError(
    "internal",
    "Failed to connect to Riot API"
  );
}

/**
 * Get Riot account by Game Name and Tag
 */
export async function getAccountByRiotId(
  gameName: string,
  tagLine: string,
  region: string = "euw1"
): Promise<RiotAccount> {
  const apiKey = getRiotApiKey();
  const routing = getRegionalRouting(region);
  const url = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

  try {
    const response = await axios.get<RiotAccount>(url, {
      headers: {
        "X-Riot-Token": apiKey,
      },
    });

    return response.data;
  } catch (error) {
    handleRiotError(error as AxiosError, "getAccountByRiotId");
  }
}

/**
 * Get summoner data by PUUID
 */
export async function getSummonerByPuuid(
  puuid: string,
  region: string = "euw1"
): Promise<SummonerData> {
  const apiKey = getRiotApiKey();
  const url = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;

  try {
    const response = await axios.get<SummonerData>(url, {
      headers: {
        "X-Riot-Token": apiKey,
      },
    });

    logger.info('LoL Summoner API - Response data: ' + JSON.stringify(response.data));
    logger.info('LoL Summoner API - Has id field?: ' + ('id' in response.data));
    logger.info('LoL Summoner API - id value: ' + (response.data.id || 'UNDEFINED'));

    return response.data;
  } catch (error) {
    handleRiotError(error as AxiosError, "getSummonerByPuuid");
  }
}

/**
 * Get ranked stats by PUUID
 */
export async function getRankedStats(
  puuid: string,
  region: string = "euw1"
): Promise<RankedStats[]> {
  const apiKey = getRiotApiKey();
  const url = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;

  try {
    const response = await axios.get<RankedStats[]>(url, {
      headers: {
        "X-Riot-Token": apiKey,
      },
    });

    return response.data;
  } catch (error) {
    handleRiotError(error as AxiosError, "getRankedStats");
  }
}

/**
 * Get champion mastery (top champions)
 */
export async function getChampionMastery(
  puuid: string,
  region: string = "euw1",
  count: number = 3
): Promise<ChampionMastery[]> {
  const apiKey = getRiotApiKey();
  const url = `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`;

  try {
    const response = await axios.get<ChampionMastery[]>(url, {
      headers: {
        "X-Riot-Token": apiKey,
      },
    });

    return response.data;
  } catch (error) {
    handleRiotError(error as AxiosError, "getChampionMastery");
  }
}

/**
 * Get total mastery score
 */
export async function getTotalMasteryScore(
  puuid: string,
  region: string = "euw1"
): Promise<number> {
  const apiKey = getRiotApiKey();
  const url = `https://${region}.api.riotgames.com/lol/champion-mastery/v4/scores/by-puuid/${puuid}`;

  try {
    const response = await axios.get<number>(url, {
      headers: {
        "X-Riot-Token": apiKey,
      },
    });

    return response.data;
  } catch (error) {
    handleRiotError(error as AxiosError, "getTotalMasteryScore");
  }
}


// ===== Match History API Functions =====

/**
 * Get recent match IDs by PUUID (match-v5)
 * Uses regional routing (e.g. "europe", "americas") not platform routing
 */
export async function getRecentMatchIds(
  puuid: string,
  region: string = "euw1",
  count: number = 5
): Promise<string[]> {
  const apiKey = getRiotApiKey();
  const routing = getRegionalRouting(region);
  const url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&type=ranked&count=${count}`;

  try {
    const response = await axios.get<string[]>(url, {
      headers: {
        "X-Riot-Token": apiKey,
      },
    });

    return response.data;
  } catch (error) {
    handleRiotError(error as AxiosError, "getRecentMatchIds");
  }
}

/**
 * Get match details by match ID (match-v5)
 */
export async function getMatchById(
  matchId: string,
  region: string = "euw1"
): Promise<any> {
  const apiKey = getRiotApiKey();
  const routing = getRegionalRouting(region);
  const url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`;

  try {
    const response = await axios.get<any>(url, {
      headers: {
        "X-Riot-Token": apiKey,
      },
    });

    return response.data;
  } catch (error) {
    handleRiotError(error as AxiosError, "getMatchById");
  }
}

// ===== TFT API Functions =====
// Using official Riot TFT API

/**
 * Get TFT summoner data by PUUID
 */
export async function getTftSummonerByPuuid(
  puuid: string,
  region: string = "euw1"
): Promise<TftSummonerData> {
  const apiKey = getRiotApiKey();
  const url = 'https://' + region + '.api.riotgames.com/tft/summoner/v1/summoners/by-puuid/' + puuid;

  try {
    logger.info('TFT API URL (PLATFORM ROUTING): ' + url.replace(puuid, puuid.substring(0, 15) + '...'));
    logger.info('Region parameter: ' + region);

    const response = await axios.get<TftSummonerData>(url, {
      headers: {
        "X-Riot-Token": apiKey,
      },
    });

    logger.info('TFT Summoner API - Response status: ' + response.status);
    logger.info('TFT Summoner API - Response data (raw JSON): ' + JSON.stringify(response.data));
    logger.info('TFT Summoner API - Has id field?: ' + ('id' in response.data));
    logger.info('TFT Summoner API - id value: ' + (response.data.id || 'UNDEFINED'));

    return response.data;
  } catch (error) {
    handleRiotError(error as AxiosError, "getTftSummonerByPuuid");
  }
}

/**
 * Get TFT ranked stats by Summoner ID
 * TFT API still requires summoner ID (no PUUID endpoint exists)
 */
export async function getTftRankedStats(
  summonerId: string,
  region: string = "euw1"
): Promise<TftLeagueEntry[]> {
  const apiKey = getRiotApiKey();
  const url = 'https://' + region + '.api.riotgames.com/tft/league/v1/entries/by-summoner/' + summonerId;

  try {
    const response = await axios.get<TftLeagueEntry[]>(url, {
      headers: {
        "X-Riot-Token": apiKey,
      },
    });

    return response.data;
  } catch (error) {
    handleRiotError(error as AxiosError, "getTftRankedStats");
  }
}
