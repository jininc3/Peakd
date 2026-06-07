/**
 * Cloud Functions for email verification during signup.
 *
 * sendEmailVerificationCode: Generates a 6-digit code, stores it in Firestore,
 *   and sends it to the user's email via Resend.
 *
 * verifyEmailCode: Checks the code the user entered against Firestore.
 *
 * Setup: Set Firebase secret for Resend API key:
 *   firebase functions:secrets:set RESEND_API_KEY
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";
import {Resend} from "resend";

const resendApiKey = defineSecret("RESEND_API_KEY");

const CODE_EXPIRY_MINUTES = 10;
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

export const sendEmailVerificationCodeFunction = onCall(
  {invoker: "public", secrets: [resendApiKey]},
  async (request) => {
    const {email, skipRegisteredCheck} = request.data as {
      email: string;
      skipRegisteredCheck?: boolean;
    };

    if (!email || typeof email !== "string") {
      throw new HttpsError("invalid-argument", "Email is required.");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new HttpsError("invalid-argument", "Invalid email address.");
    }

    const normalizedEmail = email.toLowerCase().trim();
    const db = admin.firestore();

    // Check if email is already registered (skip for existing users adding email)
    if (!skipRegisteredCheck) {
      const usersQuery = await db
        .collection("users")
        .where("email", "==", normalizedEmail)
        .limit(1)
        .get();

      if (!usersQuery.empty) {
        throw new HttpsError(
          "already-exists",
          "This email is already registered."
        );
      }
    }

    // Generate code and store in Firestore
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    await db.collection("emailVerificationCodes").doc(normalizedEmail).set({
      code,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      attempts: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send email via Resend
    const resend = new Resend(resendApiKey.value());

    const {data, error} = await resend.emails.send({
      from: "Peakd <noreply@peakd.gg>",
      to: normalizedEmail,
      subject: "Your Peakd verification code",
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #fff; background: #0f0f0f; padding: 24px; border-radius: 12px; text-align: center;">
            Your verification code
          </h2>
          <p style="font-size: 36px; font-weight: 800; letter-spacing: 8px; text-align: center; margin: 24px 0;">
            ${code}
          </p>
          <p style="color: #666; font-size: 14px; text-align: center;">
            This code expires in ${CODE_EXPIRY_MINUTES} minutes.
          </p>
        </div>
      `,
    });

    if (error) {
      logger.error(`Resend error for ${normalizedEmail}: ${JSON.stringify(error)}`);
      throw new HttpsError("internal", `Failed to send verification email: ${error.message}`);
    }

    logger.info(`Verification code sent to ${normalizedEmail}, id: ${data?.id}`);
    return {success: true};
  }
);

export const verifyEmailCodeFunction = onCall(
  {invoker: "public"},
  async (request) => {
    const {email, code} = request.data as {email: string; code: string};

    if (!email || !code) {
      throw new HttpsError(
        "invalid-argument",
        "Email and code are required."
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const db = admin.firestore();
    const docRef = db.collection("emailVerificationCodes").doc(normalizedEmail);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new HttpsError(
        "not-found",
        "No verification code found. Please request a new one."
      );
    }

    const data = docSnap.data()!;

    // Check expiry
    const expiresAt = data.expiresAt.toDate();
    if (new Date() > expiresAt) {
      await docRef.delete();
      throw new HttpsError(
        "deadline-exceeded",
        "Verification code has expired. Please request a new one."
      );
    }

    // Check max attempts
    if (data.attempts >= 5) {
      await docRef.delete();
      throw new HttpsError(
        "resource-exhausted",
        "Too many attempts. Please request a new code."
      );
    }

    // Verify code
    if (data.code !== code) {
      await docRef.update({
        attempts: admin.firestore.FieldValue.increment(1),
      });
      throw new HttpsError(
        "permission-denied",
        "Incorrect verification code."
      );
    }

    // Code is correct — delete it and return success
    await docRef.delete();
    logger.info(`Email verified: ${normalizedEmail}`);
    return {success: true, verified: true};
  }
);
