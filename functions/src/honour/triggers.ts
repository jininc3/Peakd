/**
 * Honour system triggers: record duos as they happen, keep the prompt time in
 * step with the duo session, and send the prompts when they fall due.
 *
 * Live-queue matches are recorded from onDuoMatchUpdated (duo/onMatchUpdated.ts)
 * at the moment both players accept.
 */

import * as admin from "firebase-admin";
import {onDocumentUpdated, onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions/v2";
import {INVITE_PROMPT_DELAY_MS, PROMPT_WINDOW_MS} from "./config";
import {recordDuoPlay, reschedulePrompt} from "./recordDuoPlay";

/** Either side has blocked the other. */
export async function isBlockedPair(
  db: admin.firestore.Firestore,
  a: string,
  b: string,
): Promise<boolean> {
  const [x, y] = await Promise.all([
    db.doc(`users/${a}/blockedUsers/${b}`).get(),
    db.doc(`users/${b}/blockedUsers/${a}`).get(),
  ]);
  return x.exists || y.exists;
}

/**
 * A duo invite accepted — from a duo post or a direct invite, whichever side
 * sent it. The invite is a `party_invite` notification flagged `duoInvite`,
 * and accepting sets its status; the recipient's own inbox is the one updated.
 */
export const onDuoInviteAccepted = onDocumentUpdated(
  "users/{userId}/notifications/{notificationId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (after.type !== "party_invite" || after.duoInvite !== true) return;
    if (before.status === "accepted" || after.status !== "accepted") return;

    const accepter = event.params.userId;
    const sender = after.fromUserId as string | undefined;
    if (!sender || sender === accepter) return;

    await recordDuoPlay(admin.firestore(), {
      userA: accepter,
      userB: sender,
      source: "invite",
      game: after.game as string | undefined,
      promptAfter: Date.now() + INVITE_PROMPT_DELAY_MS,
    });
  },
);

/**
 * The duo session is the pair's own "we're playing" marker. Ending it brings
 * the prompt forward to now (with the MIN_PLAY_MS floor); extending it pushes
 * the prompt to the new expiry.
 */
export const onDuoSessionWritten = onDocumentWritten(
  "duoSessions/{sessionId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const participants = ((after ?? before)?.participants ?? []) as string[];
    if (participants.length !== 2) return;
    const [a, b] = participants;
    const db = admin.firestore();

    if (before && !after) {
      await reschedulePrompt(db, a, b, Date.now());
      return;
    }
    const prevExpiry = (before?.expiresAt as admin.firestore.Timestamp | undefined)?.toMillis();
    const nextExpiry = (after?.expiresAt as admin.firestore.Timestamp | undefined)?.toMillis();
    if (before && after && nextExpiry && prevExpiry && nextExpiry > prevExpiry) {
      await reschedulePrompt(db, a, b, nextExpiry);
    }
  },
);

/**
 * Sends each due prompt: one `honour_prompt` notification per player, about
 * their partner. Skipped for a blocked pair, and per direction once the
 * player has already honoured that partner (one honour per pair, ever).
 */
export const sendHonourPromptsScheduled = onSchedule(
  {schedule: "every 5 minutes", timeZone: "America/Los_Angeles"},
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const due = await db
      .collection("duoPlays")
      .where("prompted", "==", false)
      .where("promptAfter", "<=", now)
      .limit(200)
      .get();
    if (due.empty) return;

    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + PROMPT_WINDOW_MS);

    for (const play of due.docs) {
      const data = play.data();
      const [a, b] = data.participants as string[];
      try {
        // Claim it first, so an overlapping run can't prompt twice.
        const claimed = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(play.ref);
          if (fresh.get("prompted") === true) return false;
          tx.update(play.ref, {prompted: true, promptedAt: now});
          return true;
        });
        if (!claimed) continue;
        if (await isBlockedPair(db, a, b)) continue;

        for (const [me, partner] of [[a, b], [b, a]]) {
          const already = await db.doc(`userHonour/${partner}/endorsements/${me}`).get();
          if (already.exists) continue;
          const p = data.profiles?.[partner] ?? {};
          await db.collection(`users/${me}/notifications`).add({
            type: "honour_prompt",
            playId: play.id,
            fromUserId: partner,
            fromUsername: p.username || "your duo",
            fromAvatar: p.avatar || "",
            fromUserAvatar: p.avatar || "",
            game: data.game || "",
            status: "pending",
            expiresAt,
            read: false,
            createdAt: now,
          });
        }
      } catch (err) {
        logger.error(`Honour prompt failed for ${play.id}`, err);
      }
    }
  },
);
