/**
 * Discord OAuth2 plumbing shared by discordLogin (sign in with Discord) and
 * linkDiscord (connect Discord to an existing Peakd account).
 */
import { HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";

export const discordClientId = defineString("DISCORD_CLIENT_ID");
export const discordClientSecret = defineSecret("DISCORD_CLIENT_SECRET");

// Token-exchange redirect_uri must exactly match the one used in the
// authorize step, and only these are legitimate callers. Login and linking
// share one callback page, so they share this list.
export const ALLOWED_REDIRECT_URIS = [
  "http://localhost:3000/auth/discord/callback",
  "https://peakd.gg/auth/discord/callback",
  "https://www.peakd.gg/auth/discord/callback",
];

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  email: string | null;
  verified: boolean;
  avatar: string | null;
}

/** Trade a one-time OAuth code for the Discord user it was issued to. */
export async function fetchDiscordUser(code: unknown, redirectUri: unknown): Promise<DiscordUser> {
  if (!code || typeof code !== "string") {
    throw new HttpsError("invalid-argument", "Missing OAuth code.");
  }
  if (typeof redirectUri !== "string" || !ALLOWED_REDIRECT_URIS.includes(redirectUri)) {
    throw new HttpsError("invalid-argument", "Unrecognized redirect URI.");
  }

  // Code → access token. Server-side: the only place the secret is used.
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
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    throw new HttpsError("internal", "Failed to fetch Discord profile.");
  }
  return (await userRes.json()) as DiscordUser;
}
