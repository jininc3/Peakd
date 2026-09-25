/**
 * Discord OAuth2 → Firebase custom token exchange.
 *
 * Called (unauthenticated) by /auth/discord/callback with the one-time `code`
 * Discord appended to the redirect. Flow:
 *
 *   1. Exchange the code for an access token (server-side — this is the only
 *      place the client secret is used).
 *   2. Fetch the Discord user (id, email, verified, avatar).
 *   3. Resolve a Firebase uid:
 *      a. discordAccounts/{discordId} mapping exists → returning Discord user.
 *      b. Verified email matches an existing Firebase user → auto-link: reuse
 *         that uid and record the mapping.
 *      c. Otherwise mint a fresh user with uid `discord:{discordId}`.
 *   4. Return a custom token; the client signs in with signInWithCustomToken.
 *
 * The discordAccounts collection is the source of truth for the Discord→uid
 * link. It is only ever touched by this function (Admin SDK bypasses rules);
 * client Firestore rules should not grant access to it.
 */
import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { db } from "../badges/db";
import { discordClientSecret, fetchDiscordUser } from "./oauth";

export const discordLogin = onCall(
  { secrets: [discordClientSecret], cors: true },
  async (request) => {
    const { code, redirectUri } = (request.data ?? {}) as {
      code?: string;
      redirectUri?: string;
    };

    // 1–2. Code → the Discord user it belongs to.
    const discordUser = await fetchDiscordUser(code, redirectUri);

    // Empty when the account has no custom picture. Discord's own generic
    // defaults aren't worth importing — the signup wizard falls back to a
    // Peakd avatar, which suits the product better than a grey Discord blob.
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
      : "";
    const suggestedUsername = discordUser.global_name || discordUser.username;
    const email =
      discordUser.email && discordUser.verified ? discordUser.email : null;

    // 3a. Returning Discord user?
    const mappingRef = db.doc(`discordAccounts/${discordUser.id}`);
    const mapping = await mappingRef.get();
    // The mapping can outlive the account it points at (deleted before
    // deleteAccount cleared mappings). Minting a token for that uid makes
    // Firebase re-create it as a bare auth user with no email, so a stale
    // mapping is dropped and the login carries on as a new/auto-linked one.
    let mappedUser: admin.auth.UserRecord | null = null;
    if (mapping.exists) {
      mappedUser = await admin.auth().getUser(mapping.data()!.uid as string).catch((err) => {
        if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
        return null;
      });
      if (!mappedUser) await mappingRef.delete();
    }
    if (mapping.exists && mappedUser) {
      const uid = mappedUser.uid;
      await backfillEmail(mappedUser, email);
      const token = await admin.auth().createCustomToken(uid);
      // The profile may be missing OR a placeholder: building a rank card
      // before finishing signup creates users/{uid} with signupComplete:false.
      // Existence alone would call that a returning user and drop them into
      // the app with a half-made account, so the flag is what decides.
      const profileSnap = await db.doc(`users/${uid}`).get();
      const signupFinished =
        profileSnap.exists && profileSnap.data()?.signupComplete !== false;
      // Show their Discord on their profile if it isn't already. Accounts made
      // before the Connected section read Discord from here never got it.
      // discordHidden: they disconnected it from their profile — respect that.
      if (signupFinished && !profileSnap.get("discordLink") && !profileSnap.get("discordHidden")) {
        await profileSnap.ref
          .update({ discordLink: discordUser.username, discordId: discordUser.id })
          .catch(() => {});
      }
      return {
        token,
        isNewUser: !signupFinished,
        email: email ?? "",
        suggestedUsername,
        avatarUrl,
      };
    }

    // 3b. Auto-link by verified email.
    if (email) {
      try {
        const existing = await admin.auth().getUserByEmail(email);
        await mappingRef.set({
          uid: existing.uid,
          discordId: discordUser.id,
          discordUsername: discordUser.username,
          linkedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Now linked, so their Discord belongs on their profile too.
        const existingProfile = await db.doc(`users/${existing.uid}`).get();
        if (existingProfile.exists && !existingProfile.get("discordLink") && !existingProfile.get("discordHidden")) {
          await existingProfile.ref
            .update({ discordLink: discordUser.username, discordId: discordUser.id })
            .catch(() => {});
        }
        const token = await admin.auth().createCustomToken(existing.uid);
        return {
          token,
          isNewUser: false,
          email,
          suggestedUsername,
          avatarUrl,
        };
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== "auth/user-not-found") throw err;
      }
    }

    // 3c. Brand-new user.
    const uid = `discord:${discordUser.id}`;
    try {
      await admin.auth().createUser({
        uid,
        ...(email ? { email, emailVerified: true } : {}),
        displayName: suggestedUsername,
        ...(avatarUrl ? { photoURL: avatarUrl } : {}),
      });
    } catch (err) {
      // uid already exists → fine (e.g. mapping doc write failed last time).
      if ((err as { code?: string }).code !== "auth/uid-already-exists") {
        throw err;
      }
    }
    await mappingRef.set({
      uid,
      discordId: discordUser.id,
      discordUsername: discordUser.username,
      linkedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const token = await admin.auth().createCustomToken(uid);
    return {
      token,
      isNewUser: true,
      email: email ?? "",
      suggestedUsername,
      avatarUrl,
    };
  }
);

/** Addresses we mint so a password can exist without a real inbox. */
const INTERNAL_EMAIL = /@peakd-(discord|phone)\.internal$/;

/**
 * Give a returning Discord user the verified Discord email if their account
 * has no real one — only a minted internal address, or nothing. Without it,
 * password reset has nowhere to send a code. Skipped when another account
 * already owns the address; never overwrites a real email the user has.
 * Best-effort: a failure here must not fail the login.
 */
async function backfillEmail(user: admin.auth.UserRecord, email: string | null): Promise<void> {
  if (!email) return;
  if (user.email && !INTERNAL_EMAIL.test(user.email)) return;
  try {
    const taken = await admin.auth().getUserByEmail(email).then(() => true, (err) => {
      if ((err as { code?: string }).code === "auth/user-not-found") return false;
      throw err;
    });
    if (taken) return;
    await admin.auth().updateUser(user.uid, {email, emailVerified: true});
    const profile = admin.firestore().doc(`users/${user.uid}`);
    const snap = await profile.get();
    if (snap.exists && !snap.get("email")) await profile.update({email});
  } catch (err) {
    logger.warn(`Discord email backfill failed for ${user.uid}:`, err);
  }
}
