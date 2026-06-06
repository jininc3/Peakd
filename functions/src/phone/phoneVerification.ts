/**
 * Cloud Functions for phone verification via Twilio Verify.
 *
 * sendPhoneVerificationCode: Sends an SMS verification code via Twilio.
 * verifyPhoneCode: Verifies the code the user entered.
 *
 * Setup: Set Firebase secrets:
 *   firebase functions:secrets:set TWILIO_ACCOUNT_SID
 *   firebase functions:secrets:set TWILIO_AUTH_TOKEN
 *   firebase functions:secrets:set TWILIO_VERIFY_SERVICE_SID
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {logger} from "firebase-functions/v2";
import * as admin from "firebase-admin";

const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");
const twilioVerifyServiceSid = defineSecret("TWILIO_VERIFY_SERVICE_SID");

export const sendPhoneVerificationCodeFunction = onCall(
  {invoker: "public", secrets: [twilioAccountSid, twilioAuthToken, twilioVerifyServiceSid]},
  async (request) => {
    const {phoneNumber} = request.data as {phoneNumber: string};

    if (!phoneNumber || typeof phoneNumber !== "string") {
      throw new HttpsError("invalid-argument", "Phone number is required.");
    }

    // Basic phone number validation
    const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, "");
    if (!/^\+[0-9]{7,15}$/.test(cleaned)) {
      throw new HttpsError("invalid-argument", "Invalid phone number format. Must include country code (e.g. +1...).");
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require("twilio");
      const client = twilio(twilioAccountSid.value(), twilioAuthToken.value());

      await client.verify.v2
        .services(twilioVerifyServiceSid.value())
        .verifications.create({
          to: cleaned,
          channel: "sms",
        });

      logger.info(`Phone verification sent to ${cleaned}`);
      return {success: true};
    } catch (error: any) {
      logger.error(`Twilio error for ${cleaned}:`, error?.message || error);
      if (error?.code === 60200) {
        throw new HttpsError("invalid-argument", "Invalid phone number.");
      }
      throw new HttpsError("internal", "Failed to send verification code.");
    }
  }
);

export const verifyPhoneCodeFunction = onCall(
  {invoker: "public", secrets: [twilioAccountSid, twilioAuthToken, twilioVerifyServiceSid]},
  async (request) => {
    const {phoneNumber, code} = request.data as {phoneNumber: string; code: string};

    if (!phoneNumber || !code) {
      throw new HttpsError("invalid-argument", "Phone number and code are required.");
    }

    const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, "");

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require("twilio");
      const client = twilio(twilioAccountSid.value(), twilioAuthToken.value());

      const check = await client.verify.v2
        .services(twilioVerifyServiceSid.value())
        .verificationChecks.create({
          to: cleaned,
          code,
        });

      if (check.status !== "approved") {
        throw new HttpsError("permission-denied", "Incorrect verification code.");
      }

      logger.info(`Phone verified: ${cleaned}`);

      // Check if an account exists with this phone number
      const db = admin.firestore();
      let snapshot = await db.collection("users")
        .where("phoneNumber", "==", cleaned)
        .limit(1)
        .get();

      // Fallback: look up by generated internal email
      if (snapshot.empty) {
        const sanitized = cleaned.replace(/[^0-9]/g, "");
        const generatedEmail = `phone_${sanitized}@peakd-phone.internal`;
        snapshot = await db.collection("users")
          .where("email", "==", generatedEmail)
          .limit(1)
          .get();
      }

      if (snapshot.empty) {
        // No account — phone is verified but user needs to sign up
        return {success: true, verified: true, accountExists: false};
      }

      // Account exists — generate a custom token for sign-in
      const userId = snapshot.docs[0].id;
      const customToken = await admin.auth().createCustomToken(userId);

      logger.info(`Generated custom token for phone user ${userId}`);
      return {success: true, verified: true, accountExists: true, customToken};
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error(`Twilio verify error for ${cleaned}:`, error?.message || error);
      if (error?.code === 60200 || error?.status === 404) {
        throw new HttpsError("not-found", "Verification expired. Please request a new code.");
      }
      throw new HttpsError("internal", "Failed to verify code.");
    }
  }
);
