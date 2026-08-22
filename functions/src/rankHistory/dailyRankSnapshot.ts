/**
 * Rank Snapshot Cloud Function
 *
 * Runs twice daily (06:00 and 18:00 UTC) for every user with a linked Riot or
 * Valorant account. Each run:
 *   1. records an LP/RR snapshot for the rank progression graph (on change), and
 *   2. refreshes the rank fields the profile page and rank cards read
 *      (riotStats.rankedSolo / valorantStats + peak rank + gameStats), so
 *      profiles stay current without the user having to open the app.
 */

import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {getRankedStats} from "../riot/riotApi";
import {getValorantMMR} from "../valorant/valorantApi";
import {recordRankSnapshotIfChanged} from "./recordRankSnapshot";

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000;

const LEAGUE_TIER_ORDER: Record<string, number> = {
  IRON: 1, BRONZE: 2, SILVER: 3, GOLD: 4, PLATINUM: 5, EMERALD: 6,
  DIAMOND: 7, MASTER: 8, GRANDMASTER: 9, CHALLENGER: 10,
};
const LEAGUE_DIVISION_ORDER: Record<string, number> = {IV: 1, III: 2, II: 3, I: 4};

function winRateOf(wins: number, losses: number): number {
  const total = wins + losses;
  return total === 0 ? 0 : Math.round((wins / total) * 10000) / 100;
}

