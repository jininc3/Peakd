/**
 * Marks a new email-signup account's email as verified.
 *
 * Email signup checks the address with a 6-digit code at its first step
 * (sendEmailVerificationCode → verifyEmailCode, which records the
 * verification). The account itself is only created at the last step, in the
 * browser, and a browser can't set emailVerified — so the rules step calls
 * this straight after creating it, and the account skips the link email and
 * the /verify-email wait.
 *
 * Only the signed-in owner can call it, only for the email on their own auth
 * account, and only if that exact address was verified with a code — the
 * record is consumed, so one code verifies one account. Anything else
 * returns verified: false and the client falls back to the link email.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";
import {consumeVerified} from "../auth/verifiedIdentity";

/**
 * Time from the code step to finishing signup. Birthday, username, avatar,
 * password and rules can reasonably take longer than the 15 minutes a
 * sign-in gets.
 */
const SIGNUP_WINDOW_MS = 2 * 60 * 60 * 1000;

export const markSignupEmailVerifiedFunction = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  const uid = request.auth.uid;
  const user = await admin.auth().getUser(uid);
  if (!user.email) return {verified: false};
  if (user.emailVerified) return {verified: true};

  const ok = await consumeVerified("email", user.email, SIGNUP_WINDOW_MS);
  if (!ok) {
    logger.info(`Signup email not pre-verified for ${uid}; falling back to link`);
    return {verified: false};
  }
  await admin.auth().updateUser(uid, {emailVerified: true});
  logger.info(`Signup email marked verified for ${uid}`);
  return {verified: true};
});
