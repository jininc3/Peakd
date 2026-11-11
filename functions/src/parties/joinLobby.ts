/**
 * Joining a lobby, decided on the server.
 *
 * firestore.rules no longer lets anyone add themselves to a lobby's members, so
 * every way in comes through here and each one proves its right to enter:
 *
 *   - code:   the lobby's 5-character invite code
 *   - token:  its invite link's token
 *   - invite: a pending invite naming this user
 *   - open:   the lobby being public
 *
 * Then the same checks for all of them: the lobby's rank requirement and its
 * capacity. Wrong codes and tokens are rate limited, since a 5-character code
 * could otherwise be guessed.
 *
 * Signed-out players (an anonymous session) get in only by a link to a lobby
 * that was made without an account, under the name they give.
 */
import {onCall, HttpsError, CallableRequest} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

type Game = "valorant" | "league";

interface JoinRequest {
  method?: "code" | "token" | "invite" | "open";
  code?: string;
  partyId?: string;
  token?: string;
  /** The name a signed-out player joins under. */
  guestName?: string;
  /**
   * A 5v5 seat they picked: this side, and in a League lobby by role this
   * lane. Joined and seated in the one write, or refused if it has gone.
   */
  side?: 1 | 2;
  lane?: string;
}

export interface JoinResult {
  partyId: string;
  status: "joined" | "already";
  /** Seated where they asked (data.side). Lets the web tell this version apart. */
  seated?: boolean;
}

interface Caller {
  uid: string;
  anonymous: boolean;
}

/** Keep in step with LEAGUE_TIERS and VALORANT_TIERS in Peakd-web's lib/lobbyService.ts. */
const LEAGUE_TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const VALORANT_TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "ASCENDANT", "IMMORTAL", "RADIANT"];

/** A lobby without a recorded cap: 10 + spectators for a 5v5, else 20. Matches capacityOf. */
const FIVE_V_FIVE_MAX_MEMBERS = 30;
const DEFAULT_MAX_MEMBERS = 20;

/** Wrong codes or tokens allowed per user in a window, before they're told to wait. */
const MAX_FAILED_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const GUEST_NAME_MAX = 20;
const CODE_PATTERN = /^[A-Z0-9]{5}$/;

/** Matches gameKeyOf in Peakd-web's lib/lobbyService.ts. */
function gameOf(party: FirebaseFirestore.DocumentData): Game {
  if (party.gameId === "valorant" || party.gameId === "league") return party.gameId;
  return String(party.game ?? "").toLowerCase().includes("league") ? "league" : "valorant";
}

const TEAM_SIZE = 5;

/**
 * Where a newcomer to a 5v5 sits: the side they asked for if it has room;
 * otherwise, in a lobby without lanes, the first side with an empty seat
 * (Team 1, then Team 2), so a lobby fills from the top. A League lobby laid
 * out by lane leaves them spectating until they pick a lane. Null for a
 * spectator. Matches usesLanes and resolveTeams in Peakd-web lib/lobbyService.ts.
 */
/** A side's players who are still in the lobby, members or guests. */
function liveTeam(party: FirebaseFirestore.DocumentData, members: string[], side: "1" | "2"): string[] {
  const live = new Set([...members, ...((party.guests ?? []) as {id?: string}[]).map((g) => g.id)]);
  return ((party.teams?.[side] ?? []) as string[]).filter((id) => live.has(id));
}

const LANES = ["Top", "Jungle", "Mid", "Bottom", "Support"];

/**
 * An invite to a particular lane (League, by role): that lane on that side,
 * if it's still free when they accept; null to spectate if it's been taken
 * or the side has filled. Undefined when the invite named no lane.
 */
