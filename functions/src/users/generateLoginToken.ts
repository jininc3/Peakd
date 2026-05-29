import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";

/**
 * Passwordless login helper.
 * Called after the user has verified their identity via OTP (phone).
 * Creates a custom token so the client can sign in without overwriting
 * the user's stored password.
 */
export const generateLoginTokenFunction = onCall(
  {invoker: "public"},
  async (request) => {
    const {phoneNumber} = request.data;

    if (!phoneNumber) {
      throw new HttpsError(
        "invalid-argument",
        "Phone number is required."
      );
    }

    const db = admin.firestore();

    let snapshot = await db.collection("users")
      .where("phoneNumber", "==", phoneNumber)
      .limit(1)
      .get();

    // Fallback: look up by the generated internal email
    if (snapshot.empty) {
      const sanitized = phoneNumber.replace(/[^0-9]/g, "");
      const generatedEmail = `phone_${sanitized}@peakd-phone.internal`;
      snapshot = await db.collection("users")
        .where("email", "==", generatedEmail)
        .limit(1)
        .get();
    }

    if (snapshot.empty) {
      throw new HttpsError("not-found", "No account found with this phone number.");
    }

    const userId = snapshot.docs[0].id;

    try {
      const customToken = await admin.auth().createCustomToken(userId);

      logger.info(`Generated custom token for user ${userId}`);
      return {customToken};
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error("Error generating login token:", error);
      throw new HttpsError("internal", "Failed to generate login credentials.");
    }
  }
);
