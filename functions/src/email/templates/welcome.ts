/**
 * The welcome email, sent once when a new account finishes signup (see
 * sendWelcomeEmail.ts). Dark is what goes out; light is kept for previewing
 * and testing from the admin panel's Emails tab.
 *
 * Generated from the design files ("Welcome Email.html" / "Welcome Email
 * Light.html") with their placeholders resolved: the lockup served from the
 * site, the rank-card button pointed at the homepage, the preferences link
 * at /profile/settings/notifications, and
 * the Unsubscribe link and sample postal address dropped — there is no
 * unsubscribe endpoint, and a made-up address can't go in a real email.
 */

export const WELCOME_SUBJECT = "Welcome to Peakd";

export const WELCOME_TEXT = [
  "Welcome to Peakd",
  "",
  "Peakd is where League and Valorant players show their rank, find teammates and compete with friends. Here are the four things to try first.",
  "",
  "1. Create your rank card — link your Riot account and your ranks update automatically as you play.",
  "2. Find a duo — browse players by game, rank, role and region, or queue live to get matched.",
  "3. Create a leaderboard — start a private lobby for your friends, team or community.",
  "4. Check out the clips feed — watch the best plays, and upload your own.",
  "",
  "Create your rank card: https://www.peakd.gg",
  "",
  "You're receiving this because you created a Peakd account.",
  "Email preferences: https://www.peakd.gg/profile/settings/notifications",
].join("\n");