function laneSeatFor(
  party: FirebaseFirestore.DocumentData,
  members: string[],
  invite: {side?: unknown; lane?: unknown} | undefined,
): {side: "1" | "2"; lane: string} | null | undefined {
  if (!invite || (invite.side !== 1 && invite.side !== 2) || !LANES.includes(String(invite.lane))) return undefined;
  if (party.lobbyKind !== "fiveVFive" || gameOf(party) !== "league" || party.roleSlots === false) return undefined;
  const side = String(invite.side) as "1" | "2";
  const team = liveTeam(party, members, side);
  const taken = team.length >= TEAM_SIZE || team.some((id) => party.roles?.[id] === invite.lane);
  return taken ? null : {side, lane: String(invite.lane)};
}

/**
 * The seat they chose before joining (Join on a team, or on a lane), checked
 * against the lobby as it is now. Throws if it has been taken since, so the
 * join fails cleanly rather than seating them elsewhere. Undefined when they
 * didn't pick one.
 */
function pickedSeat(
  party: FirebaseFirestore.DocumentData,
  members: string[],
  data: JoinRequest,
): {side: "1" | "2"; lane?: string} | undefined {
  if (party.lobbyKind !== "fiveVFive" || (data.side !== 1 && data.side !== 2)) return undefined;
  const side = String(data.side) as "1" | "2";
  const team = liveTeam(party, members, side);
  if (team.length >= TEAM_SIZE) throw new HttpsError("failed-precondition", `Team ${side} just filled up.`);
  const lanes = gameOf(party) === "league" && party.roleSlots !== false;
  if (!lanes || !LANES.includes(String(data.lane))) return {side};
  const lane = String(data.lane);
  if (team.some((id) => party.roles?.[id] === lane)) {
    throw new HttpsError("failed-precondition", `Someone just took ${lane === "Bottom" ? "bot" : lane.toLowerCase()} on Team ${side}.`);
  }
  return {side, lane};
}

function seatFor(party: FirebaseFirestore.DocumentData, members: string[], asked: unknown): "1" | "2" | null {
  if (party.lobbyKind !== "fiveVFive") return null;
  const size = (side: "1" | "2") => liveTeam(party, members, side).length;
  if ((asked === 1 || asked === 2) && size(String(asked) as "1" | "2") < TEAM_SIZE) return String(asked) as "1" | "2";
  const lanes = gameOf(party) === "league" && party.roleSlots !== false;
  if (lanes) return null;
  // The emptier team first, so a new player evens the sides rather than
  // stacking the host's; Team 1 when they're level.
  const order: ("1" | "2")[] = size("2") < size("1") ? ["2", "1"] : ["1", "2"];
  return order.find((side) => size(side) < TEAM_SIZE) ?? null;
}

function capacityOf(party: FirebaseFirestore.DocumentData): number {
  if (typeof party.maxMembers === "number") return party.maxMembers;
  return party.lobbyKind === "fiveVFive" ? FIVE_V_FIVE_MAX_MEMBERS : DEFAULT_MAX_MEMBERS;
}

function tierIndex(game: Game, rank: string | undefined): number {
  const tier = rank?.split(" ")[0]?.toUpperCase() ?? "";
  return (game === "league" ? LEAGUE_TIERS : VALORANT_TIERS).indexOf(tier);
}

function currentRank(user: FirebaseFirestore.DocumentData | undefined, game: Game): string | undefined {
  if (game === "valorant") {
    const rank = user?.valorantStats?.currentRank;
    return rank && rank !== "Unranked" ? rank : undefined;
  }
  const solo = user?.riotStats?.rankedSolo;
  return solo?.tier && solo.tier !== "UNRANKED" ? `${solo.tier}${solo.rank ? " " + solo.rank : ""}` : undefined;
}

