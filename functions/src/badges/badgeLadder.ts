/**
 * Rank-tier ladder, ordered low to high. Mirrors lib/badges.ts on the web
 * app (RANK_TIER_LADDER) — kept in sync manually since functions/ has its
 * own build and doesn't import from the Next.js app. One shared badge per
 * ladder position rather than per-game tier names, since League and
 * Valorant's scales diverge above Platinum (League: Emerald, Diamond,
 * Master, Grandmaster, Challenger vs Valorant: Diamond, Ascendant,
 * Immortal, Radiant). minTierValue matches tierValue()/rankScore() in
 * helpers.ts.
 *
 * KNOWN NAMING MISMATCH: because the scales diverge, one minTierValue means
 * different real tiers per game. minTierValue 5 is Valorant DIAMOND but League
 * EMERALD, so a League player earns "Diamond in the Rough" at Emerald, and
 * League Diamond grants "Ascendant". The grant LOGIC is correct — rung 5 is
 * genuinely the 5th tier in both games — but the badge copy reads wrong for
 * League. Left as-is deliberately: renaming a shared badge only moves the
 * problem to the other game. The web app works around it for progress copy via
 * LADDER_TIER_NAME in lib/badgeProgress.ts, which names the target per game.
 * A real fix means per-game badge names, which is a catalog change.
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
