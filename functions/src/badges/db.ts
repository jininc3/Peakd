import * as admin from "firebase-admin";

/**
 * Shared Firestore handle for the functions moved over from the web repo.
 *
 * The app is initialized once in index.ts (this codebase's single entry
 * point), so this module must not initialize it again — a second
 * initializeApp() throws. The guard remains for safety if these functions are
 * ever loaded in isolation (tests, the functions shell).
 */
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();
