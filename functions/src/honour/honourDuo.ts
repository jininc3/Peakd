/**
 * Honour a duo partner. The only way an endorsement is written: counts live
 * on userHonour/{userId}, which clients can read but never write, so a player
 * can't raise their own.
 */

import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as functionsV1 from "firebase-functions/v1";
import {logger} from "firebase-functions/v2";
import {PROMPT_WINDOW_MS, isHonourTag, topTag} from "./config";
import {isBlockedPair} from "./triggers";

export const honourDuoFunction = onCall(
  {invoker: "public"},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to honour a duo.");
    const me = request.auth.uid;
    const {playId, tag} = (request.data ?? {}) as {playId?: string; tag?: string};
    if (!playId || typeof playId !== "string") {
      throw new HttpsError("invalid-argument", "Missing duo.");
    }
    if (!isHonourTag(tag)) throw new HttpsError("invalid-argument", "Unknown tag.");

    const db = admin.firestore();
    const play = await db.collection("duoPlays").doc(playId).get();
    if (!play.exists) throw new HttpsError("not-found", "That duo couldn't be found.");

    const participants = play.get("participants") as string[];
    if (!participants.includes(me)) {
      throw new HttpsError("permission-denied", "You can only honour someone you duo'd with.");
    }
    const partner = participants.find((p) => p !== me);
    if (!partner) throw new HttpsError("failed-precondition", "No partner on this duo.");

    // Only once the prompt has gone out, and only inside its window.
    const promptedAt = (play.get("promptedAt") as admin.firestore.Timestamp | undefined)?.toMillis();
    if (!promptedAt) throw new HttpsError("failed-precondition", "It's too soon to honour this duo.");
    if (Date.now() > promptedAt + PROMPT_WINDOW_MS) {
      throw new HttpsError("deadline-exceeded", "The time to honour this duo has passed.");
    }
    if (await isBlockedPair(db, me, partner)) {
      throw new HttpsError("permission-denied", "You can't honour this player.");
    }

    const honourRef = db.collection("userHonour").doc(partner);
    const endorsementRef = honourRef.collection("endorsements").doc(me);

    await db.runTransaction(async (tx) => {
      const [existing, honour] = await Promise.all([tx.get(endorsementRef), tx.get(honourRef)]);
      if (existing.exists) {
        throw new HttpsError("already-exists", "You've already honoured this player.");
      }
      const counts = {...((honour.get("counts") as Record<string, number> | undefined) ?? {})};
      counts[tag] = (counts[tag] ?? 0) + 1;
      tx.set(endorsementRef, {
        fromUserId: me,
        tag,
        playId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(honourRef, {
        counts,
        topTag: topTag(counts),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Retire the prompt everywhere it was shown to this player.
    const prompts = await db
      .collection(`users/${me}/notifications`)
      .where("playId", "==", playId)
      .get();
    await Promise.all(prompts.docs.map((d) => d.ref.update({status: "honoured", read: true})));

    // Anonymous on purpose: naming the giver would pressure people to
    // honour back.
    await db.collection(`users/${partner}/notifications`).add({
      type: "honour_received",
      tag,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {ok: true};
  },
);

/**
 * Removes a deleted account from the honour system: its own counts, the
 * honours it gave (taken back off the receivers' counts), and its duo records.
 *
 * On the Auth deletion rather than inside deleteAccount, because the mobile
 * app deletes accounts from the client and never calls that function.
 */
export const onAuthUserDeletedHonour = functionsV1.auth.user().onDelete(async (user) => {
  const uid = user.uid;
  const db = admin.firestore();
  try {
    // Honours this player gave.
    const given = await db.collectionGroup("endorsements").where("fromUserId", "==", uid).get();
    for (const e of given.docs) {
      const honourRef = e.ref.parent.parent;
      if (!honourRef) continue;
      const tag = e.get("tag") as string;
      await db.runTransaction(async (tx) => {
        const honour = await tx.get(honourRef);
        const counts = {...((honour.get("counts") as Record<string, number> | undefined) ?? {})};
        if (counts[tag]) counts[tag] -= 1;
        tx.delete(e.ref);
        if (honour.exists) {
          tx.set(honourRef, {
            counts,
            topTag: topTag(counts),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });
    }

    // Honours this player received.
    const ownRef = db.collection("userHonour").doc(uid);
    await db.recursiveDelete(ownRef);

    // Duo records they were part of.
    const plays = await db.collection("duoPlays").where("participants", "array-contains", uid).get();
    await Promise.all(plays.docs.map((d) => d.ref.delete()));
  } catch (err) {
    logger.error(`Honour purge failed for ${uid}`, err);
  }
});
