import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedSkeleton } from '@/components/ui/Skeleton';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getFollowing } from '@/services/followService';
import { likePost, unlikePost, isPostLiked } from '@/services/likeService';
import { subscribeToUserChats } from '@/services/chatService';
import CommentModal from '@/app/components/commentModal';
import ReportPostModal from '@/app/components/reportPostModal';
import PostContent from '@/app/components/postContent';
import PostDuoCard from '@/app/components/postDuoCard';
import { DuoCardData } from '@/app/(tabs)/duoFinder';
import { collection, getDocs, orderBy, query, Timestamp, where, onSnapshot, limit, startAfter, QueryDocumentSnapshot, DocumentData, doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Image, ScrollView, StyleSheet, TouchableOpacity, View, Alert, RefreshControl, Modal, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from '@/hooks/useRouter';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FOR_YOU_CACHE_KEY = 'cached_for_you_posts';

const { width, height: screenHeight } = Dimensions.get('window');

// Grid background matching web app (64px, 2.5% white lines, fades from top)
const GRID_SIZE = 40;



// Scale-down press wrapper for tactile button feel
const ScalePress = ({ onPress, style, children, disabled, activeOpacity, hitSlop }: {
  onPress?: () => void;
  style?: any;
  children: React.ReactNode;
  disabled?: boolean;
  activeOpacity?: number;
  hitSlop?: any;
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  };
  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      activeOpacity={activeOpacity ?? 1}
      hitSlop={hitSlop}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

// Format timestamp for comments
const formatTimeAgo = (timestamp: any): string => {
  const now = new Date();
  const date = timestamp.toDate();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  const diffInDays = Math.floor(diffInSeconds / 86400);

  // Within the last minute
  if (diffInSeconds < 60) {
    return 'now';
  }

  // Check if it's today (same calendar day)
  const isToday = date.getDate() === now.getDate() &&
                  date.getMonth() === now.getMonth() &&
                  date.getFullYear() === now.getFullYear();

  if (isToday) {
    // Show time for today's posts
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // Within a week (1-7 days ago)
  if (diffInDays < 7) {
    return diffInDays === 1 ? '1 day ago' : `${diffInDays} days ago`;
  }

  // More than a week ago - show date
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();
  const currentYear = now.getFullYear();

  if (year === currentYear) {
    return `${day} ${month}`;
  } else {
    const shortYear = year.toString().slice(-2);
    return `${day} ${month} ${shortYear}`;
  }
};

interface Post {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  thumbnailUrl?: string;
  caption?: string;
  taggedGame?: string;
  createdAt: Timestamp;
  likes: number;
  commentsCount?: number;
  leagueRank?: string;
  valorantRank?: string;
  showRankOnPosts?: boolean;
  categories?: string[];
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // FAB hover animation
  const fabY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabY, { toValue: -4, duration: 1500, useNativeDriver: true }),
        Animated.timing(fabY, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const {
    user: currentUser,
    preloadedPosts,
    preloadedForYouPosts,
    preloadedFollowingIds,
    clearPreloadedPosts,
    clearPreloadedForYouPosts,
    newlyFollowedUserPosts,
    newlyFollowedUserId,
    clearNewlyFollowedUserPosts,
    newlyUnfollowedUserId,
    clearNewlyUnfollowedUserId,
    isUserBlocked,
    isPostReported,
    addReportedPost,
    markFeedReady,
  } = useAuth();
  const [activeTab, setActiveTab] = useState<'forYou' | 'following'>('forYou');
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [forYouPosts, setForYouPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingUserIds, setFollowingUserIds] = useState<string[]>([]);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const postRefs = useRef<{ [key: string]: View | null }>({});
  const videoPlayers = useRef<{ [key: string]: any }>({});
  const scrollViewRef = useRef<ScrollView>(null);
  const lastNavTime = useRef(0);
  const [selectedGameFilter, setSelectedGameFilter] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [likingInProgress, setLikingInProgress] = useState<Set<string>>(new Set());
  const [commentingPost, setCommentingPost] = useState<Post | null>(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [reportingPost, setReportingPost] = useState<Post | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasConsumedPreload, setHasConsumedPreload] = useState(false);

  // For You pagination state
  const [forYouLastDoc, setForYouLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [forYouHasMore, setForYouHasMore] = useState(true);
  const [forYouLoadingMore, setForYouLoadingMore] = useState(false);
  const [forYouLoading, setForYouLoading] = useState(false);
  const [forYouFetched, setForYouFetched] = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);
  const [showNewClip, setShowNewClip] = useState(false);
  const [showTabDropdown, setShowTabDropdown] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const newestPostTimestampRef = useRef<Timestamp | null>(null);
  const newPostsUnsubRef = useRef<(() => void) | null>(null);

  // Track the last game filter used for For You fetches to avoid infinite re-fetch loops
  const prevForYouFilterRef = useRef<string | null | undefined>(undefined);

  // Cache posts per game filter for instant tab switching
  const forYouCacheRef = useRef<Record<string, Post[]>>({});
  const followingCacheRef = useRef<Record<string, Post[]>>({});
  const prevFollowingFilterRef = useRef<string | null | undefined>(undefined);

  // Duo card state for posting
  const [valorantCard, setValorantCard] = useState<DuoCardData | null>(null);
  const [leagueCard, setLeagueCard] = useState<DuoCardData | null>(null);
  const [valorantInGameIcon, setValorantInGameIcon] = useState<string | undefined>(undefined);
  const [valorantInGameName, setValorantInGameName] = useState<string | undefined>(undefined);
  const [valorantWinRate, setValorantWinRate] = useState<number | undefined>(undefined);
  const [leagueInGameIcon, setLeagueInGameIcon] = useState<string | undefined>(undefined);
  const [leagueInGameName, setLeagueInGameName] = useState<string | undefined>(undefined);
  const [leagueWinRate, setLeagueWinRate] = useState<number | undefined>(undefined);
  const [valorantGamesPlayed, setValorantGamesPlayed] = useState<number | undefined>(undefined);
  const [leagueGamesPlayed, setLeagueGamesPlayed] = useState<number | undefined>(undefined);

  const currentPosts = activeTab === 'forYou' ? forYouPosts : followingPosts;

  const POSTS_PER_PAGE = 8;

  // Signal to loading screen that the feed is ready to display
  const feedReadySignaled = useRef(false);
  useEffect(() => {
    if (feedReadySignaled.current) return;
    const followingReady = activeTab === 'following' && !loading;
    const forYouReady = activeTab === 'forYou' && forYouFetched;
    if (followingReady || forYouReady) {
      feedReadySignaled.current = true;
      markFeedReady();
    }
  }, [activeTab, loading, forYouFetched, markFeedReady]);

  // Callback to register video players
  const handlePlayerReady = useCallback((postId: string, player: any) => {
    videoPlayers.current[postId] = player;
  }, []);


  // Reset feed state when user changes (e.g. sign out → sign in with different account)
  const prevUserIdRef = useRef<string | undefined>(currentUser?.id);
  useEffect(() => {
    if (currentUser?.id && currentUser.id !== prevUserIdRef.current) {
      setFollowingPosts([]);
      setForYouPosts([]);
      setFollowingUserIds([]);
      setLikedPosts(new Set());
      setLastDoc(null);
      setHasMore(true);
      setHasConsumedPreload(false);
      setLoading(true);
      setSelectedGameFilter(null);
      setForYouLastDoc(null);
      setForYouHasMore(true);
      setForYouFetched(false);
      setForYouLoading(false);
      forYouCacheRef.current = {};
      prevForYouFilterRef.current = undefined;
      followingCacheRef.current = {};
      prevFollowingFilterRef.current = undefined;
    }
    prevUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);

  // Listen for unread notifications count in real-time
  useEffect(() => {
    if (!currentUser?.id) return;

    const notificationsRef = collection(db, 'users', currentUser.id, 'notifications');
    const q = query(notificationsRef, where('read', '==', false));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadNotificationCount(snapshot.size);
    }, () => {});

    return () => unsubscribe();
  }, [currentUser?.id]);

  // Listen for unread messages count in real-time
  useEffect(() => {
    if (!currentUser?.id) return;

    const unsubscribe = subscribeToUserChats(currentUser.id, (chats) => {
      const total = chats.reduce((sum, chat) => {
        return sum + (chat.unreadCount?.[currentUser.id] || 0);
      }, 0);
      setUnreadMessageCount(total);
    });

    return () => unsubscribe();
  }, [currentUser?.id]);

  // Use preloaded following IDs if available, otherwise fetch
  useEffect(() => {
    if (preloadedFollowingIds) {
      setFollowingUserIds(preloadedFollowingIds.filter(id => !isUserBlocked(id)));
      return;
    }

    const fetchFollowingUsers = async () => {
      if (!currentUser?.id) return;

      try {
        const followingData = await getFollowing(currentUser.id);
        let userIds = followingData.map(follow => follow.followingId);
        userIds = userIds.filter(id => id !== currentUser.id && !isUserBlocked(id));
        setFollowingUserIds(userIds);
      } catch (error) {
        console.error('Error fetching following:', error);
      }
    };

    fetchFollowingUsers();
  }, [currentUser?.id, preloadedFollowingIds]);

  // Consume preloaded posts from AuthContext (already enriched with rank data)
  useEffect(() => {
    if (preloadedPosts) {
      const filtered = preloadedPosts.filter(p => !isUserBlocked(p.userId) && !isPostReported(p.id));
      setFollowingPosts(filtered);
      followingCacheRef.current['_all'] = filtered;
      setLoading(false);
      if (!hasConsumedPreload) {
        setHasConsumedPreload(true);
      }
      clearPreloadedPosts();
    }
  }, [preloadedPosts, clearPreloadedPosts]);

  // Consume preloaded For You posts from AuthContext cache
  const forYouNeedsBackgroundRefresh = useRef(false);
  useEffect(() => {
    if (preloadedForYouPosts && !forYouFetched) {
      const filtered = preloadedForYouPosts.filter(p => !isUserBlocked(p.userId) && !isPostReported(p.id));
      setForYouPosts(filtered);
      forYouCacheRef.current['_all'] = filtered;
      setForYouFetched(true);
      setForYouLoading(false);
      clearPreloadedForYouPosts();
      forYouNeedsBackgroundRefresh.current = true;
    }
  }, [preloadedForYouPosts, forYouFetched, clearPreloadedForYouPosts]);

  // Track the newest post timestamp whenever followingPosts changes
  useEffect(() => {
    if (followingPosts.length > 0) {
      const newest = followingPosts[0]?.createdAt;
      if (newest && (!newestPostTimestampRef.current || newest.toMillis() > newestPostTimestampRef.current.toMillis())) {
        newestPostTimestampRef.current = newest;
      }
    }
  }, [followingPosts]);

  // Lightweight listener for new posts from followed users
  useEffect(() => {
    if (!currentUser?.id || followingUserIds.length === 0) return;

    // Clean up previous listener
    if (newPostsUnsubRef.current) {
      newPostsUnsubRef.current();
      newPostsUnsubRef.current = null;
    }

    // Only listen to a small batch (Firestore 'in' limit is 30)
    const listenIds = followingUserIds.slice(0, 30);

    // Start listening from now (or the newest post we have)
    const since = newestPostTimestampRef.current || Timestamp.now();

    const q = query(
      collection(db, 'posts'),
      where('userId', 'in', listenIds),
      where('createdAt', '>', since),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const newPost = snapshot.docs[0].data();
        // Don't show banner for own posts
        if (newPost.userId !== currentUser?.id) {
          setHasNewPosts(true);
        }
      }
    }, () => {});

    newPostsUnsubRef.current = unsubscribe;

    return () => {
      if (newPostsUnsubRef.current) {
        newPostsUnsubRef.current();
        newPostsUnsubRef.current = null;
      }
    };
  }, [currentUser?.id, followingUserIds]);

  // Smart merge logic for newly followed user posts
  useEffect(() => {
    const enrichAndMergeNewPosts = async () => {
      if (!newlyFollowedUserPosts || !newlyFollowedUserId) return;

      console.log(`✅ Merging ${newlyFollowedUserPosts.length} posts from newly followed user:`, newlyFollowedUserId);

      // Enrich newly followed user posts with rank data
      const enrichedNewPosts = await Promise.all(
        newlyFollowedUserPosts.map(async (post) => {
          try {
            const userQuery = query(
              collection(db, 'users'),
              where('__name__', '==', post.userId)
            );
            const userSnapshot = await getDocs(userQuery);

            if (!userSnapshot.empty) {
              const userData = userSnapshot.docs[0].data();

              let leagueRank = undefined;
              let valorantRank = undefined;

              if (userData.riotStats?.rankedSolo) {
                leagueRank = `${userData.riotStats.rankedSolo.tier} ${userData.riotStats.rankedSolo.rank}`;
              }
              if (userData.valorantStats?.currentRank) {
                valorantRank = userData.valorantStats.currentRank;
              }

              return {
                ...post,
                avatar: userData.avatar || post.avatar || null,
                leagueRank,
                valorantRank,
                showRankOnPosts: userData.showRankOnPosts ?? false,
              };
            }
          } catch (error) {
            console.error(`Error enriching newly followed post ${post.id}:`, error);
          }

          return post;
        })
      );

      // Only merge if we're on the following tab
      if (activeTab === 'following') {
        setFollowingPosts(currentPosts => {
          // Combine new posts with existing posts
          const combined = [...currentPosts, ...enrichedNewPosts];

        // Remove duplicates by ID
        const uniqueMap = new Map();
        combined.forEach(post => {
          if (!uniqueMap.has(post.id)) {
            uniqueMap.set(post.id, post);
          }
        });
        const unique = Array.from(uniqueMap.values());

        // Sort by timestamp descending (most recent first)
        unique.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

        // Take only top 8 most recent posts
        const top8 = unique.slice(0, POSTS_PER_PAGE);

        console.log(`✅ Feed updated: ${currentPosts.length} → ${top8.length} posts (showing top 8 most recent)`);
        return top8;
      });
    }

      // Add the newly followed user to the following list
      setFollowingUserIds(prev => {
        if (!prev.includes(newlyFollowedUserId)) {
          return [...prev, newlyFollowedUserId];
        }
        return prev;
      });

      // Clear the newly followed posts from context
      clearNewlyFollowedUserPosts();
    };

    enrichAndMergeNewPosts();
  }, [newlyFollowedUserPosts, newlyFollowedUserId, activeTab, clearNewlyFollowedUserPosts, POSTS_PER_PAGE]);

  // Smart removal logic for unfollowed user posts
  useEffect(() => {
    if (!newlyUnfollowedUserId) return;

    console.log(`✅ Removing posts from unfollowed user:`, newlyUnfollowedUserId);

    // Only remove if we're on the following tab
    if (activeTab === 'following') {
      setFollowingPosts(currentPosts => {
        const filtered = currentPosts.filter(post => post.userId !== newlyUnfollowedUserId);
        console.log(`✅ Feed updated: ${currentPosts.length} → ${filtered.length} posts (removed unfollowed user's posts)`);
        return filtered;
      });
    }

    // Remove the unfollowed user from the following list
    setFollowingUserIds(prev => prev.filter(id => id !== newlyUnfollowedUserId));

    // Clear the unfollowed userId from context
    clearNewlyUnfollowedUserId();
  }, [newlyUnfollowedUserId, activeTab, clearNewlyUnfollowedUserId]);

  // Fetch posts with pagination
  const fetchPostsWithPagination = useCallback(async (isLoadMore: boolean = false) => {
    if (!currentUser?.id) return;
    if (isLoadMore && (!hasMore || loadingMore)) return;

    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      // Only show skeleton if we have no cached posts for this filter
      const cacheKey = selectedGameFilter || '_all';
      if (!followingCacheRef.current[cacheKey]?.length) {
        setLoading(true);
      }
      setLastDoc(null);
      setHasMore(true);
    }

    try {
      // If no following users, show empty state
      if (followingUserIds.length === 0) {
        setFollowingPosts([]);
        setLoading(false);
        return;
      }

      // Batch queries for users following more than 10 people
      const batchSize = 10;
      const batches: string[][] = [];
      for (let i = 0; i < followingUserIds.length; i += batchSize) {
        batches.push(followingUserIds.slice(i, i + batchSize));
      }

      let allBatchPosts: Post[] = [];

      // Fetch posts from each batch
      for (const batch of batches) {
        let q = query(
          collection(db, 'posts'),
          where('userId', 'in', batch),
          orderBy('createdAt', 'desc'),
          limit(POSTS_PER_PAGE * 2) // Fetch more to account for filtering
        );

        if (isLoadMore && lastDoc) {
          q = query(
            collection(db, 'posts'),
            where('userId', 'in', batch),
            orderBy('createdAt', 'desc'),
            startAfter(lastDoc),
            limit(POSTS_PER_PAGE * 2)
          );
        }

        const snapshot = await getDocs(q);
        const batchPosts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Post));

        allBatchPosts = [...allBatchPosts, ...batchPosts];
      }

      // Sort all posts by createdAt
      allBatchPosts.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

      // Filter out archived posts
      allBatchPosts = allBatchPosts.filter(post => !(post as any).archived);

      // Apply game filter if selected
      let filteredPosts = allBatchPosts;
      if (selectedGameFilter) {
        filteredPosts = filteredPosts.filter(post => post.taggedGame === selectedGameFilter);
      }

      // Take only the number we need
      const postsToShow = filteredPosts.slice(0, POSTS_PER_PAGE);

      // Fetch user avatars and rank data for posts
      const postsWithAvatars = await Promise.all(
        postsToShow.map(async (post) => {
          try {
            const userQuery = query(
              collection(db, 'users'),
              where('__name__', '==', post.userId)
            );
            const userSnapshot = await getDocs(userQuery);

            if (!userSnapshot.empty) {
              const userData = userSnapshot.docs[0].data();

              // Get rank data for tier border
              let leagueRank = undefined;
              let valorantRank = undefined;

              if (userData.riotStats?.rankedSolo) {
                leagueRank = `${userData.riotStats.rankedSolo.tier} ${userData.riotStats.rankedSolo.rank}`;
              }
              if (userData.valorantStats?.currentRank) {
                valorantRank = userData.valorantStats.currentRank;
              }

              return {
                ...post,
                avatar: userData.avatar || post.avatar || null,
                leagueRank,
                valorantRank,
                showRankOnPosts: userData.showRankOnPosts ?? false,
              };
            }
          } catch (error) {
            console.error(`Error fetching data for user ${post.userId}:`, error);
          }

          return post;
        })
      );

      const cacheKey = selectedGameFilter || '_all';
      if (isLoadMore) {
        setFollowingPosts(prev => {
          // Filter out duplicates by checking if post ID already exists
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = postsWithAvatars.filter(p => !existingIds.has(p.id));
          const updated = [...prev, ...newPosts];
          followingCacheRef.current[cacheKey] = updated;
          return updated;
        });
      } else {
        setFollowingPosts(postsWithAvatars);
        followingCacheRef.current[cacheKey] = postsWithAvatars;
      }

      // Update pagination state - if we got fewer posts than requested, there are no more
      setHasMore(postsWithAvatars.length === POSTS_PER_PAGE);
      if (postsWithAvatars.length > 0) {
        // Find the last document for pagination
        const lastPost = postsWithAvatars[postsWithAvatars.length - 1];
        const lastPostQuery = query(
          collection(db, 'posts'),
          where('__name__', '==', lastPost.id)
        );
        const lastPostSnapshot = await getDocs(lastPostQuery);
        if (!lastPostSnapshot.empty) {
          setLastDoc(lastPostSnapshot.docs[0]);
        }
      }

    } catch (error) {
      console.error('Error fetching posts:', error);
      Alert.alert('Error', 'Failed to load posts. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [currentUser?.id, followingUserIds, selectedGameFilter, hasMore, loadingMore, lastDoc]);

  // Fetch For You posts with pagination
  const fetchForYouPosts = useCallback(async (isLoadMore: boolean = false) => {
    if (!currentUser?.id) return;
    if (isLoadMore && (!forYouHasMore || forYouLoadingMore)) return;

    if (isLoadMore) {
      setForYouLoadingMore(true);
    } else {
      // Only show skeleton if we have no cached posts for this filter
      const cacheKey = selectedGameFilter || '_all';
      if (!forYouCacheRef.current[cacheKey]?.length) {
        setForYouLoading(true);
      }
      setForYouLastDoc(null);
      setForYouHasMore(true);
    }

    try {
      // Build base query constraints
      const constraints: any[] = [
        orderBy('createdAt', 'desc'),
        limit(POSTS_PER_PAGE * 2) // Fetch extra to account for filtering
      ];

      // Show posts from all public accounts regardless of game interests

      if (isLoadMore && forYouLastDoc) {
        constraints.push(startAfter(forYouLastDoc));
      }

      const q = query(collection(db, 'posts'), ...constraints);
      const snapshot = await getDocs(q);

      let allPosts = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Post));

      // Filter out archived, blocked, reported, and own posts
      allPosts = allPosts.filter(post =>
        !(post as any).archived &&
        !isUserBlocked(post.userId) &&
        !isPostReported(post.id) &&
        post.userId !== currentUser.id
      );

      // Apply game filter row if selected
      if (selectedGameFilter) {
        allPosts = allPosts.filter(post => post.taggedGame === selectedGameFilter);
      }

      // Take only what we need
      const postsToShow = allPosts.slice(0, POSTS_PER_PAGE);

      // Batch-fetch user data for all posts in parallel
      const uniqueUserIds = [...new Set(postsToShow.map(p => p.userId))];
      const userDataMap = new Map<string, any>();
      const userBatchSize = 10;
      const userBatches: string[][] = [];
      for (let i = 0; i < uniqueUserIds.length; i += userBatchSize) {
        userBatches.push(uniqueUserIds.slice(i, i + userBatchSize));
      }
      const userResults = await Promise.all(
        userBatches.map(batch =>
          getDocs(query(collection(db, 'users'), where('__name__', 'in', batch)))
            .catch(error => { console.error('Error batch fetching users for For You:', error); return null; })
        )
      );
      userResults.forEach(snapshot => {
        snapshot?.docs.forEach(d => {
          userDataMap.set(d.id, d.data());
        });
      });

      // Enrich with avatar, rank data, and filter out private accounts
      const enrichedPosts: Post[] = [];
      for (const post of postsToShow) {
        const userData = userDataMap.get(post.userId);
        if (userData) {
          if (userData.isPrivate) continue;

          let leagueRank = undefined;
          let valorantRank = undefined;

          if (userData.riotStats?.rankedSolo) {
            leagueRank = `${userData.riotStats.rankedSolo.tier} ${userData.riotStats.rankedSolo.rank}`;
          }
          if (userData.valorantStats?.currentRank) {
            valorantRank = userData.valorantStats.currentRank;
          }

          enrichedPosts.push({
            ...post,
            avatar: userData.avatar || post.avatar || undefined,
            leagueRank,
            valorantRank,
            showRankOnPosts: userData.showRankOnPosts ?? false,
          });
        } else {
          enrichedPosts.push(post);
        }
      }

      const cacheKey = selectedGameFilter || '_all';
      if (isLoadMore) {
        setForYouPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = enrichedPosts.filter(p => !existingIds.has(p.id));
          const updated = [...prev, ...newPosts];
          forYouCacheRef.current[cacheKey] = updated;
          return updated;
        });
      } else {
        setForYouPosts(enrichedPosts);
        forYouCacheRef.current[cacheKey] = enrichedPosts;
      }

      // Update pagination state
      setForYouHasMore(enrichedPosts.length === POSTS_PER_PAGE);
      if (snapshot.docs.length > 0) {
        setForYouLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
      setForYouFetched(true);

      // Cache For You posts to AsyncStorage for instant next launch (only initial fetch, no filter)
      if (!isLoadMore && !selectedGameFilter && enrichedPosts.length > 0) {
        try {
          const cacheable = enrichedPosts.map((p: Post) => ({
            ...p,
            createdAt: { seconds: p.createdAt.seconds, nanoseconds: p.createdAt.nanoseconds },
          }));
          AsyncStorage.setItem(FOR_YOU_CACHE_KEY, JSON.stringify(cacheable)).catch(() => {});
        } catch {}
      }

    } catch (error) {
      console.error('Error fetching For You posts:', error);
    } finally {
      setForYouLoading(false);
      setForYouLoadingMore(false);
    }
  }, [currentUser?.id, selectedGameFilter, forYouHasMore, forYouLoadingMore, forYouLastDoc, isUserBlocked, isPostReported]);

  // Initial fetch when dependencies change
  // Note: Don't fetch if we just consumed preloaded posts (hasConsumedPreload && no filter)
  useEffect(() => {
    if (activeTab === 'following') {
      // Skip initial fetch if we have preloaded posts and no filters applied
      if (hasConsumedPreload && selectedGameFilter === null) {
        return;
      }

      const filterChanged = prevFollowingFilterRef.current !== selectedGameFilter;
      if (filterChanged) {
        // Instantly show cached posts for this filter (no skeleton flash)
        const cacheKey = selectedGameFilter || '_all';
        const cached = followingCacheRef.current[cacheKey];
        if (cached && cached.length > 0) {
          setFollowingPosts(cached);
        }
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        prevFollowingFilterRef.current = selectedGameFilter;
        setHasConsumedPreload(false);
      }

      if (followingUserIds.length > 0) {
        if (!hasConsumedPreload || filterChanged) {
          fetchPostsWithPagination(false);
        }
      } else {
        setLoading(false);
      }
    } else if (activeTab === 'forYou') {
      // Fetch For You on first switch or when the game filter actually changes
      const filterChanged = prevForYouFilterRef.current !== selectedGameFilter;
      if (filterChanged) {
        // Instantly show cached posts for this filter (no skeleton flash)
        const cacheKey = selectedGameFilter || '_all';
        const cached = forYouCacheRef.current[cacheKey];
        if (cached && cached.length > 0) {
          setForYouPosts(cached);
        }
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      }
      if (!forYouFetched || filterChanged) {
        prevForYouFilterRef.current = selectedGameFilter;
        fetchForYouPosts(false);
      } else if (forYouNeedsBackgroundRefresh.current) {
        // Silently refresh cached For You data in background
        forYouNeedsBackgroundRefresh.current = false;
        fetchForYouPosts(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, followingUserIds, activeTab, selectedGameFilter, hasConsumedPreload, preloadedPosts, forYouFetched]);

  // Check which posts are liked by the current user
  useEffect(() => {
    const checkLikedPosts = async () => {
      if (!currentUser?.id || currentPosts.length === 0) return;

      try {
        const likedPostIds = new Set<string>();
        await Promise.all(
          currentPosts.map(async (post) => {
            const isLiked = await isPostLiked(currentUser.id, post.id);
            if (isLiked) {
              likedPostIds.add(post.id);
            }
          })
        );
        setLikedPosts(likedPostIds);
      } catch (error) {
        console.error('Error checking liked posts:', error);
      }
    };

    checkLikedPosts();
  }, [currentPosts, currentUser?.id]);

  // Handle like/unlike toggle
  const handleLikeToggle = async (post: Post) => {
    if (!currentUser?.id) {
      Alert.alert('Error', 'You must be logged in to like posts');
      return;
    }

    // Prevent multiple clicks while processing
    if (likingInProgress.has(post.id)) return;

    // Add to in-progress set
    const newInProgress = new Set(likingInProgress);
    newInProgress.add(post.id);
    setLikingInProgress(newInProgress);

    const isCurrentlyLiked = likedPosts.has(post.id);

    // Optimistic update
    const newLikedPosts = new Set(likedPosts);
    if (isCurrentlyLiked) {
      newLikedPosts.delete(post.id);
    } else {
      newLikedPosts.add(post.id);
    }
    setLikedPosts(newLikedPosts);

    // Update local post count optimistically
    const updatePostLikes = (posts: Post[]) =>
      posts.map((p) =>
        p.id === post.id
          ? { ...p, likes: p.likes + (isCurrentlyLiked ? -1 : 1) }
          : p
      );

    if (activeTab === 'following') {
      setFollowingPosts(updatePostLikes(followingPosts));
    } else {
      setForYouPosts(updatePostLikes(forYouPosts));
    }

    try {
      if (isCurrentlyLiked) {
        await unlikePost(currentUser.id, post.id);
      } else {
        const postThumbnail = post.mediaType === 'video' && post.thumbnailUrl
          ? post.thumbnailUrl
          : post.mediaUrl;

        await likePost(
          currentUser.id,
          currentUser.username || currentUser.email?.split('@')[0] || 'User',
          currentUser.avatar,
          post.id,
          post.userId,
          postThumbnail
        );
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      Alert.alert('Error', 'Failed to update like. Please try again.');

      // Revert optimistic update on error
      setLikedPosts(isCurrentlyLiked ? newLikedPosts : new Set(Array.from(newLikedPosts).filter(id => id !== post.id)));

      if (activeTab === 'following') {
        setFollowingPosts(updatePostLikes(followingPosts).map((p) =>
          p.id === post.id ? { ...p, likes: p.likes + (isCurrentlyLiked ? 1 : -1) } : p
        ));
      } else {
        setForYouPosts(updatePostLikes(forYouPosts).map((p) =>
          p.id === post.id ? { ...p, likes: p.likes + (isCurrentlyLiked ? 1 : -1) } : p
        ));
      }
    } finally {
      // Remove from in-progress set
      const updatedInProgress = new Set(likingInProgress);
      updatedInProgress.delete(post.id);
      setLikingInProgress(updatedInProgress);
    }
  };

  // Handle opening comment modal
  const handleOpenComments = (post: Post) => {
    setCommentingPost(post);
    setShowCommentModal(true);
  };

  // Handle closing comment modal
  const handleCloseComments = () => {
    setShowCommentModal(false);
    setCommentingPost(null);
  };

  // Handle report post
  const handleReport = (post: Post) => {
    setReportingPost(post);
    setShowReportModal(true);
  };

  const handlePostReported = (postId: string) => {
    addReportedPost(postId);
    // Remove the post from the feed immediately
    if (activeTab === 'following') {
      setFollowingPosts(prev => prev.filter(p => p.id !== postId));
    } else {
      setForYouPosts(prev => prev.filter(p => p.id !== postId));
    }
  };

  // Pull to refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setHasNewPosts(false);
    if (activeTab === 'forYou') {
      setForYouFetched(false);
      await fetchForYouPosts(false);
    } else {
      await fetchPostsWithPagination(false);
    }
    setRefreshing(false);
  }, [activeTab, fetchPostsWithPagination, fetchForYouPosts]);

  // Load more posts when scrolling to bottom
  const handleLoadMore = useCallback(() => {
    if (activeTab === 'forYou') {
      if (forYouHasMore && !forYouLoadingMore && !forYouLoading) {
        fetchForYouPosts(true);
      }
    } else {
      if (hasMore && !loadingMore && !loading) {
        fetchPostsWithPagination(true);
      }
    }
  }, [activeTab, hasMore, loadingMore, loading, fetchPostsWithPagination, forYouHasMore, forYouLoadingMore, forYouLoading, fetchForYouPosts]);

  // Detect when user scrolls to bottom
  const handleScrollEnd = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 100;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isCloseToBottom) {
      handleLoadMore();
    }
  }, [handleLoadMore]);

  // Update comment count when a comment is added (without refetching all posts)
  const handleCommentAdded = useCallback(() => {
    if (!commentingPost) return;

    // Update the comment count for the specific post locally
    const updatePostCommentCount = (posts: Post[]) =>
      posts.map((p) =>
        p.id === commentingPost.id
          ? { ...p, commentsCount: (p.commentsCount ?? 0) + 1 }
          : p
      );

    if (activeTab === 'following') {
      setFollowingPosts(updatePostCommentCount(followingPosts));
    } else {
      setForYouPosts(updatePostCommentCount(forYouPosts));
    }
  }, [commentingPost, activeTab, followingPosts, forYouPosts]);

  // Fetch user's duo cards and in-game stats for posting
  useEffect(() => {
    const fetchDuoCards = async () => {
      if (!currentUser?.id) return;

      try {
        const userDocRef = doc(db, 'users', currentUser.id);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();

          // Extract in-game stats
          if (userData.valorantStats?.card?.small) {
            setValorantInGameIcon(userData.valorantStats.card.small);
          }
          if (userData.valorantStats?.gameName) {
            const tagLine = userData.valorantAccount?.tag || '';
            setValorantInGameName(tagLine ? `${userData.valorantStats.gameName}#${tagLine}` : userData.valorantStats.gameName);
          }
          if (userData.valorantStats?.winRate !== undefined) {
            setValorantWinRate(userData.valorantStats.winRate);
          }
          if (userData.valorantStats?.gamesPlayed !== undefined) {
            setValorantGamesPlayed(userData.valorantStats.gamesPlayed);
          }
          if (userData.riotStats?.profileIconId) {
            setLeagueInGameIcon(`https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${userData.riotStats.profileIconId}.png`);
          }
          if (userData.riotAccount?.gameName) {
            const tagLine = userData.riotAccount.tagLine || '';
            setLeagueInGameName(`${userData.riotAccount.gameName}#${tagLine}`);
          }
          if (userData.riotStats?.rankedSolo?.winRate !== undefined) {
            setLeagueWinRate(userData.riotStats.rankedSolo.winRate);
          }
          if (userData.riotStats?.rankedSolo?.wins !== undefined) {
            setLeagueGamesPlayed((userData.riotStats.rankedSolo.wins || 0) + (userData.riotStats.rankedSolo.losses || 0));
          }
        }

        // Load Valorant card
        const valorantCardDoc = await getDoc(doc(db, 'duoCards', `${currentUser.id}_valorant`));
        if (valorantCardDoc.exists()) {
          const cardData = valorantCardDoc.data();
          setValorantCard({
            game: 'valorant',
            username: cardData.username,
            currentRank: cardData.currentRank,
            region: cardData.region,
            mainRole: cardData.mainRole,
            peakRank: cardData.peakRank,
            mainAgent: cardData.mainAgent,
            lookingFor: cardData.lookingFor || 'Any',
          });
        }

        // Load League card
        const leagueCardDoc = await getDoc(doc(db, 'duoCards', `${currentUser.id}_league`));
        if (leagueCardDoc.exists()) {
          const cardData = leagueCardDoc.data();
          setLeagueCard({
            game: 'league',
            username: cardData.username,
            currentRank: cardData.currentRank,
            region: cardData.region,
            mainRole: cardData.mainRole,
            peakRank: cardData.peakRank,
            mainAgent: cardData.mainAgent,
            lookingFor: cardData.lookingFor || 'Any',
          });
        }
      } catch (error) {
        console.error('Error fetching duo cards:', error);
      }
    };

    fetchDuoCards();
  }, [currentUser?.id]);

  // Handle add new clip button
  const handleAddClip = () => {
    if (!currentUser?.id) {
      Alert.alert('Error', 'You must be logged in to create a clip');
      return;
    }

    // Mark screen as unfocused to prevent videos from auto-playing
    setIsScreenFocused(false);

    // Stop all videos immediately by setting state
    setPlayingVideoId(null);

    // Pause all videos before opening modal
    Object.values(videoPlayers.current).forEach((player) => {
      if (player) {
        try {
          player.pause();
        } catch (error) {
          // Video already paused or unmounted
        }
      }
    });

    router.push('/postPages/createPostVideo');
  };

  // Handle when a new post is created
  const handlePostCreated = async (newPost: Post) => {
    // Enrich the new post with rank data for the current user
    try {
      if (currentUser?.id) {
        const userQuery = query(
          collection(db, 'users'),
          where('__name__', '==', currentUser.id)
        );
        const userSnapshot = await getDocs(userQuery);

        if (!userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data();

          let leagueRank = undefined;
          let valorantRank = undefined;

          if (userData.riotStats?.rankedSolo) {
            leagueRank = `${userData.riotStats.rankedSolo.tier} ${userData.riotStats.rankedSolo.rank}`;
          }
          if (userData.valorantStats?.currentRank) {
            valorantRank = userData.valorantStats.currentRank;
          }

          newPost = {
            ...newPost,
            leagueRank,
            valorantRank,
            showRankOnPosts: userData.showRankOnPosts ?? false,
          };
        }
      }
    } catch (error) {
      console.error('Error enriching new post with rank data:', error);
    }

    // Add new post to the beginning of the following posts array (most recent first)
    setFollowingPosts(prevPosts => [newPost, ...prevPosts]);
    console.log('New post added to feed:', newPost.id);

    // Restore screen focus after post is created
    setIsScreenFocused(true);
  };

  // Handle screen focus/blur for video playback
  useFocusEffect(
    useCallback(() => {
      // Screen is focused
      setIsScreenFocused(true);

      return () => {
        // Screen lost focus - pause all videos
        setIsScreenFocused(false);
        setPlayingVideoId(null);
        Object.values(videoPlayers.current).forEach((player) => {
          if (player) {
            try {
              player.pause();
            } catch (error) {
              // Video already paused or unmounted
            }
          }
        });
      };
    }, [])
  );

  // Scroll to top and refresh when Feed tab is pressed while already on Feed
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', (e) => {
      if (navigation.isFocused()) {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        handleRefresh();
      }
    });
    return unsubscribe;
  }, [navigation, handleRefresh]);

  // Check for visible videos when posts load or tab changes (only when screen is focused)
  useEffect(() => {
    if (currentPosts.length > 0 && !loading && isScreenFocused) {
      // Delay to ensure refs are set
      setTimeout(() => {
        checkVideoInView();
      }, 100);
    } else {
      // If no posts or screen not focused, clear playing video
      setPlayingVideoId(null);
    }
  }, [currentPosts, loading, isScreenFocused, checkVideoInView]);

  const handleVideoClick = (postId: string) => {
    setPlayingVideoId(playingVideoId === postId ? null : postId);
  };

  // Check which video is in viewport (only auto-play when screen is focused)
  const checkVideoInView = useCallback(() => {
    // Don't auto-play videos if screen is not focused
    if (!isScreenFocused) {
      return;
    }

    const videoPosts = currentPosts.filter(post => post.mediaType === 'video');
    let foundVisibleVideo = false;

    videoPosts.forEach(post => {
      const ref = postRefs.current[post.id];
      if (ref) {
        ref.measureInWindow((x, y, width, height) => {
          const windowHeight = Dimensions.get('window').height;
          const headerHeight = 150; // Approximate height of header + tabs

          // Check if video is at least 50% visible in viewport
          const isVisible =
            y + height > headerHeight &&
            y < windowHeight &&
            (y + height / 2) > headerHeight &&
            (y + height / 2) < windowHeight;

          if (isVisible && !foundVisibleVideo) {
            foundVisibleVideo = true;
            if (playingVideoId !== post.id) {
              setPlayingVideoId(post.id);
            }
          } else if (!isVisible && playingVideoId === post.id) {
            setPlayingVideoId(null);
          }
        });
      }
    });
  }, [currentPosts, playingVideoId, isScreenFocused]);

  const handleScroll = () => {
    // Use requestAnimationFrame for smoother checking
    requestAnimationFrame(() => {
      checkVideoInView();
    });
  };

  const handleUserPress = (userId: string, username?: string, avatar?: string) => {
    // Navigate immediately first
    if (userId === currentUser?.id) {
      router.push('/(tabs)/profile');
    } else {
      router.push({
        pathname: '/profilePages/profileView',
        params: { userId, username: username || '', avatar: avatar || '', preloadedFollowing: 'true' },
      });
    }

    // Clean up videos after navigation is triggered
    setIsScreenFocused(false);
    setPlayingVideoId(null);
    try {
      Object.values(videoPlayers.current).forEach((player) => {
        try { player?.pause(); } catch (e) {}
      });
    } catch (e) {}
  };

  // Handle direct message
  const handleDirectMessage = (post: Post) => {
    if (!currentUser?.id) {
      Alert.alert('Error', 'You must be logged in to send messages');
      return;
    }

    // Prevent messaging yourself
    if (post.userId === currentUser.id) {
      Alert.alert('Notice', 'You cannot message yourself');
      return;
    }

    router.push({
      pathname: '/chatPages/chatScreen',
      params: {
        otherUserId: post.userId,
        otherUsername: post.username,
        otherUserAvatar: post.avatar || '',
      },
    });
  };

  const isInitialLoading = activeTab === 'following' ? loading : forYouLoading;

  if (isInitialLoading) {
    return <ThemedView style={styles.container} />;
  }

  return (
    <ThemedView style={styles.container}>
      {/* Ambient background glow */}
      <View style={styles.backgroundGlow} pointerEvents="none">
        {/* Grid pattern (matches web landing-grid) */}
        <View style={styles.gridOverlay}>
          {Array.from({ length: Math.ceil(width / GRID_SIZE) + 1 }).map((_, i) => (
            <View key={`v${i}`} style={[styles.gridLineV, { left: i * GRID_SIZE }]} />
          ))}
          {Array.from({ length: Math.ceil(screenHeight / GRID_SIZE) + 1 }).map((_, i) => (
            <View key={`h${i}`} style={[styles.gridLineH, { top: i * GRID_SIZE }]} />
          ))}
          <LinearGradient
            colors={['transparent', 'transparent', '#0f0f0f']}
            locations={[0, 0.35, 0.7]}
            style={StyleSheet.absoluteFill}
          />
        </View>
        {/* Fixed shimmer band — diagonal gleam */}
        <View style={styles.shimmerBand} pointerEvents="none">
          <LinearGradient
            colors={[
              'transparent',
              'rgba(212, 184, 120, 0.03)',
              'rgba(212, 184, 120, 0.06)',
              'rgba(212, 184, 120, 0.03)',
              'transparent',
            ]}
            locations={[0, 0.37, 0.5, 0.63, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        {/* Secondary fainter shimmer */}
        <View style={styles.shimmerBandSecondary} pointerEvents="none">
          <LinearGradient
            colors={[
              'transparent',
              'rgba(212, 184, 120, 0.035)',
              'transparent',
            ]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>

      <View style={[styles.header, { paddingTop: insets.top - 10 }]}>
        <ScalePress
          style={styles.headerIconButton}
          onPress={() => { if (Date.now() - lastNavTime.current < 500) return; lastNavTime.current = Date.now(); router.push('/chatPages/chatList'); }}
        >
          <IconSymbol size={27} name="tray" color="#fff" />
          {unreadMessageCount > 0 && (
            <View style={styles.notificationBadge}>
              <ThemedText style={styles.notificationBadgeText}>
                {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
              </ThemedText>
            </View>
          )}
        </ScalePress>

        <TouchableOpacity
          onPress={() => setShowTabDropdown(!showTabDropdown)}
          activeOpacity={0.7}
          style={styles.headerDropdownTrigger}
        >
          <Image
            source={require('@/assets/images/peakdlogo2.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <IconSymbol
            size={14}
            name={showTabDropdown ? 'chevron.up' : 'chevron.down'}
            color="#F0D6A2"
          />
        </TouchableOpacity>

        <ScalePress
          style={styles.headerIconButton}
          onPress={() => { if (Date.now() - lastNavTime.current < 500) return; lastNavTime.current = Date.now(); router.push('/notifications'); }}
        >
          <IconSymbol size={22} name="bell" color="#fff" />
          {unreadNotificationCount > 0 && (
            <View style={styles.notificationBadge}>
              <ThemedText style={styles.notificationBadgeText}>
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </ThemedText>
            </View>
          )}
        </ScalePress>
      </View>

      {/* Tab Dropdown Overlay */}
      {showTabDropdown && (
        <Pressable style={styles.tabDropdownOverlay} onPress={() => setShowTabDropdown(false)}>
          <Pressable style={styles.tabDropdownSheet} onPress={(e) => e.stopPropagation()}>
            <ScalePress
              style={[styles.tabDropdownCard, activeTab === 'forYou' && styles.tabDropdownCardActive]}
              onPress={() => {
                setActiveTab('forYou');
                setSelectedGameFilter(null);
                setShowTabDropdown(false);
              }}
            >
              <ThemedText style={[styles.tabDropdownCardText, activeTab === 'forYou' && styles.tabDropdownCardTextActive]}>
                FOR YOU
              </ThemedText>
            </ScalePress>
            <ScalePress
              style={[styles.tabDropdownCard, activeTab === 'following' && styles.tabDropdownCardActive]}
              onPress={() => {
                setActiveTab('following');
                setSelectedGameFilter(null);
                setShowTabDropdown(false);
              }}
            >
              <ThemedText style={[styles.tabDropdownCardText, activeTab === 'following' && styles.tabDropdownCardTextActive]}>
                FOLLOWING
              </ThemedText>
            </ScalePress>
          </Pressable>
        </Pressable>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          if (showTabDropdown) setShowTabDropdown(false);
          handleScroll();
          handleScrollEnd(e);
        }}
        scrollEventThrottle={100}
        onScrollEndDrag={handleScroll}
        onMomentumScrollEnd={handleScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#fff"
            colors={['#fff']}
          />
        }
      >
        {/* Game Filter Tabs */}
        <View style={styles.gameFilterRow}>
          <ScalePress onPress={() => setSelectedGameFilter(null)} style={[styles.gameFilterPill, selectedGameFilter === null && styles.gameFilterPillActive]}>
            <ThemedText style={[styles.gameFilterPillText, selectedGameFilter === null && styles.gameFilterPillTextActive]}>All</ThemedText>
          </ScalePress>
          <ScalePress onPress={() => setSelectedGameFilter('valorant')} style={[styles.gameFilterPill, selectedGameFilter === 'valorant' && styles.gameFilterPillActive]}>
            <Image
              source={require('@/assets/images/valorant-red.png')}
              style={styles.gameFilterIcon}
              resizeMode="contain"
            />
            <ThemedText style={[styles.gameFilterPillText, selectedGameFilter === 'valorant' && styles.gameFilterPillTextActive]}>Valorant</ThemedText>
          </ScalePress>
          <ScalePress onPress={() => setSelectedGameFilter('league')} style={[styles.gameFilterPill, selectedGameFilter === 'league' && styles.gameFilterPillActive]}>
            <Image
              source={require('@/assets/images/lol-icon.png')}
              style={styles.gameFilterIcon}
              resizeMode="contain"
            />
            <ThemedText style={[styles.gameFilterPillText, selectedGameFilter === 'league' && styles.gameFilterPillTextActive]}>League</ThemedText>
          </ScalePress>
        </View>

        {hasNewPosts && activeTab === 'following' && !loading && (
          <ScalePress
            style={styles.newPostsBanner}
            onPress={() => {
              scrollViewRef.current?.scrollTo({ y: 0, animated: true });
              handleRefresh();
            }}
          >
            <IconSymbol size={14} name="arrow.up" color="#fff" />
            <ThemedText style={styles.newPostsBannerText}>New posts</ThemedText>
          </ScalePress>
        )}

        {(activeTab === 'following' ? loading : forYouLoading) ? (
          <FeedSkeleton count={3} />
        ) : currentPosts.length > 0 ? (
          <>
            {currentPosts.map((post, index) => {
              const isTeaser = index === 7 && currentPosts.length === POSTS_PER_PAGE;

              const postContent = (
                <PostContent
                  key={post.id}
                  post={post}
                  playingVideoId={playingVideoId}
                  postRefs={postRefs}
                  onOpenComments={handleOpenComments}
                  onDirectMessage={handleDirectMessage}
                  onLikeToggle={handleLikeToggle}
                  onUserPress={handleUserPress}
                  formatTimeAgo={formatTimeAgo}
                  currentUserId={currentUser?.id}
                  isLiked={likedPosts.has(post.id)}
                  likeCount={post.likes}
                  isLiking={likingInProgress.has(post.id)}
                  onPlayerReady={handlePlayerReady}
                  showRecentComments={true}
                  onReport={handleReport}
                />
              );

              if (isTeaser) {
                return (
                  <View key={post.id} style={styles.teaserWrapper}>
                    {postContent}
                    <LinearGradient
                      colors={['rgba(30,33,36,0)', 'rgba(30,33,36,0.6)', 'rgba(30,33,36,1)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={styles.teaserGradient}
                      pointerEvents="none"
                    />
                  </View>
                );
              }

              return postContent;
            })}
            {(activeTab === 'following' ? loadingMore : forYouLoadingMore) && (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color="#000" />
                <ThemedText style={styles.loadingMoreText}>Loading more posts...</ThemedText>
              </View>
            )}
            {!(activeTab === 'following' ? hasMore : forYouHasMore) && currentPosts.length > 0 && (
              <View style={styles.endOfFeedContainer}>
                <ThemedText style={styles.endOfFeedText}>You're all caught up!</ThemedText>
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyTitle}>
              {activeTab === 'following'
                ? "Nothing here yet"
                : "No posts available"}
            </ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {activeTab === 'following'
                ? "Follow people to see their clips"
                : "Check back later for new content"}
            </ThemedText>
          </View>
        )}
      </ScrollView>

      {/* Comment Modal */}
      {commentingPost && (
        <CommentModal
          visible={showCommentModal}
          postId={commentingPost.id}
          postOwnerId={commentingPost.userId}
          postThumbnail={
            commentingPost.mediaType === 'video' && commentingPost.thumbnailUrl
              ? commentingPost.thumbnailUrl
              : commentingPost.mediaUrl
          }
          onClose={handleCloseComments}
          onCommentAdded={handleCommentAdded}
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
          onReported={handlePostReported}
        />
      )}

      {/* Floating Add Clip Button */}
      <Animated.View style={[styles.fabWrapper, { transform: [{ translateY: fabY }] }]}>
        <ScalePress
          style={styles.fabButton}
          onPress={handleAddClip}
        >
          <IconSymbol size={26} name="plus" color="#fff" />
        </ScalePress>
      </Animated.View>

      {/* Post Duo Card Modal */}
      <PostDuoCard
        visible={showNewPost}
        onClose={() => {
          setShowNewPost(false);
          setIsScreenFocused(true);
        }}
        onPostCreated={() => {
          setShowNewPost(false);
          setIsScreenFocused(true);
        }}
        valorantCard={valorantCard}
        leagueCard={leagueCard}
        userAvatar={currentUser?.avatar}
        valorantInGameIcon={valorantInGameIcon}
        valorantInGameName={valorantInGameName}
        valorantWinRate={valorantWinRate}
        leagueInGameIcon={leagueInGameIcon}
        leagueInGameName={leagueInGameName}
        leagueWinRate={leagueWinRate}
        valorantGamesPlayed={valorantGamesPlayed}
        leagueGamesPlayed={leagueGamesPlayed}
      />

      {/* Game Filter Bottom Sheet */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <Pressable
          style={styles.filterModalOverlay}
          onPress={() => setShowFilterModal(false)}
        >
          <Pressable style={styles.filterModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.filterModalHandle} />
            <ThemedText style={styles.filterModalTitle}>FILTER BY GAME</ThemedText>

            <ScalePress
              style={[styles.filterOption, selectedGameFilter === null && styles.filterOptionActive]}
              onPress={() => {
                setSelectedGameFilter(null);
                setShowFilterModal(false);
              }}
            >
              <View style={styles.filterOptionRadio}>
                {selectedGameFilter === null && <View style={styles.filterOptionRadioInner} />}
              </View>
              <ThemedText style={[styles.filterOptionText, selectedGameFilter === null && styles.filterOptionTextActive]}>
                ALL GAMES
              </ThemedText>
            </ScalePress>

            <ScalePress
              style={[styles.filterOption, selectedGameFilter === 'valorant' && styles.filterOptionActive]}
              onPress={() => {
                setSelectedGameFilter('valorant');
                setShowFilterModal(false);
              }}
            >
              <View style={styles.filterOptionRadio}>
                {selectedGameFilter === 'valorant' && <View style={styles.filterOptionRadioInner} />}
              </View>
              <ThemedText style={[styles.filterOptionText, selectedGameFilter === 'valorant' && styles.filterOptionTextActive]}>
                VALORANT
              </ThemedText>
            </ScalePress>

            <ScalePress
              style={[styles.filterOption, selectedGameFilter === 'league' && styles.filterOptionActive]}
              onPress={() => {
                setSelectedGameFilter('league');
                setShowFilterModal(false);
              }}
            >
              <View style={styles.filterOptionRadio}>
                {selectedGameFilter === 'league' && <View style={styles.filterOptionRadioInner} />}
              </View>
              <ThemedText style={[styles.filterOptionText, selectedGameFilter === 'league' && styles.filterOptionTextActive]}>
                LEAGUE
              </ThemedText>
            </ScalePress>
          </Pressable>
        </Pressable>
      </Modal>

    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  backgroundGlow: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  shimmerBand: {
    position: 'absolute',
    top: -screenHeight * 0.35,
    left: -width * 0.6,
    width: width * 2.2,
    height: screenHeight * 1.7,
    transform: [{ rotate: '20deg' }],
  },
  shimmerBandSecondary: {
    position: 'absolute',
    top: -screenHeight * 0.2,
    left: -width * 0.1,
    width: width * 1.9,
    height: screenHeight * 1.5,
    transform: [{ rotate: '-15deg' }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 4,
    zIndex: 100,
  },
  headerLogo: {
    width: 172,
    height: 72,
  },
  headerDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  tabDropdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 200,
    paddingTop: 110,
    paddingHorizontal: 16,
  },
  tabDropdownSheet: {
    width: 220,
    alignSelf: 'center',
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 6,
    gap: 4,
  },
  tabDropdownCard: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  tabDropdownCardActive: {
    borderColor: 'rgba(212, 184, 120, 0.3)',
    backgroundColor: 'rgba(212, 184, 120, 0.08)',
  },
  tabDropdownCardText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#444',
    letterSpacing: 0.5,
  },
  tabDropdownCardTextActive: {
    color: '#fff',
  },
  headerTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  headerTab: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  headerTabText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  headerTabTextActive: {
    color: '#fff',
  },
  headerTabUnderline: {
    marginTop: 4,
    width: '100%',
    height: 2,
    backgroundColor: '#C9A84C',
    borderRadius: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerIconButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  notificationBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 16,
  },
  tabScrollContainer: {
  },
  tabScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 6,
  },
  gameFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  gameFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    flexShrink: 0,
  },
  gameFilterPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gameFilterPillActive: {
    backgroundColor: 'rgba(212, 184, 120, 0.1)',
    borderColor: 'rgba(212, 184, 120, 0.3)',
  },
  gameFilterIcon: {
    width: 18,
    height: 18,
  },
  gameFilterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  gameFilterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  gameFilterPillTextActive: {
    color: '#fff',
  },
  newPostsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#c42743',
    borderRadius: 20,
    marginBottom: 12,
  },
  newPostsBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  gameFilterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 0.5,
  },
  gameFilterTabTextActive: {
    color: '#fff',
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  filterModalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  filterModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  filterModalTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  filterOptionActive: {},
  filterOptionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#555',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterOptionRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  filterOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 0.5,
  },
  filterOptionTextActive: {
    color: '#fff',
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#2c2f33',
    borderWidth: 1,
    borderColor: '#2c2f33',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    minHeight: 40,
  },
  tabActive: {
    backgroundColor: '#c42743',
    borderColor: '#c42743',
    shadowColor: '#c42743',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.4,
    shadowRadius: 4.65,
    elevation: 8,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#999',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  gameTabShadow: {
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  gameTabShadowActive: {
    shadowColor: '#DC3D4B',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  gameTab: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#2c2f33',
    borderWidth: 1,
    borderColor: '#2c2f33',
    minHeight: 32,
    minWidth: 90,
    overflow: 'hidden',
  },
  gameTabActive: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  gameTabGradient: {
    flex: 1,
    width: '100%',
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  gameTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999',
  },
  gameTabTextActive: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 100,
  },
  emptyContainer: {
    paddingHorizontal: 28,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 36,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#555',
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 14,
    color: '#666',
  },
  endOfFeedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  endOfFeedText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  teaserWrapper: {
    position: 'relative',
  },
  teaserGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    pointerEvents: 'none',
  },
  fabWrapper: {
    position: 'absolute',
    bottom: 24,
    right: 20,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 184, 120, 0.25)',
    shadowColor: '#D4B878',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
});