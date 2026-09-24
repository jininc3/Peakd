/**
 * Records that two players duo'd, which is what later lets each of them
 * honour the other. Written only by the server, from events both players
 * took part in: a live-queue match both accepted, or a duo invite accepted.
 */

import * as admin from "firebase-admin";
import {MIN_PLAY_MS, dayKey, pairKey} from "./config";

export type DuoSource = "queue" | "invite";

interface RecordInput {
  userA: string;
  userB: string;
  source: DuoSource;
  game?: string;
  /** When the honour prompt should go out. */
  promptAfter: number;
}

/**
 * One doc per pair per UTC day. A second duo the same day folds into the
 * first rather than prompting twice; its promptAfter only ever moves later,
 * so the prompt waits for the last of the day's sessions.
 */
export async function recordDuoPlay(
  db: admin.firestore.Firestore,
  input: RecordInput,
): Promise<void> {
  const {userA, userB, source, game, promptAfter} = input;
  if (!userA || !userB || userA === userB) return;

  const now = Date.now();
  const key = pairKey(userA, userB);
  const ref = db.collection("duoPlays").doc(`${key}_${dayKey(now)}`);

  // Names and avatars ride on the play so the prompt can say who it's about
  // without a read per participant when it is sent.
  const [aSnap, bSnap] = await Promise.all([
    db.collection("users").doc(userA).get(),
    db.collection("users").doc(userB).get(),
  ]);
  if (!aSnap.exists || !bSnap.exists) return;
  const profile = (s: admin.firestore.DocumentSnapshot) => ({
    username: (s.get("username") as string) || "Player",
    avatar: (s.get("avatar") as string) || "",
  });

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      // Already prompted today: the pair has had their ask for the day.
      if (snap.get("prompted") === true) return;
      const current = (snap.get("promptAfter") as admin.firestore.Timestamp).toMillis();
      if (promptAfter > current) {
        tx.update(ref, {promptAfter: admin.firestore.Timestamp.fromMillis(promptAfter)});
      }
      return;
    }
    tx.set(ref, {
      pairKey: key,
      participants: [userA, userB],
      profiles: {[userA]: profile(aSnap), [userB]: profile(bSnap)},
      source,
      game: game || "",
      startedAt: admin.firestore.Timestamp.fromMillis(now),
      promptAfter: admin.firestore.Timestamp.fromMillis(promptAfter),
      prompted: false,
    });
  });
}

/**
 * Moves the pair's pending prompt to `at` (but never sooner than MIN_PLAY_MS
 * after they started) — used when their duo session ends early or is
 * extended. No-op when nothing is pending.
 */
export async function reschedulePrompt(
  db: admin.firestore.Firestore,
  userA: string,
  userB: string,
  at: number,
): Promise<void> {
  const pending = await db
    .collection("duoPlays")
    .where("pairKey", "==", pairKey(userA, userB))
    .where("prompted", "==", false)
    .get();
  await Promise.all(
    pending.docs.map((d) => {
      const startedAt = (d.get("startedAt") as admin.firestore.Timestamp).toMillis();
      // A session ended after five minutes still waits out MIN_PLAY_MS:
      // they may have ended it to go and play.
      const when = Math.max(at, startedAt + MIN_PLAY_MS);
      return d.ref.update({promptAfter: admin.firestore.Timestamp.fromMillis(when)});
    }),
  );
}
