import rankCard from '@/app/components/rankCard';

// Alias for JSX usage (React components must start with uppercase)
const RankCard = rankCard;
import PostDuoCard from '@/app/components/postDuoCard';
import { DuoCardData } from '@/app/(tabs)/duoFinder';
import PostViewerModal from '@/app/components/postViewerModal';
import ManageCategoriesModal from '@/app/components/manageCategoriesModal';
import AssignCategoryModal from '@/app/components/assignCategoryModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { collection, getDocs, query, Timestamp, where, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Linking, Modal, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View, LayoutAnimation, Platform, UIManager, Animated } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLeagueStats, getTftStats, formatRank } from '@/services/riotService';
import { useValorantStats } from '@/contexts/ValorantStatsContext';
import { deletePostMedia } from '@/services/storageService';
import { deleteDoc } from 'firebase/firestore';
import { calculateTierBorderColor, calculateTierBorderGradient, calculateTier } from '@/utils/tierBorderUtils';
import { formatCount } from '@/utils/formatCount';
import { ProfilePageSkeleton } from '@/components/ui/Skeleton';
import GradientBorder from '@/components/GradientBorder';
import { isRemoteAvatar, getDefaultAvatarSource, hasAvatar } from '@/utils/resolveAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

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
const TAB_CONTENT_MIN_HEIGHT = screenHeight * 0.4;
const CARD_PADDING = 20;
const CARD_GAP = 16;
const CARD_WIDTH = screenWidth - (CARD_PADDING * 2);

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
  taggedUsers?: any[];
  taggedGame?: string;
  createdAt: Timestamp;
  likes: number;
  commentsCount?: number;
  duration?: number; // Video duration in seconds
  categories?: string[];
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

