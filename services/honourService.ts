import { collection, doc, documentId, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';

/**
 * Honour — positive-only endorsements between players who duo'd.
 *
 * After a live-queue match both accepted (or, on the web, an accepted duo
 * invite), each player gets an `honour_prompt` notification about the other.
 * Honouring gives one tag; once HONOUR_THRESHOLD different players have given
 * someone the same tag, their most-given tag shows next to their name.
 *
 * Counts are written only by the honourDuo Cloud Function, so nobody can raise
 * their own. KEEP IN SYNC with functions/src/honour/config.ts and
 * Peakd-web/lib/honour.ts.
 */

export const HONOUR_TAGS = [
  { id: 'good_comms', label: 'Good comms' },
  { id: 'chill', label: 'Chill' },
  { id: 'shotcaller', label: 'Shotcaller' },
  { id: 'clutch', label: 'Clutch' },
  { id: 'team_player', label: 'Team player' },
] as const;

export type HonourTagId = (typeof HONOUR_TAGS)[number]['id'];

export function honourLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return HONOUR_TAGS.find((t) => t.id === id)?.label ?? null;
}

/** Honour a duo partner with one tag. Throws with the server's message. */
export async function honourDuo(playId: string, tag: HonourTagId): Promise<void> {
  const fn = httpsCallable<{ playId: string; tag: HonourTagId }, { ok: boolean }>(functions, 'honourDuo');
  await fn({ playId, tag });
}

/** "Not this time" — retires the prompt without honouring. */
export async function dismissHonourPrompt(userId: string, notifId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'notifications', notifId), { status: 'dismissed', read: true });
}

/** Whether a prompt can still be answered. */
export function isHonourPromptLive(n: { type: string; status?: string; expiresAt?: { toMillis: () => number } }): boolean {
  if (n.type !== 'honour_prompt') return false;
  if (n.status && n.status !== 'pending') return false;
  return !n.expiresAt || n.expiresAt.toMillis() > Date.now();
}

/** The tag shown next to one player's name, or null below the threshold. */
export async function getHonourTag(userId: string): Promise<HonourTagId | null> {
  if (!userId) return null;
  const snap = await getDoc(doc(db, 'userHonour', userId));
  return (snap.get('topTag') as HonourTagId | null | undefined) ?? null;
}

/** Shown tags for many players at once — one `in` query per 30 ids. */
export async function getHonourTags(userIds: string[]): Promise<Map<string, HonourTagId>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, HonourTagId>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  await Promise.all(
    chunks.map(async (chunk) => {
      const snap = await getDocs(query(collection(db, 'userHonour'), where(documentId(), 'in', chunk)));
      snap.forEach((d) => {
        const tag = d.get('topTag') as HonourTagId | null | undefined;
        if (tag) out.set(d.id, tag);
      });
    })
  );
  return out;
}
