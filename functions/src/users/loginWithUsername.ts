/**
 * Universal username + password login.
 *
 * Looks up the user by username (or email), verifies the password
 * against Firebase Auth, and returns a custom token. Works for ALL
 * sign-up methods (email, phone, Google, Apple) as long as the user
 * has set a password.
 *
 * For accounts that never set a password (e.g. Google-only), the
 * function sets the provided password first, then signs them in.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";

export const loginWithUsernameFunction = onCall(
  {invoker: "public"},
  async (request) => {
    const {username, password} = request.data as {
      username: string;
      password: string;
    };

    if (!username || !password) {
      throw new HttpsError(
        "invalid-argument",
        "Username and password are required."
      );
    }

    const db = admin.firestore();
    const normalizedInput = username.trim().toLowerCase();

    // Look up user by username or email
    let snapshot;
    if (normalizedInput.includes("@")) {
      snapshot = await db
        .collection("users")
        .where("email", "==", normalizedInput)
        .limit(1)
        .get();
    } else {
      snapshot = await db
        .collection("users")
        .where("usernameLower", "==", normalizedInput)
        .limit(1)
        .get();
    }

    if (snapshot.empty) {
      throw new HttpsError("not-found", "No account found.");
    }

    const userId = snapshot.docs[0].id;

    try {
      const authUser = await admin.auth().getUser(userId);

      if (!authUser.email) {
        throw new HttpsError(
          "failed-precondition",
          "Account has no auth email configured."
        );
      }

      // Check if user has password provider
      const hasPasswordProvider = authUser.providerData.some(
        (p) => p.providerId === "password"
      );

      if (hasPasswordProvider) {
        // Verify password via Firebase Auth REST API
        const apiKey = process.env.WEB_API_KEY;
        if (!apiKey) {
          throw new HttpsError("internal", "Server misconfigured.");
        }

        const resp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
          {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
              email: authUser.email,
              password,
              returnSecureToken: false,
            }),
          }
        );

        if (!resp.ok) {
          const errorData = await resp.json().catch(() => ({}));
          const errorMessage = errorData?.error?.message || "";
          logger.error(`Login failed for ${normalizedInput}: ${errorMessage}, providers: ${authUser.providerData.map((p) => p.providerId).join(",")}`);
          throw new HttpsError(
            "permission-denied",
            "Incorrect password."
          );
        }
      } else {
        // No password set (Google/Apple/phone signup) — set it now
        await admin.auth().updateUser(userId, {password});
        logger.info(`Password set for ${normalizedInput} (first username login)`);
      }

      // Password verified — generate custom token
      const customToken = await admin.auth().createCustomToken(userId);
      logger.info(`Username login for ${normalizedInput}`);
      return {customToken};
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error("Error in loginWithUsername:", error);
      throw new HttpsError("internal", "Failed to sign in.");
    }
  }
);
