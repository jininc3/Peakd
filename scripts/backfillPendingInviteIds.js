/**
 * One-off: gives every lobby's pending invites the `pendingInviteIds` list that
 * firestore.rules reads to let invited people see the lobby. Safe to run twice.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=<service account json> node scripts/backfillPendingInviteIds.js
 *
 * Add --dry-run to report without writing. Run it BEFORE deploying the rules, or
 * people with an invite already waiting can't open the lobby until they accept.
 */
const admin = require("../functions/node_modules/firebase-admin");

admin.initializeApp();
const dryRun = process.argv.includes("--dry-run");

(async () => {
  const db = admin.firestore();
  const parties = await db.collection("parties").get();
  let updated = 0;
  let batch = db.batch();
  let inBatch = 0;
  for (const doc of parties.docs) {
    const ids = (doc.data().pendingInvites ?? []).map((p) => p.userId).filter(Boolean);
    const current = doc.data().pendingInviteIds ?? [];
    if (ids.length === current.length && ids.every((id) => current.includes(id))) continue;
    updated += 1;
    if (dryRun) continue;
    batch.update(doc.ref, {pendingInviteIds: ids});
    if (++inBatch === 400) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (!dryRun && inBatch > 0) await batch.commit();
  console.log(`${dryRun ? "Would update" : "Updated"} ${updated} of ${parties.size} lobbies.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
