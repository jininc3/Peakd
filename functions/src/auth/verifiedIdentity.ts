/**
 * Proof that a caller has just verified an email or phone code, for the
 * functions that sign someone in or change their password by email or phone
 * alone.
 *
 * Those functions are unauthenticated by nature (the caller is signing in),
 * and emails and phone numbers are readable from public profiles — so taking
 * one as input and returning a sign-in token, or setting a password, handed
 * the account to anyone who typed it. Now the code check itself records the
 * verification here, server-side, and the token/reset functions require and
 * consume it.
 *
 * The collection has no client rules, so the default deny keeps it
 * server-only.
 */
import * as admin from "firebase-admin";

/** How long after a code is verified the follow-up call may use it. */
const WINDOW_MS = 15 * 60 * 1000;

export type IdentityKind = "email" | "phone";

/** The same key however the number or address was typed. */
export function identityKey(kind: IdentityKind, value: string): string {
  const normalized =
    kind === "email" ? value.trim().toLowerCase() : value.replace(/[\s\-()]/g, "");
  return `${kind}_${normalized}`;
}

/** Record that `value` was just verified with a code. */
export async function markVerified(kind: IdentityKind, value: string): Promise<void> {
  await admin
    .firestore()
    .collection("identityVerifications")
    .doc(identityKey(kind, value))
    .set({verifiedAt: admin.firestore.FieldValue.serverTimestamp()});
}

/**
 * True, once, if `value` was verified within the window. Single-use: the
 * record is deleted as it's read, so a verification signs in one session.
 *
 * `windowMs` defaults to the sign-in window; email signup passes a longer one,
 * since its code is checked at the first step and consumed at the last.
 */
export async function consumeVerified(
  kind: IdentityKind,
  value: string,
  windowMs: number = WINDOW_MS
): Promise<boolean> {
  const db = admin.firestore();
  const ref = db.collection("identityVerifications").doc(identityKey(kind, value));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    tx.delete(ref);
    const at = (snap.get("verifiedAt") as admin.firestore.Timestamp | undefined)?.toMillis();
    return !!at && Date.now() - at <= windowMs;
  });
}