export const WELCOME_HTML_DARK = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Welcome to Peakd</title>
<style>
@media (max-width:620px){.wrap{width:100%!important}.px{padding-left:24px!important;padding-right:24px!important}.h1{font-size:34px!important;line-height:38px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:#0c0d10;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0c0d10;">Your account is ready. Link your rank, find a duo, start a leaderboard and share your best clips.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0c0d10" style="background:#0c0d10;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">



<tr><td bgcolor="#171a21" style="background:#171a21;border:1px solid #3a4050;border-top:3px solid #c9a86a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="px" style="padding:32px 40px 0;"><a href="https://www.peakd.gg" style="text-decoration:none;"><img src="https://www.peakd.gg/peakd-lockup-white.png" width="138" height="30" alt="PEAKD" style="display:block;width:138px;height:30px;border:0;outline:none;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;letter-spacing:2px;color:#e9eaee;"></a></td></tr>
<tr><td class="px" style="padding:36px 40px 8px;border-top:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#c9a86a;mso-line-height-rule:exactly;line-height:16px;">Welcome aboard</td></tr>
<tr><td class="px h1" style="padding:0 40px 16px;font-family:Arial,Helvetica,sans-serif;font-size:40px;font-weight:bold;text-transform:uppercase;color:#e9eaee;mso-line-height-rule:exactly;line-height:44px;">Welcome to Peakd</td></tr>
<tr><td class="px" style="padding:0 40px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#aeb4bf;mso-line-height-rule:exactly;line-height:25px;">Peakd is where League and Valorant players show their rank, find teammates and compete with friends. Here are the four things to try first.</td></tr>

<tr><td class="px" style="padding:0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="border-top:1px solid #2e3340;padding:22px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" valign="top" style="width:44px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" bgcolor="#c9a86a" style="width:32px;height:32px;background:#c9a86a;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0c0d10;">1</td></tr></table></td>
<td valign="top" style="font-family:Arial,Helvetica,sans-serif;"><div style="font-size:17px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#e9eaee;mso-line-height-rule:exactly;line-height:22px;">Create your rank card</div><div style="padding-top:6px;font-size:14px;color:#aeb4bf;mso-line-height-rule:exactly;line-height:21px;">Link your Riot account and your League and Valorant ranks update automatically as you play, with peak rank, win rate and your 14-day progress.</div></td>
</tr></table></td></tr>

<tr><td style="border-top:1px solid #2e3340;padding:22px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" valign="top" style="width:44px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" bgcolor="#c9a86a" style="width:32px;height:32px;background:#c9a86a;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0c0d10;">2</td></tr></table></td>
<td valign="top" style="font-family:Arial,Helvetica,sans-serif;"><div style="font-size:17px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#e9eaee;mso-line-height-rule:exactly;line-height:22px;">Find a duo</div><div style="padding-top:6px;font-size:14px;color:#aeb4bf;mso-line-height-rule:exactly;line-height:21px;">Browse players by game, rank, role and region, or queue live to get matched with the next player at your level. Every duo is rated by the players who've queued with them.</div></td>
</tr></table></td></tr>

<tr><td style="border-top:1px solid #2e3340;padding:22px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" valign="top" style="width:44px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" bgcolor="#c9a86a" style="width:32px;height:32px;background:#c9a86a;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0c0d10;">3</td></tr></table></td>
<td valign="top" style="font-family:Arial,Helvetica,sans-serif;"><div style="font-size:17px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#e9eaee;mso-line-height-rule:exactly;line-height:22px;">Create a leaderboard</div><div style="padding-top:6px;font-size:14px;color:#aeb4bf;mso-line-height-rule:exactly;line-height:21px;">Start a private lobby for your friends, team or community and see who climbs fastest. Standings update from real ranked games.</div></td>
</tr></table></td></tr>

<tr><td style="border-top:1px solid #2e3340;border-bottom:1px solid #2e3340;padding:22px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" valign="top" style="width:44px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" bgcolor="#c9a86a" style="width:32px;height:32px;background:#c9a86a;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0c0d10;">4</td></tr></table></td>
<td valign="top" style="font-family:Arial,Helvetica,sans-serif;"><div style="font-size:17px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#e9eaee;mso-line-height-rule:exactly;line-height:22px;">Check out the clips feed</div><div style="padding-top:6px;font-size:14px;color:#aeb4bf;mso-line-height-rule:exactly;line-height:21px;">Watch the best plays from the community, and upload your own clips to your profile.</div></td>
</tr></table></td></tr>
</table>
</td></tr>

<tr><td class="px" style="padding:32px 40px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="#e9eaee" style="background:#e9eaee;border-radius:0;">
<!--[if mso]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" style="height:48px;v-text-anchor:middle;width:240px;" fill="t" stroke="f"><v:fill color="#e9eaee"/><center style="color:#0c0d10;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;letter-spacing:2px;">CREATE YOUR RANK CARD</center></v:rect><![endif]-->
<!--[if !mso]><!--><a href="https://www.peakd.gg" style="display:block;padding:16px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#0c0d10;text-decoration:none;">Create your rank card &rarr;</a><!--<![endif]-->
</td></tr></table>
<div style="padding-top:14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8b93a1;line-height:20px;">It takes about a minute, and every other feature builds on it.</div>
</td></tr>
</table>
</td></tr>

<tr><td class="px" style="padding:28px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;mso-line-height-rule:exactly;line-height:19px;">
You're receiving this because you created a Peakd account.<br>
<a href="https://www.peakd.gg/profile/settings/notifications" style="color:#aeb4bf;text-decoration:underline;">Email preferences</a>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`;

export const WELCOME_HTML_LIGHT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Welcome to Peakd</title>
<style>
@media (max-width:620px){.wrap{width:100%!important}.px{padding-left:24px!important;padding-right:24px!important}.h1{font-size:34px!important;line-height:38px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f1;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f1;">Your account is ready. Link your rank, find a duo, start a leaderboard and share your best clips.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f1" style="background:#f4f4f1;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">



<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #d9dad5;border-top:3px solid #c9a86a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="px" style="padding:32px 40px 0;"><a href="https://www.peakd.gg" style="text-decoration:none;"><img src="https://www.peakd.gg/peakd-lockup-black.png" width="138" height="30" alt="PEAKD" style="display:block;width:138px;height:30px;border:0;outline:none;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;letter-spacing:2px;color:#0c0d10;"></a></td></tr>
<tr><td class="px" style="padding:36px 40px 8px;border-top:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8a6d35;mso-line-height-rule:exactly;line-height:16px;">Welcome aboard</td></tr>
<tr><td class="px h1" style="padding:0 40px 16px;font-family:Arial,Helvetica,sans-serif;font-size:40px;font-weight:bold;text-transform:uppercase;color:#0c0d10;mso-line-height-rule:exactly;line-height:44px;">Welcome to Peakd</td></tr>
<tr><td class="px" style="padding:0 40px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#4a505c;mso-line-height-rule:exactly;line-height:25px;">Peakd is where League and Valorant players show their rank, find teammates and compete with friends. Here are the four things to try first.</td></tr>

<tr><td class="px" style="padding:0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="border-top:1px solid #e4e5e0;padding:22px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" valign="top" style="width:44px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" bgcolor="#c9a86a" style="width:32px;height:32px;background:#c9a86a;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0c0d10;">1</td></tr></table></td>
<td valign="top" style="font-family:Arial,Helvetica,sans-serif;"><div style="font-size:17px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#0c0d10;mso-line-height-rule:exactly;line-height:22px;">Create your rank card</div><div style="padding-top:6px;font-size:14px;color:#4a505c;mso-line-height-rule:exactly;line-height:21px;">Link your Riot account and your League and Valorant ranks update automatically as you play, with peak rank, win rate and your 14-day progress.</div></td>
</tr></table></td></tr>

<tr><td style="border-top:1px solid #e4e5e0;padding:22px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" valign="top" style="width:44px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" bgcolor="#c9a86a" style="width:32px;height:32px;background:#c9a86a;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0c0d10;">2</td></tr></table></td>
<td valign="top" style="font-family:Arial,Helvetica,sans-serif;"><div style="font-size:17px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#0c0d10;mso-line-height-rule:exactly;line-height:22px;">Find a duo</div><div style="padding-top:6px;font-size:14px;color:#4a505c;mso-line-height-rule:exactly;line-height:21px;">Browse players by game, rank, role and region, or queue live to get matched with the next player at your level. Every duo is rated by the players who've queued with them.</div></td>
</tr></table></td></tr>

<tr><td style="border-top:1px solid #e4e5e0;padding:22px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" valign="top" style="width:44px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" bgcolor="#c9a86a" style="width:32px;height:32px;background:#c9a86a;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0c0d10;">3</td></tr></table></td>
<td valign="top" style="font-family:Arial,Helvetica,sans-serif;"><div style="font-size:17px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#0c0d10;mso-line-height-rule:exactly;line-height:22px;">Create a leaderboard</div><div style="padding-top:6px;font-size:14px;color:#4a505c;mso-line-height-rule:exactly;line-height:21px;">Start a private lobby for your friends, team or community and see who climbs fastest. Standings update from real ranked games.</div></td>
</tr></table></td></tr>

<tr><td style="border-top:1px solid #e4e5e0;border-bottom:1px solid #e4e5e0;padding:22px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" valign="top" style="width:44px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" bgcolor="#c9a86a" style="width:32px;height:32px;background:#c9a86a;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0c0d10;">4</td></tr></table></td>
<td valign="top" style="font-family:Arial,Helvetica,sans-serif;"><div style="font-size:17px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#0c0d10;mso-line-height-rule:exactly;line-height:22px;">Check out the clips feed</div><div style="padding-top:6px;font-size:14px;color:#4a505c;mso-line-height-rule:exactly;line-height:21px;">Watch the best plays from the community, and upload your own clips to your profile.</div></td>
</tr></table></td></tr>
</table>
</td></tr>

<tr><td class="px" style="padding:32px 40px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="#0c0d10" style="background:#0c0d10;border-radius:0;">
<!--[if mso]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" style="height:48px;v-text-anchor:middle;width:240px;" fill="t" stroke="f"><v:fill color="#0c0d10"/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;letter-spacing:2px;">CREATE YOUR RANK CARD</center></v:rect><![endif]-->
<!--[if !mso]><!--><a href="https://www.peakd.gg" style="display:block;padding:16px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#ffffff;text-decoration:none;">Create your rank card &rarr;</a><!--<![endif]-->
</td></tr></table>
<div style="padding-top:14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;line-height:20px;">It takes about a minute, and every other feature builds on it.</div>
</td></tr>
</table>
</td></tr>

<tr><td class="px" style="padding:28px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8b909a;mso-line-height-rule:exactly;line-height:19px;">
You're receiving this because you created a Peakd account.<br>
<a href="https://www.peakd.gg/profile/settings/notifications" style="color:#4a505c;text-decoration:underline;">Email preferences</a>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`;