function isHigherLeagueRank(
  tier: string,
  rank: string,
  peak: {tier?: string; rank?: string} | undefined
): boolean {
  if (!peak?.tier || peak.tier === "UNRANKED") return true;
  const cur = (LEAGUE_TIER_ORDER[tier] || 0) * 10 + (LEAGUE_DIVISION_ORDER[rank] || 0);
  const best = (LEAGUE_TIER_ORDER[peak.tier] || 0) * 10 + (LEAGUE_DIVISION_ORDER[peak.rank ?? ""] || 0);
  return cur > best;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const dailyRankSnapshotScheduled = onSchedule(
  {
    schedule: "0 6,18 * * *",
    timeZone: "UTC",
    secrets: ["RIOT_API_KEY", "HENRIK_API_KEY"],
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const db = admin.firestore();
    logger.info("Starting rank snapshot job");

    const usersSnapshot = await db.collection("users").get();
    let leagueCount = 0;
    let valorantCount = 0;
    let leagueRefreshed = 0;
    let valorantRefreshed = 0;
    let errorCount = 0;

    const users = usersSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }));

    // Process in batches to respect rate limits
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (user) => {
        // League of Legends snapshot
        const riotAccount = user.data?.riotAccount;
        if (riotAccount?.puuid && riotAccount?.region) {
          try {
            const rankedStats = await getRankedStats(
              riotAccount.puuid,
              riotAccount.region
            );
            const soloQueue = rankedStats.find(
              (q) => q.queueType === "RANKED_SOLO_5x5"
            );
            if (soloQueue) {
              const wrote = await recordRankSnapshotIfChanged(user.id, {
                game: "league",
                puuid: riotAccount.puuid,
                value: soloQueue.leaguePoints,
                rank: `${soloQueue.tier} ${soloQueue.rank}`,
              });
              if (wrote) leagueCount++;

              // Refresh the profile/rank-card fields. Dot-paths so the rest of
              // riotStats (mastery, icon, match data) is left untouched.
              const userRef = db.collection("users").doc(user.id);
              const update: Record<string, unknown> = {
                "riotStats.rankedSolo": {
                  tier: soloQueue.tier,
                  rank: soloQueue.rank,
                  leaguePoints: soloQueue.leaguePoints,
                  wins: soloQueue.wins,
                  losses: soloQueue.losses,
                  winRate: winRateOf(soloQueue.wins, soloQueue.losses),
                },
                "riotStats.lastUpdated": admin.firestore.Timestamp.now(),
              };
              if (isHigherLeagueRank(soloQueue.tier, soloQueue.rank, user.data?.riotStats?.peakRank)) {
                update["riotStats.peakRank"] = {
                  tier: soloQueue.tier,
                  rank: soloQueue.rank,
                  season: "2025",
                  achievedAt: admin.firestore.FieldValue.serverTimestamp(),
                };
              }
              if (user.data?.riotStats) {
                await userRef.update(update);
              } else {
                // No stats doc yet (linked but never fetched) — seed it.
                await userRef.set({
                  riotStats: {
                    puuid: riotAccount.puuid,
                    rankedSolo: update["riotStats.rankedSolo"],
                    peakRank: update["riotStats.peakRank"] ?? null,
                    lastUpdated: admin.firestore.Timestamp.now(),
                  },
                }, {merge: true});
              }
              await userRef.collection("gameStats").doc("league").set({
                currentRank: `${soloQueue.tier} ${soloQueue.rank}`,
                lp: soloQueue.leaguePoints,
                lastUpdated: admin.firestore.Timestamp.now(),
              }, {merge: true});
              leagueRefreshed++;
            }
          } catch (err) {
            logger.warn(
              `Failed to snapshot League LP for user ${user.id}:`,
              err
            );
            errorCount++;
          }
        }

        // Valorant snapshot
        const valorantAccount = user.data?.valorantAccount;
        if (
          valorantAccount?.gameName &&
          valorantAccount?.tag &&
          valorantAccount?.region
        ) {
          try {
            const mmrData = await getValorantMMR(
              valorantAccount.region,
              valorantAccount.gameName,
              valorantAccount.tag
            );
            const currentRank = mmrData?.current_data?.currenttierpatched;
            if (currentRank && currentRank !== "Unranked") {
              const wrote = await recordRankSnapshotIfChanged(user.id, {
                game: "valorant",
                value: mmrData.current_data.ranking_in_tier,
                rank: currentRank,
              });
              if (wrote) valorantCount++;

              // Refresh the profile/rank-card fields (rank + RR + MMR + peak).
              // Wins/losses come from match history, which this job doesn't
              // pull, so those stay as last fetched.
              const userRef = db.collection("users").doc(user.id);
              const update: Record<string, unknown> = {
                "valorantStats.currentRank": currentRank,
                "valorantStats.rankRating": mmrData.current_data.ranking_in_tier ?? 0,
                "valorantStats.mmr": mmrData.current_data.elo ?? 0,
                "valorantStats.lastUpdated": admin.firestore.FieldValue.serverTimestamp(),
              };
              if (mmrData.highest_rank?.patched_tier && mmrData.highest_rank?.season) {
                update["valorantStats.peakRank"] = {
                  tier: mmrData.highest_rank.patched_tier,
                  season: mmrData.highest_rank.season,
                };
              }
              if (user.data?.valorantStats) {
                await userRef.update(update);
              } else {
                await userRef.set({
                  valorantStats: {
                    gameName: valorantAccount.gameName,
                    tag: valorantAccount.tag,
                    region: valorantAccount.region,
                    currentRank,
                    rankRating: mmrData.current_data.ranking_in_tier ?? 0,
                    mmr: mmrData.current_data.elo ?? 0,
                    ...(update["valorantStats.peakRank"] ? {peakRank: update["valorantStats.peakRank"]} : {}),
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                  },
                }, {merge: true});
              }
              await userRef.collection("gameStats").doc("valorant").set({
                currentRank,
                rr: mmrData.current_data.ranking_in_tier ?? 0,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
              }, {merge: true});
              valorantRefreshed++;
            }
          } catch (err) {
            logger.warn(
              `Failed to snapshot Valorant RR for user ${user.id}:`,
              err
            );
            errorCount++;
          }
        }
      }));

      // Delay between batches to respect rate limits
      if (i + BATCH_SIZE < users.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    logger.info(
      `Rank snapshot complete: ${leagueCount} League, ` +
      `${valorantCount} Valorant changes saved; ` +
      `${leagueRefreshed} League, ${valorantRefreshed} Valorant profiles refreshed. ` +
      `${errorCount} errors.`
    );
  }
);
