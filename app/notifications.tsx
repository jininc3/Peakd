import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useState, useEffect, useCallback, useRef } from 'react';
import { SectionList, StyleSheet, TouchableOpacity, View, Image, ActivityIndicator, Animated, Alert } from 'react-native';
import { NotificationSkeleton } from '@/components/ui/Skeleton';
// Long-press to delete replaces swipe-to-delete
import { useRouter } from '@/hooks/useRouter';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, where, Timestamp, getDocs, writeBatch, getDoc, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import PostViewerModal from '@/app/components/postViewerModal';
import ReportPostModal from '@/app/components/reportPostModal';
import { LinearGradient } from 'expo-linear-gradient';
import { acceptFollowRequest, declineFollowRequest } from '@/services/followService';
import { isRemoteAvatar, getDefaultAvatarSource, hasAvatar } from '@/utils/resolveAvatar';
import CachedImage from '@/components/ui/CachedImage';

const GAME_LOGOS: { [key: string]: any } = {
  'Valorant': require('@/assets/images/valorant-red.png'),
  'League of Legends': require('@/assets/images/lol-icon.png'),
  'League': require('@/assets/images/lol-icon.png'),
  'Apex Legends': require('@/assets/images/apex.png'),
};

interface Notification {
  id: string;
  type: 'follow' | 'like' | 'comment' | 'tag' | 'party_invite' | 'party_complete' | 'party_ranking_change' | 'challenge_invite' | 'follow_request';
  status?: 'pending' | 'accepted' | 'declined';
  fromUserId?: string; // Optional for system notifications like party_complete
  fromUsername?: string; // Optional for system notifications like party_complete
  fromUserAvatar?: string;
  postId?: string;
  postThumbnail?: string;
  commentText?: string;
  partyId?: string;
  partyName?: string;
  game?: string;
  winnerUserId?: string;
  winnerUsername?: string;
  isWinner?: boolean;
  finalRank?: number;
  newRank?: number; // For party_ranking_change
  read: boolean;
  createdAt: Timestamp;
}

interface Post {
  id: string;
  userId: string;
  username: string;
  mediaUrl: string;
  mediaUrls?: string[];
  mediaType: 'image' | 'video';
  mediaTypes?: string[];
  thumbnailUrl?: string;
  caption?: string;
  taggedPeople?: string[];
  taggedGame?: string;
  createdAt: Timestamp;
  likes: number;
  commentsCount?: number;
}

// Module-level cache so notifications persist across navigations
let cachedNotifications: Notification[] | null = null;
// Module-level avatar cache so we don't re-fetch on every navigation
const globalAvatarCache: { [userId: string]: string | null } = {};
// Track deleted users globally to avoid re-fetching
const globalDeletedUsers = new Set<string>();

