import { db } from '@/config/firebase';
import {
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

export interface DuoQueueEntry {
  userId: string;
  game: 'valorant' | 'league';
  mode: 'lfg' | 'duo';
  status: 'searching' | 'matched' | 'expired';
  matchedWith: string | null;
  matchId: string | null;
  createdAt: any;
  username: string;
  avatar?: string;
  inGameIcon?: string;
  inGameName?: string;
  currentRank?: string;
  mainRole?: string;
  mainAgent?: string;
}

export interface DuoMatchCardData {
  userId: string;
  username: string;
  avatar?: string | null;
  inGameIcon?: string | null;
  inGameName?: string | null;
  currentRank?: string | null;
  mainRole?: string | null;
  mainAgent?: string | null;
}

export interface DuoMatch {
  game: 'valorant' | 'league';
  mode: 'lfg' | 'duo';
  user1Id: string;
  user2Id: string;
  user1Card: DuoMatchCardData;
  user2Card: DuoMatchCardData;
  user1Accepted: boolean | 'declined';
  user2Accepted: boolean | 'declined';
  status: 'pending' | 'active' | 'declined' | 'expired' | 'dismissed';
  expiresAt: any;
  createdAt: any;
}

/**
 * Join the duo matching queue
 */
export const joinDuoQueue = async (
  userId: string,
  game: 'valorant' | 'league',
  mode: 'lfg' | 'duo',
  cardData: {
    username: string;
    avatar?: string;
    inGameIcon?: string;
    inGameName?: string;
    currentRank?: string;
    mainRole?: string;
    mainAgent?: string;
  }
): Promise<void> => {
  const queueDocRef = doc(db, 'duoQueue', `${userId}_${game}`);
  await setDoc(queueDocRef, {
    userId,
    game,
    mode,
    status: 'searching',
    matchedWith: null,
    matchId: null,
    createdAt: serverTimestamp(),
    username: cardData.username,
    avatar: cardData.avatar || null,
    inGameIcon: cardData.inGameIcon || null,
    inGameName: cardData.inGameName || null,
    currentRank: cardData.currentRank || null,
    mainRole: cardData.mainRole || null,
    mainAgent: cardData.mainAgent || null,
  });
};

/**
 * Leave the duo matching queue
 */
export const leaveDuoQueue = async (
  userId: string,
  game: 'valorant' | 'league'
): Promise<void> => {
  const queueDocRef = doc(db, 'duoQueue', `${userId}_${game}`);
  try {
    await deleteDoc(queueDocRef);
  } catch (error) {
    console.error('Error leaving duo queue:', error);
  }
};

/**
 * Subscribe to duo queue status changes (searching -> matched)
 */
export const subscribeToDuoQueue = (
  userId: string,
  game: 'valorant' | 'league',
  callback: (data: DuoQueueEntry | null) => void
): (() => void) => {
  const queueDocRef = doc(db, 'duoQueue', `${userId}_${game}`);
  return onSnapshot(queueDocRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as DuoQueueEntry);
    } else {
      callback(null);
    }
  }, () => {});
};

/**
 * Get a duo match by ID
 */
export const getDuoMatch = async (matchId: string): Promise<DuoMatch | null> => {
  const matchDocRef = doc(db, 'duoMatches', matchId);
  const matchDoc = await getDoc(matchDocRef);
  if (matchDoc.exists()) {
    return matchDoc.data() as DuoMatch;
  }
  return null;
};

/**
 * Accept a duo match
 */
export const acceptMatch = async (matchId: string, userId: string): Promise<void> => {
  const matchDocRef = doc(db, 'duoMatches', matchId);
  const matchDoc = await getDoc(matchDocRef);
  if (!matchDoc.exists()) return;

  const data = matchDoc.data();
  if (data.user1Id === userId) {
    await updateDoc(matchDocRef, { user1Accepted: true });
  } else if (data.user2Id === userId) {
    await updateDoc(matchDocRef, { user2Accepted: true });
  }
};

/**
 * Decline a duo match
 */
export const declineMatch = async (matchId: string, userId: string): Promise<void> => {
  const matchDocRef = doc(db, 'duoMatches', matchId);
  const matchDoc = await getDoc(matchDocRef);
  if (!matchDoc.exists()) return;

  const data = matchDoc.data();
  if (data.user1Id === userId) {
    await updateDoc(matchDocRef, { user1Accepted: 'declined' });
  } else if (data.user2Id === userId) {
    await updateDoc(matchDocRef, { user2Accepted: 'declined' });
  }
};

/**
 * Subscribe to match status changes (pending -> active/declined/expired)
 */
export const subscribeToMatch = (
  matchId: string,
  callback: (match: DuoMatch | null) => void
): (() => void) => {
  const matchDocRef = doc(db, 'duoMatches', matchId);
  return onSnapshot(matchDocRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as DuoMatch);
    } else {
      callback(null);
    }
  }, () => {});
};
