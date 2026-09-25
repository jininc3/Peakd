/**
 * Welcome email, sent once when a new account finishes signup.
 *
 * "Finishes" is the web signup's rules step committing the profile with
 * signupComplete: true — the account exists and the user is signed in. A
 * pre-signup placeholder (signupComplete: false, written when a rank card is
 * built before signing up) doesn't count until that same commit flips it.
 *
 * Fires only on the transition to complete, so existing accounts — whose docs
 * are complete already — never get it when they're edited. Firestore triggers
 * are at-least-once, so an emailLog marker created before sending makes a
 * retried event a no-op rather than a second welcome.
 */

import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";
import {resendApiKey, sendEmail} from "./sendEmail";
import {findTemplate} from "./templates";

/** Addresses minted so a password can exist without a real inbox. */
const INTERNAL_EMAIL = /@peakd-(discord|phone)\.internal$/;

export const sendWelcomeEmail = onDocumentWritten(
  {document: "users/{userId}", secrets: [resendApiKey]},
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || after.signupComplete !== true) return;
    if (before?.signupComplete === true) return;

    const userId = event.params.userId;
    const email = typeof after.email === "string" ? after.email.trim().toLowerCase() : "";
    if (!email || INTERNAL_EMAIL.test(email)) {
      logger.info(`Welcome email skipped for ${userId}: no real email address`);
      return;
    }

    const db = admin.firestore();
    const marker = db.doc(`emailLog/welcome_${userId}`);
    try {
      await marker.create({
        template: "welcome",
        to: email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      // ALREADY_EXISTS: a retry of an event that already sent (or is sending).
      if ((err as {code?: number}).code === 6) return;
      throw err;
    }

    try {
      const id = await sendEmail(email, findTemplate("welcome")!.render("dark"));
      await marker.update({sentAt: admin.firestore.FieldValue.serverTimestamp(), resendId: id ?? null});
      logger.info(`Welcome email sent to ${userId}`);
    } catch (err) {
      // Drop the marker so a retry can try again, and rethrow so it retries.
      await marker.delete().catch(() => {});
      logger.error(`Welcome email failed for ${userId}:`, err);
      throw err;
    }
  }
);