export default function NotificationsScreen() {
  const router = useRouter();
  const { user: currentUser, isUserBlocked, addReportedPost } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>(cachedNotifications || []);
  const [loading, setLoading] = useState(cachedNotifications === null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showPostViewer, setShowPostViewer] = useState(false);
  const [reportingPost, setReportingPost] = useState<Post | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [loadingPost, setLoadingPost] = useState(false);
  const [partyIcons, setPartyIcons] = useState<{ [partyId: string]: string | null }>({});
  // Swipeable refs removed — using long-press to delete

  // Pagination state
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Load and listen to notifications in real-time
  const isFirstLoad = useRef(!cachedNotifications);
  useEffect(() => {
    if (!currentUser?.id) return;

    // Only show loading spinner on first-ever load (no cache)
    if (isFirstLoad.current) {
      setLoading(true);
    }

    // Set up real-time listener for notifications
    const notificationsRef = collection(db, 'users', currentUser.id, 'notifications');
    const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(10));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const notifs: Notification[] = [];

      // Track last document for pagination
      const lastVisible = snapshot.docs[snapshot.docs.length - 1];
      setLastDoc(lastVisible || null);
      setHasMore(snapshot.docs.length === 10);

      // First pass: collect all notifications
      snapshot.forEach((doc) => {
        const data = doc.data();
        notifs.push({
          id: doc.id,
          type: data.type,
          status: data.status,
          fromUserId: data.fromUserId,
          fromUsername: data.fromUsername,
          fromUserAvatar: data.fromUserAvatar || data.fromAvatar,
          postId: data.postId,
          postThumbnail: data.postThumbnail,
          commentText: data.commentText,
          partyId: data.partyId,
          partyName: data.partyName,
          game: data.game,
          read: data.read,
          createdAt: data.createdAt,
        });
      });

      // Second pass: fetch current avatars and filter out notifications from deleted users
      for (const notif of notifs) {
        if (!notif.fromUserId) continue;
        if (globalDeletedUsers.has(notif.fromUserId)) continue;

        // Check global cache first — skip fetch entirely if we already have this user
        if (notif.fromUserId in globalAvatarCache) {
          const cached = globalAvatarCache[notif.fromUserId];
          if (cached) notif.fromUserAvatar = cached;
          continue;
        }

        // Fetch current avatar from user document
        try {
          const userDoc = await getDoc(doc(db, 'users', notif.fromUserId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const currentAvatar = userData.avatar;
            if (currentAvatar) {
              notif.fromUserAvatar = currentAvatar;
            }
            globalAvatarCache[notif.fromUserId] = notif.fromUserAvatar ?? null;
          } else {
            globalDeletedUsers.add(notif.fromUserId);
          }
        } catch (error) {
          console.error('Error fetching user avatar:', error);
        }
      }

      // Filter out notifications from deleted or blocked users
      const filteredNotifs = notifs.filter(
        (notif) => !notif.fromUserId || (!globalDeletedUsers.has(notif.fromUserId) && !isUserBlocked(notif.fromUserId))
      );

      cachedNotifications = filteredNotifs;
      setNotifications(filteredNotifs);
      setLoading(false);
      isFirstLoad.current = false;
    });

    // Clean up old notifications (30 days) on load
    cleanupOldNotifications();

    return () => unsubscribe();
  }, [currentUser?.id]);

  // Fetch party icons for any leaderboard notifications missing them
  useEffect(() => {
    const partyIdsToFetch = Array.from(
      new Set(
        notifications
          .map(n => n.partyId)
          .filter((pid): pid is string => !!pid && partyIcons[pid] === undefined)
      )
    );
    if (partyIdsToFetch.length === 0) return;

    let cancelled = false;
    (async () => {
      const updates: { [k: string]: string | null } = {};
      await Promise.all(
        partyIdsToFetch.map(async (pid) => {
          try {
            const partyDoc = await getDoc(doc(db, 'parties', pid));
            if (partyDoc.exists()) {
              const data = partyDoc.data();
              updates[pid] = data.partyIcon || data.icon || null;
            } else {
              updates[pid] = null;
            }
          } catch {
            updates[pid] = null;
          }
        })
      );
      if (!cancelled && Object.keys(updates).length > 0) {
        setPartyIcons(prev => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notifications, partyIcons]);

  // Mark all notifications as read when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (currentUser?.id) {
        markAllAsRead();
      }
    }, [currentUser?.id])
  );

  // Mark all notifications as read (queries Firestore directly to catch all pages)
  const markAllAsRead = async () => {
    if (!currentUser?.id) return;

    try {
      const notificationsRef = collection(db, 'users', currentUser.id, 'notifications');
      const unreadQuery = query(notificationsRef, where('read', '==', false));
      const unreadSnapshot = await getDocs(unreadQuery);

      if (unreadSnapshot.empty) return;

      const batch = writeBatch(db);
      unreadSnapshot.forEach((docSnap) => {
        batch.update(docSnap.ref, { read: true });
      });

      await batch.commit();
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  // Delete a single notification
  const deleteNotification = async (notificationId: string, event?: any) => {
    if (event) {
      event.stopPropagation();
    }

    if (!currentUser?.id) return;

    try {
      await deleteDoc(doc(db, 'users', currentUser.id, 'notifications', notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  // Clear all notifications
  const clearAllNotifications = async () => {
    if (!currentUser?.id) return;

    try {
      const batch = writeBatch(db);
      notifications.forEach((notification) => {
        const notifRef = doc(db, 'users', currentUser.id, 'notifications', notification.id);
        batch.delete(notifRef);
      });
      await batch.commit();
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  };

  // Clean up notifications older than 30 days
  const cleanupOldNotifications = async () => {
    if (!currentUser?.id) return;

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoffTimestamp = Timestamp.fromDate(thirtyDaysAgo);

      const notificationsRef = collection(db, 'users', currentUser.id, 'notifications');
      const q = query(notificationsRef, where('createdAt', '<', cutoffTimestamp));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) return;

      const batch = writeBatch(db);
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
    }
  };

  // Fetch post data and show post viewer
  const fetchAndShowPost = async (postId: string) => {
    setLoadingPost(true);
    try {
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);

      if (postSnap.exists()) {
        const postData = postSnap.data();
        const post: Post = {
          id: postSnap.id,
          userId: postData.userId,
          username: postData.username,
          mediaUrl: postData.mediaUrl,
          mediaUrls: postData.mediaUrls,
          mediaType: postData.mediaType,
          mediaTypes: postData.mediaTypes,
          thumbnailUrl: postData.thumbnailUrl,
          caption: postData.caption,
          taggedPeople: postData.taggedPeople,
          taggedGame: postData.taggedGame,
          createdAt: postData.createdAt,
          likes: postData.likes || 0,
          commentsCount: postData.commentsCount || 0,
        };
        setSelectedPost(post);
        setShowPostViewer(true);
      }
    } catch (error) {
      console.error('Error fetching post:', error);
    } finally {
      setLoadingPost(false);
    }
  };

  // Accept party invitation
  const [acceptingInvite, setAcceptingInvite] = useState<string | null>(null);

  const handleAcceptInvite = async (notification: Notification, event: any) => {
    event.stopPropagation();
    if (!currentUser?.id || !notification.partyId) return;

    setAcceptingInvite(notification.id);

    try {
      // Get user data for member details first (this should always succeed for own user)
      const userDoc = await getDoc(doc(db, 'users', currentUser.id));
      const userData = userDoc.data();

      // Get party document directly by ID
      const partyRef = doc(db, 'parties', notification.partyId);
      const partySnapshot = await getDoc(partyRef);

      if (!partySnapshot.exists()) {
        Alert.alert('Error', 'This leaderboard no longer exists.');
        await deleteNotification(notification.id);
        setAcceptingInvite(null);
        return;
      }

      const partyData = partySnapshot.data();

      // Check if already a member
      if (partyData.members?.includes(currentUser.id)) {
        Alert.alert('Already Joined', 'You are already a member of this leaderboard.');
        await deleteNotification(notification.id);
        setAcceptingInvite(null);
        return;
      }

      // Update party: add user to members and memberDetails, update pendingInvites
      const updatedMembers = [...(partyData.members || []), currentUser.id];
      const updatedMemberDetails = [
        ...(partyData.memberDetails || []),
        {
          userId: currentUser.id,
          username: userData?.username || 'Unknown',
          avatar: userData?.avatar || '',
          joinedAt: new Date().toISOString(),
        },
      ];

      // Remove user from pendingInvites instead of updating status
      const updatedPendingInvites = (partyData.pendingInvites || []).filter(
        (invite: any) => invite.userId !== currentUser.id
      );

      await updateDoc(partyRef, {
        members: updatedMembers,
        memberDetails: updatedMemberDetails,
        pendingInvites: updatedPendingInvites,
      });

      // Update the notification status to accepted
      await updateDoc(doc(db, 'users', currentUser.id, 'notifications', notification.id), { status: 'accepted' });

      console.log('Successfully joined party:', notification.partyName);

      // Navigate to the appropriate detail page based on party type
      if (partyData.type === 'leaderboard') {
        router.push({
          pathname: '/partyPages/leaderboardDetail',
          params: {
            name: notification.partyName,
            id: notification.partyId,
            game: notification.game,
            members: updatedMembers.length.toString(),
            startDate: partyData.startDate || '',
            endDate: partyData.endDate || '',
          },
        });
      } else {
        // Default to leaderboard detail
        router.push({
          pathname: '/partyPages/leaderboardDetail',
          params: {
            name: notification.partyName,
            id: notification.partyId,
            game: notification.game,
          },
        });
      }
    } catch (error: any) {
      console.error('Error accepting invitation:', error);
      if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
        Alert.alert(
          'Unable to Join',
          'There was a permissions issue joining this leaderboard. The invite may have expired or been revoked.'
        );
      } else {
        Alert.alert('Error', 'Failed to accept invitation. Please try again.');
      }
    } finally {
      setAcceptingInvite(null);
    }
  };

  // Decline party invitation
  const handleDeclineInvite = async (notification: Notification, event: any) => {
    event.stopPropagation();
    if (!currentUser?.id || !notification.partyId) return;

    try {
      // Get party document directly by ID
      const partyRef = doc(db, 'parties', notification.partyId);
      const partySnapshot = await getDoc(partyRef);

      if (partySnapshot.exists()) {
        const partyData = partySnapshot.data();

        // Update invite status to declined in pendingInvites
        const updatedPendingInvites = (partyData.pendingInvites || []).map((invite: any) =>
          invite.userId === currentUser.id ? { ...invite, status: 'declined' } : invite
        );

        await updateDoc(partyRef, {
          pendingInvites: updatedPendingInvites,
        });
      }

      // Update the notification status to declined
      await updateDoc(doc(db, 'users', currentUser.id, 'notifications', notification.id), { status: 'declined' });

      console.log('Declined party invitation:', notification.partyName);
    } catch (error) {
      console.error('Error declining invitation:', error);
    }
  };

  // Accept challenge invite
  const handleAcceptChallenge = async (notification: Notification, event: any) => {
    event.stopPropagation();
    if (!currentUser?.id || !notification.partyId) return;

    setAcceptingInvite(notification.id);
    try {
      const partyRef = doc(db, 'parties', notification.partyId);
      const partySnapshot = await getDoc(partyRef);

      if (!partySnapshot.exists()) {
        Alert.alert('Error', 'This leaderboard no longer exists.');
        await deleteNotification(notification.id);
        setAcceptingInvite(null);
        return;
      }

      const partyData = partySnapshot.data();

      // Update challenge invite status to accepted
      const updatedChallengeInvites = (partyData.challengeInvites || []).map((inv: any) =>
        inv.userId === currentUser.id ? { ...inv, status: 'accepted' } : inv
      );

      // Add to challenge participants
      const updatedParticipants = [...(partyData.challengeParticipants || [])];
      if (!updatedParticipants.includes(currentUser.id)) {
        updatedParticipants.push(currentUser.id);
      }

      await updateDoc(partyRef, {
        challengeInvites: updatedChallengeInvites,
        challengeParticipants: updatedParticipants,
      });

      // Update the notification status to accepted
      await updateDoc(doc(db, 'users', currentUser.id, 'notifications', notification.id), { status: 'accepted' });

      // Navigate to leaderboard detail
      router.push({
        pathname: '/partyPages/leaderboardDetail',
        params: {
          name: notification.partyName,
          id: notification.partyId,
          game: notification.game,
        },
      });
    } catch (error) {
      console.error('Error accepting challenge:', error);
      Alert.alert('Error', 'Failed to accept challenge.');
    } finally {
      setAcceptingInvite(null);
    }
  };

  // Decline challenge invite
  const handleDeclineChallenge = async (notification: Notification, event: any) => {
    event.stopPropagation();
    if (!currentUser?.id || !notification.partyId) return;

    try {
      const partyRef = doc(db, 'parties', notification.partyId);
      const partySnapshot = await getDoc(partyRef);

      if (partySnapshot.exists()) {
        const partyData = partySnapshot.data();

        const updatedChallengeInvites = (partyData.challengeInvites || []).map((inv: any) =>
          inv.userId === currentUser.id ? { ...inv, status: 'rejected' } : inv
        );

        await updateDoc(partyRef, {
          challengeInvites: updatedChallengeInvites,
        });
      }

      // Update the notification status to declined
      await updateDoc(doc(db, 'users', currentUser.id, 'notifications', notification.id), { status: 'declined' });
    } catch (error) {
      console.error('Error declining challenge:', error);
    }
  };

  // Accept follow request
  const handleAcceptFollowRequest = async (notification: Notification, event: any) => {
    event.stopPropagation();
    if (!currentUser?.id || !notification.fromUserId) return;
    setAcceptingInvite(notification.id);

    try {
      const requestDoc = await getDoc(doc(db, 'users', currentUser.id, 'followRequests', notification.fromUserId));
      if (!requestDoc.exists()) {
        Alert.alert('Error', 'This follow request no longer exists.');
        await deleteNotification(notification.id);
        setAcceptingInvite(null);
        return;
      }
      const requestData = requestDoc.data();

      await acceptFollowRequest(
        currentUser.id,
        currentUser.username || '',
        currentUser.avatar,
        notification.fromUserId,
        requestData.requesterUsername,
        requestData.requesterAvatar,
      );

      // Update the notification status to accepted
      await updateDoc(doc(db, 'users', currentUser.id, 'notifications', notification.id), { status: 'accepted' });
    } catch (error) {
      console.error('Error accepting follow request:', error);
      Alert.alert('Error', 'Failed to accept follow request.');
    } finally {
      setAcceptingInvite(null);
    }
  };

  // Decline follow request
  const handleDeclineFollowRequest = async (notification: Notification, event: any) => {
    event.stopPropagation();
    if (!currentUser?.id || !notification.fromUserId) return;

    try {
      await declineFollowRequest(currentUser.id, notification.fromUserId);

      // Update the notification status to declined
      await updateDoc(doc(db, 'users', currentUser.id, 'notifications', notification.id), { status: 'declined' });
    } catch (error) {
      console.error('Error declining follow request:', error);
    }
  };

  // Navigate to user profile
  const handleUserPress = (userId: string, event: any, username?: string, avatar?: string) => {
    event.stopPropagation();
    router.push({
      pathname: '/profilePages/profileView',
      params: { userId, username: username || '', avatar: avatar || '' },
    });
  };

  // Navigate to appropriate page based on notification type
  const handleNotificationPress = async (notification: Notification) => {
    if (notification.type === 'follow_request') {
      if (notification.status === 'accepted' && notification.fromUserId) {
        router.push({
          pathname: '/profilePages/profileView',
          params: { userId: notification.fromUserId, username: notification.fromUsername || '', avatar: notification.fromUserAvatar || '' },
        });
      }
      // No navigation for pending/declined — accept/decline on notifications page
    } else if (notification.type === 'follow' && notification.fromUserId) {
      // Navigate to user profile for follow notifications
      router.push({
        pathname: '/profilePages/profileView',
        params: { userId: notification.fromUserId, username: notification.fromUsername || '', avatar: notification.fromUserAvatar || '' },
      });
    } else if ((notification.type === 'like' || notification.type === 'comment' || notification.type === 'tag') && notification.postId) {
      // Show post viewer for like/comment/tag notifications
      fetchAndShowPost(notification.postId);
    } else if (notification.type === 'challenge_invite' && notification.partyId) {
      // Navigate to challenge detail page
      router.push({
        pathname: '/partyPages/challengeDetail',
        params: {
          id: notification.partyId,
          game: notification.game || '',
        },
      });
    } else if (notification.type === 'party_invite' && notification.partyId) {
      if (notification.status === 'accepted') {
        router.push({
          pathname: '/partyPages/leaderboardDetail',
          params: {
            id: notification.partyId,
            name: notification.partyName || 'Leaderboard',
            game: notification.game || '',
          },
        });
      }
      // No navigation for pending/declined — accept/decline on notifications page
    } else if ((notification.type === 'party_complete' || notification.type === 'party_ranking_change') && notification.partyId) {
      // Navigate to leaderboard detail
      router.push({
        pathname: '/partyPages/leaderboardDetail',
        params: {
          id: notification.partyId,
          name: notification.partyName || 'Leaderboard',
          game: notification.game || '',
        },
      });
    }
  };

  // Format time ago
  const getTimeAgo = (timestamp: Timestamp): string => {
    const now = new Date();
    const notificationDate = timestamp.toDate();
    const diffInSeconds = Math.floor((now.getTime() - notificationDate.getTime()) / 1000);

    const THIRTY_DAYS = 30 * 86400;
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < THIRTY_DAYS) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = notificationDate.getDate();
    const month = months[notificationDate.getMonth()];
    const year = String(notificationDate.getFullYear()).slice(-2);
    return `${day}${month}${year}`;
  };

  // Close any previously open swipeable when a new one opens
  const handleLongPress = (notificationId: string) => {
    Alert.alert('Delete Notification', 'Do you want to delete this notification?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteNotification(notificationId) },
    ]);
  };

  // Load older notifications when scrolling
  const loadOlderNotifications = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDoc || !currentUser?.id) return;

    setLoadingMore(true);
    try {
      const notificationsRef = collection(db, 'users', currentUser.id, 'notifications');
      const q = query(
        notificationsRef,
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(10)
      );
      const querySnapshot = await getDocs(q);

      const newNotifs: Notification[] = [];

      // Collect new notifications
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        newNotifs.push({
          id: doc.id,
          type: data.type,
          status: data.status,
          fromUserId: data.fromUserId,
          fromUsername: data.fromUsername,
          fromUserAvatar: data.fromUserAvatar || data.fromAvatar,
          postId: data.postId,
          postThumbnail: data.postThumbnail,
          commentText: data.commentText,
          partyId: data.partyId,
          partyName: data.partyName,
          game: data.game,
          read: data.read,
          createdAt: data.createdAt,
        });
      });

      // Fetch current avatars and filter out notifications from deleted users
      for (const notif of newNotifs) {
        if (!notif.fromUserId) continue;
        if (globalDeletedUsers.has(notif.fromUserId)) continue;

        // Check global cache first
        if (notif.fromUserId in globalAvatarCache) {
          const cached = globalAvatarCache[notif.fromUserId];
          if (cached) notif.fromUserAvatar = cached;
          continue;
        }

        try {
          const userDoc = await getDoc(doc(db, 'users', notif.fromUserId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const currentAvatar = userData.avatar;
            if (currentAvatar) {
              notif.fromUserAvatar = currentAvatar;
            }
            globalAvatarCache[notif.fromUserId] = notif.fromUserAvatar ?? null;
          } else {
            globalDeletedUsers.add(notif.fromUserId);
          }
        } catch (error) {
          console.error('Error fetching user avatar:', error);
        }
      }

      // Filter out notifications from deleted users
      const filteredNewNotifs = newNotifs.filter(
        (notif) => !notif.fromUserId || !globalDeletedUsers.has(notif.fromUserId)
      );

      // Append new notifications and filter out duplicates
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const uniqueNewNotifs = filteredNewNotifs.filter(n => !existingIds.has(n.id));
        const updated = [...prev, ...uniqueNewNotifs];
        cachedNotifications = updated;
        return updated;
      });

      // Update pagination state
      const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
      setLastDoc(lastVisible || null);
      setHasMore(querySnapshot.docs.length === 10);
    } catch (error) {
      console.error('Error loading older notifications:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, lastDoc, currentUser?.id]);


  // Group notifications into sections by time period
  const getNotificationSections = () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of this week (Sunday)
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const today: Notification[] = [];
    const thisWeek: Notification[] = [];
    const lastWeek: Notification[] = [];
    const earlier: Notification[] = [];

    notifications.forEach((notif) => {
      const notifDate = notif.createdAt.toDate();
      if (notifDate >= todayStart) {
        today.push(notif);
      } else if (notifDate >= weekStart) {
        thisWeek.push(notif);
      } else if (notifDate >= lastWeekStart) {
        lastWeek.push(notif);
      } else {
        earlier.push(notif);
      }
    });

    const sections: { title: string; data: Notification[] }[] = [];
    if (today.length > 0) sections.push({ title: 'Today', data: today });
    if (thisWeek.length > 0) sections.push({ title: 'This Week', data: thisWeek });
    if (lastWeek.length > 0) sections.push({ title: 'Last Week', data: lastWeek });
    if (earlier.length > 0) sections.push({ title: 'Earlier', data: earlier });

    return sections;
  };

  return (
    <ThemedView style={styles.container}>
      {/* Purple shimmer background */}
      <View style={styles.backgroundGlow} pointerEvents="none">
        <View style={styles.shimmerBand} pointerEvents="none">
          <LinearGradient
            colors={[
              'transparent',
              'rgba(139, 127, 232, 0.03)',
              'rgba(139, 127, 232, 0.06)',
              'rgba(139, 127, 232, 0.03)',
              'transparent',
            ]}
            locations={[0, 0.37, 0.5, 0.63, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <IconSymbol size={20} name="chevron.left" color="#fff" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle} numberOfLines={1}>Notifications</ThemedText>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={clearAllNotifications}>
            <ThemedText style={styles.clearAllButton}>Clear All</ThemedText>
          </TouchableOpacity>
        )}
        {notifications.length === 0 && <View style={styles.headerSpacer} />}
      </View>

      <SectionList
        sections={getNotificationSections()}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        onEndReached={loadOlderNotifications}
        onEndReachedThreshold={0.5}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={loading ? (
          <NotificationSkeleton count={8} />
        ) : null}
        ListFooterComponent={loadingMore ? (
          <View style={styles.loadingMoreContainer}>
            <ActivityIndicator size="small" color="#c42743" />
            <ThemedText style={styles.loadingMoreText}>Loading more...</ThemedText>
          </View>
        ) : null}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyState}>
            <IconSymbol size={64} name="bell" color="#72767d" />
            <ThemedText style={styles.emptyText}>No notifications yet</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              When someone follows you, you'll see it here
            </ThemedText>
          </View>
        ) : null}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionHeaderText}>{title}</ThemedText>
          </View>
        )}
        renderItem={({ item: notification }) => (
                <TouchableOpacity
                  style={[
                    styles.notificationCard,
                    !notification.read && styles.unreadNotification,
                    (notification.type === 'party_invite' || notification.type === 'challenge_invite' || notification.type === 'follow_request') && !notification.status && styles.inviteCard,
                  ]}
                  onPress={() => handleNotificationPress(notification)}
                  onLongPress={() => handleLongPress(notification.id)}
                  activeOpacity={0.7}
                  delayLongPress={400}
                >
                  <View style={styles.notificationLeft}>
                    {/* Avatar */}
                    {notification.fromUserId ? (
                      <TouchableOpacity
                        style={styles.avatar}
                        onPress={(e) => handleUserPress(notification.fromUserId, e, notification.fromUsername, notification.fromUserAvatar)}
                        activeOpacity={0.7}
                      >
                        {isRemoteAvatar(notification.fromUserAvatar) ? (
                          <CachedImage uri={notification.fromUserAvatar!} style={styles.avatarImage} />
                        ) : getDefaultAvatarSource(notification.fromUserAvatar) ? (
                          <Image source={getDefaultAvatarSource(notification.fromUserAvatar)!} style={styles.avatarImage} />
                        ) : (
                          <ThemedText style={styles.avatarInitial}>
                            {notification.fromUsername?.[0]?.toUpperCase() || '?'}
                          </ThemedText>
                        )}
                      </TouchableOpacity>
                    ) : notification.partyId && partyIcons[notification.partyId] ? (
                      <View style={styles.avatar}>
                        <CachedImage
                          uri={partyIcons[notification.partyId] as string}
                          style={styles.avatarImage}
                        />
                      </View>
                    ) : (
                      <View style={styles.avatar}>
                        <IconSymbol size={18} name="trophy.fill" color="#A08845" />
                      </View>
                    )}

                    {/* Notification content */}
                    <View style={styles.notificationContent}>
                      <View style={styles.notificationTextRow}>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.notificationText}>
                            {notification.fromUsername && notification.fromUserId ? (
                              <ThemedText
                                style={styles.usernameText}
                                onPress={(e) => handleUserPress(notification.fromUserId, e, notification.fromUsername, notification.fromUserAvatar)}
                              >
                                {notification.fromUsername}
                              </ThemedText>
                            ) : null}
                            {notification.type === 'follow' && ' started following you'}
                            {notification.type === 'like' && ' liked your post'}
                            {notification.type === 'tag' && ' tagged you in a post'}
                            {notification.type === 'comment' && ' commented: '}
                            {notification.type === 'party_invite' && (
                              notification.status === 'accepted'
                                ? <>{' '}Joined <ThemedText style={styles.leaderboardNameText}>{notification.partyName || 'Leaderboard'}</ThemedText></>
                                : notification.status === 'declined'
                                  ? <>{' '}Declined <ThemedText style={styles.leaderboardNameText}>{notification.partyName || 'Leaderboard'}</ThemedText></>
                                  : ' invited you to join'
                            )}
                            {notification.type === 'challenge_invite' && (
                              notification.status === 'accepted'
                                ? <>{' '}Joined <ThemedText style={styles.leaderboardNameText}>{notification.partyName || 'Challenge'}</ThemedText></>
                                : notification.status === 'declined'
                                  ? <>{' '}Declined <ThemedText style={styles.leaderboardNameText}>{notification.partyName || 'Challenge'}</ThemedText></>
                                  : ' challenged you'
                            )}
                            {notification.type === 'follow_request' && (
                              notification.status === 'accepted'
                                ? ' is now following you'
                                : notification.status === 'declined'
                                  ? ' follow request declined'
                                  : ' wants to follow you'
                            )}
                            {notification.type === 'party_complete' && (
                              <>
                                <ThemedText style={styles.leaderboardNameText}>
                                  {(notification.partyName || '').toUpperCase()}
                                </ThemedText>
                                {notification.isWinner
                                  ? ` ended. You won! Finished #${notification.finalRank}`
                                  : ` ended. You finished #${notification.finalRank}`}
                              </>
                            )}
                            {notification.type === 'party_ranking_change' && notification.fromUsername && (
                              <>
                                {' moved to '}
                                <ThemedText style={styles.rankText}>
                                  #{notification.newRank}
                                </ThemedText>
                                {' in '}
                                <ThemedText style={styles.leaderboardNameText}>
                                  {(notification.partyName || '').toUpperCase()}
                                </ThemedText>
                              </>
                            )}
                            {notification.type === 'comment' && notification.commentText && (
                              <ThemedText style={styles.commentPreview}>
                                "{notification.commentText.length > 30
                                  ? notification.commentText.substring(0, 30) + '...'
                                  : notification.commentText}"
                              </ThemedText>
                            )}
                          </ThemedText>
                        </View>
                      </View>

                      {notification.type === 'follow_request' ? (
                        notification.status ? (
                          <View style={styles.bottomRow}>
                            <ThemedText style={styles.timeText}>{getTimeAgo(notification.createdAt)}</ThemedText>
                          </View>
                        ) : (
                          <>
                            {/* Follow request — accept/decline only, no preview card */}
                            <View style={styles.inviteActionRow}>
                              <TouchableOpacity
                                style={[styles.partyInviteAcceptBtn, acceptingInvite === notification.id && styles.acceptButtonLoading]}
                                onPress={(e) => handleAcceptFollowRequest(notification, e)}
                                activeOpacity={0.7}
                                disabled={acceptingInvite === notification.id}
                              >
                                {acceptingInvite === notification.id ? (
                                  <ActivityIndicator size="small" color="#0f0f0f" />
                                ) : (
                                  <ThemedText style={styles.partyInviteAcceptText}>Accept</ThemedText>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.partyInviteDeclineBtn, acceptingInvite === notification.id && { opacity: 0.5 }]}
                                onPress={(e) => handleDeclineFollowRequest(notification, e)}
                                activeOpacity={0.7}
                                disabled={acceptingInvite === notification.id}
                              >
                                <ThemedText style={styles.partyInviteDeclineText}>Decline</ThemedText>
                              </TouchableOpacity>
                              <ThemedText style={styles.inviteTimeText}>{getTimeAgo(notification.createdAt)}</ThemedText>
                            </View>
                          </>
                        )
                      ) : (notification.type === 'party_invite' || notification.type === 'challenge_invite') ? (
                        notification.status ? (
                          <View style={styles.bottomRow}>
                            <ThemedText style={styles.timeText}>{getTimeAgo(notification.createdAt)}</ThemedText>
                          </View>
                        ) : (
                          <>
                            {/* Leaderboard preview card */}
                            <View style={styles.invitePreviewCard}>
                              {notification.partyId && partyIcons[notification.partyId] ? (
                                <CachedImage uri={partyIcons[notification.partyId] as string} style={styles.invitePreviewIconImage} />
                              ) : GAME_LOGOS[notification.game || ''] ? (
                                <Image source={GAME_LOGOS[notification.game || '']} style={styles.invitePreviewIconImage} resizeMode="contain" />
                              ) : (
                                <View style={styles.invitePreviewIconFallback}>
                                  <IconSymbol size={16} name="trophy.fill" color="#A08845" />
                                </View>
                              )}
                              <View style={styles.invitePreviewInfo}>
                                <ThemedText style={styles.invitePreviewName} numberOfLines={1}>
                                  {notification.partyName || 'Leaderboard'}
                                </ThemedText>
                                {notification.game && (
                                  <ThemedText style={styles.invitePreviewGame}>{notification.game}</ThemedText>
                                )}
                              </View>
                              {notification.type !== 'party_invite' && (
                                <IconSymbol size={12} name="chevron.right" color="#444" />
                              )}
                            </View>

                            {/* Action row */}
                            <View style={styles.inviteActionRow}>
                              <TouchableOpacity
                                style={[
                                  notification.type === 'party_invite' ? styles.partyInviteAcceptBtn : styles.inviteAcceptBtn,
                                  acceptingInvite === notification.id && styles.acceptButtonLoading,
                                ]}
                                onPress={(e) => notification.type === 'party_invite' ? handleAcceptInvite(notification, e) : handleAcceptChallenge(notification, e)}
                                activeOpacity={0.7}
                                disabled={acceptingInvite === notification.id}
                              >
                                {acceptingInvite === notification.id ? (
                                  <ActivityIndicator size="small" color={notification.type === 'party_invite' ? '#0f0f0f' : '#fff'} />
                                ) : (
                                  <ThemedText style={notification.type === 'party_invite' ? styles.partyInviteAcceptText : styles.inviteAcceptText}>Accept</ThemedText>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  notification.type === 'party_invite' ? styles.partyInviteDeclineBtn : styles.inviteDeclineBtn,
                                  acceptingInvite === notification.id && { opacity: 0.5 },
                                ]}
                                onPress={(e) => notification.type === 'party_invite' ? handleDeclineInvite(notification, e) : handleDeclineChallenge(notification, e)}
                                activeOpacity={0.7}
                                disabled={acceptingInvite === notification.id}
                              >
                                <ThemedText style={notification.type === 'party_invite' ? styles.partyInviteDeclineText : styles.inviteDeclineText}>Decline</ThemedText>
                              </TouchableOpacity>
                              <ThemedText style={styles.inviteTimeText}>{getTimeAgo(notification.createdAt)}</ThemedText>
                            </View>
                          </>
                        )
                      ) : (
                        <View style={styles.bottomRow}>
                          <ThemedText style={styles.timeText}>{getTimeAgo(notification.createdAt)}</ThemedText>
                        </View>
                      )}
                    </View>

                    {/* Post thumbnail for like/comment/tag notifications */}
                    {(notification.type === 'like' || notification.type === 'comment' || notification.type === 'tag') && notification.postThumbnail && (
                      <CachedImage uri={notification.postThumbnail!} style={styles.postThumbnail} />
                    )}
                  </View>

                  {/* Unread indicator */}
                  {!notification.read && <View style={styles.unreadDot} />}
                </TouchableOpacity>
        )}
      />

      {/* Post Viewer Modal */}
      {selectedPost && (
        <PostViewerModal
          visible={showPostViewer}
          post={selectedPost}
          posts={[selectedPost]}
          currentIndex={0}
          userAvatar={currentUser?.avatar}
          onClose={() => {
            setShowPostViewer(false);
            setSelectedPost(null);
          }}
          onCommentAdded={() => {}}
          onReport={(post) => {
            setReportingPost(post);
            setShowReportModal(true);
          }}
        />
      )}

      {/* Report Post Modal */}
      {reportingPost && (
        <ReportPostModal
          visible={showReportModal}
          postId={reportingPost.id}
          postOwnerId={reportingPost.userId}
          postOwnerUsername={reportingPost.username}
          onClose={() => {
            setShowReportModal(false);
            setReportingPost(null);
          }}
          onReported={(postId) => {
            addReportedPost(postId);
            setShowPostViewer(false);
            setSelectedPost(null);
          }}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  backgroundGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  shimmerBand: {
    position: 'absolute',
    top: -200,
    left: -300,
    width: 800,
    height: 600,
    transform: [{ rotate: '20deg' }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flexShrink: 1,
  },
  headerSpacer: {
    width: 60,
  },
  clearAllButton: {
    fontSize: 13,
    fontWeight: '500',
    color: '#555',
  },
  deleteButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    borderRadius: 12,
    position: 'relative',
  },
  unreadNotification: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  notificationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#36393e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  notificationContent: {
    flex: 1,
  },
  notificationText: {
    fontSize: 13,
    color: '#b9bbbe',
    lineHeight: 18,
    marginBottom: 2,
  },
  usernameText: {
    fontWeight: '700',
    color: '#fff',
    fontSize: 13,
  },
  timeText: {
    fontSize: 11,
    color: '#72767d',
  },
  unreadDot: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#c42743',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#b9bbbe',
    textAlign: 'center',
    lineHeight: 20,
  },
  postThumbnail: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#36393e',
    marginLeft: 6,
  },
  commentPreview: {
    fontStyle: 'italic',
    color: '#b9bbbe',
  },
  winnerText: {
    color: '#FFD700',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
  },
  rankText: {
    color: '#FFD700',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
  },
  notificationTextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  partyGameText: {
    fontSize: 11,
    color: '#b9bbbe',
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inviteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  declineButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#36393e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: '#A08845',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 65,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonLoading: {
    opacity: 0.7,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  inviteCard: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderTopColor: 'rgba(255,255,255,0.09)',
    marginHorizontal: 12,
    marginVertical: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  invitePreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131313',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  invitePreviewIconImage: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
  },
  invitePreviewIconFallback: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitePreviewInfo: {
    flex: 1,
    gap: 2,
  },
  invitePreviewName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  invitePreviewGame: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  inviteActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  inviteAcceptBtn: {
    flex: 1,
    backgroundColor: '#A08845',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteAcceptText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  inviteDeclineBtn: {
    flex: 1,
    backgroundColor: '#2b2d31',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteDeclineText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
  },
  partyInviteAcceptBtn: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyInviteAcceptText: {
    color: '#0f0f0f',
    fontSize: 13,
    fontWeight: '700',
  },
  partyInviteDeclineBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  partyInviteDeclineText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  inviteTimeText: {
    fontSize: 11,
    color: '#72767d',
    marginLeft: 4,
  },
  leaderboardNameText: {
    fontWeight: '700',
    color: '#A08845',
    fontSize: 13,
    lineHeight: 18,
  },
  rankingChangeText: {
    color: '#b9bbbe',
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  loadingMoreContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 13,
    color: '#72767d',
  },
});
