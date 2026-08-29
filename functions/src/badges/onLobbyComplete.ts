/**
 * Triggered when `parties/{partyId}` is updated.
 *
 * When challengeStatus transitions to "completed", checks for:
 * mvp, sweep, underdog, back_to_back, dynasty
 */
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { db, grantBadge } from "./helpers";

interface RankingEntry {
  userId: string;
  rank: number;
  pointsGained?: number;
  /** Track if user was ever last place during the challenge */
  wasLastPlace?: boolean;
  /** Track if user was ever NOT #1 during the challenge */
  droppedFromFirst?: boolean;
}

export const onLobbyComplete = onDocumentUpdated(
  "parties/{partyId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // Only trigger when status transitions to "completed"
    if (before.challengeStatus === "completed" || after.challengeStatus !== "completed") {
      return;
    }

    const partyId = event.params.partyId;
    const rankings: RankingEntry[] = after.rankings ?? [];
    const members: string[] = after.members ?? [];
    const partyName: string = after.partyName ?? "";

    if (rankings.length < 2) return;

    // Sort by rank ascending (rank 1 = winner)
    const sorted = [...rankings].sort((a, b) => a.rank - b.rank);
    const winner = sorted[0];
    if (!winner) return;

    // ── mvp: most points gained in a lobby ──
    const withPoints = sorted.filter((r) => typeof r.pointsGained === "number");
    if (withPoints.length > 0) {
      const mvp = withPoints.reduce((best, r) =>
        (r.pointsGained ?? 0) > (best.pointsGained ?? 0) ? r : best
      );
      if (mvp.pointsGained && mvp.pointsGained > 0) {
        await grantBadge(mvp.userId, "mvp", partyName);
      }
    }

    // ── sweep: finish #1 without ever dropping from 1st ──
    // Uses the droppedFromFirst flag if tracked, otherwise just grant to winner
    if (!winner.droppedFromFirst) {
      await grantBadge(winner.userId, "sweep", partyName);
    }

    // ── underdog: win after being last at some point ──
    if (winner.wasLastPlace) {
      await grantBadge(winner.userId, "underdog", partyName);
    }

    // ── back_to_back: win 2 consecutive lobbies ──
    // Check if this user won their previous lobby
    const prevLobbiesSnap = await db
      .collection("parties")
      .where("members", "array-contains", winner.userId)
      .where("challengeStatus", "==", "completed")
      .get();

    const completedLobbies = prevLobbiesSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p: any) => p.id !== partyId && Array.isArray(p.rankings))
      .sort((a: any, b: any) => {
        // Sort by endDate descending
        const aDate = parseDate(a.endDate);
        const bDate = parseDate(b.endDate);
        return (bDate ?? 0) - (aDate ?? 0);
      }) as any[];

    if (completedLobbies.length > 0) {
      const lastLobby = completedLobbies[0];
      const lastRankings = (lastLobby.rankings ?? []) as RankingEntry[];
      const lastSorted = [...lastRankings].sort((a, b) => a.rank - b.rank);
      if (lastSorted[0]?.userId === winner.userId) {
        await grantBadge(winner.userId, "back_to_back", partyName);
      }
    }

    // ── dynasty: win 3+ lobbies with the same group ──
    // Find all completed lobbies where this user won (rank 1)
    const wonLobbies = prevLobbiesSnap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter((p) => {
        const r = (p.data.rankings ?? []) as RankingEntry[];
        const s = [...r].sort((a, b) => a.rank - b.rank);
        return s[0]?.userId === winner.userId;
      });

    // Include current lobby
    const currentMembers = new Set(members);

    // Count lobbies won with substantially the same group (>= 50% overlap)
    let sameGroupWins = 1; // Current lobby counts
    for (const lobby of wonLobbies) {
      if (lobby.id === partyId) continue;
      const lobbyMembers: string[] = lobby.data.members ?? [];
      const overlap = lobbyMembers.filter((m) => currentMembers.has(m)).length;
      const overlapRatio = overlap / Math.max(currentMembers.size, lobbyMembers.length);
      if (overlapRatio >= 0.5) {
        sameGroupWins++;
      }
    }

    if (sameGroupWins >= 3) {
      await grantBadge(winner.userId, "dynasty", partyName);
    }
  }
);

function parseDate(val: string | undefined): number | null {
  if (!val) return null;
  const parts = val.split("/").map(Number);
  if (parts.length !== 3 || parts.some((p) => isNaN(p))) return null;
  const [month, day, year] = parts;
  return new Date(year, month - 1, day).getTime();
}
