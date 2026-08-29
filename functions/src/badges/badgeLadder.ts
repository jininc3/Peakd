/**
 * Rank-tier ladder, ordered low to high. Mirrors lib/badges.ts on the web
 * app (RANK_TIER_LADDER) — kept in sync manually since functions/ has its
 * own build and doesn't import from the Next.js app. One shared badge per
 * ladder position rather than per-game tier names, since League and
 * Valorant's scales diverge above Platinum (League: Emerald, Diamond,
 * Master, Grandmaster, Challenger vs Valorant: Diamond, Ascendant,
 * Immortal, Radiant). minTierValue matches tierValue()/rankScore() in
 * helpers.ts.
 */
export const RANK_TIER_LADDER: { badgeId: string; minTierValue: number }[] = [
  { badgeId: "bronze_tier", minTierValue: 1 },
  { badgeId: "silver_tier", minTierValue: 2 },
  { badgeId: "gold_tier", minTierValue: 3 },
  { badgeId: "platinum_tier", minTierValue: 4 },
  { badgeId: "diamond_in_the_rough", minTierValue: 5 },
  { badgeId: "ascendant_tier", minTierValue: 6 },
  { badgeId: "top_1_percent", minTierValue: 7 },
];
