/**
 * A 5v5 series won: every player on the winning side gets a trophy kept on
 * their own account (users/{uid}/trophies) and a `series_won` notification.
 *
 * Kept on the account, not just worked out from the lobby, so a trophy stays
 * when its winner leaves the lobby, or the lobby is deleted. The web's
 * trophies route (Peakd-web app/api/users/[userId]/trophies) reads these
 * alongside the ones it works out. KEEP IN SYNC with Peakd-web lib/trophies.ts
 * (the Trophy shape) and lib/server/series.ts (what counts as decided).
 *
 * A series is known by its deciding game's report time (`endedAt`). Taking
 * that game back (Undo, within 10 minutes) takes the trophies and
 * notifications back with it. Writes are keyed by that time, so a trigger
 * delivered twice changes nothing.
 */
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {db} from "../badges/db";

type Side = "1" | "2";

interface Game {
  winner?: unknown;
  at?: string;
  teams?: Partial<Record<Side, string[]>>;
}

interface Decided {
  endedAt: string;
  format: 3 | 5;
  wins: Record<Side, number>;
  winner: Side;
  teams: Partial<Record<Side, string[]>>;
}

/** The running series, if it has just been won. */
function decidedNow(p: FirebaseFirestore.DocumentData): Decided | null {
  if (p.lobbyKind !== "fiveVFive" || p.lobbyMode !== "series" || !Array.isArray(p.series?.games)) return null;
  const games = p.series.games as Game[];
  const format: 3 | 5 = p.series.format === 5 ? 5 : 3;
  const need = Math.ceil(format / 2);
  const wins: Record<Side, number> = {"1": 0, "2": 0};
  for (const g of games) if (g?.winner === 1 || g?.winner === 2) wins[String(g.winner) as Side] += 1;
  const winner: Side | null = wins["1"] >= need ? "1" : wins["2"] >= need ? "2" : null;
  const last = games.at(-1);
  if (!winner || !last?.at) return null;
  return {endedAt: last.at, format, wins, winner, teams: last.teams ?? {}};
}

/** Every series this lobby still knows as won: its history and the running one. */
function knownEnds(p: FirebaseFirestore.DocumentData): Set<string> {
  const ends = new Set<string>();
  for (const h of (Array.isArray(p.seriesHistory) ? p.seriesHistory : []) as {endedAt?: string; winner?: unknown}[]) {
    if (h?.endedAt && (h.winner === 1 || h.winner === 2)) ends.add(h.endedAt);
  }
  const now = decidedNow(p);
  if (now) ends.add(now.endedAt);
  return ends;
}

/** Real accounts only: a guest's id ("guest:…") has nowhere to keep a trophy. */
function players(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).filter((id) => typeof id === "string" && id && !id.startsWith("guest:")))];
}

const trophyId = (partyId: string, endedAt: string) => `${partyId}:${endedAt}`;
const notifId = (partyId: string, endedAt: string) => `series_won_${partyId}_${endedAt}`;

export const onSeriesDecided = onDocumentUpdated(
  "parties/{partyId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    const partyId = event.params.partyId;

    const was = decidedNow(before);
    const now = decidedNow(after);

    // Won: a series decided now that wasn't (or was a different one) before.
    if (now && now.endedAt !== was?.endedAt) {
      const winners = players(now.teams[now.winner]);
      if (winners.length === 0) return;
      const loser: Side = now.winner === "1" ? "2" : "1";
      const details = new Map<string, {username?: string; avatar?: string}>(
        ((after.memberDetails ?? []) as {userId?: string; username?: string; avatar?: string}[])
          .filter((d) => d?.userId)
          .map((d) => [d.userId as string, d]),
      );
      // A private lobby's name and icon only show once it's listed (lib/server/series.ts lobbyShown).
      const shown = after.visibility === "public" || after.listed === true;
      const team = winners.map((id) => ({
        userId: id,
        username: details.get(id)?.username ?? "",
        ...(details.get(id)?.avatar ? {avatar: details.get(id)!.avatar} : {}),
      }));
      const score: [number, number] = [now.wins[now.winner], now.wins[loser]];
      const host = details.get(after.createdBy ?? "");

      // Accounts that still exist, so nothing is written under a deleted one.
      const userDocs = await db.getAll(...winners.map((id) => db.collection("users").doc(id)));
      const batch = db.batch();
      for (const u of userDocs) {
        if (!u.exists) continue;
        batch.set(u.ref.collection("trophies").doc(trophyId(partyId, now.endedAt)), {
          id: trophyId(partyId, now.endedAt),
          lobbyId: partyId,
          lobbyName: shown && typeof after.partyName === "string" ? after.partyName : null,
          ...(shown && typeof after.partyIcon === "string" && after.partyIcon ? {lobbyIcon: after.partyIcon} : {}),
          game: after.gameId === "valorant" ? "valorant" : "league",
          format: now.format,
          side: Number(now.winner),
          score,
          team,
          endedAt: now.endedAt,
          awardedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.set(u.ref.collection("notifications").doc(notifId(partyId, now.endedAt)), {
          type: "series_won",
          fromUserId: after.createdBy ?? "",
          fromUsername: host?.username ?? "",
          fromAvatar: host?.avatar ?? "",
          partyId,
          partyName: after.partyName ?? "",
          game: after.game ?? "",
          format: now.format,
          score,
          endedAt: now.endedAt,
          read: false,
          createdAt: admin.firestore.Timestamp.now(),
        });
      }
      await batch.commit();
      return;
    }

    // Taken back: the series that was won is no longer won anywhere — not
    // running, and not filed in the history (where a new series, or closing
    // the lobby, would have put it).
    if (was && !knownEnds(after).has(was.endedAt)) {
      const batch = db.batch();
      for (const id of players(was.teams[was.winner])) {
        const user = db.collection("users").doc(id);
        batch.delete(user.collection("trophies").doc(trophyId(partyId, was.endedAt)));
        batch.delete(user.collection("notifications").doc(notifId(partyId, was.endedAt)));
      }
      await batch.commit();
    }
  }
);
