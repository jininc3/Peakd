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
import {getValorantMatches, HenrikMatch} from "../valorant/valorantApi";
import {remintRiotAccount} from "./repairAccount";

// Immutable per-match cache. Riot match data never changes once the game
// ends, so these documents have no TTL.
const MATCH_CACHE_COLLECTION = "riotMatchCache";

// Which matches a player has recently played DOES change, so this list is
// cached only briefly. The TTL is the longest a just-finished game can take to
// appear on a rank card.
const MATCH_ID_CACHE_COLLECTION = "riotMatchIdCache";
const MATCH_ID_CACHE_TTL_MS = 5 * 60 * 1000;

// Henrik returns matches in one bulk payload, so the whole response is cached
// together rather than per match.
const VALORANT_MATCH_CACHE_COLLECTION = "valorantMatchCache";
const VALORANT_MATCH_CACHE_TTL_MS = 5 * 60 * 1000;

// Throttle for user-initiated forced refreshes. Long enough that a held button
// cannot drain the shared Riot/Henrik keys, short enough that a user who plays
// a game and presses Refresh sees it.
const FORCE_REFRESH_COLLECTION = "matchRefreshThrottle";
const FORCE_REFRESH_COOLDOWN_MS = 30 * 1000;

// Per-IP ceiling for logged-out callers. Generous enough that browsing a few
// public profiles never trips it, tight enough to stop an id-walk.
const ANON_LIMIT_COLLECTION = "matchHistoryAnonRate";
const ANON_LIMIT_WINDOW_MS = 60 * 1000;
const ANON_LIMIT_MAX = 30;

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
  /** Riot queue id — 420 = Ranked Solo/Duo, 440 = Flex. */
  queueId?: number;
  /** Match length in seconds. */
  gameDuration?: number;
  champLevel?: number;
  /** Summoner spell ids (D / F). */
  summonerSpells?: [number, number];
  /** Keystone perk id and the secondary rune tree (style) id. */
  runes?: { keystone: number; secondaryStyle: number; primaryStyle: number };
  /** Final build: item0..item5 then item6 (trinket). 0 = empty slot. */
  items?: number[];
  cs?: number;
  visionScore?: number;
  damageToChampions?: number;
  goldEarned?: number;
  role?: string;
}

export interface GetRecentMatchesRequest {
  targetUserId: string;
  game: "league" | "valorant";
  count?: number;
  /**
   * Bypass the short-TTL list caches so a just-finished game shows up now.
   * Set only by an explicit user action (a Refresh press) — never on open,
   * or every card view would cost a full round of upstream calls.
   *
   * Throttled per caller (FORCE_REFRESH_COOLDOWN_MS): the flag reaches Riot
   * and Henrik directly, so an unthrottled one would let a single client drain
   * the shared keys. Immutable per-match documents are still served from cache
   * regardless — a finished match cannot have changed.
   */
  forceRefresh?: boolean;
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
    // Deliberately NOT auth-gated: /profile/[username] is a public, shareable
    // page (it carries OG metadata for exactly that), so a logged-out visitor
    // must be able to open a rank card and see match history.
    //
    // The quota risk that gating would have covered — an anonymous caller
    // walking targetUserIds to drain the shared Riot/Henrik keys — is handled
    // by the caches instead: reads are served from Firestore, and the only
    // paths that reach upstream are a cache miss or a forced refresh, both of
    // which are rate-limited below.
    const {targetUserId, game, count, forceRefresh} =
      request.data as GetRecentMatchesRequest;

    if (!targetUserId || !game) {
      throw new HttpsError(
        "invalid-argument",
        "targetUserId and game are required"
      );
    }

    const matchCount = count && count > 0 ? Math.min(count, 20) : 5;

