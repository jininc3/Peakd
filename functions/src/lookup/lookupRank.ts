/**
 * Unauthenticated rank lookup for the logged-out card builder (web /create).
 *
 * Read-only counterpart to linkValorantAccount / linkRiotAccount: it resolves
 * a rank for display and writes NOTHING to any user document. Nothing here is
 * proof of account ownership — a visitor can type any Riot ID. The real,
 * authenticated link still happens at the end of signup.
 *
 * Because the endpoint is public, the shared Riot/Henrik keys are exposed to
 * whatever traffic reaches it. Two things keep that inside quota:
 *
 *   1. A Firestore response cache (rankLookupCache/{game:name:tag:region}),
 *      TTL CACHE_TTL_MS. Repeat lookups of the same Riot ID — the common case
 *      while a card is being passed around — never reach Riot.
 *   2. A fixed-window per-IP limit (rankLookupRate/{ip}) on cache MISSES only,
 *      so one caller cannot walk many distinct IDs and bypass the cache.
 *
 * Neither is a security boundary; both are quota protection. The endpoint is
 * open by design — the point is that a visitor with no account sees a card.
 */
import {onCall, HttpsError, CallableRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {getValorantAccountByRiotId, getValorantMMR} from "../valorant/valorantApi";
import {getAccountByRiotId, getRankedStats} from "../riot/riotApi";

// Declared so the runtime mounts them for this function; the API modules read
// the values themselves.
const henrikApiKey = defineSecret("HENRIK_API_KEY");
const riotApiKey = defineSecret("RIOT_API_KEY");

const CACHE_TTL_MS = 5 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 12;

type Game = "valorant" | "league";

interface LookupRequest {
  game?: string;
  gameName?: string;
  tagLine?: string;
  region?: string;
}

/** Must match PublicRankResult in the web repo's lib/publicRankLookup.ts. */
interface PublicRankResult {
  rank?: string;
  peakRank?: string;
  winRate?: number;
  wins?: number;
  losses?: number;
  leaguePoints?: number;
  rankRating?: number;
  /**
   * Whether this Riot ID is already claimed by a Peakd profile.
   *
   * Lets the logged-out builder send an existing owner to log in instead of
   * offering a signup that would fail at the link step. Deliberately carries
   * no user id or username — the caller is anonymous, and who owns an account
   * is not theirs to learn.
   *
   * NOT part of the cached payload: a claim can appear at any time, and a
   * stale "false" would invite exactly the failed signup this prevents.
   */
  alreadyLinked?: boolean;
}

/**
 * A lookup result plus the Riot-canonical identity it resolved to.
 *
 * The claim id in linkedAccounts is built from what Riot returned, not from
 * what the visitor typed — the link functions store it that way, and casing
 * differs often enough ("Prevail#ROZI" vs "prevail#rozi") that matching on the
 * typed form would miss real claims.
 */
interface LookupOutcome {
  result: PublicRankResult;
  /** Claim document id in linkedAccounts, or undefined when unresolvable. */
  claimId?: string;
}

// Mirrors validRegions in linkValorantAccount / linkRiotAccount. A region that
// previews here but fails at link time is worse than one that never previews.
const VAL_REGIONS = new Set(["na", "eu", "ap", "kr", "latam", "br"]);
const LOL_REGIONS = new Set([
  "na1", "euw1", "eun1", "kr", "br1", "jp1", "oc1", "la1", "la2", "tr1", "ru",
]);

/** "PLATINUM" + "I" -> "Platinum I". Apex tiers carry no division. */
function formatLeagueRank(tier: string, division?: string): string {
  if (!tier) return "Unranked";
  const t = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  if (["Master", "Grandmaster", "Challenger"].includes(t)) return t;
  return division ? `${t} ${division}` : t;
}

/** Firestore ids cannot contain "/", and Riot IDs cannot either. */
function cacheKey(game: Game, gameName: string, tagLine: string, region: string): string {
  return `${game}:${gameName}:${tagLine}:${region}`.toLowerCase();
}

/**
 * Fixed-window per-IP limit. Best-effort: an infrastructure failure here must
 * not take the lookup down, so non-HttpsError problems fall through to allow.
 */
async function checkRateLimit(ip: string): Promise<void> {
  if (!ip) return;
  const db = admin.firestore();
  const ref = db.doc(`rankLookupRate/${ip.replace(/[^a-zA-Z0-9:.\-]/g, "_")}`);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const data = snap.data() as {count?: number; windowStart?: number} | undefined;

      if (!data?.windowStart || now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
        tx.set(ref, {count: 1, windowStart: now});
        return;
      }
      if ((data.count ?? 0) >= RATE_LIMIT_MAX) {
        throw new HttpsError(
          "resource-exhausted",
          "Too many lookups. Wait a moment and try again."
        );
      }
      tx.update(ref, {count: (data.count ?? 0) + 1});
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.warn("Rank lookup rate check failed, allowing request:", error);
  }
}

async function lookupValorant(
  gameName: string,
  tagLine: string
): Promise<LookupOutcome> {
  // Region is NOT taken from the caller. The account lookup is region-agnostic
  // and its response carries the account's real region — asking the visitor
  // instead lets a wrong pick fetch MMR from the wrong region and come back
  // rankless. Mirrors linkValorantAccount.
  const account = await getValorantAccountByRiotId(gameName, tagLine);
  const apiRegion = (account.region || "").toLowerCase();
  const region = VAL_REGIONS.has(apiRegion) ? apiRegion : "na";

  // getValorantMMR already maps 404/429 to the right HttpsError.
  const mmr = await getValorantMMR(region, gameName, tagLine);
  const current = mmr.current_data?.currenttierpatched;
  const peak = mmr.highest_rank?.patched_tier;

  return {
    result: {
      rank: current && current.toUpperCase() !== "UNRANKED" ? current : undefined,
      peakRank: peak,
      rankRating: mmr.current_data?.ranking_in_tier,
    },
    // Mirrors linkValorantAccount's accountId exactly, region included — the
    // same Riot ID on two regions is two separate claims there.
    claimId: `valorant:${account.name ?? gameName}#${account.tag ?? tagLine}#${region}`,
  };
}

