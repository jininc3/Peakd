/**
 * Honour system — shared constants and helpers.
 *
 * After two players duo (a live-queue match both accepted, or a duo invite
 * accepted from either side), each is asked whether they want to honour the
 * other. Honouring is positive-only: pick one tag from HONOUR_TAGS. Nothing
 * negative is ever shown — a bad teammate is a block or a report, not a score.
 *
 * A tag appears next to a player's name once HONOUR_THRESHOLD different
 * players have given them that same tag; the most-given tag is the one shown.
 *
 * Data:
 *   duoPlays/{pairKey}_{day}      one per pair per UTC day; server-only.
 *   userHonour/{userId}            public counts + the tag to display.
 *   userHonour/{userId}/endorsements/{fromUserId}
 *                                  one per giver, ever; server-only, so who
 *                                  honoured whom is never readable.
 *
 * KEEP IN SYNC with the tag list in Peakd-web/lib/honour.ts and
 * services/honourService.ts in this repo.
 */

export const HONOUR_TAGS = [
  {id: "good_comms", label: "Good comms"},
  {id: "chill", label: "Chill"},
  {id: "shotcaller", label: "Shotcaller"},
  {id: "clutch", label: "Clutch"},
  {id: "team_player", label: "Team player"},
] as const;

export type HonourTagId = (typeof HONOUR_TAGS)[number]["id"];

export function isHonourTag(v: unknown): v is HonourTagId {
  return HONOUR_TAGS.some((t) => t.id === v);
}

export function honourLabel(id: string): string {
  return HONOUR_TAGS.find((t) => t.id === id)?.label ?? id;
}

/** Distinct players who must give the same tag before it is shown. */
export const HONOUR_THRESHOLD = 5;

/** How long after the prompt the player may still honour. */
export const PROMPT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Never prompt sooner than this after the duo started: a League game runs
 * 25–35 minutes and Valorant 35–45, so an earlier prompt lands mid-game.
 */
export const MIN_PLAY_MS = 30 * 60 * 1000;

/**
 * Live-queue duos have no session to end, so the prompt is simply timed:
 * long enough for a game or two.
 */
export const QUEUE_PROMPT_DELAY_MS = 60 * 60 * 1000;

/**
 * Invite duos default to the duo session's own lifetime (see EXPIRY_MS in
 * Peakd-web/lib/duoSessionService.ts). Ending the session early brings the
 * prompt forward; extending it pushes the prompt back.
 */
export const INVITE_PROMPT_DELAY_MS = 90 * 60 * 1000;

/** Order-independent key for a pair, matching duoSessionIdFor on the web. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("_");
}

/** UTC day, so a pair gets at most one prompt per day however often they duo. */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The tag to display: the most-given tag among those at or over the
 * threshold. Ties go to the tag listed first in HONOUR_TAGS, so the result is
 * stable rather than flipping between reads.
 */
export function topTag(counts: Partial<Record<string, number>>): HonourTagId | null {
  let best: HonourTagId | null = null;
  let bestCount = 0;
  for (const {id} of HONOUR_TAGS) {
    const n = counts[id] ?? 0;
    if (n >= HONOUR_THRESHOLD && n > bestCount) {
      best = id;
      bestCount = n;
    }
  }
  return best;
}
