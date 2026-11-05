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
import { randomUUID } from "node:crypto";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { db } from "../badges/db";
import { discordClientSecret, fetchDiscordUser } from "./oauth";

const DISCORD_AVATAR_PREFIX = "https://cdn.discordapp.com/avatars/";

/** Where a Discord picture is kept once copied: the player's own picture folder. */
const discordCopyPath = (uid: string, hash: string) => `profile-pictures/${uid}/discord-${hash}.png`;

/**
 * Copy a Discord picture into Storage and return the copy's URL.
 *
 * A Discord CDN URL carries a hash that changes each time the picture changes
 * on Discord, and the old URL then 404s — so linking to Discord directly left
 * profiles with dead pictures. The copy lives as long as the account does
 * (deleteAccount clears profile-pictures/{uid}). Named by the hash, so a
 * picture already copied is reused rather than fetched again.
 */
async function copyDiscordAvatar(uid: string, discordId: string, hash: string): Promise<string> {
  const bucket = admin.storage().bucket();
  const path = discordCopyPath(uid, hash);
  const file = bucket.file(path);

  let token: string | undefined;
  const [exists] = await file.exists();
  if (exists) {
    const [meta] = await file.getMetadata();
    token = meta.metadata?.firebaseStorageDownloadTokens as string | undefined;
  }
  if (!token) {
    const res = await fetch(`${DISCORD_AVATAR_PREFIX}${discordId}/${hash}.png?size=256`);
    if (!res.ok) throw new Error(`Discord avatar fetch failed: ${res.status}`);
    token = randomUUID();
    await file.save(Buffer.from(await res.arrayBuffer()), {
      contentType: "image/png",
      metadata: {
        cacheControl: "public, max-age=31536000",
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** A picture that came from Discord: a CDN link, or our copy of one. */
const isFromDiscord = (url: string, uid: string) =>
  url.startsWith(DISCORD_AVATAR_PREFIX) ||
  url.includes(encodeURIComponent(`profile-pictures/${uid}/discord-`));

/**
 * Keep a Discord picture current. On each login, if the profile's picture is
 * still one that came from Discord — a CDN link (from before pictures were
 * copied, and possibly dead by now) or a copy of an older one — and Discord
 * now has a different one (or none), swap in the current copy: on the
 * profile, and on the duo posts and clip posts that copied it when they were
 * made.
 *
 * A failed copy hands us a CDN link instead. That never replaces a copy we
 * already hold, which won't go dead; the next login tries again. It does
 * replace an older CDN link, which may be dead already.
 *
 * A picture the player uploaded themselves is never touched. Best-effort: a
 * failure here must not fail the login, so it is logged and swallowed.
 */
async function refreshDiscordAvatar(
  profile: admin.firestore.DocumentSnapshot,
  avatarUrl: string,
): Promise<void> {
  try {
    const current = profile.get("avatar");
    if (
      !profile.exists ||
      typeof current !== "string" ||
      !isFromDiscord(current, profile.id) ||
      current === avatarUrl ||
      (avatarUrl.startsWith(DISCORD_AVATAR_PREFIX) && !current.startsWith(DISCORD_AVATAR_PREFIX))
    ) {
      return;
    }

    const batch = db.batch();
    batch.update(profile.ref, { avatar: avatarUrl });
    for (const name of ["duoPosts", "posts"]) {
      const copies = await db.collection(name).where("userId", "==", profile.id).get();
      for (const d of copies.docs) {
        if (d.get("avatar") === current) batch.update(d.ref, { avatar: avatarUrl });
      }
    }
    await batch.commit();
  } catch (err) {
    logger.error("discordLogin: avatar refresh failed", { uid: profile.id, err });
  }
}

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
    // The picture to hand out for a given account: our Storage copy of it,
    // or the Discord link itself if copying fails (better than nothing).
    const avatarFor = async (uid: string): Promise<string> => {
      if (!discordUser.avatar) return "";
      try {
        return await copyDiscordAvatar(uid, discordUser.id, discordUser.avatar);
      } catch (err) {
        logger.error("discordLogin: avatar copy failed", { uid, err });
        return avatarUrl;
      }
    };
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
      const avatar = await avatarFor(uid);
      if (signupFinished) await refreshDiscordAvatar(profileSnap, avatar);
      return {
        token,
        isNewUser: !signupFinished,
        email: email ?? "",
        suggestedUsername,
        avatarUrl: avatar,
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
        const avatar = await avatarFor(existing.uid);
        await refreshDiscordAvatar(existingProfile, avatar);
        const token = await admin.auth().createCustomToken(existing.uid);
        return {
          token,
          isNewUser: false,
          email,
          suggestedUsername,
          avatarUrl: avatar,
        };
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== "auth/user-not-found") throw err;
      }
    }

    // 3c. Brand-new user.
    const uid = `discord:${discordUser.id}`;
    const avatar = await avatarFor(uid);
    try {
      await admin.auth().createUser({
        uid,
        ...(email ? { email, emailVerified: true } : {}),
        displayName: suggestedUsername,
        ...(avatar ? { photoURL: avatar } : {}),
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
      avatarUrl: avatar,
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