// Helper function to format video duration
const formatDuration = (seconds?: number): string => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Darken a hex color by mixing it toward black
function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * factor);
  const dg = Math.round(g * factor);
  const db = Math.round(b * factor);
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useLocalSearchParams<{ refresh?: string }>();
  const { user, refreshUser, preloadedProfilePosts, preloadedRiotStats, clearPreloadedProfileData } = useAuth();
  const { valorantStats, fetchStats: fetchValorantStats } = useValorantStats();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedPostIndex, setSelectedPostIndex] = useState(0);
  const [showPostViewer, setShowPostViewer] = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Duo card state for posting
  const [valorantCard, setValorantCard] = useState<DuoCardData | null>(null);
  const [leagueCard, setLeagueCard] = useState<DuoCardData | null>(null);
  const [valorantInGameIcon, setValorantInGameIcon] = useState<string | undefined>(undefined);
  const [valorantInGameName, setValorantInGameName] = useState<string | undefined>(undefined);
  const [valorantWinRate, setValorantWinRate] = useState<number | undefined>(undefined);
  const [leagueInGameIcon, setLeagueInGameIcon] = useState<string | undefined>(undefined);
  const [leagueInGameName, setLeagueInGameName] = useState<string | undefined>(undefined);
  const [leagueWinRate, setLeagueWinRate] = useState<number | undefined>(undefined);
  const [achievements, setAchievements] = useState<{ partyId: string; partyName: string; game: string; placement: number; endDate: string }[]>([]);
  const [loadingAchievements, setLoadingAchievements] = useState(true);
  const [riotAccount, setRiotAccount] = useState<any>(null);
  const [valorantAccount, setValorantAccount] = useState<any>(null);
  const [riotStats, setRiotStats] = useState<any>(null);
  const [tftStats, setTftStats] = useState<any>(null);
  const [enabledRankCards, setEnabledRankCards] = useState<string[]>([]);
  const [loadingRankCards, setLoadingRankCards] = useState(true);
  const [activeRankCardIndex, setActiveRankCardIndex] = useState(0);
  const [showRankCardBack, setShowRankCardBack] = useState(false);
  const [joinedAt, setJoinedAt] = useState<Date | null>(null);
  const [hasConsumedPreloadPosts, setHasConsumedPreloadPosts] = useState(false);
  const [hasConsumedPreloadRiot, setHasConsumedPreloadRiot] = useState(false);
  const [showSocialsDropdown, setShowSocialsDropdown] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Avatar loading state
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [avatarKey, setAvatarKey] = useState(0); // Key to force image reload

  // Cover photo loading state
  const [coverPhotoLoaded, setCoverPhotoLoaded] = useState(false);
  const [coverPhotoKey, setCoverPhotoKey] = useState(0); // Key to force image reload

  // Combined loading state - all data fetched, ready to reveal everything together
  const [allContentLoaded, setAllContentLoaded] = useState(false);

  // Category state
  const [clipCategories, setClipCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [showAssignCategory, setShowAssignCategory] = useState(false);
  const [categorizingPost, setCategorizingPost] = useState<Post | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'clips' | 'achievements'>('clips');
  const tabs: ('clips' | 'achievements')[] = ['clips', 'achievements'];
  const tabScrollRef = useRef<ScrollView>(null);
  const isRemovingPost = useRef(false);

  const handleTabScroll = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    const tab = tabs[index];
    if (tab) {
      setActiveTab(tab);
    }
  }, []);

  const scrollToTab = useCallback((tab: 'clips' | 'achievements') => {
    const index = tabs.indexOf(tab);
    tabScrollRef.current?.scrollTo({ x: index * screenWidth, animated: true });
  }, []);

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Set avatar as loaded if it's not an image (emoji or letter)
  // Also increment avatarKey to force image reload when avatar changes
  useEffect(() => {
    if (!hasAvatar(user?.avatar)) {
      setAvatarLoaded(true);
    } else {
      setAvatarLoaded(false);
      setAvatarError(false);
      setAvatarKey(prev => prev + 1); // Force image component to remount
    }
  }, [user?.avatar]);

  // Set cover photo as loaded if there's no cover photo (gradient)
  // Also increment coverPhotoKey to force image reload when cover photo changes
  useEffect(() => {
    if (!user?.coverPhoto) {
      setCoverPhotoLoaded(true);
    } else {
      setCoverPhotoLoaded(false);
      setCoverPhotoKey(prev => prev + 1); // Force image component to remount
    }
  }, [user?.coverPhoto]);

  // Coordinate all sections - reveal everything together once all data is fetched
  useEffect(() => {
    if (!loadingPosts && !loadingRankCards && !loadingAchievements) {
      console.log('✅ All profile content loaded, revealing together');
      // Small delay for images to paint
      setTimeout(() => {
        setAllContentLoaded(true);
      }, 50);
    }
  }, [loadingPosts, loadingRankCards, loadingAchievements]);

  // Timeout fallback - if data takes too long (4 seconds), reveal anyway
  useEffect(() => {
    if (!allContentLoaded && user?.id) {
      const timeout = setTimeout(() => {
        console.log('⏱️ Profile load timeout, revealing content');
        setAllContentLoaded(true);
      }, 4000);

      return () => clearTimeout(timeout);
    }
  }, [allContentLoaded, user?.id]);

  // Debug logging - only when values change
  useEffect(() => {
    console.log('Profile - Riot Account:', riotAccount ? 'Set' : 'Not set');
    console.log('Profile - Valorant Account:', valorantAccount ? 'Set' : 'Not set');
    console.log('Profile - Riot Stats:', riotStats ? 'Set' : 'Not set');
    console.log('Profile - Valorant Stats:', valorantStats ? 'Set' : 'Not set');
    console.log('Profile - Valorant matchHistory:', valorantStats?.matchHistory?.length ?? 'none', valorantStats?.matchHistory);
    console.log('Profile - Enabled Rank Cards:', enabledRankCards);
  }, [riotAccount, valorantAccount, riotStats, valorantStats, enabledRankCards]);

  // Dynamic games array based on Riot data and enabled rank cards
  // Show rank cards if user has either Riot account OR Valorant account
  // Cards are ordered according to the enabledRankCards array
  const userGamesBase = (riotAccount || valorantAccount) ?
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
            trophies: riotStats.rankedSolo?.leaguePoints || 0,
            icon: '⚔️',
            image: require('@/assets/images/leagueoflegends.png'),
            wins: riotStats.rankedSolo?.wins || 0,
            losses: riotStats.rankedSolo?.losses || 0,
            winRate: riotStats.rankedSolo?.winRate || 0,
            recentMatches: ['+15', '-18', '+20', '+17', '-14'],
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
            recentMatches: ['+12', '-10', '+15', '+18', '-8'],
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
    : [];

  const userGames = userGamesBase;

  // Fetch Riot account and stats (League and TFT)
  // Lightweight function to fetch enabled rank cards and account data from Firestore (no API calls)
  const fetchEnabledRankCards = async () => {
    if (!user?.id) return;

    try {
      const userDoc = await getDoc(doc(db, 'users', user.id));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const cards = data.enabledRankCards || [];
        let updatedCards = [...cards];
        if (data.riotAccount && !updatedCards.includes('league')) {
          updatedCards.push('league');
        }
        if (data.valorantAccount && !updatedCards.includes('valorant')) {
          updatedCards.push('valorant');
        }
        // Remove cards for unlinked accounts
        if (!data.riotAccount) {
          updatedCards = updatedCards.filter(c => c !== 'league' && c !== 'tft');
          setRiotAccount(null);
          setRiotStats(null);
        } else {
          setRiotAccount(data.riotAccount);
          if (data.riotStats) setRiotStats(data.riotStats);
        }
        if (!data.valorantAccount) {
          updatedCards = updatedCards.filter(c => c !== 'valorant');
          setValorantAccount(null);
        } else {
          setValorantAccount(data.valorantAccount);
          // valorantStats are managed by ValorantStatsContext (loads cached stats on init)
        }
        setEnabledRankCards(updatedCards);
        setClipCategories(data.clipCategories || []);
        if (data.createdAt) {
          setJoinedAt(data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt));
        }
        setLoadingRankCards(false);
      }
    } catch (error) {
      console.error('Error fetching enabled rank cards:', error);
    }
  };

  const fetchRiotData = async (forceRefresh: boolean = false) => {
    if (!user?.id) return;

    try {
      // Only show skeleton if we don't have any rank data yet
      if (!riotAccount && !valorantAccount) {
        setLoadingRankCards(true);
      }
      // Fetch Riot account info from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.id));
      if (userDoc.exists()) {
        const data = userDoc.data();

        // Ensure enabledRankCards only includes linked accounts
        const cards = data.enabledRankCards || [];
        let updatedCards = [...cards];
        if (data.riotAccount && !updatedCards.includes('league')) {
          updatedCards.push('league');
        }
        if (data.valorantAccount && !updatedCards.includes('valorant')) {
          updatedCards.push('valorant');
        }
        // Remove cards for unlinked accounts
        if (!data.riotAccount) {
          updatedCards = updatedCards.filter(c => c !== 'league' && c !== 'tft');
        }
        if (!data.valorantAccount) {
          updatedCards = updatedCards.filter(c => c !== 'valorant');
        }
        setEnabledRankCards(updatedCards);

        if (data.createdAt) {
          setJoinedAt(data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt));
        }
        setShowRankCardBack(data.showRankCardBack ?? false);

        if (data.riotAccount) {
          setRiotAccount(data.riotAccount);

          // Load cached League stats from Firestore first
          if (data.riotStats) {
            console.log('Loading cached riot stats from Firestore');
            setRiotStats(data.riotStats);
          }

          // Fetch fresh League of Legends stats if account is linked
          try {
            console.log('Fetching fresh League stats, forceRefresh:', forceRefresh);
            const leagueResponse = await getLeagueStats(forceRefresh);
            console.log('League response:', leagueResponse);
            if (leagueResponse.success && leagueResponse.stats) {
              console.log('Setting fresh riot stats:', leagueResponse.stats);
              setRiotStats(leagueResponse.stats);
            } else {
              console.log('League stats not successful, using cached data');
            }
          } catch (error) {
            // Keep using cached data from Firestore
          }

          // TFT stats temporarily disabled - using placeholder data
          // TODO: Re-enable when needed
          console.log('TFT stats disabled - showing placeholder data');
        } else {
          setRiotAccount(null);
          setRiotStats(null);
        }

        // Valorant stats: set account and trigger context fetch if needed
        if (data.valorantAccount) {
          setValorantAccount(data.valorantAccount);

          // Check if matchHistory is missing — force refresh via context
          const needsMatchHistoryRefresh = !valorantStats?.matchHistory ||
            !Array.isArray(valorantStats.matchHistory) ||
            valorantStats.matchHistory.length === 0;

          if (forceRefresh || needsMatchHistoryRefresh) {
            fetchValorantStats(forceRefresh || needsMatchHistoryRefresh);
          }
        } else {
          setValorantAccount(null);
        }
      }
    } catch (error) {
      console.error('Error fetching Riot data:', error);
    } finally {
      setLoadingRankCards(false);
    }
  };

  // Fetch user's posts from Firestore
  const fetchPosts = async () => {
    if (!user?.id) return;

    console.log('🔄 fetchPosts called');
    setLoadingPosts(true);
    try {
      // Fetch all posts with just the where clause (no orderBy in query to avoid index requirement)
      const postsQuery = query(
        collection(db, 'posts'),
        where('userId', '==', user.id)
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
      Alert.alert('Error', 'Failed to load posts');
    } finally {
      setLoadingPosts(false);
    }
  };

  // Consume preloaded profile posts from AuthContext (loaded during loading screen)
  useEffect(() => {
    if (preloadedProfilePosts && !hasConsumedPreloadPosts) {
      console.log('✅ Using preloaded profile posts from loading screen:', preloadedProfilePosts.length);
      // Filter out archived posts from preloaded data
      const nonArchivedPosts = preloadedProfilePosts.filter(post => !(post as any).archived);
      setPosts(nonArchivedPosts);
      setLoadingPosts(false);
      setHasConsumedPreloadPosts(true);
    }
  }, [preloadedProfilePosts, hasConsumedPreloadPosts]);

  // Consume preloaded Riot stats from AuthContext (loaded during loading screen)
  useEffect(() => {
    if (preloadedRiotStats && !hasConsumedPreloadRiot && user?.id) {
      console.log('✅ Using preloaded Riot stats from loading screen');
      setRiotStats(preloadedRiotStats);
      setHasConsumedPreloadRiot(true);

      // Also fetch and set riotAccount, valorantAccount, and enabledRankCards from Firestore so rank cards show
      (async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.id));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.riotAccount) {
              setRiotAccount(data.riotAccount);
            } else {
              setRiotAccount(null);
              setRiotStats(null);
            }
            // Valorant account status (stats come from ValorantStatsContext)
            if (data.valorantAccount) {
              setValorantAccount(data.valorantAccount);
            } else {
              setValorantAccount(null);
            }

            // Ensure enabledRankCards only includes linked accounts
            const cards = data.enabledRankCards || [];
            let updatedCards = [...cards];
            if (data.riotAccount && !updatedCards.includes('league')) {
              updatedCards.push('league');
            }
            if (data.valorantAccount && !updatedCards.includes('valorant')) {
              updatedCards.push('valorant');
            }
            if (!data.riotAccount) {
              updatedCards = updatedCards.filter(c => c !== 'league' && c !== 'tft');
            }
            if (!data.valorantAccount) {
              updatedCards = updatedCards.filter(c => c !== 'valorant');
            }
            setEnabledRankCards(updatedCards);
          }
        } catch (error) {
          console.error('Error fetching riotAccount:', error);
        } finally {
          setLoadingRankCards(false);
        }
      })();
    }
  }, [preloadedRiotStats, hasConsumedPreloadRiot, user?.id]);

  // Clear preloaded data after consumption
  useEffect(() => {
    if (hasConsumedPreloadPosts && hasConsumedPreloadRiot) {
      clearPreloadedProfileData();
    }
  }, [hasConsumedPreloadPosts, hasConsumedPreloadRiot, clearPreloadedProfileData]);

  // Fetch Riot data and posts when component mounts (only if no preloaded data)
  useEffect(() => {
    if (user?.id) {
      // Only fetch Riot data if we didn't get preloaded stats
      if (!hasConsumedPreloadRiot && !preloadedRiotStats) {
        fetchRiotData();
      }
      // Only fetch posts if we didn't get preloaded posts
      if (!hasConsumedPreloadPosts && !preloadedProfilePosts) {
        fetchPosts();
      }
    }
  }, [user?.id, hasConsumedPreloadPosts, hasConsumedPreloadRiot, preloadedProfilePosts, preloadedRiotStats]);

  // Refresh user data and rank cards on tab focus
  // fetchRiotData() picks up newly linked accounts and uses client cache for stats (no redundant API calls)
  const lastProfileFetch = useRef<number>(0);
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        // Always re-fetch rank cards and account data on focus (lightweight Firestore read)
        fetchEnabledRankCards();
        const now = Date.now();
        if (now - lastProfileFetch.current > 30000) {
          lastProfileFetch.current = now;
          refreshUser();
          fetchRiotData();
          fetchPosts();
        }
        // Always re-fetch lightweight preferences on focus
        const refreshPrefs = async () => {
          try {
            const userDoc = await getDoc(doc(db, 'users', user.id));
            if (userDoc.exists()) {
              setShowRankCardBack(userDoc.data().showRankCardBack ?? false);
            }
          } catch {}
        };
        refreshPrefs();
      }
    }, [user?.id])
  );

  // Handle refresh parameter from linking pages
  // This forces a refresh of account data when returning from account linking
  useEffect(() => {
    if (refresh === 'true' && user?.id) {
      lastProfileFetch.current = Date.now();
      console.log('Refresh parameter detected, forcing data refresh');
      // Force refresh to get the newly linked account
      fetchRiotData(true);
      // Clear the refresh parameter by replacing the route without the param
      router.replace('/(tabs)/profile');
    }
  }, [refresh, user?.id]);

  // Fetch achievements (completed parties where user placed top 3)
  const fetchAchievements = async () => {
    if (!user?.id) return;

    setLoadingAchievements(true);
    try {
      const partiesRef = collection(db, 'parties');
      const partiesQuery = query(partiesRef, where('members', 'array-contains', user.id));
      const snapshot = await getDocs(partiesQuery);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const results: { partyId: string; partyName: string; game: string; placement: number; endDate: string }[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.endDate || !data.rankings) return;

        // Parse endDate (MM/DD/YYYY)
        const [month, day, year] = data.endDate.split('/').map(Number);
        const endDate = new Date(year, month - 1, day);
        if (endDate >= today) return; // Not completed yet

        // Find user's ranking
        const userRanking = data.rankings.find((r: any) => r.userId === user.id);
        if (userRanking && userRanking.rank >= 1 && userRanking.rank <= 3) {
          results.push({
            partyId: docSnap.id,
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
    } catch (error) {
      console.error('Error fetching achievements:', error);
    } finally {
      setLoadingAchievements(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchAchievements();
    }
  }, [user?.id]);

  // Handle pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Reset loading states to show skeletons
    setAllContentLoaded(false);
    setLoadingPosts(true);
    setLoadingRankCards(true);
    setLoadingAchievements(true);
    setAvatarLoaded(false);
    setAvatarError(false);
    setCoverPhotoLoaded(false);

    await refreshUser(); // Refresh user data from AuthContext
    await Promise.all([
      fetchRiotData(true), // Force refresh Riot data from API
      fetchPosts(), // Refresh posts
      fetchAchievements(), // Refresh achievements
    ]);
    setRefreshing(false);
  }, [user?.id]);

  // Callback for rank card update buttons
  const handleRankCardRefresh = useCallback(() => {
    fetchRiotData(true);
  }, [user?.id]);

  // Fetch user's duo cards and in-game stats for posting
  useEffect(() => {
    const fetchDuoCards = async () => {
      if (!user?.id) return;

      try {
        const userDocRef = doc(db, 'users', user.id);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();

          if (userData.valorantStats?.card?.small) {
            setValorantInGameIcon(userData.valorantStats.card.small);
          }
          if (userData.valorantStats?.gameName) {
            const tagLine = userData.valorantAccount?.tag || userData.valorantAccount?.tagLine || '';
            setValorantInGameName(tagLine ? `${userData.valorantStats.gameName}#${tagLine}` : userData.valorantStats.gameName);
          }
          if (userData.valorantStats?.winRate !== undefined) {
            setValorantWinRate(userData.valorantStats.winRate);
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
        }

        const valorantCardDoc = await getDoc(doc(db, 'duoCards', `${user.id}_valorant`));
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

        const leagueCardDoc = await getDoc(doc(db, 'duoCards', `${user.id}_league`));
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
  }, [user?.id]);

  const handleAddPost = () => {
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to create a post');
      return;
    }

    if (!valorantCard && !leagueCard) {
      Alert.alert('No Duo Card', 'Create a duo card in the Duo Finder tab first to post to the feed.');
      return;
    }

    setShowNewPost(true);
  };

  const handlePostPress = (post: Post) => {
    const index = posts.findIndex(p => p.id === post.id);
    setSelectedPostIndex(index);
    setSelectedPost(post);
    setShowPostViewer(true);
  };

  const handleNavigatePost = (index: number) => {
    if (index >= 0 && index < posts.length) {
      setSelectedPostIndex(index);
      setSelectedPost(posts[index]);
    }
  };

  const closePostViewer = () => {
    setShowPostViewer(false);
    setSelectedPost(null);
  };

  const handleDeletePost = (post: Post) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all media files from Storage
              if (post.mediaUrls && post.mediaUrls.length > 0) {
                for (const mediaUrl of post.mediaUrls) {
                  await deletePostMedia(mediaUrl);
                }
              } else if (post.mediaUrl) {
                await deletePostMedia(post.mediaUrl);
              }

              // Delete thumbnail if exists
              if (post.thumbnailUrl) {
                await deletePostMedia(post.thumbnailUrl);
              }

              // Delete from Firestore
              await deleteDoc(doc(db, 'posts', post.id));

              // Decrement user's post count
              if (user?.id) {
                await updateDoc(doc(db, 'users', user.id), {
                  postsCount: increment(-1),
                });
                // Refresh user data to update the UI
                await refreshUser();
              }

              // Update local state
              setPosts(prevPosts => prevPosts.filter(p => p.id !== post.id));

              Alert.alert('Success', 'Post deleted successfully');
            } catch (error: any) {
              console.error('Delete post error:', error);
              Alert.alert('Error', 'Failed to delete post');
            }
          },
        },
      ]
    );
  };

  const handleCommentAdded = () => {
    // Update comment count locally instead of refetching all posts
    if (selectedPost) {
      setPosts(prevPosts =>
        prevPosts.map(post =>
          post.id === selectedPost.id
            ? { ...post, commentsCount: (post.commentsCount ?? 0) + 1 }
            : post
        )
      );
      // Also update the selected post in the modal
      setSelectedPost(prev =>
        prev ? { ...prev, commentsCount: (prev.commentsCount ?? 0) + 1 } : null
      );
    }
  };

  const handleEditCaption = async (post: Post, newCaption: string) => {
    try {
      // Update in Firestore
      await updateDoc(doc(db, 'posts', post.id), {
        caption: newCaption,
      });

      // Update local state
      setPosts(prevPosts =>
        prevPosts.map(p =>
          p.id === post.id ? { ...p, caption: newCaption } : p
        )
      );

      // Also update the selected post in the modal if it's the same post
      if (selectedPost?.id === post.id) {
        setSelectedPost(prev =>
          prev ? { ...prev, caption: newCaption } : null
        );
      }
    } catch (error) {
      console.error('Error updating caption:', error);
      Alert.alert('Error', 'Failed to update caption');
    }
  };

  // Category handlers
  const handleCategorize = (post: Post) => {
    setCategorizingPost(post);
    setShowAssignCategory(true);
  };

  const handleSavePostCategories = async (newCategories: string[]) => {
    if (!categorizingPost) return;
    try {
      await updateDoc(doc(db, 'posts', categorizingPost.id), {
        categories: newCategories,
      });
      setPosts(prev =>
        prev.map(p => p.id === categorizingPost.id ? { ...p, categories: newCategories } : p)
      );
      if (selectedPost?.id === categorizingPost.id) {
        setSelectedPost(prev => prev ? { ...prev, categories: newCategories } : null);
      }
    } catch (error) {
      console.error('Error updating post categories:', error);
      Alert.alert('Error', 'Failed to update categories');
    }
  };

  const handleSaveCategories = async (newCategories: string[]) => {
    if (!user?.id) return;
    try {
      await updateDoc(doc(db, 'users', user.id), {
        clipCategories: newCategories,
      });
      setClipCategories(newCategories);
      if (selectedCategory && !newCategories.includes(selectedCategory)) {
        setSelectedCategory(null);
      }
    } catch (error) {
      console.error('Error updating categories:', error);
      Alert.alert('Error', 'Failed to update categories');
    }
  };

  const handleSaveCategoriesWithPosts = async (
    newCategories: string[],
    postUpdates: { postId: string; categories: string[] }[]
  ) => {
    if (!user?.id) return;
    try {
      // Update user's category list
      await updateDoc(doc(db, 'users', user.id), {
        clipCategories: newCategories,
      });
      setClipCategories(newCategories);
      if (selectedCategory && !newCategories.includes(selectedCategory)) {
        setSelectedCategory(null);
      }

      // Update each modified post
      for (const update of postUpdates) {
        await updateDoc(doc(db, 'posts', update.postId), {
          categories: update.categories,
        });
      }

      // Update local post state
      if (postUpdates.length > 0) {
        const updateMap = new Map(postUpdates.map(u => [u.postId, u.categories]));
        setPosts(prev =>
          prev.map(p => updateMap.has(p.id) ? { ...p, categories: updateMap.get(p.id) } : p)
        );
      }
    } catch (error) {
      console.error('Error updating categories:', error);
      Alert.alert('Error', 'Failed to update categories');
    }
  };

  const filteredPosts = selectedCategory
    ? posts.filter(p => p.categories?.includes(selectedCategory))
    : posts;

  const handleArchivePost = (post: Post) => {
    Alert.alert(
      'Archive Post',
      'This post will be hidden from your profile. You can view archived posts in your settings.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Archive',
          onPress: async () => {
            try {
              // Update post in Firestore to mark as archived
              await updateDoc(doc(db, 'posts', post.id), {
                archived: true,
              });

              // Mark that we're removing a post (to prevent loading state reset)
              isRemovingPost.current = true;

              // Remove from local state (hide from profile)
              setPosts(prevPosts => prevPosts.filter(p => p.id !== post.id));

              // Close the post viewer modal
              closePostViewer();

              Alert.alert('Success', 'Post archived successfully');
            } catch (error: any) {
              console.error('Archive post error:', error);
              Alert.alert('Error', 'Failed to archive post');
            }
          },
        },
      ]
    );
  };

  // Calculate tier border color based on current ranks
  const tierBorderColor = calculateTierBorderColor(
    riotStats?.rankedSolo ? formatRank(riotStats.rankedSolo.tier, riotStats.rankedSolo.rank) : undefined,
    valorantStats?.currentRank
  );

  // Calculate tier border gradient based on current ranks
  const tierBorderGradient = calculateTierBorderGradient(
    riotStats?.rankedSolo ? formatRank(riotStats.rankedSolo.tier, riotStats.rankedSolo.rank) : undefined,
    valorantStats?.currentRank
  );

  // Shine on B tier and above
  const tierShine = (() => {
    const tier = calculateTier(
      riotStats?.rankedSolo ? formatRank(riotStats.rankedSolo.tier, riotStats.rankedSolo.rank) : undefined,
      valorantStats?.currentRank
    );
    return tier === 'B' || tier === 'A' || tier === 'S';
  })();

  // Interpolate scroll position to create overlap effect
  const profileCardTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -60],
    extrapolate: 'clamp',
  });

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

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        decelerationRate="fast"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#c42743"
            colors={['#c42743']}
            progressViewOffset={110}
          />
        }
      >
        {/* Header Section - Cover photo reaches top */}
        <View style={styles.headerSection}>
          {!allContentLoaded ? (
            <>
            {/* Cover photo placeholder with icons during loading */}
            <View style={styles.coverPhotoCardContainer}>
              <View style={styles.coverPhotoInner}>
                <LinearGradient
                  colors={['#2c2f33', '#1a1a1a', '#0f0f0f']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.coverPhotoGradient}
                />
                <LinearGradient
                  colors={['transparent', '#0f0f0f']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.coverPhotoBottomFade}
                  pointerEvents="none"
                />
                <View style={[styles.headerIconsRow, { top: insets.top - 10 }]}>
                  <View style={styles.headerIconsSpacer} />
                  <TouchableOpacity
                    style={styles.headerIconButton}
                    onPress={() => router.push('/chatPages/chatList')}
                    activeOpacity={0.7}
                  >
                    <IconSymbol size={27} name="tray" color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.headerIconButton}
                    onPress={() => router.push('/profilePages/settings')}
                    activeOpacity={0.7}
                  >
                    <IconSymbol size={27} name="gearshape" color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <ProfilePageSkeleton />
          </>) : (
          <>
          {/* Cover Photo Area - inset card */}
          <View style={styles.coverPhotoCardContainer}>
              <View style={styles.coverPhotoInner}>
                {user?.coverPhoto ? (
                  <Image
                    key={`cover-${coverPhotoKey}`}
                    source={{ uri: `${user.coverPhoto}&t=${coverPhotoKey}` }}
                    style={styles.coverPhotoImage}
                    onLoad={() => setCoverPhotoLoaded(true)}
                    onError={() => setCoverPhotoLoaded(true)}
                  />
                ) : null}
                {/* Bottom fade into background - only when cover photo exists */}
                {user?.coverPhoto && (
                  <LinearGradient
                    colors={['transparent', '#0f0f0f']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.coverPhotoBottomFade}
                    pointerEvents="none"
                  />
                )}
                {/* Header Icons overlaid on cover photo */}
                <View style={[styles.headerIconsRow, { top: insets.top - 10 }]}>
                  <View style={styles.headerIconsSpacer} />
                  <TouchableOpacity
                    style={styles.headerIconButton}
                    onPress={() => router.push('/chatPages/chatList')}
                    activeOpacity={0.7}
                  >
                    <IconSymbol size={27} name="tray" color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.headerIconButton}
                    onPress={() => router.push('/profilePages/settings')}
                    activeOpacity={0.7}
                  >
                    <IconSymbol size={27} name="gearshape" color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
          </View>

          {/* Profile Info Section - TikTok style: username+handle+stats left, avatar right */}
          <View style={styles.profileInfoSection}>
            <View style={styles.avatarStatsRow}>
              {/* Left side: Username, handle, stats */}
              <View style={styles.usernameStatsGroup}>
                <ThemedText style={styles.coverPhotoUsername} numberOfLines={1}>{user?.username || 'User'}</ThemedText>
                {joinedAt && (
                  <ThemedText style={styles.joinedText}>{formatJoinDate(joinedAt)}</ThemedText>
                )}

                {/* Stats row */}
                <View style={styles.statsColumns}>
                  <TouchableOpacity
                    style={styles.statColumn}
                    onPress={() => router.push('/profilePages/following')}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={styles.statNumber}>{formatCount(user?.followingCount)}</ThemedText>
                    <ThemedText style={styles.statLabel}>Following</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.statColumn}
                    onPress={() => router.push('/profilePages/followers')}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={styles.statNumber}>{formatCount(user?.followersCount)}</ThemedText>
                    <ThemedText style={styles.statLabel}>Followers</ThemedText>
                  </TouchableOpacity>
                  <View style={[styles.statColumn, { marginLeft: 10 }]}>
                    <ThemedText style={styles.statNumber}>{formatCount(posts.length)}</ThemedText>
                    <ThemedText style={styles.statLabel}>Posts</ThemedText>
                  </View>
                </View>
              </View>

              {/* Right side: Avatar */}
              <TouchableOpacity
                style={styles.profileAvatarButton}
                onPress={() => setShowAvatarModal(true)}
                activeOpacity={0.7}
              >
                {tierBorderGradient ? (
                  <GradientBorder
                    colors={tierBorderGradient}
                    borderWidth={2.5}
                    borderRadius={46}
                    shine={tierShine}
                  >
                    <View style={styles.profileAvatarCircleWithGradient}>
                      {isRemoteAvatar(user?.avatar) && !avatarError ? (
                        <Image
                          key={`avatar-${avatarKey}`}
                          source={{ uri: `${user.avatar}&t=${avatarKey}` }}
                          style={styles.profileAvatarImage}
                          onLoad={() => setAvatarLoaded(true)}
                          onError={() => {
                            setAvatarLoaded(true);
                            setAvatarError(true);
                          }}
                        />
                      ) : getDefaultAvatarSource(user?.avatar) ? (
                        <Image
                          source={getDefaultAvatarSource(user?.avatar)!}
                          style={styles.profileAvatarImage}
                          onLoad={() => setAvatarLoaded(true)}
                        />
                      ) : (
                        <ThemedText style={styles.profileAvatarInitial}>
                          {user?.username?.[0]?.toUpperCase() || 'U'}
                        </ThemedText>
                      )}
                    </View>
                  </GradientBorder>
                ) : (
                  <View style={styles.profileAvatarCircle}>
                    {isRemoteAvatar(user?.avatar) && !avatarError ? (
                      <Image
                        key={`avatar-${avatarKey}`}
                        source={{ uri: `${user.avatar}&t=${avatarKey}` }}
                        style={styles.profileAvatarImage}
                        onLoad={() => setAvatarLoaded(true)}
                        onError={() => {
                          setAvatarLoaded(true);
                          setAvatarError(true);
                        }}
                      />
                    ) : getDefaultAvatarSource(user?.avatar) ? (
                      <Image
                        source={getDefaultAvatarSource(user?.avatar)!}
                        style={styles.profileAvatarImage}
                        onLoad={() => setAvatarLoaded(true)}
                      />
                    ) : (
                      <ThemedText style={styles.profileAvatarInitial}>
                        {user?.username?.[0]?.toUpperCase() || 'U'}
                      </ThemedText>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Action Row: Edit Profile button + Social Icons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.editProfileButton}
                onPress={() => router.push('/profilePages/editProfile')}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.editProfileButtonText}>Edit Profile</ThemedText>
              </TouchableOpacity>

              <View style={styles.socialIconsGroup}>
                {/* Instagram */}
                <TouchableOpacity
                  style={[styles.socialIconButton, !user?.instagramLink && styles.socialIconInactive]}
                  onPress={async () => {
                    if (user?.instagramLink) {
                      try {
                        const username = user.instagramLink.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
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
                    } else {
                      Alert.alert('Not Configured', 'Add your Instagram username in Edit Profile');
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

                {/* Discord */}
                <TouchableOpacity
                  style={[styles.socialIconButton, !user?.discordLink && styles.socialIconInactive]}
                  onPress={async () => {
                    if (user?.discordLink) {
                      try {
                        await Clipboard.setStringAsync(user.discordLink);
                        Alert.alert('Copied!', `Discord username "${user.discordLink}" copied to clipboard`);
                      } catch (error) {
                        Alert.alert('Error', 'Failed to copy Discord username');
                      }
                    } else {
                      Alert.alert('Not Configured', 'Add your Discord username in Edit Profile');
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
              </View>
            </View>

            {/* Bio */}
            {user?.bio && (
              <View style={styles.bioSection}>
                <ThemedText style={styles.bioText}>{user.bio}</ThemedText>
              </View>
            )}
          </View>

          {/* Section Divider */}
          <View style={styles.profileSectionDivider} />

          {/* Rank Cards Preview */}
          {userGames.length > 0 ? (
            <View style={styles.rankCardsPreview}>
              {/* Header */}
              <View style={styles.rankCardsPreviewHeader}>
                <View style={styles.rankCardsPreviewHeaderLeft}>
                  <ThemedText style={styles.rankCardsPreviewTitle}>Rank Cards</ThemedText>
                  <IconSymbol size={16} name="sparkle" color="rgba(255,255,255,0.4)" />
                </View>
                <TouchableOpacity
                  onPress={() => router.push('/profilePages/rankCards')}
                  activeOpacity={0.7}
                  style={styles.rankCardsViewAll}
                >
                  <ThemedText style={styles.rankCardsViewAllText}>View all</ThemedText>
                  <IconSymbol size={14} name="arrow.right" color="#F0D6A2" />
                </TouchableOpacity>
              </View>
              <ThemedText style={styles.rankCardsPreviewSubtitle}>Your ranked journey</ThemedText>

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
                  let displayUsername = user?.username || 'User';
                  if (game.name === 'Valorant' && valorantAccount) {
                    displayUsername = `${valorantAccount.gameName}#${valorantAccount.tag}`;
                  } else if ((game.name === 'League of Legends' || game.name === 'TFT') && riotAccount) {
                    displayUsername = `${riotAccount.gameName}#${riotAccount.tagLine}`;
                  }
                  return (
                    <View key={game.id} style={styles.rankCardPreviewItem}>
                      <View style={styles.rankCardPreviewScale}>
                        <RankCard
                          game={game}
                          username={displayUsername}
                          isFocused={true}
                          initialFlipped={showRankCardBack}
                          flipOnly={true}
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
          ) : (
            <View style={styles.rankCardsPreview}>
              {/* Header */}
              <View style={styles.rankCardsPreviewHeader}>
                <View style={styles.rankCardsPreviewHeaderLeft}>
                  <ThemedText style={styles.rankCardsPreviewTitle}>Rank Cards</ThemedText>
                  <IconSymbol size={16} name="sparkle" color="rgba(255,255,255,0.4)" />
                </View>
              </View>
              <ThemedText style={styles.rankCardsPreviewSubtitle}>Your ranked journey</ThemedText>

              <TouchableOpacity
                style={styles.emptyBanner}
                onPress={() => router.push('/profilePages/newRankCard')}
                activeOpacity={0.8}
              >
                <View style={styles.emptyBannerIconRow}>
                  <View style={styles.emptyBannerIconCircle}>
                    <Image
                      source={require('@/assets/images/valorant-logo.png')}
                      style={{ width: 18, height: 18, tintColor: '#72767d' }}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={[styles.emptyBannerIconCircle, styles.emptyBannerIconCircleCenter]}>
                    <Image
                      source={require('@/assets/images/riotgames.png')}
                      style={{ width: 24, height: 24 }}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={styles.emptyBannerIconCircle}>
                    <Image
                      source={require('@/assets/images/leagueoflegends.png')}
                      style={{ width: 18, height: 18, tintColor: '#72767d' }}
                      resizeMode="contain"
                    />
                  </View>
                </View>
                <View style={styles.emptyBannerTextContainer}>
                  <ThemedText style={styles.emptyBannerTitle}>Show off your rank</ThemedText>
                  <ThemedText style={styles.emptyBannerSubtext}>Link your Riot account to get started</ThemedText>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Clips Section */}
          <View style={styles.clipsSection}>
            {/* Clips Header */}
            <View style={styles.clipsSectionHeader}>
              <View style={styles.clipsSectionHeaderLeft}>
                <ThemedText style={styles.clipsSectionTitle}>Clips</ThemedText>
                <IconSymbol size={18} name="film" color="rgba(255,255,255,0.4)" />
              </View>
              {posts.length > 0 && (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/profilePages/clips', params: { userId: user?.id || '' } })}
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
                    onPress={() => router.push({ pathname: '/postViewer', params: { postId: posts[0].id } })}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={{ uri: posts[0].thumbnailUrl || posts[0].mediaUrl }}
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
                        onPress={() => router.push({ pathname: '/postViewer', params: { postId: post.id } })}
                        activeOpacity={0.85}
                      >
                        <Image
                          source={{ uri: post.thumbnailUrl || post.mediaUrl }}
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
              <TouchableOpacity
                style={styles.clipsEmpty}
                onPress={() => router.push('/postPages/createPostVideo')}
                activeOpacity={0.7}
              >
                <IconSymbol size={24} name="plus" color="rgba(255,255,255,0.3)" />
                <ThemedText style={styles.clipsEmptyText}>Add your first clip</ThemedText>
              </TouchableOpacity>
            )}
          </View>

          {/* Achievements Section */}
          <View style={styles.achievementsSection}>
            {/* Header */}
            <View style={styles.achievementsSectionHeader}>
              <View style={styles.achievementsSectionHeaderLeft}>
                <ThemedText style={styles.achievementsSectionTitle}>Achievements</ThemedText>
                <IconSymbol size={18} name="trophy" color="rgba(255,255,255,0.4)" />
              </View>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/profilePages/achievementsBadges', params: { userId: user?.id || '' } })}
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
                      onPress={() => router.push({ pathname: '/profilePages/achievementsBadges', params: { userId: user?.id || '' } })}
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
          </>
          )}
        </View>
      </Animated.ScrollView>

      {/* Post Viewer Modal */}
      <PostViewerModal
        visible={showPostViewer}
        post={selectedPost}
        posts={posts}
        currentIndex={selectedPostIndex}
        userAvatar={user?.avatar}
        onClose={closePostViewer}
        onNavigate={handleNavigatePost}
        onCommentAdded={handleCommentAdded}
        onDelete={handleDeletePost}
        onEditCaption={handleEditCaption}
        onArchive={handleArchivePost}
        onCategorize={handleCategorize}
      />

      {/* Manage Categories Modal */}
      <ManageCategoriesModal
        visible={showManageCategories}
        categories={clipCategories}
        posts={posts}
        onClose={() => setShowManageCategories(false)}
        onSave={handleSaveCategoriesWithPosts}
      />

      {/* Assign Category Modal */}
      {categorizingPost && (
        <AssignCategoryModal
          visible={showAssignCategory}
          categories={clipCategories}
          selectedCategories={categorizingPost.categories || []}
          onClose={() => {
            setShowAssignCategory(false);
            setCategorizingPost(null);
          }}
          onSave={handleSavePostCategories}
        />
      )}

      {/* Post Duo Card Modal */}
      <PostDuoCard
        visible={showNewPost}
        onClose={() => setShowNewPost(false)}
        onPostCreated={() => setShowNewPost(false)}
        valorantCard={valorantCard}
        leagueCard={leagueCard}
        userAvatar={user?.avatar}
        valorantInGameIcon={valorantInGameIcon}
        valorantInGameName={valorantInGameName}
        valorantWinRate={valorantWinRate}
        leagueInGameIcon={leagueInGameIcon}
        leagueInGameName={leagueInGameName}
        leagueWinRate={leagueWinRate}
      />

      {/* Create Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <TouchableOpacity
          style={styles.createModalOverlay}
          activeOpacity={1}
          onPress={() => setShowCreateModal(false)}
        >
          <TouchableOpacity
            style={styles.createModalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <View style={styles.createModalHandle} />

            {/* Title */}
            <ThemedText style={styles.createModalTitle}>Create</ThemedText>

            {/* Divider */}
            <View style={styles.createModalDivider} />

            {/* Options */}
            <TouchableOpacity
              style={styles.createModalOption}
              onPress={() => {
                setShowCreateModal(false);
                router.push('/postPages/createPostVideo');
              }}
              activeOpacity={0.7}
            >
              <View style={styles.createModalIconWrapper}>
                <IconSymbol size={24} name="play.rectangle" color="#fff" />
              </View>
              <ThemedText style={styles.createModalOptionText}>Clip</ThemedText>
            </TouchableOpacity>

            <View style={styles.createModalOptionDivider} />

            <TouchableOpacity
              style={styles.createModalOption}
              onPress={() => {
                setShowCreateModal(false);
                router.push('/profilePages/newRankCard');
              }}
              activeOpacity={0.7}
            >
              <View style={styles.createModalIconWrapper}>
                <IconSymbol size={24} name="rectangle.stack.badge.plus" color="#fff" />
              </View>
              <ThemedText style={styles.createModalOptionText}>Rank Card</ThemedText>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Avatar Preview Modal */}
      <Modal
        visible={showAvatarModal}
        animationType="none"
        transparent={true}
        onRequestClose={() => setShowAvatarModal(false)}
      >
        <TouchableOpacity
          style={styles.avatarModalOverlay}
          activeOpacity={1}
          onPress={() => setShowAvatarModal(false)}
        >
          <View style={styles.avatarModalContent}>
            {tierBorderGradient ? (
              <GradientBorder
                colors={tierBorderGradient}
                borderWidth={4}
                borderRadius={100}
                shine={tierShine}
              >
                <View style={styles.avatarModalCircleWithGradient}>
                  {isRemoteAvatar(user?.avatar) && !avatarError ? (
                    <Image
                      source={{ uri: `${user.avatar}&t=${avatarKey}` }}
                      style={styles.avatarModalImage}
                      resizeMode="cover"
                    />
                  ) : getDefaultAvatarSource(user?.avatar) ? (
                    <Image
                      source={getDefaultAvatarSource(user?.avatar)!}
                      style={styles.avatarModalImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <ThemedText style={styles.avatarModalInitial}>
                      {user?.username?.[0]?.toUpperCase() || 'U'}
                    </ThemedText>
                  )}
                </View>
              </GradientBorder>
            ) : (
              <View style={styles.avatarModalCircle}>
                {isRemoteAvatar(user?.avatar) && !avatarError ? (
                  <Image
                    source={{ uri: `${user.avatar}&t=${avatarKey}` }}
                    style={styles.avatarModalImage}
                    resizeMode="cover"
                  />
                ) : getDefaultAvatarSource(user?.avatar) ? (
                  <Image
                    source={getDefaultAvatarSource(user?.avatar)!}
                    style={styles.avatarModalImage}
                    resizeMode="cover"
                  />
                ) : (
                  <ThemedText style={styles.avatarModalInitial}>
                    {user?.username?.[0]?.toUpperCase() || 'U'}
                  </ThemedText>
                )}
              </View>
            )}
          </View>
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
    paddingTop: 8,
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
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 10,
  },
  headerIconsSpacer: {
    flex: 1,
  },
  headerIconButton: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareIconButton: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Cover photo card container - full width
  coverPhotoCardContainer: {
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
  },
  coverPhotoInner: {
    height: 170,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  coverPhotoFallbackBorder: {
    borderRadius: 18,
  },
  coverPhotoImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 1,
  },
  coverPhotoGradient: {
    width: '100%',
    height: '100%',
  },
  coverPhotoBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 30,
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
  avatarStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  profileAvatarButton: {
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
  // Action row: Edit Profile + Social icons
  profileSectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 20,
    marginTop: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  editProfileButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editProfileButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
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
  socialIconInactive: {
    opacity: 0.35,
  },
  socialIconImage: {
    width: 18,
    height: 18,
  },
  // Small avatar on the right
  smallAvatarButton: {
  },
  smallAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  smallAvatarCircleWithGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#36393e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  smallAvatarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  // Category tabs
  categoryTabsContainer: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  categoryTab: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#2c2f33',
    borderWidth: 1,
    borderColor: '#36393e',
  },
  categoryTabActive: {
    backgroundColor: 'transparent',
    borderColor: '#fff',
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b9bbbe',
  },
  categoryTabTextActive: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  categoryTabIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2c2f33',
    borderWidth: 1,
    borderColor: '#36393e',
    alignItems: 'center',
    justifyContent: 'center',
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
  sectionHeaderRight: {
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
    fontSize: 12,
    fontWeight: '500',
    color: '#555',
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
  addClipsButton: {
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
  rankCardsSection: {
    marginBottom: 8,
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
  // 2-column landscape grid
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
  categoryManageButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCategoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginLeft: 16,
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
  },
  addCategoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  emptyCategoryState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyCategoryText: {
    fontSize: 14,
    color: '#555',
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
  gridClipMultiple: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 5,
    borderRadius: 6,
  },
  gridClipLikes: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    paddingHorizontal: 0,
  },
  postItem: {
    width: (screenWidth - 4) / 3,
    height: ((screenWidth - 4) / 3) * 1.3,
    backgroundColor: '#36393e',
    position: 'relative',
    borderRadius: 4,
    overflow: 'hidden',
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
  multipleIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 4,
    padding: 4,
  },
  emptyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    gap: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  bannerRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 16,
  },
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
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
  miniBanner: {
    flex: 1,
    aspectRatio: 1,
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
  miniBannerChevron: {
    position: 'absolute',
    top: 16,
    right: 14,
  },
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
  emptyBannerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: -6,
  },
  emptyBannerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0f0f0f',
  },
  emptyBannerIconCircleCenter: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    zIndex: 1,
  },
  emptyBannerTextContainer: {
    flex: 1,
  },
  emptyBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  emptyBannerSubtext: {
    fontSize: 12,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  emptyGameLogos: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    gap: -8,
  },
  emptyGameLogoCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0f0f0f',
  },
  emptyGameLogoCircleCenter: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.1)',
    zIndex: 1,
  },
  emptyGameLogo: {
    width: 20,
    height: 20,
    tintColor: '#72767d',
  },
  emptyGameLogoLarge: {
    width: 26,
    height: 26,
  },
  emptyClipsIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    gap: -8,
  },
  emptyClipsIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0f0f0f',
  },
  emptyClipsIconCircleCenter: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.1)',
    zIndex: 1,
  },
  addClipsEmptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 28,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  addClipsEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2c2f33',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
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
  addClipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  addClipButtonText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
  },
  addRankCardEmptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  addRankCardEmptyText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
  },
  verticalRankCardsContainer: {
    paddingHorizontal: 16,
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
  collapseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#36393e',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#424549',
  },
  collapseButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
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
  addRankCardCardVertical: {
    width: '100%',
    height: 180,
    backgroundColor: '#2c2f33',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#424549',
    borderStyle: 'dashed',
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 8,
      height: 12,
    },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 14,
  },
  addRankCardContent: {
    alignItems: 'center',
    gap: 12,
  },
  addRankCardText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  addRankCardSubtext: {
    fontSize: 14,
    color: '#72767d',
  },
  popoverOverlay: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 999,
  },
  socialsPopover: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    marginLeft: -100,
    marginBottom: 8,
    width: 200,
    backgroundColor: '#2c2f33',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 1000,
  },
  popoverArrow: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#2c2f33',
  },
  socialDropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  socialDropdownIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#36393e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  instagramIconContainer: {
    borderColor: '#E4405F',
  },
  discordIconContainer: {
    borderColor: '#5865F2',
  },
  socialDropdownIcon: {
    width: 20,
    height: 20,
  },
  socialDropdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  socialDropdownSubtitle: {
    fontSize: 12,
    color: '#b9bbbe',
  },
  socialNotConfigured: {
    borderColor: '#424549',
    opacity: 0.5,
  },
  achievementsList: {
    paddingHorizontal: 20,
    gap: 8,
  },
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
  achievementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  achievementMedal: {
    fontSize: 24,
  },
  achievementInfo: {
    flex: 1,
  },
  achievementPartyName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e0e0e0',
    marginBottom: 3,
  },
  achievementMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  achievementMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#444',
    marginHorizontal: 6,
  },
  achievementGame: {
    fontSize: 11,
    fontWeight: '500',
    color: '#72767d',
  },
  achievementDate: {
    fontSize: 11,
    fontWeight: '500',
    color: '#4a4d52',
  },
  achievementPlacementContainer: {
    marginRight: 4,
  },
  achievementPlacement: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  // Create Modal styles
  createModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  createModalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  createModalHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  createModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  createModalDivider: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 20,
    marginBottom: 8,
  },
  createModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 16,
  },
  createModalIconWrapper: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createModalOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  createModalOptionDivider: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: 72,
  },
  // Avatar Modal styles
  avatarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarModalContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarModalCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  avatarModalCircleWithGradient: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarModalImage: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
  },
  avatarModalInitial: {
    fontSize: 72,
    fontWeight: '700',
    color: '#fff',
  },
});
