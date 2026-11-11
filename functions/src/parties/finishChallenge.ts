/**
 * Finishing a lobby's challenge — the one way it's done, whether it reached
 * its end date (the daily checkCompletedParties) or everyone in it voted to
 * end it early (Peakd-web lib/lobbyService answerChallengeVote, which sets
 * `challengeEndNow`).
 *
 * Only the challenge's participants are ranked, and by what the challenge
 * measures: an LP/RR climb by LP/RR gained since each player's start (their
 * own start, for a late joiner), a highest-rank challenge by rank. The
 * scoring mirrors Peakd-web lib/lobbyService.ts (ladderPoints, rankScore) —
 * KEEP IN SYNC.
 *
 * Writes the standings to `rankings` and flips the challenge to "completed"
 * (which onLobbyComplete reads for badges), tells each participant where they
 * finished (`party_complete`), then clears the challenge so the lobby can run
 * another. Fewer than two players left: nothing is ranked, it's just cleared.
 */
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {db} from "../badges/db";

type Game = "league" | "valorant";

const TIER_VALUE: Record<Game, Record<string, number>> = {
  league: {IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5, DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9},
  valorant: {IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, DIAMOND: 5, ASCENDANT: 6, IMMORTAL: 7, RADIANT: 8},
};
const DIVISION_VALUE: Record<string, number> = {IV: 0, III: 1, II: 2, I: 3, "1": 0, "2": 1, "3": 2};
const DIVISIONS_PER_TIER: Record<Game, number> = {league: 4, valorant: 3};
const APEX: Record<Game, Set<string>> = {
  league: new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]),
  valorant: new Set(["RADIANT"]),
};

/** A rank and its LP/RR as one point on a continuous ladder (web ladderPoints). */
function ladderPoints(game: Game, rank: string | undefined, points: number): number | null {
  if (!rank) return null;
  const [tierRaw, divRaw = ""] = rank.trim().split(/\s+/);
  const tier = tierRaw?.toUpperCase();
  const tierValue = TIER_VALUE[game][tier];
  if (tierValue === undefined) return null;
  const perTier = DIVISIONS_PER_TIER[game];
  if (APEX[game].has(tier)) {
    const base = game === "league" ? TIER_VALUE.league.MASTER : tierValue;
    return base * perTier * 100 + points;
  }
  return (tierValue * perTier + (DIVISION_VALUE[divRaw.toUpperCase()] ?? 0)) * 100 + points;
}

/** Rank order for a highest-rank challenge (web rankScore); -1 unranked. */
function rankScore(game: Game, rank: string | undefined, points: number): number {
  if (!rank) return -1;
  const [tierRaw, divRaw = ""] = rank.split(" ");
  const tierValue = TIER_VALUE[game][tierRaw?.toUpperCase()] ?? -1;
  if (tierValue < 0) return -1;
  return tierValue * 10000 + (DIVISION_VALUE[divRaw.toUpperCase()] ?? 0) * 1000 + points;
}

function gameOf(p: FirebaseFirestore.DocumentData): Game {
  if (p.gameId === "league" || p.gameId === "valorant") return p.gameId;
  return String(p.game ?? "").toLowerCase().includes("league") ? "league" : "valorant";
}

/** A player's rank and LP/RR now, as the lobby page reads them. */
async function statsNow(userId: string, game: Game): Promise<{rank?: string; points: number}> {
  try {
    const s = (await db.doc(`users/${userId}/gameStats/${game}`).get()).data();
    if (s?.currentRank) return {rank: s.currentRank, points: Number(game === "league" ? s.lp : s.rr) || 0};
    const u = (await db.doc(`users/${userId}`).get()).data();
    if (game === "league" && u?.riotStats?.rankedSolo?.tier) {
      const r = u.riotStats.rankedSolo;
      return {rank: `${r.tier}${r.rank ? " " + r.rank : ""}`, points: Number(r.leaguePoints) || 0};
    }
    if (game === "valorant" && u?.valorantStats?.currentRank) {
      return {rank: u.valorantStats.currentRank, points: Number(u.valorantStats.rankRating) || 0};
    }
  } catch (e) {
    console.error(`finishChallenge: stats for ${userId} failed`, e);
  }
  return {points: 0};
}

