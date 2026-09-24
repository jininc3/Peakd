/**
 * Cloud Functions for email login (passwordless via Firebase email link).
 *
 * checkEmailAccountExists: Verifies an account exists before sending
 *   the sign-in link from the client.
 *
 * generateEmailLoginToken: After the client verifies via Firebase email
 *   link sign-in, generates temp credentials so the client can bridge
 *   from the native SDK to the web SDK.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";
import {consumeVerified} from "../auth/verifiedIdentity";

export const checkEmailAccountExistsFunction = onCall(
  {invoker: "public"},
  async (request) => {
    const {email} = request.data as {email: string};

    if (!email || typeof email !== "string") {
      throw new HttpsError("invalid-argument", "Email is required.");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new HttpsError("invalid-argument", "Invalid email address.");
    }

    const normalizedEmail = email.toLowerCase().trim();
    const db = admin.firestore();

    const usersQuery = await db
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (usersQuery.empty) {
      throw new HttpsError(
        "not-found",
        "No account found with this email."
      );
    }

    return {exists: true};
  }
);

export const generateEmailLoginTokenFunction = onCall(
  {invoker: "public"},
  async (request) => {
    const {email} = request.data as {email: string};

    if (!email || typeof email !== "string") {
      throw new HttpsError("invalid-argument", "Email is required.");
    }

    const normalizedEmail = email.toLowerCase().trim();
    const db = admin.firestore();

    // Only after this email's code was verified (verifyEmailCode). Without
    // this, any address — readable from public profiles — got a sign-in
    // token for its account.
    if (!(await consumeVerified("email", normalizedEmail))) {
      throw new HttpsError("permission-denied", "Verify the code sent to your email first.");
    }

    const usersQuery = await db
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (usersQuery.empty) {
      throw new HttpsError("not-found", "No account found.");
    }

    const userId = usersQuery.docs[0].id;

    try {
      const customToken = await admin.auth().createCustomToken(userId);
      logger.info(`Email login token generated for ${normalizedEmail}`);
      return {customToken};
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error("Error generating email login token:", error);
      throw new HttpsError(
        "internal",
        "Failed to generate login credentials."
      );
    }
  }
);
