/**
 * Firebase Cloud Functions for Peakd App
 *
 * This file exports all Cloud Functions for the Peakd application,
 * including Riot Games API integration.
 */

import * as admin from "firebase-admin";
import {setGlobalOptions} from "firebase-functions/v2";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Set global options for cost control
setGlobalOptions({maxInstances: 10});

// Export Riot Games API functions
export {linkRiotAccountFunction as linkRiotAccount} from "./riot/linkRiotAccount";
export {getLeagueStatsFunction as getLeagueStats} from "./riot/getLeagueStats";
export {getTftStatsFunction as getTftStats} from "./riot/getTftStats";
export {unlinkRiotAccountFunction as unlinkRiotAccount} from "./riot/unlinkRiotAccount";

export {getRecentMatchesFunction as getRecentMatches} from "./riot/getRecentMatches";

// One-shot admin repair for Riot accounts stored against the wrong platform.
export {repairRiotRegionsFunction as repairRiotRegions} from "./riot/repairRiotRegions";

// Export Valorant API functions (Henrik's API)
export {linkValorantAccountFunction as linkValorantAccount} from "./valorant/linkValorantAccount";
export {getValorantStatsFunction as getValorantStats} from "./valorant/getValorantStats";
export {unlinkValorantAccountFunction as unlinkValorantAccount} from "./valorant/unlinkValorantAccount";

// Export public showcase stats (logged-out homepage)
export {getShowcaseStatsFunction as getShowcaseStats} from "./showcase/getShowcaseStats";

// Public, unauthenticated rank preview for the logged-out card builder (web /create).
export {lookupRankFunction as lookupRank} from "./lookup/lookupRank";

// Export Push Notification functions
export {onNotificationCreated} from "./notifications/onNotificationCreated";
export {onMessageCreated} from "./notifications/onMessageCreated";
export {onGameStatsUpdatedFunction as onGameStatsUpdated} from "./notifications/onGameStatsUpdated";

// Export Follow Count Management functions
export {onFollowerCreated} from "./follows/onFollowCreated";
export {onFollowerDeleted} from "./follows/onFollowDeleted";
export {
  recalculateFollowCountsCallable,
  recalculateFollowCountsScheduled,
} from "./follows/recalculateFollowCounts";

// Export Party Management functions
export {checkCompletedPartiesScheduled} from "./parties/checkCompletedParties";
export {refreshPartyStatsFunction as refreshPartyStats} from "./parties/refreshPartyStats";

// Export User Management functions
export {updateUsernameFunction as updateUsername} from "./users/updateUsername";
export {resetPhonePasswordFunction as resetPhonePassword} from "./users/resetPhonePassword";
export {generateLoginTokenFunction as generateLoginToken} from "./users/generateLoginToken";
export {loginWithUsernameFunction as loginWithUsername} from "./users/loginWithUsername";
export {setUserPasswordFunction as setUserPassword} from "./users/setUserPassword";
export {deleteAllAccountsFunction as deleteAllAccounts} from "./users/deleteAllAccounts";
export {deleteAccountFunction as deleteAccount} from "./users/deleteAccount";

// Export Email Verification functions
export {sendEmailVerificationCodeFunction as sendEmailVerificationCode} from "./email/emailVerification";
export {verifyEmailCodeFunction as verifyEmailCode} from "./email/emailVerification";
export {checkEmailAccountExistsFunction as checkEmailAccountExists} from "./email/emailLoginVerification";
export {generateEmailLoginTokenFunction as generateEmailLoginToken} from "./email/emailLoginVerification";

// Phone verification (Twilio)
export {sendPhoneVerificationCodeFunction as sendPhoneVerificationCode} from "./phone/phoneVerification";
export {verifyPhoneCodeFunction as verifyPhoneCode} from "./phone/phoneVerification";

// Export Rank History functions
export {dailyRankSnapshotScheduled} from "./rankHistory/dailyRankSnapshot";

// Export Presence Cleanup functions
export {cleanupPresenceScheduled} from "./presence/cleanupPresence";

// Export Duo Matching functions
export {onDuoQueueCreated} from "./duo/onDuoQueueCreated";
export {onDuoMatchUpdated} from "./duo/onMatchUpdated";
export {cleanupDuoQueueScheduled} from "./duo/cleanupDuoQueue";
export {cleanupExpiredMatchesScheduled} from "./duo/cleanupExpiredMatches";

// Badge + profile triggers, merged in from the web repo (previously deployed
// as the separate "badges" codebase from Peakd-web/functions).
export {onRankChange} from "./badges/onRankChange";
export {onLeaderboardChange} from "./badges/onLeaderboardChange";
export {onLobbyComplete} from "./badges/onLobbyComplete";
export {onProfileView} from "./badges/onProfileView";

// Discord OAuth -> Firebase custom token exchange (web login/signup).
export {discordLogin} from "./discord/discordLogin";
