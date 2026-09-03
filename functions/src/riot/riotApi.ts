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
    } else if (status === 400 && isRegionMismatchError(error)) {
      // Surfaced distinctly so callers can re-resolve the region and retry,
      // rather than treating a routing mistake as a permanent failure.
      throw new HttpsError(
        "failed-precondition",
        "REGION_MISMATCH"
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
 * True when a Riot error is the region-mismatch 400 — a PUUID sent to a
 * platform host that can't decrypt it. Distinguishing this from other 400s is
 * what lets callers repair the stored region instead of failing forever.
 */
export function isRegionMismatchError(error: unknown): boolean {
  const err = error as {response?: {status?: number; data?: {status?: {message?: string}}}};
  if (err?.response?.status !== 400) return false;
  const message = err.response?.data?.status?.message ?? "";
  return message.toLowerCase().includes("exception decrypting");
}

/**
 * Resolve the platform a player's LoL/TFT account actually lives on.
 *
 * PUUIDs are region-scoped ciphertext: one minted under a given platform only
 * decrypts on that platform's host. Asking euw1 about a kr PUUID returns
 * "Bad Request - Exception decrypting ...", a 400 that looks like malformed
 * input but is really a routing mismatch.
 *
 * account-v1 carries no region field, so the platform cannot be derived from
 * the link-time account lookup — hence this second, regionally-routed call.
 * Its answer is authoritative; a region picked from a dropdown is not.
 *
 * Returns null when the region can't be resolved, so callers can fall back to
 * whatever they already had rather than failing the whole operation.
 */
export async function getAccountRegion(
  puuid: string,
  game: "lol" | "tft" = "lol",
  routingHint: string = "euw1"
): Promise<string | null> {
  const apiKey = getRiotApiKey();
  const routing = getRegionalRouting(routingHint);
  const url = `https://${routing}.api.riotgames.com/riot/account/v1/region/by-game/${game}/by-puuid/${puuid}`;

  try {
    const response = await axios.get<{puuid: string; game: string; region: string}>(
      url,
      {headers: {"X-Riot-Token": apiKey}}
    );
    const region = response.data?.region?.toLowerCase();
    // Only trust a platform this codebase knows how to route.
    return region && REGIONAL_ROUTING[region] ? region : null;
  } catch (error) {
    const status = (error as AxiosError).response?.status;
    logger.warn(`Could not resolve account region (${status ?? "no status"}) for game ${game}`);
    return null;
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
    const response = await axios.get<TftSummonerData>(url, {
      headers: {
        "X-Riot-Token": apiKey,
      },
    });

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
