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

// Export Valorant API functions (Henrik's API)
export {linkValorantAccountFunction as linkValorantAccount} from "./valorant/linkValorantAccount";
export {getValorantStatsFunction as getValorantStats} from "./valorant/getValorantStats";
export {unlinkValorantAccountFunction as unlinkValorantAccount} from "./valorant/unlinkValorantAccount";

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

// Export Duo Matching functions
export {onDuoQueueCreated} from "./duo/onDuoQueueCreated";
export {onDuoMatchUpdated} from "./duo/onMatchUpdated";
export {cleanupDuoQueueScheduled} from "./duo/cleanupDuoQueue";
export {cleanupExpiredMatchesScheduled} from "./duo/cleanupExpiredMatches";
