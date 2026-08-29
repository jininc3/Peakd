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
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { db } from "../badges/db";

const discordClientId = defineString("DISCORD_CLIENT_ID");
const discordClientSecret = defineSecret("DISCORD_CLIENT_SECRET");

// Token-exchange redirect_uri must exactly match the one used in the
// authorize step, and only these are legitimate callers.
const ALLOWED_REDIRECT_URIS = [
  "http://localhost:3000/auth/discord/callback",
  "https://peakd.gg/auth/discord/callback",
  "https://www.peakd.gg/auth/discord/callback",
];

interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  email: string | null;
  verified: boolean;
  avatar: string | null;
}

export const discordLogin = onCall(
  { secrets: [discordClientSecret], cors: true },
  async (request) => {
    const { code, redirectUri } = (request.data ?? {}) as {
      code?: string;
      redirectUri?: string;
    };
    if (!code || typeof code !== "string") {
      throw new HttpsError("invalid-argument", "Missing OAuth code.");
    }
    if (!redirectUri || !ALLOWED_REDIRECT_URIS.includes(redirectUri)) {
      throw new HttpsError("invalid-argument", "Unrecognized redirect URI.");
    }

    // 1. Code → access token.
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: discordClientId.value(),
        client_secret: discordClientSecret.value(),
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      // Expired/reused codes land here — a normal occurrence on page refresh.
      throw new HttpsError("unauthenticated", "Discord code exchange failed.");
    }
    const { access_token: accessToken } = (await tokenRes.json()) as {
      access_token: string;
    };

    // 2. Who is this?
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) {
      throw new HttpsError("internal", "Failed to fetch Discord profile.");
    }
    const discordUser = (await userRes.json()) as DiscordUser;

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
    if (mapping.exists) {
      const uid = mapping.data()!.uid as string;
      const token = await admin.auth().createCustomToken(uid);
      // The profile may be missing OR a placeholder: building a rank card
      // before finishing signup creates users/{uid} with signupComplete:false.
      // Existence alone would call that a returning user and drop them into
      // the app with a half-made account, so the flag is what decides.
      const profileSnap = await db.doc(`users/${uid}`).get();
      const signupFinished =
        profileSnap.exists && profileSnap.data()?.signupComplete !== false;
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
