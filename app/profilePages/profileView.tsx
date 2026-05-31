import rankCard from '@/app/components/rankCard';

// Alias for JSX usage (React components must start with uppercase)
const RankCard = rankCard;
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProfilePageSkeleton } from '@/components/ui/Skeleton';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, TouchableOpacity, View, ActivityIndicator, Alert, Linking, Modal, LayoutAnimation, Platform, UIManager, Animated, InteractionManager } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/contexts/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '@/config/firebase';
import { collection, query, where, getDocs, Timestamp, doc, getDoc, setDoc, deleteDoc, updateDoc, increment } from 'firebase/firestore';
import { followUser, unfollowUser, isFollowing as checkIsFollowing, getUserRecentPosts, sendFollowRequest, cancelFollowRequest, hasFollowRequest } from '@/services/followService';
import { blockUser } from '@/services/blockService';
import PostViewerModal from '@/app/components/postViewerModal';
import ReportPostModal from '@/app/components/reportPostModal';
import { calculateTierBorderColor, calculateTierBorderGradient, calculateTier } from '@/utils/tierBorderUtils';
import { formatCount } from '@/utils/formatCount';
import GradientBorder from '@/components/GradientBorder';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import CachedImage from '@/components/ui/CachedImage';
import { isRemoteAvatar, getDefaultAvatarSource } from '@/utils/resolveAvatar';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ViewedUser {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  coverPhoto?: string;
  bio?: string;
  discordLink?: string;
  instagramLink?: string;
  postsCount?: number;
  followersCount?: number;
  followingCount?: number;
  createdAt?: Date;
}

// Helper function to format join date
const formatJoinDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Joined today';
  if (diffDays === 1) return 'Joined yesterday';
  if (diffDays < 30) return `Joined ${diffDays} days ago`;

  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  return `Joined ${day} ${month} ${year}`;
};

// Helper function to format rank display
const formatRank = (tier: string, rank: string) => {
  return `${tier.charAt(0).toUpperCase()}${tier.slice(1).toLowerCase()} ${rank}`;
};

// Helper function to format video duration
const formatDuration = (seconds?: number): string => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Rank icon maps for profile banner pills
const LEAGUE_RANK_ICONS: { [key: string]: any } = {
  iron: require('@/assets/images/leagueranks/iron.png'),
  bronze: require('@/assets/images/leagueranks/bronze.png'),
  silver: require('@/assets/images/leagueranks/silver.png'),
  gold: require('@/assets/images/leagueranks/gold.png'),
  platinum: require('@/assets/images/leagueranks/platinum.png'),
  emerald: require('@/assets/images/leagueranks/emerald.png'),
  diamond: require('@/assets/images/leagueranks/diamond.png'),
  master: require('@/assets/images/leagueranks/masters.png'),
  grandmaster: require('@/assets/images/leagueranks/grandmaster.png'),
  challenger: require('@/assets/images/leagueranks/challenger.png'),
  unranked: require('@/assets/images/leagueranks/unranked.png'),
};
const VALORANT_RANK_ICONS: { [key: string]: any } = {
  iron: require('@/assets/images/valorantranks/iron.png'),
  bronze: require('@/assets/images/valorantranks/bronze.png'),
  silver: require('@/assets/images/valorantranks/silver.png'),
  gold: require('@/assets/images/valorantranks/gold.png'),
  platinum: require('@/assets/images/valorantranks/platinum.png'),
  diamond: require('@/assets/images/valorantranks/diamond.png'),
  ascendant: require('@/assets/images/valorantranks/ascendant.png'),
  immortal: require('@/assets/images/valorantranks/immortal.png'),
  radiant: require('@/assets/images/valorantranks/radiant.png'),
  unranked: require('@/assets/images/valorantranks/unranked.png'),
};
const getRankIconForPill = (rank: string, game: string) => {
  if (!rank || rank === 'Unranked') {
    return game === 'Valorant' ? VALORANT_RANK_ICONS.unranked : LEAGUE_RANK_ICONS.unranked;
  }
  const tier = rank.split(' ')[0].toLowerCase();
  if (game === 'Valorant') return VALORANT_RANK_ICONS[tier] || VALORANT_RANK_ICONS.unranked;
  return LEAGUE_RANK_ICONS[tier] || LEAGUE_RANK_ICONS.unranked;
};
const CARD_PADDING = 20;
const CARD_GAP = 16;
const CARD_WIDTH = screenWidth - (CARD_PADDING * 2);

interface Post {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  thumbnailUrl?: string;
  caption?: string;
  taggedPeople?: string[];
  taggedGame?: string;
  createdAt: Timestamp;
  likes: number;
  commentsCount?: number;
  duration?: number; // Video duration in seconds
  categories?: string[];
}