function title(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Throws unless the player's rank meets the lobby's. Tier only; unranked never does. */
function assertMeetsRequirement(
  party: FirebaseFirestore.DocumentData,
  user: FirebaseFirestore.DocumentData | undefined,
) {
  const req = party.requirement as {type: "min" | "max"; tier: string} | null | undefined;
  if (!req) return;
  const game = gameOf(party);
  const rank = currentRank(user, game);
  const player = tierIndex(game, rank);
  const gate = tierIndex(game, req.tier);
  const passes = player >= 0 && (gate < 0 || (req.type === "min" ? player >= gate : player <= gate));
  if (passes) return;
  const need = `${title(req.tier)} or ${req.type === "min" ? "higher" : "lower"}`;
  throw new HttpsError(
    "failed-precondition",
    rank ?
      `This lobby requires ${need}. Your current rank is ${rank}.` :
      `This lobby requires ${need}. Link a ranked ${game === "valorant" ? "Valorant" : "League"} account to join.`,
  );
}

/** Refuses a caller who has guessed wrong too often. Not a counted attempt itself. */
async function assertNotLimited(db: FirebaseFirestore.Firestore, uid: string, now: number) {
  const snap = await db.collection("lobbyJoinRate").doc(uid).get();
  const data = snap.data();
  if (data && now - data.windowStart < ATTEMPT_WINDOW_MS && data.count >= MAX_FAILED_ATTEMPTS) {
    throw new HttpsError("resource-exhausted", "Too many wrong codes. Wait a few minutes and try again.");
  }
}

async function recordFailure(db: FirebaseFirestore.Firestore, uid: string, now: number) {
  const ref = db.collection("lobbyJoinRate").doc(uid);
  await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    const fresh = !data || now - data.windowStart >= ATTEMPT_WINDOW_MS;
    tx.set(ref, {windowStart: fresh ? now : data.windowStart, count: fresh ? 1 : data.count + 1});
  });
}

/** The lobby this request names, once it has proved it may enter. */
async function resolveLobby(
  db: FirebaseFirestore.Firestore,
  caller: Caller,
  data: JoinRequest,
  now: number,
): Promise<FirebaseFirestore.DocumentReference> {
  const parties = db.collection("parties");
  const method = data.method;

  if (method === "code") {
    if (caller.anonymous) throw new HttpsError("permission-denied", "Log in to join with a code.");
    const code = String(data.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!CODE_PATTERN.test(code)) {
      throw new HttpsError("invalid-argument", "Please enter a valid 5-character invite code.");
    }
    await assertNotLimited(db, caller.uid, now);
    const found = await parties.where("inviteCode", "==", code).limit(1).get();
    // Coming from a locked lobby's row, the code has to be that lobby's. Another
    // lobby's code answers as a wrong one, rather than joining somewhere else.
    if (found.empty || (data.partyId && found.docs[0].id !== data.partyId)) {
      await recordFailure(db, caller.uid, now);
      throw new HttpsError("not-found", "Invalid invite code. Party not found.");
    }
    return found.docs[0].ref;
  }

  if (typeof data.partyId !== "string" || !data.partyId || data.partyId.includes("/")) {
    throw new HttpsError("invalid-argument", "Lobby not found.");
  }
  const ref = parties.doc(data.partyId);
  const snap = await ref.get();
  const party = snap.data();

  if (method === "token") {
    await assertNotLimited(db, caller.uid, now);
    // Same answer for a missing lobby and a wrong token, so this can't be used
    // to probe which lobbies exist.
    if (!party || !party.inviteToken || party.inviteToken !== data.token) {
      await recordFailure(db, caller.uid, now);
      throw new HttpsError("permission-denied", "This invite link is no longer valid.");
    }
    if (caller.anonymous && party.anonymousHost !== true) {
      throw new HttpsError("permission-denied", "Log in to join this lobby.");
    }
    return ref;
  }

  if (caller.anonymous) throw new HttpsError("permission-denied", "Log in to join this lobby.");
  if (!party) throw new HttpsError("not-found", "Lobby not found.");

  if ((party.members ?? []).includes(caller.uid)) return ref;
  if (method === "open") {
    if (party.visibility !== "public") throw new HttpsError("permission-denied", "This lobby is invite only.");
    return ref;
  }
  if (method === "invite") {
    const invited = (party.pendingInvites ?? []).some((p: {userId?: string}) => p.userId === caller.uid);
    if (!invited) throw new HttpsError("permission-denied", "This invite is no longer valid.");
    return ref;
  }
  throw new HttpsError("invalid-argument", "Unknown way to join.");
}

