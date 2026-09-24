/**
 * Connect a Discord account to the signed-in Peakd account, so the profile's
 * Connected section shows a Discord username the player has proven they own
 * rather than one they typed.
 *
 * Two ways in:
 *   - { code, redirectUri }: the player went through Discord's consent screen
 *     from their profile (the web's /auth/discord/callback, in link mode).
 *   - {}: the account signed in with Discord, so the link already exists in
 *     discordAccounts — copy it onto the profile without a second sign-in.
 *
 * Linking also records discordAccounts/{discordId} → uid, the same mapping
 * discordLogin reads, so the player can sign in with Discord from then on.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "../badges/db";
import { discordClientSecret, fetchDiscordUser } from "./oauth";

export const linkDiscord = onCall(
  { secrets: [discordClientSecret], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to connect Discord.");
    }
    const uid = request.auth.uid;
    const { code, redirectUri } = (request.data ?? {}) as {
      code?: string;
      redirectUri?: string;
    };

    const profileRef = db.doc(`users/${uid}`);
    const profile = await profileRef.get();
    if (!profile.exists) {
      throw new HttpsError("failed-precondition", "Finish creating your account first.");
    }

    let discordId: string;
    let discordUsername: string;

    if (code) {
      const discordUser = await fetchDiscordUser(code, redirectUri);
      discordId = discordUser.id;
      discordUsername = discordUser.username;

      // One Discord account per Peakd account: if it already signs someone
      // else in, taking it over would lock them out.
      const mappingRef = db.doc(`discordAccounts/${discordId}`);
      const mapping = await mappingRef.get();
      if (mapping.exists && mapping.get("uid") !== uid) {
        throw new HttpsError(
          "already-exists",
          "That Discord account is already connected to another Peakd account.",
        );
      }
      await mappingRef.set(
        {
          uid,
          discordId,
          discordUsername,
          linkedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } else {
      const found = await db.collection("discordAccounts").where("uid", "==", uid).limit(1).get();
      if (found.empty) {
        throw new HttpsError("not-found", "No Discord account is linked to this account.");
      }
      discordId = found.docs[0].get("discordId") as string;
      discordUsername = found.docs[0].get("discordUsername") as string;
    }

    // Connecting on purpose also undoes an earlier disconnect (discordHidden),
    // which otherwise stops the name being filled back in.
    await profileRef.update({
      discordLink: discordUsername,
      discordId,
      discordHidden: admin.firestore.FieldValue.delete(),
    });
    return { username: discordUsername };
  },
);
