/**
 * Refresh Party Stats Cloud Function
 *
 * Fetches fresh stats from Riot/Henrik APIs for all members of a party.
 * Includes a 2-minute cooldown per party to prevent API abuse.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
  getSummonerByPuuid,
  getRankedStats,
  getChampionMastery,
  getTotalMasteryScore,
} from "../riot/riotApi";
import {
  getValorantMMR,
  getValorantAccountByRiotId,
  getValorantMatches,
} from "../valorant/valorantApi";

// Cooldown: 2 minutes between refreshes per party
const REFRESH_COOLDOWN_MS = 2 * 60 * 1000;

function calculateWinRate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100 * 100) / 100;
}

/**
 * Refresh a single League user's stats
 */
async function refreshLeagueUserStats(
  userId: string,
  db: admin.firestore.Firestore
): Promise<boolean> {
  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return false;

    const userData = userDoc.data();
    if (!userData?.riotAccount?.puuid) return false;

    const {puuid, region} = userData.riotAccount;

    const [summonerData, rankedStats, topChampions, masteryScore] =
      await Promise.all([
        getSummonerByPuuid(puuid, region),
        getRankedStats(puuid, region),
        getChampionMastery(puuid, region, 3),
        getTotalMasteryScore(puuid, region),
      ]);

    const soloQueue = rankedStats.find(
      (q) => q.queueType === "RANKED_SOLO_5x5"
    );

    const stats = {
      puuid,
      summonerLevel: summonerData.summonerLevel,
      profileIconId: summonerData.profileIconId,
      rankedSolo: soloQueue
        ? {
          tier: soloQueue.tier,
          rank: soloQueue.rank,
          leaguePoints: soloQueue.leaguePoints,
          wins: soloQueue.wins,
          losses: soloQueue.losses,
          winRate: calculateWinRate(soloQueue.wins, soloQueue.losses),
        }
        : {
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
      peakRank: userData.riotStats?.peakRank || {
        tier: soloQueue?.tier || "UNRANKED",
        rank: soloQueue?.rank || "",
        season: "2025",
        achievedAt: admin.firestore.Timestamp.now(),
      },
    };

    await userRef.update({riotStats: stats});

    const currentRank = soloQueue
      ? `${soloQueue.tier} ${soloQueue.rank}`
      : "Unranked";
    const lp = soloQueue ? soloQueue.leaguePoints : 0;

    await userRef.collection("gameStats").doc("league").set(
      {
        currentRank,
        lp,
        dailyGain: 0,
        lastUpdated: admin.firestore.Timestamp.now(),
      },
      {merge: true}
    );

    return true;
  } catch (error) {
    logger.warn(`Failed to refresh League stats for user ${userId}:`, error);
    return false;
  }
}

/**
 * Refresh a single Valorant user's stats
 */
