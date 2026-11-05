/**
 * Handing a signed-out player's lobbies to the account they then made.
 *
 * Their anonymous id is swapped for the account's wherever it appears: members,
 * the member list, teams and, for a lobby they host, the host. If the account
 * was already in the lobby, the anonymous seat is dropped instead.
 *
 * The caller proves they were that anonymous player with its ID token, which
 * the browser keeps when the session ends. Without that proof, anyone could
 * take over a stranger's seat by naming their id. The token lasts about an
 * hour, so a signup left longer than that leaves the lobbies with the old
 * session: they keep working, but aren't handed over.
 */
import {onCall, HttpsError, CallableRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

interface ClaimRequest {
  anonymousToken?: string;
  partyIds?: unknown;
}

const MAX_LOBBIES = 50;

/** Separate from the callable so it can be run against the emulator. */
export async function claimLobbies(
  db: FirebaseFirestore.Firestore,
  from: string,
  me: {uid: string; username: string; avatar: string},
  partyIds: string[],
): Promise<number> {
  let claimed = 0;
  for (const partyId of partyIds) {
    if (!partyId || partyId.includes("/")) continue;
    const ref = db.collection("parties").doc(partyId);
    const done = await db.runTransaction(async (tx) => {
      const party = (await tx.get(ref)).data();
      const members: string[] = party?.members ?? [];
      if (!party || !members.includes(from)) return false;

      const already = members.includes(me.uid);
      const swap = (ids: string[] = []) =>
        already ? ids.filter((id) => id !== from) : ids.map((id) => (id === from ? me.uid : id));

      const details: Array<Record<string, unknown>> = party.memberDetails ?? [];
      const detail = details.find((m) => m.userId === from);
      const memberDetails = details.filter((m) => m.userId !== from);
      if (!already && detail) {
        // The self-given rank goes: the account's own linked rank shows now.
        const replacement: Record<string, unknown> = {...detail, userId: me.uid, username: me.username, avatar: me.avatar};
        delete replacement.rank;
        memberDetails.push(replacement);
      }

      tx.update(ref, {
        members: swap(members),
        memberDetails,
        ...(party.teams ? {teams: {"1": swap(party.teams["1"]), "2": swap(party.teams["2"])}} : {}),
        ...(party.createdBy === from ? {createdBy: me.uid} : {}),
      });
      return true;
    });
    if (done) claimed += 1;
  }
  return claimed;
}

export const claimAnonymousLobbiesFunction = onCall(
  {cors: true},
  async (request: CallableRequest<ClaimRequest>): Promise<{claimed: number}> => {
    const auth = request.auth;
    if (!auth || auth.token.firebase?.sign_in_provider === "anonymous") {
      throw new HttpsError("unauthenticated", "Log in to claim these lobbies.");
    }
    const {anonymousToken, partyIds} = request.data ?? {};
    if (typeof anonymousToken !== "string" || !Array.isArray(partyIds)) {
      throw new HttpsError("invalid-argument", "Nothing to claim.");
    }

    let from: string;
    try {
      const decoded = await admin.auth().verifyIdToken(anonymousToken);
      if (decoded.firebase?.sign_in_provider !== "anonymous") throw new Error("Not an anonymous session");
      from = decoded.uid;
    } catch (e) {
      logger.info("Anonymous lobby claim refused", e);
      throw new HttpsError("permission-denied", "That session can't be handed over.");
    }
    if (from === auth.uid) return {claimed: 0};

    const db = admin.firestore();
    const user = (await db.collection("users").doc(auth.uid).get()).data();
    const claimed = await claimLobbies(
      db,
      from,
      {uid: auth.uid, username: user?.username || "Unknown", avatar: user?.avatar || ""},
      partyIds.filter((id): id is string => typeof id === "string").slice(0, MAX_LOBBIES),
    );
    return {claimed};
  },
);