export default function ProfileViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user: currentUser, refreshUser, setNewlyFollowedUserPosts, setNewlyUnfollowedUserId, isUserBlocked, addBlockedUser, addReportedPost } = useAuth();
  const [viewedUser, setViewedUser] = useState<ViewedUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedPostIndex, setSelectedPostIndex] = useState(0);
  const [showPostViewer, setShowPostViewer] = useState(false);
  const [isFollowing, setIsFollowing] = useState(params.preloadedFollowing === 'true');
  const [followChecked, setFollowChecked] = useState(params.preloadedFollowing === 'true');
  const [followLoading, setFollowLoading] = useState(false);
  const [isTargetPrivate, setIsTargetPrivate] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);
  const [riotAccount, setRiotAccount] = useState<any>(null);
  const [valorantAccount, setValorantAccount] = useState<any>(null);
  const [riotStats, setRiotStats] = useState<any>(null);
  const [valorantStats, setValorantStats] = useState<any>(null);
  const [enabledRankCards, setEnabledRankCards] = useState<string[]>([]);
  const [showSocialsSheet, setShowSocialsSheet] = useState(false);
  const [focusedCardIndex, setFocusedCardIndex] = useState<number | null>(null);
  const cardAnimations = useRef<Animated.Value[]>([]).current;
  const [achievements, setAchievements] = useState<{ partyName: string; game: string; placement: number; endDate: string }[]>([]);
  const [loadingAchievements, setLoadingAchievements] = useState(false);
  const [reportingPost, setReportingPost] = useState<Post | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [achievementsError, setAchievementsError] = useState(false);
  const [userNotFound, setUserNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<'clips' | 'achievements'>('clips');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [clipCategories, setClipCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [activeRankCardIndex, setActiveRankCardIndex] = useState(0);
  const [revealedCards, setRevealedCards] = useState<Set<string>>(new Set());

  const tabs: ('clips' | 'achievements')[] = ['clips', 'achievements'];
  const tabScrollRef = useRef<ScrollView>(null);

  const handleTabScroll = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    if (tabs[index] && tabs[index] !== activeTab) {
      setActiveTab(tabs[index]);
    }
  }, [activeTab]);

  const scrollToTab = useCallback((tab: 'clips' | 'achievements') => {
    const index = tabs.indexOf(tab);
    tabScrollRef.current?.scrollTo({ x: index * screenWidth, animated: true });
  }, []);

  // Dynamic games array based on Riot data and enabled rank cards
  // Cards are ordered according to the enabledRankCards array
  const userGames = useMemo(() => (riotAccount || valorantAccount) ?
    enabledRankCards
      .map(gameType => {
        // League of Legends
        if (gameType === 'league' && riotStats) {
          return {
            id: 2,
            name: 'League of Legends',
            rank: riotStats.rankedSolo
              ? formatRank(riotStats.rankedSolo.tier, riotStats.rankedSolo.rank)
              : 'Unranked',
            trophies: 876,
            icon: '⚔️',
            image: require('@/assets/images/leagueoflegends.png'),
            wins: riotStats.rankedSolo?.wins || 0,
            losses: riotStats.rankedSolo?.losses || 0,
            winRate: riotStats.rankedSolo ? Math.round((riotStats.rankedSolo.wins / (riotStats.rankedSolo.wins + riotStats.rankedSolo.losses)) * 100) : 0,
            recentMatches: [],
            profileIconId: riotStats.profileIconId,
            topChampions: riotStats.topChampions || [],
            summonerLevel: riotStats.summonerLevel,
            peakRank: riotStats.peakRank
              ? { tier: `${riotStats.peakRank.tier} ${riotStats.peakRank.rank}`, season: riotStats.peakRank.season || '' }
              : undefined,
          };
        }
        // TFT (Placeholder - TODO: Implement TFT API)
        if (gameType === 'tft') {
          return {
            id: 4,
            name: 'TFT',
            rank: 'Gold I',
            trophies: 45,
            icon: '♟️',
            image: require('@/assets/images/tft.png'),
            wins: 28,
            losses: 22,
            winRate: 56.0,
            recentMatches: [],
            profileIconId: riotStats?.profileIconId,
          };
        }
        // Valorant
        if (gameType === 'valorant' && valorantStats) {
          return {
            id: 3,
            name: 'Valorant',
            rank: valorantStats.currentRank || 'Unranked',
            trophies: valorantStats.rankRating || 0,
            icon: '🎯',
            image: require('@/assets/images/valorant-black.png'),
            wins: valorantStats.wins || 0,
            losses: valorantStats.losses || 0,
            winRate: valorantStats.winRate || 0,
            matchHistory: valorantStats.matchHistory || [],
            valorantCard: valorantStats.card?.small,
            peakRank: valorantStats.peakRank ? { tier: valorantStats.peakRank.tier, season: valorantStats.peakRank.season } : undefined,
            accountLevel: valorantStats.accountLevel,
            gamesPlayed: valorantStats.gamesPlayed,
            mmr: valorantStats.mmr,
            mostPlayedAgent: valorantStats.mostPlayedAgent,
          };
        }
        return null;
      })
      .filter((game): game is NonNullable<typeof game> => game !== null)
    : [], [riotAccount, valorantAccount, riotStats, valorantStats, enabledRankCards]);

  // Get userId from params - this is required for profileView
  const userId = params.userId as string;

  // Get optional preloaded data from params for instant display
  const preloadedUsername = params.username as string | undefined;
  const preloadedAvatar = params.avatar as string | undefined;
  const preloadedFollowing = params.preloadedFollowing as string | undefined;

  // Check which of this user's rank cards have been revealed before
  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem('revealedRankCards').then(data => {
      const revealed: string[] = data ? JSON.parse(data) : [];
      const userCards = revealed.filter(key => key.startsWith(userId + ':'));
      if (userCards.length > 0) {
        setRevealedCards(new Set(userCards));
      }
    });
  }, [userId]);

  const handleRankCardFlip = useCallback(async (gameName: string) => {
    const key = `${userId}:${gameName}`;
    if (revealedCards.has(key)) return;
    setRevealedCards(prev => new Set(prev).add(key));
    try {
      const data = await AsyncStorage.getItem('revealedRankCards');
      const revealed: string[] = data ? JSON.parse(data) : [];
      if (!revealed.includes(key)) {
        revealed.push(key);
        await AsyncStorage.setItem('revealedRankCards', JSON.stringify(revealed));
      }
    } catch {}
  }, [userId, revealedCards]);

  // Initialize card animations when userGames changes
  useEffect(() => {
    // Ensure we have the right number of animation values
    while (cardAnimations.length < userGames.length) {
      cardAnimations.push(new Animated.Value(0));
    }
    // Reset animations when games change
    cardAnimations.forEach(anim => anim.setValue(0));
  }, [userGames.length]);

  // Handle card press - Apple Wallet style focus
  const handleCardPress = (pressedIndex: number) => {
    // Enable LayoutAnimation only when needed (not globally, to avoid interfering with navigation)
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    const totalCards = userGames.length;

    if (focusedCardIndex !== null) {
      if (pressedIndex !== focusedCardIndex) {
        // Clicking a non-focused card - collapse back to stack
        LayoutAnimation.configureNext(
          LayoutAnimation.create(
            300,
            LayoutAnimation.Types.easeInEaseOut,
            LayoutAnimation.Properties.opacity
          )
        );

        // Animate all cards back to original position
        const animations = cardAnimations.slice(0, totalCards).map(anim =>
          Animated.spring(anim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          })
        );
        Animated.parallel(animations).start();
        setFocusedCardIndex(null);
      }
    } else {
      // Clicking a new card - focus on it
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          300,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity
        )
      );

      // Focused card moves to back card position, others stack below
      const CARD_HEIGHT = 220;
      const STACK_OFFSET = 50;
      const GAP = 20; // Gap between focused card and pushed cards

      // Back card position (top of stack, closest to title)
      const backCardTopOffset = (totalCards - 1) * -STACK_OFFSET;

      // Focused card will move to back card position
      const focusedTargetTop = backCardTopOffset;
      const focusedBottomEdge = focusedTargetTop + CARD_HEIGHT;

      // Get all pushed card indices (sorted by index to maintain stack order)
      const pushedCardIndices: number[] = [];
      for (let i = 0; i < totalCards; i++) {
        if (i !== pressedIndex) pushedCardIndices.push(i);
      }

      const animations = cardAnimations.slice(0, totalCards).map((anim, index) => {
        // Current position of this card
        const thisReverseIndex = totalCards - 1 - index;
        const thisTopOffset = thisReverseIndex * -STACK_OFFSET;

        if (index === pressedIndex) {
          // Focused card moves to the back card's position (top)
          const moveAmount = focusedTargetTop - thisTopOffset;
          return Animated.spring(anim, {
            toValue: moveAmount,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          });
        } else {
          // Find this card's position in the pushed stack (0 = back/top, higher = front/bottom)
          const positionInPushedStack = pushedCardIndices.indexOf(index);

          // Target position: stacked below focused card with proper offsets
          const targetTop = focusedBottomEdge + GAP + (positionInPushedStack * STACK_OFFSET);
          const pushAmount = targetTop - thisTopOffset;

          return Animated.spring(anim, {
            toValue: pushAmount,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          });
        }
      });

      Animated.parallel(animations).start();
      setFocusedCardIndex(pressedIndex);
    }
  };

  // Redirect to own profile if trying to view yourself
  useEffect(() => {
    if (userId && currentUser?.id && userId === currentUser.id) {
      router.replace('/(tabs)/profile');
    }
  }, [userId, currentUser?.id]);


  // Parallel data fetching - fetch all data at once for faster load
  const fetchAllData = async () => {
    if (!userId || !currentUser?.id) return;

    try {
      // Fetch user profile, posts, follow status, and pending request in parallel
      const [userDoc, postsSnapshot, followStatus, pendingRequest] = await Promise.all([
        getDoc(doc(db, 'users', userId)),
        getDocs(query(
          collection(db, 'posts'),
          where('userId', '==', userId)
        )),
        checkIsFollowing(currentUser.id, userId),
        hasFollowRequest(currentUser.id, userId),
      ]);

      // Update user profile
      if (userDoc.exists()) {
        const data = userDoc.data();
        setViewedUser({
          id: userDoc.id,
          username: data.username,
          email: data.email,
          avatar: data.avatar,
          coverPhoto: data.coverPhoto,
          bio: data.bio,
          discordLink: data.discordLink,
          instagramLink: data.instagramLink,
          postsCount: data.postsCount || 0,
          followersCount: data.followersCount || 0,
          followingCount: data.followingCount || 0,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : undefined,
        });

        // Set account data
        setRiotAccount(data.riotAccount || null);
        setValorantAccount(data.valorantAccount || null);
        setRiotStats(data.riotStats || null);
        setValorantStats(data.valorantStats || null);
        setEnabledRankCards(data.enabledRankCards || []);
        setClipCategories(data.clipCategories || []);
        // Check online status
        if (data.showOnlineStatus !== false && data.lastActiveAt) {
          const lastActive = data.lastActiveAt.toDate ? data.lastActiveAt.toDate() : new Date(data.lastActiveAt);
          setIsOnline(Date.now() - lastActive.getTime() < 2 * 60 * 1000); // within 2 minutes
        } else {
          setIsOnline(false);
        }
        setIsTargetPrivate(data.isPrivate === true);
        setHasRequested(pendingRequest);

        setLoadingUser(false);
      } else {
        // User has been deleted or doesn't exist
        setUserNotFound(true);
        setLoadingUser(false);
        setLoadingPosts(false);
        return;
      }

      // Update posts - sort by newest first
      let fetchedPosts: Post[] = postsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Post));

      fetchedPosts = fetchedPosts.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

      setPosts(fetchedPosts);
      setLoadingPosts(false);

      // Update follow status
      setIsFollowing(followStatus);
      setFollowChecked(true);
    } catch (error) {
      console.error('Error fetching profile data:', error);
      setLoadingUser(false);
      setLoadingPosts(false);
    }
  };

  // Fetch posts only (for refresh)
  const fetchPosts = async () => {
    if (!userId) return;

    setLoadingPosts(true);
    try {
      const postsQuery = query(
        collection(db, 'posts'),
        where('userId', '==', userId)
      );

      const querySnapshot = await getDocs(postsQuery);
      let fetchedPosts: Post[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Post));

      // Filter out archived posts and sort by newest first
      fetchedPosts = fetchedPosts
        .filter(post => !(post as any).archived)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

      setPosts(fetchedPosts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoadingPosts(false);
    }
  };

  // Set preloaded data immediately for instant display
  useEffect(() => {
    if (preloadedUsername || preloadedAvatar) {
      setViewedUser({
        id: userId,
        username: preloadedUsername || 'User',
        email: '',
        avatar: preloadedAvatar,
        postsCount: 0,
        followersCount: 0,
        followingCount: 0,
      });
      setLoadingUser(false); // Show immediately, will update when real data arrives
    }
  }, [userId, preloadedUsername, preloadedAvatar]);

  // Fetch all data after navigation animation completes for smooth transitions
  useEffect(() => {
    if (!userId || !currentUser?.id) return;
    const task = InteractionManager.runAfterInteractions(() => {
      fetchAllData();
    });
    return () => task.cancel();
  }, [userId, currentUser?.id]);

  // Fetch achievements (completed parties where viewed user placed top 3)
  useEffect(() => {
    if (!userId) return;

    const fetchAchievements = async () => {
      setLoadingAchievements(true);
      setAchievementsError(false);
      try {
        const partiesRef = collection(db, 'parties');
        const partiesQuery = query(partiesRef, where('members', 'array-contains', userId));
        const snapshot = await getDocs(partiesQuery);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const results: { partyName: string; game: string; placement: number; endDate: string }[] = [];

        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (!data.endDate || !data.rankings) return;

          // Parse endDate (MM/DD/YYYY)
          const [month, day, year] = data.endDate.split('/').map(Number);
          const endDate = new Date(year, month - 1, day);
          if (endDate >= today) return; // Not completed yet

          // Find user's ranking
          const userRanking = data.rankings.find((r: any) => r.userId === userId);
          if (userRanking && userRanking.rank >= 1 && userRanking.rank <= 3) {
            results.push({
              partyName: data.partyName,
              game: data.game,
              placement: userRanking.rank,
              endDate: data.endDate,
            });
          }
        });

        // Sort by placement (1st first), then by endDate (most recent first)
        results.sort((a, b) => a.placement - b.placement || b.endDate.localeCompare(a.endDate));
        setAchievements(results);
      } catch (error: any) {
        // Handle permission errors gracefully - this happens when viewing other users' profiles
        if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
          setAchievementsError(true);
        } else {
          console.error('Error fetching achievements:', error);
        }
      } finally {
        setLoadingAchievements(false);
      }
    };

    const task = InteractionManager.runAfterInteractions(() => {
      fetchAchievements();
    });
    return () => task.cancel();
  }, [userId]);

  const handlePostPress = (post: Post, index: number) => {
    setSelectedPost(post);
    setSelectedPostIndex(index);
    setShowPostViewer(true);
  };

  const closePostViewer = () => {
    setShowPostViewer(false);
    setSelectedPost(null);
  };

  // Follow/Unfollow handler
  const handleFollowToggle = async () => {
    if (!currentUser?.id) {
      Alert.alert('Error', 'You must be logged in to follow users');
      return;
    }

    if (!userId || !viewedUser) return;

    setFollowLoading(true);

    try {
      if (isFollowing) {
        // Unfollow
        await unfollowUser(currentUser.id, userId);

        setIsFollowing(false);

        // Update local viewed user state
        setViewedUser({
          ...viewedUser,
          followersCount: (viewedUser.followersCount || 0) - 1,
        });

        // Signal to remove this user's posts from feed
        setNewlyUnfollowedUserId(userId);
      } else if (hasRequested) {
        // Cancel follow request
        await cancelFollowRequest(currentUser.id, userId);
        setHasRequested(false);
      } else if (isTargetPrivate) {
        // Send follow request to private account
        await sendFollowRequest(
          currentUser.id,
          currentUser.username || currentUser.email?.split('@')[0] || 'User',
          currentUser.avatar,
          userId,
        );
        setHasRequested(true);
      } else {
        // Instant follow (public account)
        await followUser(
          currentUser.id,
          currentUser.username || currentUser.email?.split('@')[0] || 'User',
          currentUser.avatar,
          userId,
          viewedUser.username,
          viewedUser.avatar
        );

        setIsFollowing(true);

        // Update local viewed user state
        setViewedUser({
          ...viewedUser,
          followersCount: (viewedUser.followersCount || 0) + 1,
        });

        // Fetch newly followed user's recent posts and store in context
        try {
          const recentPosts = await getUserRecentPosts(userId);
          setNewlyFollowedUserPosts(recentPosts, userId);
        } catch (error) {
          console.error('Error fetching newly followed user posts:', error);
        }
      }

      // Refresh current user data
      await refreshUser();
    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
    } finally {
      setFollowLoading(false);
    }
  };

  // Handle message button
  const handleMessage = () => {
    if (!currentUser?.id || !viewedUser) {
      Alert.alert('Error', 'Unable to start chat');
      return;
    }

    router.push({
      pathname: '/chatPages/chatScreen',
      params: {
        otherUserId: viewedUser.id,
        otherUsername: viewedUser.username,
        otherUserAvatar: viewedUser.avatar || '',
      },
    });
  };

  // Calculate tier border color based on current ranks
  const tierBorderColor = useMemo(() => calculateTierBorderColor(
    riotStats?.rankedSolo ? formatRank(riotStats.rankedSolo.tier, riotStats.rankedSolo.rank) : undefined,
    valorantStats?.currentRank
  ), [riotStats?.rankedSolo?.tier, riotStats?.rankedSolo?.rank, valorantStats?.currentRank]);

  // Calculate tier border gradient based on current ranks
  const tierBorderGradient = useMemo(() => calculateTierBorderGradient(
    riotStats?.rankedSolo ? formatRank(riotStats.rankedSolo.tier, riotStats.rankedSolo.rank) : undefined,
    valorantStats?.currentRank
  ), [riotStats?.rankedSolo?.tier, riotStats?.rankedSolo?.rank, valorantStats?.currentRank]);

  const tierShine = useMemo(() => {
    const tier = calculateTier(
      riotStats?.rankedSolo ? formatRank(riotStats.rankedSolo.tier, riotStats.rankedSolo.rank) : undefined,
      valorantStats?.currentRank
    );
    return tier === 'B' || tier === 'A' || tier === 'S';
  }, [riotStats?.rankedSolo?.tier, riotStats?.rankedSolo?.rank, valorantStats?.currentRank]);

  const handleBlock = () => {
    setShowMoreOptions(false);
    Alert.alert(
      'Block User',
      `Are you sure you want to block ${viewedUser?.username}? They won't be able to see your content or message you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            if (!currentUser?.id || !viewedUser) return;
            try {
              await blockUser(currentUser.id, viewedUser.id, viewedUser.username, viewedUser.avatar);
              addBlockedUser(viewedUser.id);
              setNewlyUnfollowedUserId(viewedUser.id);
              router.back();
            } catch (error) {
              console.error('Error blocking user:', error);
              Alert.alert('Error', 'Failed to block user');
            }
          },
        },
      ]
    );
  };

  // Check if this user is blocked
  const blocked = userId ? isUserBlocked(userId) : false;

  // Show "user not found" screen for deleted accounts or blocked users
  if (userNotFound || blocked) {
    return (
      <ThemedView style={styles.container}>
        {/* Background shimmer — matches tabs pages */}
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
          <View style={styles.shimmerBandSecondary} pointerEvents="none">
            <LinearGradient
              colors={[
                'transparent',
                'rgba(139, 127, 232, 0.035)',
                'transparent',
              ]}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>
        <View style={styles.headerSection}>
          <View style={{ paddingTop: 70, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => router.back()}
            >
              <IconSymbol size={20} name="chevron.left" color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 100 }}>
          <IconSymbol size={64} name="person.crop.circle.badge.xmark" color="#72767d" />
          <ThemedText style={{ fontSize: 20, fontWeight: '600', color: '#fff', marginTop: 16 }}>
            Account Not Found
          </ThemedText>
          <ThemedText style={{ fontSize: 14, color: '#b9bbbe', textAlign: 'center', marginTop: 8 }}>
            This account may have been deleted or is no longer available.
          </ThemedText>
          <TouchableOpacity
            style={{ marginTop: 24, paddingHorizontal: 28, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ThemedText style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Go Back</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Background shimmer — matches tabs pages */}
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
        <View style={styles.shimmerBandSecondary} pointerEvents="none">
          <LinearGradient
            colors={[
              'transparent',
              'rgba(139, 127, 232, 0.035)',
              'transparent',
            ]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} decelerationRate="fast">
        {/* Header Section */}
        <View style={styles.headerSection}>
          {/* Cover Photo Area */}
          <View style={styles.coverPhotoWrapper}>
            {viewedUser?.coverPhoto && (
              <CachedImage uri={viewedUser.coverPhoto} style={styles.coverPhotoImage} />
            )}
            {/* Bottom fade - only when cover photo exists */}
            {viewedUser?.coverPhoto && (
              <LinearGradient
                colors={['transparent', 'rgba(15, 15, 15, 0.15)', 'rgba(15, 15, 15, 0.45)', 'rgba(15, 15, 15, 0.75)', '#0f0f0f']}
                locations={[0, 0.25, 0.5, 0.75, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.coverPhotoFadeBottom}
              />
            )}

            {/* Header Icons overlaid on cover photo */}
            <View style={styles.headerIconsRow}>
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <IconSymbol size={20} name="chevron.left" color="#fff" />
              </TouchableOpacity>
              <View style={styles.headerIconsSpacer} />
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={() => setShowMoreOptions(true)}
                activeOpacity={0.7}
              >
                <IconSymbol size={20} name="ellipsis" color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {loadingUser ? (
            <ProfilePageSkeleton />
          ) : (
          <>
          {/* Profile Info Section - TikTok style: username+handle+stats left, avatar right */}
          <View style={styles.profileInfoSection}>
            <View style={styles.avatarStatsRow}>
              {/* Left side: Username, handle, stats */}
              <View style={styles.usernameStatsGroup}>
                <ThemedText style={styles.coverPhotoUsername} numberOfLines={1}>
                  {viewedUser?.username || 'User'}
                </ThemedText>
                {viewedUser?.createdAt && (
                  <ThemedText style={styles.joinedText}>{formatJoinDate(viewedUser.createdAt)}</ThemedText>
                )}

                {/* Stats row */}
                <View style={styles.statsColumns}>
                  <TouchableOpacity
                    style={styles.statColumn}
                    onPress={() => router.push({
                      pathname: '/profilePages/following',
                      params: { userId: viewedUser?.id }
                    })}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={styles.statNumber}>{formatCount(viewedUser?.followingCount)}</ThemedText>
                    <ThemedText style={styles.statLabel}>Following</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.statColumn}
                    onPress={() => router.push({
                      pathname: '/profilePages/followers',
                      params: { userId: viewedUser?.id }
                    })}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={styles.statNumber}>{formatCount(viewedUser?.followersCount)}</ThemedText>
                    <ThemedText style={styles.statLabel}>Followers</ThemedText>
                  </TouchableOpacity>
                  <View style={styles.statColumn}>
                    <ThemedText style={styles.statNumber}>{formatCount(posts.length)}</ThemedText>
                    <ThemedText style={styles.statLabel}>Posts</ThemedText>
                  </View>
                </View>
              </View>

              {/* Right side: Avatar */}
              <View>
                {tierBorderGradient ? (
                  <GradientBorder
                    colors={tierBorderGradient}
                    borderWidth={2.5}
                    borderRadius={46}
                    shine={tierShine}
                  >
                    <View style={styles.profileAvatarCircleWithGradient}>
                      {isRemoteAvatar(viewedUser?.avatar) ? (
                        <CachedImage uri={viewedUser.avatar!} style={styles.profileAvatarImage} />
                      ) : getDefaultAvatarSource(viewedUser?.avatar) ? (
                        <Image source={getDefaultAvatarSource(viewedUser?.avatar)!} style={styles.profileAvatarImage} />
                      ) : (
                        <ThemedText style={styles.profileAvatarInitial}>
                          {viewedUser?.username?.[0]?.toUpperCase() || 'U'}
                        </ThemedText>
                      )}
                    </View>
                  </GradientBorder>
                ) : (
                  <View style={styles.profileAvatarCircle}>
                    {isRemoteAvatar(viewedUser?.avatar) ? (
                      <CachedImage uri={viewedUser.avatar!} style={styles.profileAvatarImage} />
                    ) : getDefaultAvatarSource(viewedUser?.avatar) ? (
                      <Image source={getDefaultAvatarSource(viewedUser?.avatar)!} style={styles.profileAvatarImage} />
                    ) : (
                      <ThemedText style={styles.profileAvatarInitial}>
                        {viewedUser?.username?.[0]?.toUpperCase() || 'U'}
                      </ThemedText>
                    )}
                  </View>
                )}
              </View>
            </View>

            {/* Action Row: Follow Button + Social Icons */}
            <View style={styles.actionRow}>
              {followChecked && (
                <TouchableOpacity
                  style={[styles.followButton, (isFollowing || hasRequested) && styles.followButtonFollowing]}
                  onPress={handleFollowToggle}
                  disabled={followLoading}
                  activeOpacity={0.7}
                >
                  <ThemedText style={[styles.followButtonText, (isFollowing || hasRequested) && styles.followButtonTextFollowing]}>
                    {followLoading ? '...' : isFollowing ? 'Following' : hasRequested ? 'Requested' : 'Follow'}
                  </ThemedText>
                </TouchableOpacity>
              )}

              <View style={styles.socialIconsGroup}>
                {/* Messages */}
                <TouchableOpacity
                  style={styles.socialIconButton}
                  onPress={handleMessage}
                  activeOpacity={0.7}
                >
                  <IconSymbol size={18} name="paperplane.fill" color="#fff" />
                </TouchableOpacity>

                {/* Instagram */}
                {viewedUser?.instagramLink && (
                  <TouchableOpacity
                    style={styles.socialIconButton}
                    onPress={async () => {
                      try {
                        const username = viewedUser.instagramLink!.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
                        const appUrl = `instagram://user?username=${username}`;
                        const webUrl = `https://instagram.com/${username}`;
                        const supported = await Linking.canOpenURL(appUrl);
                        if (supported) {
                          await Linking.openURL(appUrl);
                        } else {
                          await Linking.openURL(webUrl);
                        }
                      } catch (error) {
                        Alert.alert('Error', 'Failed to open Instagram');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={require('@/assets/images/instagram.png')}
                      style={styles.socialIconImage}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                )}

                {/* Discord */}
                {viewedUser?.discordLink && (
                  <TouchableOpacity
                    style={styles.socialIconButton}
                    onPress={async () => {
                      try {
                        await Clipboard.setStringAsync(viewedUser.discordLink!);
                        Alert.alert('Copied!', `Discord username "${viewedUser.discordLink}" copied to clipboard`);
                      } catch (error) {
                        Alert.alert('Error', 'Failed to copy Discord username');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={require('@/assets/images/discord.png')}
                      style={styles.socialIconImage}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Bio */}
            {viewedUser?.bio && (
              <View style={styles.bioSection}>
                <ThemedText style={styles.bioText}>{viewedUser.bio}</ThemedText>
              </View>
            )}
          </View>

        {/* Private Account Message */}
        {isTargetPrivate && !isFollowing && userId !== currentUser?.id && (
          <View style={styles.privateAccountMessage}>
            <IconSymbol size={40} name="lock.fill" color="#555" />
            <ThemedText style={styles.privateAccountTitle}>This Account is Private</ThemedText>
            <ThemedText style={styles.privateAccountSubtext}>
              Follow this account to see their posts and achievements
            </ThemedText>
          </View>
        )}

        {/* Section Divider */}
        <View style={styles.profileSectionDivider} />

        {/* Rank Cards Preview */}
        {(!isTargetPrivate || isFollowing || userId === currentUser?.id) && userGames.length > 0 && (
          <View style={styles.rankCardsPreview}>
            {/* Header */}
            <View style={styles.rankCardsPreviewHeader}>
              <View style={styles.rankCardsPreviewHeaderLeft}>
                <ThemedText style={styles.rankCardsPreviewTitle}>Rank Cards</ThemedText>
                <IconSymbol size={16} name="sparkle" color="rgba(255,255,255,0.4)" />
              </View>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/profilePages/rankCards', params: { userId } })}
                activeOpacity={0.7}
                style={styles.rankCardsViewAll}
              >
                <ThemedText style={styles.rankCardsViewAllText}>View all</ThemedText>
                <IconSymbol size={14} name="arrow.right" color="#F0D6A2" />
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.rankCardsPreviewSubtitle}>
              {userId === currentUser?.id ? 'Your ranked journey' : `${viewedUser?.username}'s ranked journey`}
            </ThemedText>

            {/* Horizontal scrolling rank cards */}
            <ScrollView
              horizontal
              pagingEnabled={false}
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={screenWidth - 32 + 16}
              snapToAlignment="start"
              contentContainerStyle={styles.rankCardsScrollContent}
              onScroll={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / (screenWidth - 32 + 16));
                setActiveRankCardIndex(index);
              }}
              scrollEventThrottle={16}
            >
              {userGames.map((game) => {
                let displayUsername = viewedUser?.username || '';
                if (game.name === 'Valorant' && valorantAccount) {
                  displayUsername = `${valorantAccount.gameName}#${valorantAccount.tagLine}`;
                } else if ((game.name === 'League of Legends' || game.name === 'TFT') && riotAccount) {
                  displayUsername = `${riotAccount.gameName}#${riotAccount.tagLine}`;
                }
                const isOtherUser = userId !== currentUser?.id;
                return (
                  <View key={game.id} style={styles.rankCardPreviewItem}>
                    <View style={styles.rankCardPreviewScale}>
                      <RankCard
                        game={game}
                        username={displayUsername}
                        viewOnly={false}
                        userId={isOtherUser ? userId : undefined}
                        isFocused={true}
                        flipOnly={true}
                        autoReveal={revealedCards.has(`${userId}:${game.name}`)}
                        onFlip={() => handleRankCardFlip(game.name)}
                      />
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Dot indicators */}
            {userGames.length > 1 && (
              <View style={styles.rankCardsDots}>
                {userGames.map((game, index) => (
                  <View
                    key={game.id}
                    style={[
                      styles.rankCardsDot,
                      index === activeRankCardIndex && styles.rankCardsDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Clips Section */}
        {(!isTargetPrivate || isFollowing || userId === currentUser?.id) && (
          <View style={styles.clipsSection}>
            {/* Clips Header */}
            <View style={styles.clipsSectionHeader}>
              <View style={styles.clipsSectionHeaderLeft}>
                <ThemedText style={styles.clipsSectionTitle}>Clips</ThemedText>
                <IconSymbol size={18} name="film" color="rgba(255,255,255,0.4)" />
              </View>
              {posts.length > 0 && (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/profilePages/clips', params: { userId } })}
                  activeOpacity={0.7}
                  style={styles.clipsViewAll}
                >
                  <ThemedText style={styles.clipsViewAllText}>View all</ThemedText>
                  <IconSymbol size={14} name="arrow.right" color="#F0D6A2" />
                </TouchableOpacity>
              )}
            </View>

            {posts.length > 0 ? (
              <View style={styles.clipsGrid}>
                {/* Featured large clip */}
                <View style={styles.clipsFeatured}>
                  <TouchableOpacity
                    style={StyleSheet.absoluteFillObject}
                    onPress={() => router.push({ pathname: '/postViewer', params: { postId: posts[0].id, allPostIds: JSON.stringify(posts.map(p => p.id)) } })}
                    activeOpacity={0.85}
                  >
                    <CachedImage
                      uri={posts[0].thumbnailUrl || posts[0].mediaUrl}
                      style={StyleSheet.absoluteFillObject}
                      resizeMode="cover"
                    />
                    <View style={styles.clipOverlay}>
                      <View style={styles.clipPlayButton}>
                        <IconSymbol size={16} name="play.fill" color="#fff" />
                      </View>
                      {posts[0].duration != null && (
                        <View style={styles.clipDuration}>
                          <ThemedText style={styles.clipDurationText}>
                            {Math.floor(posts[0].duration / 60)}:{String(Math.floor(posts[0].duration % 60)).padStart(2, '0')}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Right side stacked clips */}
                <View style={styles.clipsStack}>
                  {posts.slice(1, 3).map((post) => (
                    <View key={post.id} style={styles.clipsStackItem}>
                      <TouchableOpacity
                        style={StyleSheet.absoluteFillObject}
                        onPress={() => router.push({ pathname: '/postViewer', params: { postId: post.id, allPostIds: JSON.stringify(posts.map(p => p.id)) } })}
                        activeOpacity={0.85}
                      >
                        <CachedImage
                          uri={post.thumbnailUrl || post.mediaUrl}
                          style={StyleSheet.absoluteFillObject}
                          resizeMode="cover"
                        />
                        <View style={styles.clipsStackThumbOverlay}>
                          <View style={styles.clipPlayButtonSmall}>
                            <IconSymbol size={10} name="play.fill" color="#fff" />
                          </View>
                          {post.duration != null && (
                            <View style={styles.clipDurationSmall}>
                              <ThemedText style={styles.clipDurationTextSmall}>
                                {Math.floor(post.duration / 60)}:{String(Math.floor(post.duration % 60)).padStart(2, '0')}
                              </ThemedText>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.clipsEmpty}>
                <IconSymbol size={24} name="video.fill" color="rgba(255,255,255,0.2)" />
                <ThemedText style={styles.clipsEmptyText}>No clips yet</ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Achievements Section */}
        {(!isTargetPrivate || isFollowing || userId === currentUser?.id) && (
          <View style={styles.achievementsSection}>
            {/* Header */}
            <View style={styles.achievementsSectionHeader}>
              <View style={styles.achievementsSectionHeaderLeft}>
                <ThemedText style={styles.achievementsSectionTitle}>Achievements</ThemedText>
                <IconSymbol size={18} name="trophy" color="rgba(255,255,255,0.4)" />
              </View>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/profilePages/achievementsBadges', params: { userId } })}
                activeOpacity={0.7}
                style={styles.achievementsViewAll}
              >
                <ThemedText style={styles.achievementsViewAllText}>View all</ThemedText>
                <IconSymbol size={14} name="arrow.right" color="#F0D6A2" />
              </TouchableOpacity>
            </View>

            {/* Badge cards row */}
            {achievements.length > 0 ? (
              <View style={styles.achievementsBadgeRow}>
                {achievements.slice(0, 4).map((achievement, index) => {
                  const isGold = achievement.placement === 1;
                  const isSilver = achievement.placement === 2;
                  const medal = isGold ? '\u{1F947}' : isSilver ? '\u{1F948}' : '\u{1F949}';
                  const placementLabel = isGold ? '1st Place' : isSilver ? '2nd Place' : '3rd Place';
                  return (
                    <TouchableOpacity
                      key={index}
                      style={styles.achievementCard}
                      onPress={() => router.push({ pathname: '/profilePages/achievementsBadges', params: { userId } })}
                      activeOpacity={0.85}
                    >
                      <View style={styles.achievementCardIcon}>
                        <ThemedText style={styles.achievementCardEmoji}>{medal}</ThemedText>
                      </View>
                      <ThemedText style={styles.achievementCardName} numberOfLines={1}>
                        {achievement.partyName}
                      </ThemedText>
                      <ThemedText style={styles.achievementCardDesc} numberOfLines={1}>
                        {placementLabel}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.achievementsEmpty}>
                <IconSymbol size={24} name="trophy" color="rgba(255,255,255,0.2)" />
                <ThemedText style={styles.achievementsEmptyText}>No achievements yet</ThemedText>
              </View>
            )}
          </View>
        )}
        </>
        )}
        </View>
      </ScrollView>

      {/* Post Viewer Modal */}
      {showPostViewer && (
        <PostViewerModal
          visible={showPostViewer}
          post={selectedPost}
          posts={posts}
          currentIndex={selectedPostIndex}
          userAvatar={viewedUser?.avatar}
          onClose={closePostViewer}
          onCommentAdded={fetchPosts}
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
            setPosts(prev => prev.filter(p => p.id !== postId));
            setShowPostViewer(false);
          }}
        />
      )}

      {/* Socials Bottom Sheet */}
      <Modal
        visible={showSocialsSheet}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSocialsSheet(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSocialsSheet(false)}
        >
          <View style={styles.bottomSheet}>
            <TouchableOpacity activeOpacity={1}>
              {/* Sheet Header */}
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHandle} />
                <ThemedText style={styles.sheetTitle}>Socials</ThemedText>
              </View>

              {/* Social Links */}
              <View style={styles.socialLinksContainer}>
                {/* Instagram */}
                {viewedUser?.instagramLink && (
                  <TouchableOpacity
                    style={styles.socialOption}
                    onPress={async () => {
                      setShowSocialsSheet(false);
                      try {
                        const username = viewedUser.instagramLink.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
                        const appUrl = `instagram://user?username=${username}`;
                        const webUrl = `https://instagram.com/${username}`;

                        const supported = await Linking.canOpenURL(appUrl);
                        if (supported) {
                          await Linking.openURL(appUrl);
                        } else {
                          await Linking.openURL(webUrl);
                        }
                      } catch (error) {
                        console.error('Error opening Instagram:', error);
                        Alert.alert('Error', 'Failed to open Instagram');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.socialOptionLeft}>
                      <View style={styles.instagramIconContainer}>
                        <Image
                          source={require('@/assets/images/instagram.png')}
                          style={styles.socialOptionIcon}
                          resizeMode="contain"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.socialOptionTitle}>Instagram</ThemedText>
                        <ThemedText style={styles.socialOptionSubtitle}>
                          {viewedUser.instagramLink.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')}
                        </ThemedText>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Discord */}
                {viewedUser?.discordLink && (
                  <TouchableOpacity
                    style={styles.socialOption}
                    onPress={async () => {
                      setShowSocialsSheet(false);
                      try {
                        await Clipboard.setStringAsync(viewedUser.discordLink);
                        Alert.alert(
                          'Copied!',
                          `Discord username "${viewedUser.discordLink}" copied to clipboard`,
                          [{ text: 'OK' }]
                        );
                      } catch (error) {
                        console.error('Error copying to clipboard:', error);
                        Alert.alert('Error', 'Failed to copy Discord username');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.socialOptionLeft}>
                      <View style={styles.discordIconContainer}>
                        <Image
                          source={require('@/assets/images/discord.png')}
                          style={styles.socialOptionIcon}
                          resizeMode="contain"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.socialOptionTitle}>Discord</ThemedText>
                        <ThemedText style={styles.socialOptionSubtitle}>
                          {viewedUser.discordLink}
                        </ThemedText>
                      </View>
                    </View>
                    <IconSymbol size={20} name="doc.on.doc" color="#999" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Cancel Button */}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowSocialsSheet(false)}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* More Options Bottom Sheet */}
      <Modal
        visible={showMoreOptions}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMoreOptions(false)}
      >
        <TouchableOpacity
          style={styles.moreOverlay}
          activeOpacity={1}
          onPress={() => setShowMoreOptions(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.moreSheet}>
            {/* Handle */}
            <View style={styles.moreHandleRow}>
              <View style={styles.moreHandle} />
            </View>

            {/* Options group */}
            <View style={styles.moreOptionsGroup}>
              {/* Share Profile */}
              <TouchableOpacity
                style={styles.moreOptionItem}
                onPress={async () => {
                  setShowMoreOptions(false);
                  if (viewedUser?.username) {
                    await Clipboard.setStringAsync(viewedUser.username);
                    Alert.alert('Copied', `@${viewedUser.username} copied to clipboard`);
                  }
                }}
                activeOpacity={0.6}
              >
                <View style={styles.moreOptionIcon}>
                  <IconSymbol size={18} name="square.and.arrow.up" color="#fff" />
                </View>
                <ThemedText style={styles.moreOptionLabel}>Share Profile</ThemedText>
              </TouchableOpacity>

              <View style={styles.moreOptionDivider} />

              {/* Report */}
              <TouchableOpacity
                style={styles.moreOptionItem}
                onPress={() => {
                  setShowMoreOptions(false);
                  Alert.alert('Report', 'This user has been reported. We will review your report shortly.');
                }}
                activeOpacity={0.6}
              >
                <View style={styles.moreOptionIcon}>
                  <IconSymbol size={18} name="exclamationmark.triangle" color="#fff" />
                </View>
                <ThemedText style={styles.moreOptionLabel}>Report</ThemedText>
              </TouchableOpacity>

              <View style={styles.moreOptionDivider} />

              {/* Block */}
              <TouchableOpacity
                style={styles.moreOptionItem}
                onPress={handleBlock}
                activeOpacity={0.6}
              >
                <View style={[styles.moreOptionIcon, styles.moreOptionIconDestructive]}>
                  <IconSymbol size={18} name="hand.raised.fill" color="#ff453a" />
                </View>
                <ThemedText style={styles.moreOptionLabelDestructive}>
                  Block @{viewedUser?.username}
                </ThemedText>
              </TouchableOpacity>
            </View>

            {/* Cancel */}
            <TouchableOpacity
              style={styles.moreCancelButton}
              onPress={() => setShowMoreOptions(false)}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.moreCancelText}>Cancel</ThemedText>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  privateAccountMessage: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 10,
  },
  privateAccountTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginTop: 4,
  },
  privateAccountSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  backgroundGlow: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  shimmerBand: {
    position: 'absolute',
    top: -screenHeight * 0.35,
    left: -screenWidth * 0.6,
    width: screenWidth * 2.2,
    height: screenHeight * 1.7,
    transform: [{ rotate: '20deg' }],
  },
  shimmerBandSecondary: {
    position: 'absolute',
    top: -screenHeight * 0.2,
    left: -screenWidth * 0.1,
    width: screenWidth * 1.9,
    height: screenHeight * 1.5,
    transform: [{ rotate: '-15deg' }],
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#fff',
  },
  headerSection: {},
  // Header icons row - overlaid on cover photo
  headerIconsRow: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  headerIconsSpacer: {
    flex: 1,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Cover photo area - reaches top of screen
  coverPhotoWrapper: {
    width: '100%',
    height: 170,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  coverPhotoImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.8,
  },
  coverPhotoGradient: {
    width: '100%',
    height: '100%',
  },
  coverPhotoFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    zIndex: 1,
  },
  coverPhotoUsernameRow: {
    position: 'absolute',
    bottom: 4,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  coverPhotoUsername: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  // Profile info section below cover
  profileInfoSection: {
    marginTop: 12,
    paddingHorizontal: 20,
    zIndex: 3,
  },
  usernameStatsGroup: {
    flex: 1,
    marginRight: 16,
  },
  profileHandle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#72767d',
  },
  profileUsername: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  joinedText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#555',
    marginTop: 2,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  avatarStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileAvatarCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#36393e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#0f0f0f',
  },
  profileAvatarCircleWithGradient: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#36393e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 46,
  },
  profileAvatarInitial: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  // Stats row below username
  statsColumns: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 20,
  },
  statColumn: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#72767d',
    marginTop: 1,
  },
  // Action row: Follow Button + Social icons
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  followButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#FF3B5C',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonFollowing: {
    backgroundColor: '#2a2a2a',
  },
  followButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  followButtonTextFollowing: {
    fontWeight: '600',
  },
  socialIconsGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  socialIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialIconImage: {
    width: 18,
    height: 18,
  },
  // Bio section
  bioSection: {
    marginTop: 10,
  },
  bioText: {
    fontSize: 13,
    color: '#b9bbbe',
    lineHeight: 19,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#2c2f33',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#424549',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#72767d',
    borderRadius: 2,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  socialLinksContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  socialOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#424549',
  },
  socialOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  instagramIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#36393e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E4405F',
  },
  discordIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#36393e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#5865F2',
  },
  socialOptionIcon: {
    width: 28,
    height: 28,
  },
  socialOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  socialOptionSubtitle: {
    fontSize: 13,
    color: '#b9bbbe',
  },
  cancelButton: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 16,
    backgroundColor: '#424549',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  section: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  postsSection: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F0D6A2',
  },
  walletViewButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#36393e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#424549',
  },
  sectionContainer: {
    marginHorizontal: 0,
    marginBottom: 4,
  },
  // Rank Cards Preview
  rankCardsPreview: {
    marginTop: 16,
    marginBottom: 4,
  },
  rankCardsPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 2,
  },
  rankCardsPreviewHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankCardsPreviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  rankCardsPreviewSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  rankCardsViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rankCardsViewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  rankCardsScrollContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  rankCardPreviewItem: {
    width: screenWidth - 32,
    height: 220,
  },
  rankCardPreviewScale: {
    width: screenWidth - 32,
    height: 220,
  },
  rankCardsDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  rankCardsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  rankCardsDotActive: {
    width: 18,
    borderRadius: 3,
    backgroundColor: '#F0D6A2',
  },
  // Clips Section
  clipsSection: {
    marginHorizontal: 16,
    marginTop: 10,
  },
  clipsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  clipsSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clipsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  clipsViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clipsViewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  clipsGrid: {
    flexDirection: 'row',
    gap: 6,
    height: 170,
  },
  clipsFeatured: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  clipOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 10,
  },
  clipPlayButton: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipDuration: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  clipDurationText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  clipsStack: {
    flex: 1,
    gap: 6,
  },
  clipsStackItem: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  clipsStackThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 6,
  },
  clipPlayButtonSmall: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipDurationSmall: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  clipDurationTextSmall: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  clipsEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  clipsEmptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
  },
  // Achievements Section
  achievementsSection: {
    marginHorizontal: 16,
    marginTop: 28,
    marginBottom: 16,
  },
  achievementsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  achievementsSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  achievementsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  achievementsViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  achievementsViewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  achievementsBadgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  achievementCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  achievementsEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  achievementsEmptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
  },
  achievementCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  achievementCardEmoji: {
    fontSize: 24,
  },
  achievementCardName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 2,
  },
  achievementCardDesc: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  rankCardsSection: {
    marginBottom: 8,
  },
  // Rank Cards Banner — glass teaser style
  profileSectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 20,
    marginTop: 16,
  },
  bannerRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 16,
  },
  miniBanner: {
    flex: 1,
    aspectRatio: 0.75,
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  miniBannerTopEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },
  miniBannerContent: {
    gap: 4,
  },
  miniBannerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  miniBannerCount: {
    fontSize: 12,
    color: '#9a9a9a',
    fontWeight: '500',
  },
  miniBannerChevron: {
    position: 'absolute',
    top: 16,
    right: 14,
  },
  rankCardsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  rankBannerBody: {
    flex: 1,
  },
  rankCardsBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  rankCardsBannerSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
    marginBottom: 10,
  },
  rankPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  rankPillGameIcon: {
    width: 16,
    height: 16,
  },
  rankPillRankIcon: {
    width: 20,
    height: 20,
  },
  rankPillRank: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  clipsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginTop: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  clipsBannerLeft: {
    flex: 1,
  },
  clipsBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  clipsBannerCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
  clipsThumbnailRow: {
    flexDirection: 'column',
    gap: 4,
  },
  clipsThumbnailWrap: {
    width: 70,
    height: 42,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  clipsThumbnailImg: {
    width: '100%',
    height: '100%',
  },
  clipsThumbnailEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBannerRecentPill: {
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  miniBannerRecentText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '600',
  },
  achievementsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  // 2-column landscape clips grid
  categoryFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
  },
  categoryPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  categoryPillActive: {
    backgroundColor: 'rgba(196, 39, 67, 0.15)',
    borderColor: 'rgba(196, 39, 67, 0.4)',
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  categoryPillTextActive: {
    color: '#fff',
  },
  gridClipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 6,
  },
  gridClipItem: {
    width: (screenWidth - 30) / 2,
    aspectRatio: 16 / 9,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  gridClipImage: {
    width: '100%',
    height: '100%',
  },
  gridClipBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  gridClipMeta: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  gridClipMetaText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  gridClipLikes: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  // Achievements badge grid
  achievementsBadgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  achievementBadgeWrapper: {
    width: '33.333%',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  achievementBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  achievementBadgeShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  achievementBadgeInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  achievementBadgeMedal: {
    fontSize: 28,
    textAlign: 'center',
  },
  achievementBadgeName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: '100%',
  },
  achievementBadgePlacement: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  horizontalClipsContainer: {
    paddingLeft: 20,
    paddingRight: 20,
    gap: 6,
  },
  horizontalClipItem: {
    width: 120,
    height: 120,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  horizontalClipImage: {
    width: '100%',
    height: '100%',
  },
  verticalRankCardsContainer: {
    paddingHorizontal: 6,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 16,
  },
  stackedCardsWrapper: {
    position: 'relative',
    height: 320,
    width: '100%',
  },
  stackedCardItem: {
    position: 'absolute',
    width: '100%',
    left: 0,
    shadowColor: '#000',
    shadowOffset: {
      width: 8,
      height: 12,
    },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 16,
  },
  walletViewButtonInTab: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#36393e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#424549',
    marginBottom: 4,
  },
  verticalCardWrapper: {
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 8,
      height: 12,
    },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 16,
  },
  postsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#72767d',
    marginBottom: 6,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#b9bbbe',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 240,
  },
  emptyRankCardsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyStateSimple: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyStateSimpleText: {
    fontSize: 14,
    color: '#72767d',
  },
  loadingText: {
    fontSize: 14,
    color: '#b9bbbe',
    marginTop: 12,
  },
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1,
    marginTop: 0,
  },
  postItem: {
    width: (screenWidth - 2) / 3,
    height: ((screenWidth - 2) / 3) * 1.25,
    backgroundColor: '#36393e',
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  videoDuration: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  videoDurationText: {
    fontSize: 9,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  skeletonAvatar: {
    backgroundColor: '#e5e5e5',
  },
  skeletonText: {
    backgroundColor: '#e5e5e5',
    borderRadius: 4,
  },
  horizontalAchievementsContainer: {
    paddingHorizontal: 20,
    gap: 6,
  },
  achievementCard: {
    width: 140,
    height: 140,
    backgroundColor: '#2c2f33',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderTopColor: '#3a3f44',
    borderLeftColor: '#3a3f44',
    borderBottomColor: '#16191b',
    borderRightColor: '#16191b',
  },
  achievementMedal: {
    fontSize: 32,
    marginBottom: 6,
  },
  achievementPlacement: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  achievementPartyName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#b9bbbe',
    textAlign: 'center',
    lineHeight: 14,
  },
  achievementGame: {
    fontSize: 10,
    fontWeight: '600',
    color: '#72767d',
    marginTop: 4,
  },
  // More Options sheet
  moreOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  moreSheet: {
    backgroundColor: '#161616',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  moreHandleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 18,
  },
  moreHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  moreOptionsGroup: {
    marginHorizontal: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    overflow: 'hidden',
  },
  moreOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  moreOptionDivider: {
    height: 1,
    backgroundColor: '#252525',
    marginLeft: 62,
  },
  moreOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreOptionIconDestructive: {
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
  },
  moreOptionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -0.2,
  },
  moreOptionLabelDestructive: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ff453a',
    letterSpacing: -0.2,
  },
  moreCancelButton: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 14,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    alignItems: 'center',
  },
  moreCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