    try {
      // Metered before the user lookup, so it covers every anonymous request
      // rather than only the ones that resolve to a real profile — an id-walk
      // is exactly the traffic this is meant to bound. Signed-in callers are
      // already bounded by having an account. Mirrors lookup/lookupRank.ts.
      if (!request.auth) {
        await enforceAnonymousLimit(request.rawRequest.ip ?? "");
      }

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

      // A refusal here must not fail the request: fall back to cached data,
      // which is what the user would have seen anyway. Keyed by uid when signed
      // in, else by IP, so anonymous callers are throttled too.
      const throttleKey = request.auth?.uid ?? `ip:${request.rawRequest.ip ?? "unknown"}`;
      const fresh = forceRefresh === true && (await allowForceRefresh(throttleKey));

      if (game === "league") {
        return await getLeagueRecentMatches(targetUserId, userData, matchCount, fresh);
      } else {
        return await getValorantRecentMatches(userData, matchCount, fresh);
      }
    } catch (error) {
      // A rate-limit rejection is expected behaviour, not a fault — log it at
      // warn so it doesn't fill the error budget with normal throttling.
      if (error instanceof HttpsError) {
        if (error.code === "resource-exhausted") {
          logger.warn("Match history request throttled:", error.message);
        } else {
          logger.error("Error fetching recent matches:", error);
        }
        throw error;
      }

      logger.error("Error fetching recent matches:", error);

      // Return empty matches gracefully instead of crashing
      return {
        success: true,
        matches: [],
        message: "Could not fetch match history",
      };
    }
  }
);

async function getLeagueRecentMatches(
  userId: string,
  userData: any,
  count: number,
  forceRefresh = false
): Promise<GetRecentMatchesResponse> {
  const riotAccount = userData?.riotAccount;

  if (!riotAccount?.puuid) {
    return {
      success: true,
      matches: [],
      message: "No Riot account linked",
    };
  }

  let {puuid, region} = riotAccount as {puuid: string; region: string};

  // Step 1: Get last N ranked match IDs. Unlike the matches themselves this
  // list DOES change — it's how a newly played game is discovered — so it gets
  // a short TTL rather than the permanent cache below. Within the window a warm
  // card costs zero Riot calls; past it, one.
  //
  // Same self-heal as getLeagueStats: a PUUID minted under a rotated API key
  // can't be decrypted, and without this the card silently keeps serving
  // whatever short list was cached while the key was broken.
  let matchIds = await getCachedMatchIds(puuid, region, count, forceRefresh)
    .catch(async (error) => {
      const mismatch =
        error instanceof HttpsError && error.message === "REGION_MISMATCH";
      if (!mismatch) throw error;

      const repaired = await remintRiotAccount(userId, riotAccount);
      if (!repaired) throw error;
      puuid = repaired.puuid;
      region = repaired.region;
      // Bypass the cache: the entry under the old PUUID is not this account's.
      return getCachedMatchIds(puuid, region, count, true);
    });

  // A list cached while the account was broken can be short or empty. If we got
  // fewer than asked for and weren't already forcing, re-check Riot once rather
  // than trusting a cache written during an outage.
  if (!forceRefresh && matchIds.length < count) {
    const fresh = await getCachedMatchIds(puuid, region, count, true).catch(() => matchIds);
    if (fresh.length > matchIds.length) matchIds = fresh;
  }

  if (!matchIds || matchIds.length === 0) {
    return {
      success: true,
      matches: [],
      message: "No recent matches found",
    };
  }

  // Step 2: Fetch match details. A finished match is immutable, so each one
  // is cached in Firestore forever and only genuinely new matches reach Riot.
  // Fetches run in parallel — 10 serial round trips was the dominant cost of
  // opening a League rank card.
  const settled = await Promise.allSettled(
    matchIds.map((matchId) => getCachedMatch(matchId, region))
  );

  const matches: RecentMatchResult[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === "rejected") {
      logger.warn(`Failed to fetch match ${matchIds[i]}:`, outcome.reason);
      return; // Skip this match but keep the rest
    }
    const entry = extractParticipant(outcome.value, puuid);
    if (entry) matches.push(entry);
  });

  // Riot returns ids newest-first and allSettled preserves input order, so this
  // is normally a no-op — it's here so the UI's recency assumption holds even if
  // that ever stops being true.
  matches.sort((a, b) => (b.playedAt ?? 0) - (a.playedAt ?? 0));

  return {
    success: true,
    matches,
  };
}

/**
 * Fixed-window per-IP limit for unauthenticated callers.
 *
 * Bounds how many distinct profiles one anonymous client can pull match history
 * for, which is what stops a cache-miss walk from draining the shared keys.
 * Best-effort: an infrastructure failure allows the request rather than taking
 * public profiles down with it.
 */