/** Separate from the callable so it can be run against the emulator. */
export async function joinLobby(
  db: FirebaseFirestore.Firestore,
  caller: Caller,
  data: JoinRequest,
  now = Date.now(),
): Promise<JoinResult> {
  const ref = await resolveLobby(db, caller, data, now);
  const userSnap = caller.anonymous ? null : await db.collection("users").doc(caller.uid).get();
  const user = userSnap?.data();

  let username: string;
  let avatar = "";
  if (caller.anonymous) {
    username = String(data.guestName ?? "").trim().slice(0, GUEST_NAME_MAX);
    if (!username) throw new HttpsError("invalid-argument", "Enter a name to join.");
  } else {
    username = user?.username || "Unknown";
    avatar = user?.avatar || "";
  }

  // In a transaction because capacity is a hard cap: two people taking the last
  // place at once must not both succeed.
  let seated = false;
  const status = await db.runTransaction(async (tx): Promise<JoinResult["status"]> => {
    const snap = await tx.get(ref);
    const party = snap.data();
    if (!party) throw new HttpsError("not-found", "Lobby not found.");

    const members: string[] = party.members ?? [];
    if (members.includes(caller.uid)) return "already";
    // Closed by its leader (Peakd-web closeParty): read-only, nobody new.
    if (party.closedAt) throw new HttpsError("failed-precondition", "This lobby has been closed.");
    assertMeetsRequirement(party, user);
    if (members.length >= capacityOf(party)) throw new HttpsError("failed-precondition", "This lobby is full.");

    const memberDetails = (party.memberDetails ?? []).filter((m: {userId?: string}) => m.userId !== caller.uid);
    // Someone who was invited, however they came in (the invite, the code or
    // the link), is marked so the lobby's Invites tab can show their invite as
    // accepted rather than have it vanish. Peakd-web PartyMemberDetail.
    const invite = (party.pendingInvites ?? []).find((p: {userId?: string}) => p.userId === caller.uid) as
      {invitedAt?: string} | undefined;
    memberDetails.push({
      userId: caller.uid,
      username,
      avatar,
      joinedAt: new Date(now).toISOString(),
      ...(invite ? {invited: true, ...(invite.invitedAt ? {invitedAt: invite.invitedAt} : {})} : {}),
    });
    // A seat they picked on the page: that one or nothing, so they never
    // land somewhere they didn't choose. Then an invite to a lane: that lane
    // if it's free, else spectate. Otherwise a seat on the emptier team (seatFor).
    const picked = pickedSeat(party, members, data);
    const laneSeat = picked ?? laneSeatFor(party, members, invite as {side?: unknown; lane?: unknown} | undefined);
    const seat = laneSeat === undefined ? seatFor(party, members, undefined) : laneSeat?.side ?? null;
    seated = !!picked;
    tx.update(ref, {
      members: [...members, caller.uid],
      memberDetails,
      // The side's live players plus them: rewritten rather than appended, so
      // ids left behind by deleted accounts can't take it past five.
      ...(seat ? {[`teams.${seat}`]: [...liveTeam(party, members, seat), caller.uid]} : {}),
      ...(laneSeat?.lane ? {[`roles.${caller.uid}`]: laneSeat.lane} : {}),
      pendingInvites: (party.pendingInvites ?? []).filter((p: {userId?: string}) => p.userId !== caller.uid),
      pendingInviteIds: (party.pendingInviteIds ?? []).filter((id: string) => id !== caller.uid),
    });
    return "joined";
  });

  return {partyId: ref.id, status, ...(seated ? {seated} : {})};
}

export const joinLobbyFunction = onCall(
  {cors: true},
  async (request: CallableRequest<JoinRequest>): Promise<JoinResult> => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Log in to join this lobby.");
    return joinLobby(
      admin.firestore(),
      {uid: request.auth.uid, anonymous: request.auth.token.firebase?.sign_in_provider === "anonymous"},
      request.data ?? {},
    );
  },
);
