import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";
import {consumeVerified} from "../auth/verifiedIdentity";

/**
 * Cloud Function: Reset password for phone-based accounts.
 *
 * Called after OTP verification succeeds on the client.
 * Looks up the user by phone number, sets a temporary password,
 * and returns the generated email so the client can sign in
 * via the web SDK and then update to the user's chosen password.
 */
export const resetPhonePasswordFunction = onCall(
  {invoker: "public"},
  async (request) => {
    const {phoneNumber, newPassword} = request.data;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Phone number is required."
      );
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      throw new HttpsError(
        "invalid-argument",
        "New password must be at least 6 characters."
      );
    }

    // Only after this number's code was verified (verifyPhoneCode). Without
    // this, anyone could set a phone user's password from the number alone.
    if (!(await consumeVerified("phone", phoneNumber))) {
      throw new HttpsError("permission-denied", "Verify the code sent to your phone first.");
    }

    try {
      logger.info(`resetPhonePassword called with phoneNumber: "${phoneNumber}"`);

      // Find user by phone number in Firestore
      let usersSnapshot = await admin.firestore()
        .collection("users")
        .where("phoneNumber", "==", phoneNumber)
        .limit(1)
        .get();

      // Fallback: look up by the generated internal email
      if (usersSnapshot.empty) {
        const sanitized = phoneNumber.replace(/[^0-9]/g, "");
        const generatedEmail = `phone_${sanitized}@peakd-phone.internal`;
        usersSnapshot = await admin.firestore()
          .collection("users")
          .where("email", "==", generatedEmail)
          .limit(1)
          .get();
      }

      if (usersSnapshot.empty) {
        throw new HttpsError(
          "not-found",
          "No account found with this phone number."
        );
      }

      const userId = usersSnapshot.docs[0].id;

      // Get the auth email from Firebase Auth (Firestore email may be empty for phone users)
      const authUser = await admin.auth().getUser(userId);
      const email = authUser.email;

      if (!email) {
        throw new HttpsError(
          "failed-precondition",
          "Account has no email associated."
        );
      }

      // Update the password via Admin SDK (no old password needed)
      await admin.auth().updateUser(userId, {
        password: newPassword,
      });

      logger.info(`Password reset for phone user ${userId}`);

      return {success: true, email};
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error("Error resetting phone password:", error);
      throw new HttpsError(
        "internal",
        "Failed to reset password. Please try again."
      );
    }
  }
);