async function enforceAnonymousLimit(ip: string): Promise<void> {
  if (!ip) return;
  const db = admin.firestore();
  const ref = db
    .collection(ANON_LIMIT_COLLECTION)
    .doc(ip.replace(/[^a-zA-Z0-9_.\-:]/g, "_").slice(0, 400));
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const data = snap.data() as {count?: number; windowStart?: number} | undefined;

      if (!data?.windowStart || now - data.windowStart > ANON_LIMIT_WINDOW_MS) {
        tx.set(ref, {count: 1, windowStart: now});
        return;
      }
      if ((data.count ?? 0) >= ANON_LIMIT_MAX) {
        throw new HttpsError(
          "resource-exhausted",
          "Too many requests. Wait a moment and try again."
        );
      }
      tx.update(ref, {count: (data.count ?? 0) + 1});
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.warn("Anonymous match-history limit check failed, allowing:", error);
  }
}

/**
 * Per-user throttle for forced refreshes.
 *
 * forceRefresh reaches Riot/Henrik directly, so without a limit one client
 * could hold a Refresh button and drain the shared keys. Keyed by uid when the
 * caller is signed in and by IP otherwise, since this endpoint serves logged-out
 * visitors on public profiles. Returns false when the caller refreshed too
 * recently — the request then serves cached data instead of failing, since
 * stale history is a better outcome than an error.
 *
 * Best-effort, like the rate limiter in lookupRank: an infrastructure failure
 * here allows the refresh rather than blocking it.
 */
async function allowForceRefresh(key: string): Promise<boolean> {
  const db = admin.firestore();
  // Firestore ids can't contain "/" and IPs/uids may carry other punctuation.
  const safeKey = key.replace(/[^a-zA-Z0-9_.\-:]/g, "_").slice(0, 400);
  const ref = db.collection(FORCE_REFRESH_COLLECTION).doc(safeKey);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const last = (snap.data() as {lastAt?: number} | undefined)?.lastAt ?? 0;
      if (Date.now() - last < FORCE_REFRESH_COOLDOWN_MS) return false;
      tx.set(ref, {lastAt: Date.now()});
      return true;
    });
  } catch (error) {
    logger.warn(`Force-refresh throttle check failed for ${safeKey}, allowing:`, error);
    return true;
  }
}

/**
 * Recent-match-id list for one player, cached briefly.
 *
 * Cached per (puuid, region, count) because a request for 10 ids cannot be
 * served from a cached list of 5. A miss re-fetches; a stale-but-present list
 * is preferred over an error so a Riot blip degrades to slightly old history
 * rather than an empty card.
 */
async function getCachedMatchIds(
  puuid: string,
  region: string,
  count: number,
  forceRefresh = false
): Promise<string[]> {
  const db = admin.firestore();
  const key = `${puuid}_${region}_${count}`.replace(/[^a-zA-Z0-9_.\-]/g, "_");
  const ref = db.collection(MATCH_ID_CACHE_COLLECTION).doc(key);

  let stale: string[] | undefined;
  try {
    const snap = await ref.get();
    const data = snap.data() as {ids?: string[]; cachedAt?: number} | undefined;
    if (Array.isArray(data?.ids) && typeof data?.cachedAt === "number") {
      // Still read on a forced refresh: the entry becomes the fallback if Riot
      // fails, so a Refresh press can't turn a populated card into an empty one.
      if (!forceRefresh && Date.now() - data.cachedAt < MATCH_ID_CACHE_TTL_MS) {
        return data.ids;
      }
      stale = data.ids;
    }
  } catch (error) {
    logger.warn(`Match id cache read failed for ${key}:`, error);
  }

  let ids: string[];
  try {
    ids = await getRecentMatchIds(puuid, region, count);
  } catch (error) {
    // Riot is unavailable. A slightly old list beats no history at all.
    // Stale ids beat an empty card during a brief Riot blip, but not
    // indefinitely — a decrypt error means this list belongs to an account
    // identity that no longer resolves, so the caller must see the failure and
    // repair rather than be handed stale data forever.
    const mismatch =
      error instanceof HttpsError && error.message === "REGION_MISMATCH";
    if (stale && !mismatch) {
      logger.warn("Riot match-id fetch failed; serving stale ids:", error);
      return stale;
    }
    throw error;
  }

  ref
    .set({ids, cachedAt: Date.now()})
    .catch((error) => logger.warn(`Match id cache write failed for ${key}:`, error));

  return ids;
}

