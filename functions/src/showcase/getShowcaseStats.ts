/**
 * Public showcase stats for the logged-out homepage.
 *
 * Fetches live ranked stats for a fixed set of well-known accounts (no auth
 * required) and caches the result in Firestore so homepage traffic doesn't
 * hit Riot/Henrik rate limits — at most one upstream fetch per CACHE_TTL_MS.
 */

import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {getAccountByRiotId, getRankedStats} from "../riot/riotApi";
import {getValorantAccountByRiotId, getValorantMMR} from "../valorant/valorantApi";

const CACHE_DOC = "showcase/stats";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Accounts shown on the homepage. Edit here to change the showcase. */
const SHOWCASE = {
  league: {gameName: "Hide on bush", tagLine: "KR1", region: "kr"},
  // Region is resolved from Henrik's account lookup, not hardcoded.
  valorant: {gameName: "prevail", tag: "rozi"},
} as const;

export interface ShowcaseLeague {
  inGameName: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface ShowcaseValorant {
  inGameName: string;
  currentRank: string;
  rankRating: number;
  peakRank?: string;
  wins: number;
  losses: number;
  winRate: number;
}

export interface ShowcaseStats {
  league: ShowcaseLeague | null;
  valorant: ShowcaseValorant | null;
  fetchedAt: number;
}

function winRate(wins: number, losses: number): number {
  const total = wins + losses;
  return total > 0 ? parseFloat(((wins / total) * 100).toFixed(2)) : 0;
}

async function fetchLeague(): Promise<ShowcaseLeague | null> {
  const {gameName, tagLine, region} = SHOWCASE.league;
  try {
    const account = await getAccountByRiotId(gameName, tagLine, region);
    const ranked = await getRankedStats(account.puuid, region);
    const solo = ranked.find((q) => q.queueType === "RANKED_SOLO_5x5");
    return {
      inGameName: `${account.gameName}#${account.tagLine}`,
      tier: solo?.tier ?? "UNRANKED",
      rank: solo?.rank ?? "",
      leaguePoints: solo?.leaguePoints ?? 0,
      wins: solo?.wins ?? 0,
      losses: solo?.losses ?? 0,
      winRate: winRate(solo?.wins ?? 0, solo?.losses ?? 0),
    };
  } catch (error) {
    logger.error("Showcase: League fetch failed", error);
    return null;
  }
}

async function fetchValorant(): Promise<ShowcaseValorant | null> {
  const {gameName, tag} = SHOWCASE.valorant;
  try {
    const account = await getValorantAccountByRiotId(gameName, tag);
    const region = account.region || "na";
    const mmr = await getValorantMMR(region, gameName, tag);

    // Latest act with games, same ordering logic as getValorantStats.
    let wins = 0;
    let total = 0;
    const seasons = Object.keys(mmr.by_season ?? {})
      .filter((s) => (mmr.by_season[s]?.number_of_games ?? 0) > 0)
      .sort((a, b) => {
        const parse = (c: string) => {
          const m = c.match(/e(\d+)a(\d+)/);
          return m ? {e: parseInt(m[1], 10), a: parseInt(m[2], 10)} : {e: 0, a: 0};
        };
        const pa = parse(a);
        const pb = parse(b);
        return pa.e !== pb.e ? pa.e - pb.e : pa.a - pb.a;
      });
    if (seasons.length > 0) {
      const latest = mmr.by_season[seasons[seasons.length - 1]];
      wins = latest.wins ?? 0;
      total = latest.number_of_games ?? 0;
    }
    const losses = Math.max(0, total - wins);

    return {
      inGameName: `${account.name}#${account.tag}`,
      currentRank: mmr.current_data?.currenttierpatched ?? "Unranked",
      rankRating: mmr.current_data?.ranking_in_tier ?? 0,
      peakRank: mmr.highest_rank?.patched_tier,
      wins,
      losses,
      winRate: winRate(wins, losses),
    };
  } catch (error) {
    logger.error("Showcase: Valorant fetch failed", error);
    return null;
  }
}

export const getShowcaseStatsFunction = onCall(
  {
    secrets: ["RIOT_API_KEY", "HENRIK_API_KEY"],
    // Public — the homepage calls this before the visitor signs in.
    invoker: "public",
  },
  async (): Promise<ShowcaseStats> => {
    const db = admin.firestore();
    const ref = db.doc(CACHE_DOC);
    const snap = await ref.get();
    const cached = snap.exists ? (snap.data() as ShowcaseStats) : null;

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached;
    }

    const [league, valorant] = await Promise.all([fetchLeague(), fetchValorant()]);

    // If an upstream fetch failed, keep the last good value for that game
    // rather than blanking the card.
    const fresh: ShowcaseStats = {
      league: league ?? cached?.league ?? null,
      valorant: valorant ?? cached?.valorant ?? null,
      fetchedAt: Date.now(),
    };

    await ref.set(fresh);
    return fresh;
  }
);
