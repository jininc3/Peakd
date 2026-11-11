/**
 * Rank matching utilities for duo queue.
 * Duplicated from client-side utils/rankFilters.ts since cloud functions
 * can't import from the client directory.
 */

const VALORANT_RANKS: string[] = [
  "Iron 1", "Iron 2", "Iron 3",
  "Bronze 1", "Bronze 2", "Bronze 3",
  "Silver 1", "Silver 2", "Silver 3",
  "Gold 1", "Gold 2", "Gold 3",
  "Platinum 1", "Platinum 2", "Platinum 3",
  "Diamond 1", "Diamond 2", "Diamond 3",
  "Ascendant 1", "Ascendant 2", "Ascendant 3",
  "Immortal 1", "Immortal 2", "Immortal 3",
  "Radiant",
];

const LEAGUE_RANKS: string[] = [
  "Iron IV", "Iron III", "Iron II", "Iron I",
  "Bronze IV", "Bronze III", "Bronze II", "Bronze I",
  "Silver IV", "Silver III", "Silver II", "Silver I",
  "Gold IV", "Gold III", "Gold II", "Gold I",
  "Platinum IV", "Platinum III", "Platinum II", "Platinum I",
  "Emerald IV", "Emerald III", "Emerald II", "Emerald I",
  "Diamond IV", "Diamond III", "Diamond II", "Diamond I",
  "Master",
  "Grandmaster",
  "Challenger",
];

/** Tiers with no divisions: Riot writes Master+ as "MASTER I", Valorant's top as "Radiant". */
const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER", "RADIANT"]);

/**
 * A rank's position in its game's ladder, or null when it can't be placed
 * (missing, unranked, or unrecognised).
 *
 * Ranks reach the queue in whatever case their source writes them: League's
 * come straight from Riot in capitals ("EMERALD IV"), Valorant's in title case
 * ("Gold 3"). Compare them case-blind, so neither ever misses the table.
 */
export function rankIndex(game: string, rank: string | null | undefined): number | null {
  if (!rank) return null;
  const words = rank.trim().toUpperCase().split(/\s+/);
  let tier = words[0];
  if (!tier || tier === "UNRANKED" || tier === "UNRATED") return null;
  if (tier === "PLAT") tier = "PLATINUM";
  const division = words[1];
  const key = APEX.has(tier) || !division ? tier : `${tier} ${division}`;
  const ranks = game === "valorant" ? VALORANT_RANKS : LEAGUE_RANKS;
  const i = ranks.findIndex((r) => r.toUpperCase() === key);
  return i === -1 ? null : i;
}

/**
 * Get the tier range: one whole tier either side, counted in divisions, so
 * Emerald IV reaches from Platinum IV to Diamond IV. Valorant has 3
 * divisions per tier, League has 4.
 */
export function getTierRange(game: string): number {
  return game === "valorant" ? 3 : 4;
}

/**
 * Get the absolute rank distance between two ranks.
 * Returns Infinity if either rank can't be placed.
 */
export function getRankDistance(
  game: string,
  rankA: string | null | undefined,
  rankB: string | null | undefined
): number {
  const a = rankIndex(game, rankA);
  const b = rankIndex(game, rankB);
  if (a === null || b === null) return Infinity;
  return Math.abs(a - b);
}

/**
 * Whether two players are close enough in rank to duo. A player with no
 * rank to place (unranked, or one we can't read) can pair with anyone,
 * rather than with no one.
 */
export function withinDuoRange(
  game: string,
  rankA: string | null | undefined,
  rankB: string | null | undefined
): boolean {
  if (rankIndex(game, rankA) === null || rankIndex(game, rankB) === null) return true;
  return getRankDistance(game, rankA, rankB) <= getTierRange(game);
}