/**
 * Read a match from the Firestore cache, falling back to Riot on a miss.
 *
 * Match data never changes once the game ends, so entries have no TTL. The
 * cache write is best-effort: a failure costs a future Riot call, not this one.
 */
async function getCachedMatch(matchId: string, region: string): Promise<any> {
  const db = admin.firestore();
  const ref = db.collection(MATCH_CACHE_COLLECTION).doc(matchId);

  try {
    const snap = await ref.get();
    const cached = snap.data() as {info?: unknown} | undefined;
    if (cached?.info) return cached;
  } catch (error) {
    logger.warn(`Match cache read failed for ${matchId}:`, error);
  }

  const matchData = await getMatchById(matchId, region);

  // Store only what extractParticipant reads. A full match-v5 payload is well
  // over Firestore's 1 MiB document limit once ten players' timelines are in it.
  const trimmed = {
    info: {
      gameCreation: matchData?.info?.gameCreation ?? null,
      gameEndTimestamp: matchData?.info?.gameEndTimestamp ?? null,
      gameDuration: matchData?.info?.gameDuration ?? null,
      queueId: matchData?.info?.queueId ?? null,
      participants: (matchData?.info?.participants ?? []).map((p: any) => ({
        puuid: p.puuid,
        win: p.win,
        championName: p.championName,
        championId: p.championId,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        champLevel: p.champLevel,
        summoner1Id: p.summoner1Id ?? 0,
        summoner2Id: p.summoner2Id ?? 0,
        perks: p.perks ?? null,
        item0: p.item0 ?? 0,
        item1: p.item1 ?? 0,
        item2: p.item2 ?? 0,
        item3: p.item3 ?? 0,
        item4: p.item4 ?? 0,
        item5: p.item5 ?? 0,
        item6: p.item6 ?? 0,
        totalMinionsKilled: p.totalMinionsKilled ?? 0,
        neutralMinionsKilled: p.neutralMinionsKilled ?? 0,
        visionScore: p.visionScore ?? 0,
        totalDamageDealtToChampions: p.totalDamageDealtToChampions ?? 0,
        goldEarned: p.goldEarned ?? 0,
        teamPosition: p.teamPosition ?? null,
        individualPosition: p.individualPosition ?? null,
      })),
    },
    cachedAt: Date.now(),
  };

  ref.set(trimmed).catch((error) =>
    logger.warn(`Match cache write failed for ${matchId}:`, error)
  );

  return trimmed;
}

/**
 * Pull one player's row out of a match payload. Returns null when the player
 * isn't in the match (shouldn't happen, but the data is Riot's, not ours).
 */
function extractParticipant(matchData: any, puuid: string): RecentMatchResult | null {
  const participant = matchData?.info?.participants?.find(
    (p: any) => p.puuid === puuid
  );
  if (!participant) return null;

  const styles = participant.perks?.styles ?? [];
  const primary = styles.find((st: any) => st.description === "primaryStyle") ?? styles[0];
  const secondary = styles.find((st: any) => st.description === "subStyle") ?? styles[1];

  return {
    won: participant.win === true,
    champion: participant.championName,
    championId: participant.championId,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    playedAt: matchData?.info?.gameEndTimestamp ?? matchData?.info?.gameCreation,
    queueId: matchData?.info?.queueId,
    gameDuration: matchData?.info?.gameDuration,
    champLevel: participant.champLevel,
    summonerSpells: [participant.summoner1Id ?? 0, participant.summoner2Id ?? 0],
    runes: primary?.selections?.[0]?.perk != null ? {
      keystone: primary.selections[0].perk,
      primaryStyle: primary.style,
      secondaryStyle: secondary?.style ?? 0,
    } : undefined,
    items: [0, 1, 2, 3, 4, 5, 6].map((i) => participant[`item${i}`] ?? 0),
    cs: (participant.totalMinionsKilled ?? 0) + (participant.neutralMinionsKilled ?? 0),
    visionScore: participant.visionScore,
    damageToChampions: participant.totalDamageDealtToChampions,
    goldEarned: participant.goldEarned,
    role: participant.teamPosition || participant.individualPosition,
  };
}

