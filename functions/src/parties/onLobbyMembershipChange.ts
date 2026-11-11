/**
 * Join, leave, new-host, close and reopen lines in a lobby's chat.
 *
 * When `parties/{partyId}`'s members change, the change is written into the
 * lobby's chat (parties/{id}/messages) as a system message, so it stays in the
 * conversation for good. The web used to read joins off memberDetails, which
 * erased someone's "joined" line the moment they left.
 *
 * Written with admin access: the rules don't let clients create these (they
 * only allow plain messages sent as yourself), and a leaving member is no
 * longer a member by the time they could write one.
 *
 * Closing also notifies every other member (`lobby_closed`).
 *
 * KEEP IN SYNC with lib/lobbyChatService.ts in the web repo.
 */
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {db} from "../badges/db";

interface MemberDetail {
  userId?: string;
  username?: string;
  avatar?: string;
}

export const onLobbyMembershipChange = onDocumentUpdated(
  "parties/{partyId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const messages = event.data!.after.ref.collection("messages");
    const partyId = event.params.partyId;

    // Closed or reopened by its leader (Peakd-web closeParty / reopenParty):
    // a line in the chat, and on closing, word to everyone else in it.
    if (!before.closedAt !== !after.closedAt) {
      const closing = !!after.closedAt;
      const byId: string = (closing ? after.closedBy : before.closedBy) || after.createdBy || "";
      const by = ((after.memberDetails ?? []) as MemberDetail[]).find((m) => m.userId === byId);
      const batch = db.batch();
      batch.set(messages.doc(), {
        senderId: "system",
        system: closing ? "closed" : "reopened",
        userId: byId,
        username: by?.username ?? "",
        avatar: by?.avatar ?? "",
        text: "",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (closing) {
        for (const id of (after.members ?? []) as string[]) {
          if (!id || id === byId) continue;
          batch.set(db.collection(`users/${id}/notifications`).doc(), {
            type: "lobby_closed",
            fromUserId: byId,
            fromUsername: by?.username ?? "The leader",
            fromAvatar: by?.avatar ?? "",
            partyId,
            partyName: after.partyName ?? "",
            game: after.game ?? "",
            read: false,
            createdAt: admin.firestore.Timestamp.now(),
          });
        }
      }
      await batch.commit();
    }

    const was = new Set<string>(before.members ?? []);
    const now = new Set<string>(after.members ?? []);
    const joined = [...now].filter((id) => !was.has(id));
    const left = [...was].filter((id) => !now.has(id));

    // A join and a leave in one write is an id being swapped, not people
    // coming and going: claimAnonymousLobbies handing a signed-out player's
    // place (and, if they hosted, the lobby) to their new account. Nobody
    // joined, left or took over.
    if (joined.length > 0 && left.length > 0) return;

    // A new host: handed over (Make host), or passed on by a leaving host.
    const newHost: string | null =
      before.createdBy && after.createdBy && before.createdBy !== after.createdBy && now.has(after.createdBy)
        ? after.createdBy
        : null;
    if (joined.length === 0 && left.length === 0 && !newHost) return;

    const details = (list: MemberDetail[] | undefined) =>
      new Map((list ?? []).filter((m) => m.userId).map((m) => [m.userId as string, m]));
    const beforeDetails = details(before.memberDetails);
    const afterDetails = details(after.memberDetails);

    // Stamped here rather than by the server, a millisecond apart, so a host
    // leaving reads "x has left" and then "y is now the host", in that order.
    const base = Date.now();
    let n = 0;
    const batch = db.batch();
    const add = (userId: string, kind: "joined" | "left" | "host", d?: MemberDetail) => {
      batch.set(messages.doc(), {
        senderId: "system",
        system: kind,
        userId,
        username: d?.username ?? "",
        avatar: d?.avatar ?? "",
        text: "",
        timestamp: admin.firestore.Timestamp.fromMillis(base + n++),
      });
    };
    for (const id of joined) add(id, "joined", afterDetails.get(id));
    for (const id of left) add(id, "left", beforeDetails.get(id));
    if (newHost) add(newHost, "host", afterDetails.get(newHost));
    await batch.commit();
  }
);