async function refreshValorantUserStats(
  userId: string,
  db: admin.firestore.Firestore
): Promise<boolean> {
  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return false;

    const userData = userDoc.data();
    const valorantAccount = userData?.valorantAccount;
    if (!valorantAccount) return false;

    const {gameName, tag: rawTag, region} = valorantAccount;
    const tag = String(rawTag);

    const [accountData, mmrData, matchesData] = await Promise.all([
      getValorantAccountByRiotId(gameName, tag),
      getValorantMMR(region, gameName, tag),
      getValorantMatches(region, gameName, tag, 15),
    ]);

    // Calculate season stats
    let wins = 0;
    let totalGames = 0;
    let losses = 0;

    if (mmrData.by_season && Object.keys(mmrData.by_season).length > 0) {
      const seasonsWithData = Object.keys(mmrData.by_season)
        .filter((season) => {
          const data = mmrData.by_season[season];
          return (
            data &&
            data.number_of_games !== undefined &&
            data.number_of_games > 0
          );
        })
        .sort((a, b) => {
          const parse = (code: string) => {
            const match = code.match(/e(\d+)a(\d+)/);
            if (!match) return {episode: 0, act: 0};
            return {
              episode: parseInt(match[1], 10),
              act: parseInt(match[2], 10),
            };
          };
          const aD = parse(a);
          const bD = parse(b);
          if (aD.episode !== bD.episode) return aD.episode - bD.episode;
          return aD.act - bD.act;
        });

      if (seasonsWithData.length > 0) {
        const currentSeason = seasonsWithData[seasonsWithData.length - 1];
        const seasonData = mmrData.by_season[currentSeason];
        wins = seasonData.wins || 0;
        totalGames = seasonData.number_of_games || 0;
        losses = totalGames - wins;
      }
    }

    const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;

    // Process match history
    const allMatches = matchesData
      .map((match: any) => {
        if (
          !match?.metadata?.matchid ||
          !match?.players?.all_players ||
          !match?.teams
        ) {
          return null;
        }
        const player = match.players.all_players.find(
          (p: any) =>
            p.name?.toLowerCase() === gameName.toLowerCase() &&
            String(p.tag).toLowerCase() === tag.toLowerCase()
        );
        if (!player || !player.stats || !player.team || !player.character) {
          return null;
        }
        const playerTeam = player.team.toLowerCase();
        const teamData =
          playerTeam === "red" ? match.teams.red : match.teams.blue;
        if (!teamData) return null;
        const won = teamData.has_won ?? false;
        const redRounds = match.teams.red?.rounds_won ?? 0;
        const blueRounds = match.teams.blue?.rounds_won ?? 0;
        const score =
          playerTeam === "red"
            ? `${redRounds}-${blueRounds}`
            : `${blueRounds}-${redRounds}`;
        const sortedPlayers = [...match.players.all_players].sort(
          (a: any, b: any) => (b.stats?.score ?? 0) - (a.stats?.score ?? 0)
        );
        const placement =
          sortedPlayers.findIndex(
            (p: any) =>
              p.name?.toLowerCase() === gameName.toLowerCase() &&
              String(p.tag).toLowerCase() === tag.toLowerCase()
          ) + 1;
        const gameStart =
          match.metadata.game_start ?? Math.floor(Date.now() / 1000);
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
        };
      })
      .filter((e: any) => e !== null);

    // Most played agent
    const agentCounts: {[agent: string]: number} = {};
    allMatches.forEach((match: any) => {
      if (match.agent) {
        agentCounts[match.agent] = (agentCounts[match.agent] || 0) + 1;
      }
    });
    let mostPlayedAgent: string | undefined;
    let maxCount = 0;
    for (const [agent, count] of Object.entries(agentCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostPlayedAgent = agent;
      }
    }

    const matchHistory = allMatches.slice(0, 10);

    const stats: any = {
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
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (accountData.card) stats.card = accountData.card;
    if (mmrData.highest_rank?.patched_tier && mmrData.highest_rank?.season) {
      stats.peakRank = {
        tier: mmrData.highest_rank.patched_tier,
        season: mmrData.highest_rank.season,
      };
    }
    if (mostPlayedAgent) stats.mostPlayedAgent = mostPlayedAgent;

    await userRef.update({valorantStats: stats});

    await userRef.collection("gameStats").doc("valorant").set(
      {
        currentRank: stats.currentRank,
        rr: stats.rankRating,
        dailyGain: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true}
    );

    return true;
  } catch (error) {
    logger.warn(
      `Failed to refresh Valorant stats for user ${userId}:`,
      error
    );
    return false;
  }
}

export const refreshPartyStatsFunction = onCall(
  {
    invoker: "public",
    secrets: ["RIOT_API_KEY", "HENRIK_API_KEY"],
    timeoutSeconds: 120,
  },
  async (request): Promise<{
    success: boolean;
    message: string;
    updatedCount: number;
    totalMembers: number;
  }> => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {partyId} = request.data as {partyId: string};
    if (!partyId) {
      throw new HttpsError("invalid-argument", "partyId is required");
    }

    const db = admin.firestore();
    const partyRef = db.collection("parties").doc(partyId);
    const partyDoc = await partyRef.get();

    if (!partyDoc.exists) {
      throw new HttpsError("not-found", "Party not found");
    }

    const partyData = partyDoc.data()!;

    // Verify the requester is a member
    if (!partyData.members?.includes(request.auth.uid)) {
      throw new HttpsError(
        "permission-denied",
        "You must be a member of this leaderboard"
      );
    }

    // Check cooldown
    const lastRefresh = partyData.lastStatsRefresh?.toDate?.();
    if (lastRefresh && Date.now() - lastRefresh.getTime() < REFRESH_COOLDOWN_MS) {
      const secondsLeft = Math.ceil(
        (REFRESH_COOLDOWN_MS - (Date.now() - lastRefresh.getTime())) / 1000
      );
      throw new HttpsError(
        "resource-exhausted",
        `Please wait ${secondsLeft} seconds before refreshing again`
      );
    }

    // Mark refresh timestamp immediately
    await partyRef.update({
      lastStatsRefresh: admin.firestore.FieldValue.serverTimestamp(),
    });

    const game = partyData.game;
    const isLeague =
      game === "League of Legends" || game === "League";
    const members: string[] = partyData.members || [];

    logger.info(
      `Refreshing ${isLeague ? "League" : "Valorant"} stats for ${
        members.length
      } members in party ${partyId}`
    );

    // Refresh stats for all members in parallel (batched to avoid rate limits)
    const BATCH_SIZE = 3;
    let updatedCount = 0;

    for (let i = 0; i < members.length; i += BATCH_SIZE) {
      const batch = members.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((userId) =>
          isLeague
            ? refreshLeagueUserStats(userId, db)
            : refreshValorantUserStats(userId, db)
        )
      );
      updatedCount += results.filter(Boolean).length;
    }

    logger.info(
      `Refreshed ${updatedCount}/${members.length} members in party ${partyId}`
    );

    return {
      success: true,
      message: `Updated ${updatedCount} of ${members.length} players`,
      updatedCount,
      totalMembers: members.length,
    };
  }
);