async function getValorantRecentMatches(
  userData: any,
  count: number,
  forceRefresh = false
): Promise<GetRecentMatchesResponse> {
  const valorantAccount = userData?.valorantAccount;

  if (!valorantAccount) {
    return {
      success: true,
      matches: [],
      message: "No Valorant account linked",
    };
  }

  const {gameName, tag, region} = valorantAccount;

  // Henrik returns one bulk payload rather than per-match documents, so the
  // whole response is cached under a short TTL. Henrik's limits are tighter
  // than Riot's, and this path previously had no cache at all.
  const henrikMatches = await getCachedValorantMatches(region, gameName, tag, count, forceRefresh);

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

/**
 * Henrik match list for one player, cached briefly.
 *
 * Keyed by (region, name, tag, count) — a request for 10 matches cannot be
 * served from a cached list of 5. Stale data is preferred over an error, so a
 * Henrik outage degrades to slightly old history rather than an empty card.
 */
async function getCachedValorantMatches(
  region: string,
  gameName: string,
  tag: string,
  count: number,
  forceRefresh = false
): Promise<HenrikMatch[]> {
  const db = admin.firestore();
  const key = `${region}_${gameName}_${tag}_${count}`
    .toLowerCase()
    .replace(/[^a-z0-9_.\-]/g, "_");
  const ref = db.collection(VALORANT_MATCH_CACHE_COLLECTION).doc(key);

  let stale: HenrikMatch[] | undefined;
  try {
    const snap = await ref.get();
    const data = snap.data() as {matches?: HenrikMatch[]; cachedAt?: number} | undefined;
    if (Array.isArray(data?.matches) && typeof data?.cachedAt === "number") {
      // As above: kept as the fallback even when forcing, so a Henrik failure
      // during a Refresh degrades to old history rather than an empty card.
      if (!forceRefresh && Date.now() - data.cachedAt < VALORANT_MATCH_CACHE_TTL_MS) {
        return data.matches;
      }
      stale = data.matches;
    }
  } catch (error) {
    logger.warn(`Valorant match cache read failed for ${key}:`, error);
  }

  let matches: HenrikMatch[];
  try {
    matches = await getValorantMatches(region, gameName, tag, count);
  } catch (error) {
    if (stale) {
      logger.warn("Henrik match fetch failed; serving stale matches:", error);
      return stale;
    }
    throw error;
  }

  // getValorantMatches swallows errors into [], so an empty result may be a
  // failure rather than a player with no games. Don't overwrite good data with
  // it, and don't cache it as if it were the truth.
  if (matches.length === 0) return stale ?? matches;

  // Cache a trimmed copy, not the raw payload. Henrik includes a per-round
  // event array that is typically larger than the rest of the match combined;
  // at 20 matches the raw response can exceed Firestore's 1 MiB document limit
  // and the write would fail. Only the fields read below are kept.
  ref
    .set({matches: matches.map(trimHenrikMatch), cachedAt: Date.now()})
    .catch((error) => logger.warn(`Valorant match cache write failed for ${key}:`, error));

  return matches;
}

/**
 * Reduce a Henrik match to the fields getValorantRecentMatches reads.
 *
 * Must stay in step with the mapping below — a field dropped here silently
 * becomes undefined for every cache hit.
 */
function trimHenrikMatch(match: HenrikMatch): HenrikMatch {
  return {
    metadata: {
      matchid: match.metadata?.matchid,
      map: match.metadata?.map,
      game_start: match.metadata?.game_start,
      game_length: match.metadata?.game_length,
      mode: match.metadata?.mode,
    },
    players: {
      all_players: (match.players?.all_players ?? []).map((p) => ({
        name: p.name,
        tag: p.tag,
        team: p.team,
        character: p.character,
        stats: {
          kills: p.stats?.kills,
          deaths: p.stats?.deaths,
          assists: p.stats?.assists,
          score: p.stats?.score,
          headshots: p.stats?.headshots,
          bodyshots: p.stats?.bodyshots,
          legshots: p.stats?.legshots,
        },
        currenttier_patched: p.currenttier_patched,
      })),
    },
    teams: match.teams,
  } as HenrikMatch;
}
