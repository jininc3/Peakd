import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { finishChallenge } from './finishChallenge';

/**
 * Daily: finish every running challenge whose end date has passed.
 *
 * The finishing itself (who's ranked, and how) is finishChallenge's, shared
 * with ending one early by vote. A challenge ends at the end of its last day,
 * so it's finished the day after; one the job missed (a failed run, a skipped
 * day) is finished the next time it runs, not left running for good.
 *
 * End dates: Peakd-web startChallenge writes the exact moment as an ISO
 * string, finished at the first run after it. Older lobbies hold "MM/DD/YYYY"
 * or a Timestamp, a whole day, finished the day after.
 */
export const checkCompletedPartiesScheduled = onSchedule(
  {
    schedule: 'every day 09:00',
    timeZone: 'America/Los_Angeles',
  },
  async () => {
    const db = getFirestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const now = Date.now();
    const running = await db.collection('parties').where('challengeStatus', '==', 'active').get();
    console.log(`Checking ${running.size} running challenges`);

    for (const partyDoc of running.docs) {
      const end = parseEndDate(partyDoc.data().endDate);
      if (!end) continue;
      if (end.exact ? end.date.getTime() > now : end.date.getTime() >= today.getTime()) continue;
      try {
        await finishChallenge(partyDoc.ref);
        console.log(`Finished the challenge in ${partyDoc.id}`);
      } catch (error) {
        console.error(`Error finishing the challenge in ${partyDoc.id}:`, error);
      }
    }
  }
);

/** `exact`: an ISO moment. Otherwise a calendar day, at its midnight. */
function parseEndDate(value: unknown): { date: Date; exact: boolean } | null {
  if (typeof value === 'string' && (value.includes('T') || value.includes('Z'))) {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : { date, exact: true };
  }
  if (typeof value === 'string') {
    const parts = value.split('/');
    if (parts.length !== 3) return null;
    const [month, day, year] = parts.map((n) => parseInt(n, 10));
    if (!month || !day || !year) return null;
    return { date: new Date(year, month - 1, day), exact: false };
  }
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    date.setHours(0, 0, 0, 0);
    return { date, exact: false };
  }
  return null;
}