/** The fields that make up a challenge, emptied: the lobby can run another. */
const CLEARED = {
  challengeStatus: "none",
  challengeInvites: [],
  challengeParticipants: [],
  startingStats: [],
  challengeVote: admin.firestore.FieldValue.delete(),
  challengeEndNow: admin.firestore.FieldValue.delete(),
};

export async function finishChallenge(ref: FirebaseFirestore.DocumentReference): Promise<void> {
  const snap = await ref.get();
  const p = snap.data();
  if (!p || p.challengeStatus !== "active") return;
  const game = gameOf(p);
  const members = new Set<string>(p.members ?? []);
  // The players still in it and still in the lobby. Challenges from before
  // participants were recorded fall back to the lobby.
  const ids = ((p.challengeParticipants?.length ? p.challengeParticipants : p.members) ?? [] as string[])
    .filter((id: string) => members.has(id));

  if (ids.length < 2) {
    await ref.update(CLEARED);
    return;
  }

  const climb = p.challengeType !== "rank";
  const details = new Map<string, {username?: string; avatar?: string}>(
    ((p.memberDetails ?? []) as {userId?: string; username?: string; avatar?: string}[])
      .filter((d) => d?.userId).map((d) => [d.userId as string, d]),
  );
  const starts = new Map<string, {currentRank?: string; lp?: number; rr?: number}>(
    ((p.startingStats ?? []) as {userId: string; currentRank?: string; lp?: number; rr?: number}[]).map((s) => [s.userId, s]),
  );

  const rows = await Promise.all(ids.map(async (id: string) => {
    const now = await statsNow(id, game);
    const start = starts.get(id);
    let gained = 0;
    if (start) {
      const startPoints = Number(game === "league" ? start.lp : start.rr) || 0;
      const from = ladderPoints(game, start.currentRank, startPoints);
      const to = ladderPoints(game, now.rank, now.points);
      gained = from !== null && to !== null ? to - from : now.points - startPoints;
    }
    return {id, now, gained, score: rankScore(game, now.rank, now.points)};
  }));
  // A climb is won by points gained, ties by rank; otherwise by rank.
  rows.sort((a, b) => (climb ? b.gained - a.gained : 0) || b.score - a.score);

  const rankings = rows.map((r, i) => ({
    userId: r.id,
    username: details.get(r.id)?.username ?? "",
    ...(details.get(r.id)?.avatar ? {avatar: details.get(r.id)!.avatar} : {}),
    rank: i + 1,
    currentRank: r.now.rank ?? "Unranked",
    lp: game === "league" ? r.now.points : 0,
    rr: game === "valorant" ? r.now.points : 0,
    ...(climb ? {pointsGained: r.gained} : {}),
  }));

  // Only one finish wins: the end date and an early end can't both rank it.
  const finished = await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data();
    if (fresh?.challengeStatus !== "active") return false;
    tx.update(ref, {
      rankings,
      challengeStatus: "completed",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      challengeVote: admin.firestore.FieldValue.delete(),
      challengeEndNow: admin.firestore.FieldValue.delete(),
    });
    return true;
  });
  if (!finished) return;

  const winner = rankings[0];
  const batch = db.batch();
  for (const r of rankings) {
    batch.set(db.collection(`users/${r.userId}/notifications`).doc(), {
      type: "party_complete",
      partyId: ref.id,
      partyName: p.partyName ?? "",
      game: p.game ?? "",
      winnerUserId: winner.userId,
      winnerUsername: winner.username,
      isWinner: r.userId === winner.userId,
      finalRank: r.rank,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  await ref.update(CLEARED);
}

/** Everyone in it agreed to end it early: finish it now, not at its end date. */
export const onChallengeEndNow = onDocumentUpdated(
  "parties/{partyId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (after.challengeEndNow !== true || before.challengeEndNow === true) return;
    await finishChallenge(event.data!.after.ref);
  }
);