async function lookupLeague(
  gameName: string,
  tagLine: string,
  region: string
): Promise<LookupOutcome> {
  const account = await getAccountByRiotId(gameName, tagLine, region);
  if (!account?.puuid) {
    throw new HttpsError("not-found", "Account not found. Please check the Game Name and Tag.");
  }

  // Mirrors linkRiotAccount's accountId. No region: a Riot account is one
  // claim across platforms there.
  const claimId = `riot:${account.gameName ?? gameName}#${account.tagLine ?? tagLine}`;

  const entries = await getRankedStats(account.puuid, region);
  const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");

  // Unranked is a valid outcome, not an error: the card renders "Unranked".
  // Still carries the claim id — an unranked account can be linked too.
  if (!solo?.tier) return {result: {}, claimId};

  const wins = solo.wins ?? 0;
  const losses = solo.losses ?? 0;
  const total = wins + losses;

  return {
    result: {
      rank: formatLeagueRank(solo.tier, solo.rank),
      wins,
      losses,
      winRate: total > 0 ? Math.round((wins / total) * 100) : undefined,
      leaguePoints: solo.leaguePoints,
    },
    claimId,
  };
}

/**
 * Whether a claim document exists for this account.
 *
 * Best-effort by design: an infrastructure failure here must not fail an
 * otherwise good lookup, so a read error reports "not linked" and the visitor
 * gets the normal signup path. The authenticated link is still the real
 * gate — it rejects a taken account with already-exists regardless of what
 * this preview said.
 */
async function isAlreadyLinked(claimId: string | undefined): Promise<boolean> {
  if (!claimId) return false;
  try {
    const snap = await admin.firestore().collection("linkedAccounts").doc(claimId).get();
    return snap.exists;
  } catch (error) {
    logger.warn("Linked-account check failed, treating as unlinked:", error);
    return false;
  }
}

export const lookupRankFunction = onCall(
  {secrets: [henrikApiKey, riotApiKey], cors: true},
  async (request: CallableRequest<LookupRequest>): Promise<PublicRankResult> => {
    const {game, gameName, tagLine, region} = request.data ?? {};

    // Validation mirrors the web's validateRiotId and the link functions' own
    // checks, so a bad ID fails identically in preview and at link time.
    if (game !== "valorant" && game !== "league") {
      throw new HttpsError("invalid-argument", "Unsupported game.");
    }
    if (typeof gameName !== "string" || typeof tagLine !== "string") {
      throw new HttpsError("invalid-argument", "Enter both your Riot ID and tag.");
    }
    const cleanName = gameName.trim();
    const cleanTag = tagLine.trim();
    if (cleanName.length < 3 || cleanName.length > 16) {
      throw new HttpsError("invalid-argument", "Riot ID must be between 3 and 16 characters.");
    }
    if (cleanTag.length < 2 || cleanTag.length > 5) {
      throw new HttpsError("invalid-argument", "Tag must be between 2 and 5 characters.");
    }
    // League still needs a platform host from the caller. Valorant resolves its
    // own region from the account lookup, so anything sent is ignored.
    if (game === "league" && (!region || !LOL_REGIONS.has(region))) {
      throw new HttpsError("invalid-argument", "Unsupported region.");
    }

    const db = admin.firestore();
    const key = cacheKey(game, cleanName, cleanTag, game === "valorant" ? "auto" : region!);
    const cacheRef = db.doc(`rankLookupCache/${key}`);

    // Cache hit: serve without touching Riot or the rate limit. A cached read
    // costs nothing upstream, so throttling it would only penalise sharing.
    try {
      const cached = await cacheRef.get();
      const data = cached.data() as {
        result?: PublicRankResult;
        claimId?: string;
        cachedAt?: number;
      } | undefined;
      if (data?.result && data.cachedAt && Date.now() - data.cachedAt < CACHE_TTL_MS) {
        // The claim is re-read even on a hit: someone can link the account
        // within the cache window, and a stale "not linked" would send them
        // into a signup that fails at the link step.
        return {...data.result, alreadyLinked: await isAlreadyLinked(data.claimId)};
      }
    } catch (error) {
      logger.warn("Rank cache read failed, falling through to Riot:", error);
    }

    // Miss: this call will hit Riot, so it counts against the limit.
    await checkRateLimit(request.rawRequest.ip ?? "");

    const outcome = game === "valorant" ?
      await lookupValorant(cleanName, cleanTag) :
      await lookupLeague(cleanName, cleanTag, region!);

    // Best-effort: a cache write failure must not fail a successful lookup.
    // Only the rank payload and the resolved claim id are stored —
    // alreadyLinked is deliberately excluded, since it can change inside the
    // TTL and is re-read on every hit.
    cacheRef
      .set({
        result: outcome.result,
        ...(outcome.claimId ? {claimId: outcome.claimId} : {}),
        cachedAt: Date.now(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + CACHE_TTL_MS),
      })
      .catch((error) => logger.warn("Rank cache write failed:", error));

    return {...outcome.result, alreadyLinked: await isAlreadyLinked(outcome.claimId)};
  }
);
