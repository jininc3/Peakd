import { db } from '@/config/firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'other';
export type ReportStatus = 'pending' | 'dismissed' | 'actioned';

export interface Report {
  id: string;
  /** Absent on a duo report (`kind: 'duo'`), which is about a player, not a post. */
  postId?: string;
  kind?: 'duo';
  postOwnerId: string;
  postOwnerUsername: string;
  reporterId: string;
  reporterUsername: string;
  reason: ReportReason;
  additionalInfo?: string;
  status: ReportStatus;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
}

/**
 * Report a post
 * 1. Creates a report document in the top-level reports collection
 * 2. Tracks the reported post in the user's reportedPosts subcollection (for feed hiding)
 */
export const reportPost = async (
  reporterId: string,
  reporterUsername: string,
  postId: string,
  postOwnerId: string,
  postOwnerUsername: string,
  reason: ReportReason,
  additionalInfo?: string
): Promise<void> => {
  const now = Timestamp.now();

  // Create report in top-level collection
  const reportRef = doc(collection(db, 'reports'));
  await setDoc(reportRef, {
    postId,
    postOwnerId,
    postOwnerUsername,
    reporterId,
    reporterUsername,
    reason,
    ...(additionalInfo ? { additionalInfo } : {}),
    status: 'pending' as ReportStatus,
    createdAt: now,
  });

  // Track in user's reportedPosts subcollection for feed hiding
  const reportedPostRef = doc(db, `users/${reporterId}/reportedPosts/${postId}`);
  await setDoc(reportedPostRef, {
    postId,
    createdAt: now,
  });
};

/**
 * Report a duo partner — the private route for a bad teammate, since the
 * honour system never shows anything negative. Same `reports` collection as
 * post reports: the reported player rides the postOwner fields so the admin
 * screen names them, and there is no postId because there is no post.
 */
export const reportDuoPartner = async (input: {
  reporterId: string;
  reporterUsername: string;
  reportedUserId: string;
  reportedUsername: string;
  playId?: string;
  reason: ReportReason;
}): Promise<void> => {
  await setDoc(doc(collection(db, 'reports')), {
    kind: 'duo',
    postOwnerId: input.reportedUserId,
    postOwnerUsername: input.reportedUsername,
    reporterId: input.reporterId,
    reporterUsername: input.reporterUsername,
    ...(input.playId ? { playId: input.playId } : {}),
    reason: input.reason,
    status: 'pending' as ReportStatus,
    createdAt: Timestamp.now(),
  });
};

/**
 * Get all post IDs that a user has reported (for feed filtering)
 */
export const getReportedPostIds = async (userId: string): Promise<string[]> => {
  const reportedRef = collection(db, `users/${userId}/reportedPosts`);
  const snapshot = await getDocs(reportedRef);
  return snapshot.docs.map(d => d.id);
};

/**
 * Get all reports, optionally filtered by status (for admin screen)
 */
export const getAllReports = async (status?: ReportStatus): Promise<Report[]> => {
  let q;
  if (status) {
    q = query(
      collection(db, 'reports'),
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    );
  } else {
    q = query(
      collection(db, 'reports'),
      orderBy('createdAt', 'desc')
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data(),
  } as Report));
};

/**
 * Update report status (admin action)
 */
export const updateReportStatus = async (
  reportId: string,
  status: ReportStatus
): Promise<void> => {
  const reportRef = doc(db, 'reports', reportId);
  await updateDoc(reportRef, {
    status,
    reviewedAt: Timestamp.now(),
  });
};

/**
 * Delete a reported post (admin action)
 */
export const deleteReportedPost = async (postId: string): Promise<void> => {
  const postRef = doc(db, 'posts', postId);
  await deleteDoc(postRef);
};
