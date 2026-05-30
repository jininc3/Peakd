import rankCard from '@/app/components/rankCard';
const RankCard = rankCard;
import CachedImage from '@/components/ui/CachedImage';
import PostViewerModal from '@/app/components/postViewerModal';
import ReportPostModal from '@/app/components/reportPostModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState, useEffect, useCallback } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, TouchableOpacity, View, ActivityIndicator, Alert, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/contexts/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '@/config/firebase';
import { collection, query, where, getDocs, Timestamp, doc, getDoc } from 'firebase/firestore';
import { followUser, unfollowUser, isFollowing as checkIsFollowing } from '@/services/followService';
import { calculateTierBorderColor, calculateTierBorderGradient, calculateTier } from '@/utils/tierBorderUtils';
import { formatCount } from '@/utils/formatCount';
import GradientBorder from '@/components/GradientBorder';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

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
  gamesPlayed?: {
    valorant?: {
      currentRank: string;
      gamesPlayed: number;
      winRate: number;
    };
    league?: {
      currentRank: string;
      gamesPlayed: number;
      winRate: number;
    };
    apex?: {
      currentRank: string;
      gamesPlayed: number;
      winRate: number;
    };
  };
  createdAt?: Date;
}

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

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
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
  duration?: number;
  categories?: string[];
}

// Helper function to format video duration
const formatDuration = (seconds?: number): string => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Helper function to format rank
const formatRank = (tier: string, rank: string) => {
  return `${tier.charAt(0).toUpperCase()}${tier.slice(1).toLowerCase()} ${rank}`;
};

export default function ProfilePreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user: currentUser, refreshUser, addReportedPost } = useAuth();
  const [viewedUser, setViewedUser] = useState<ViewedUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedPostIndex, setSelectedPostIndex] = useState(0);
  const [showPostViewer, setShowPostViewer] = useState(false);
  const [reportingPost, setReportingPost] = useState<Post | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [riotStats, setRiotStats] = useState<any>(null);
  const [valorantStats, setValorantStats] = useState<any>(null);
  const [riotAccount, setRiotAccount] = useState<any>(null);
  const [valorantAccount, setValorantAccount] = useState<any>(null);
  const [enabledRankCards, setEnabledRankCards] = useState<string[]>([]);
  const [achievements, setAchievements] = useState<{ partyName: string; game: string; placement: number; endDate: string }[]>([]);
  const [userNotFound, setUserNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<'clips' | 'achievements'>('clips');
  const [activeRankCardIndex, setActiveRankCardIndex] = useState(0);
  const tabs: ('clips' | 'achievements')[] = ['clips', 'achievements'];
  const tabScrollRef = useRef<ScrollView>(null);

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

  // Get userId from params
  const userId = params.userId as string || currentUser?.id;

  // Dynamic games array based on Riot data and enabled rank cards
  const userGames = (riotAccount || valorantAccount) ?
    enabledRankCards
      .map(gameType => {
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
        if (gameType === 'tft' && riotStats) {
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
            recentMatches: ['+18', '+22', '-16', '+20', '-15'],
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

  // Fetch viewed user's profile data
  const fetchUserProfile = async () => {
    if (!userId) return;

    setLoadingUser(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
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
          gamesPlayed: data.gamesPlayed,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : undefined,
        });

        // Fetch riot and valorant stats for tier border and rank cards
        if (data.riotStats) {
          setRiotStats(data.riotStats);
        }
        if (data.valorantStats) {
          setValorantStats(data.valorantStats);
        }
        if (data.riotAccount) {
          setRiotAccount(data.riotAccount);
        }
        if (data.valorantAccount) {
          setValorantAccount(data.valorantAccount);
        }
        if (data.enabledRankCards) {
          setEnabledRankCards(data.enabledRankCards);
        }
      } else {
        setUserNotFound(true);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoadingUser(false);
    }
  };

  // Fetch user's posts from Firestore
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

  // Fetch achievements
  const fetchAchievements = async () => {
    if (!userId) return;
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
        const [month, day, year] = data.endDate.split('/').map(Number);
        const endDate = new Date(year, month - 1, day);
        if (endDate >= today) return;
        const userRanking = data.rankings.find((r: any) => r.userId === userId);
        if (userRanking && userRanking.rank >= 1 && userRanking.rank <= 3) {
          results.push({ partyName: data.partyName, game: data.game, placement: userRanking.rank, endDate: data.endDate });
        }
      });
      results.sort((a, b) => a.placement - b.placement || b.endDate.localeCompare(a.endDate));
      setAchievements(results);
    } catch (error) {
      console.error('Error fetching achievements:', error);
    }
  };

  // Fetch user profile and posts when component mounts
  useEffect(() => {
    if (userId) {
      fetchUserProfile();
      fetchPosts();
      fetchAchievements();
    }
  }, [userId]);

  // Refetch when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchUserProfile();
        fetchPosts();
        fetchAchievements();
      }
    }, [userId])
  );

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

  // Check if current user is following this profile
  const checkFollowStatus = async () => {
    if (!currentUser?.id || !userId) return;

    try {
      const following = await checkIsFollowing(currentUser.id, userId);
      setIsFollowing(following);
    } catch (error) {
      console.error('Error checking follow status:', error);
    }
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
        await unfollowUser(currentUser.id, userId);
        setIsFollowing(false);
        setViewedUser({
          ...viewedUser,
          followersCount: (viewedUser.followersCount || 0) - 1,
        });
      } else {
        await followUser(
          currentUser.id,
          currentUser.username || currentUser.email?.split('@')[0] || 'User',
          currentUser.avatar,
          userId,
          viewedUser.username,
          viewedUser.avatar
        );
        setIsFollowing(true);
        setViewedUser({
          ...viewedUser,
          followersCount: (viewedUser.followersCount || 0) + 1,
        });
      }
      await refreshUser();
    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
    } finally {
      setFollowLoading(false);
    }
  };

  // Check follow status on mount
  useEffect(() => {
    checkFollowStatus();
  }, [currentUser?.id, userId]);

  // Calculate tier border color based on current ranks
  const tierBorderColor = calculateTierBorderColor(
    riotStats?.rankedSolo ? formatRank(riotStats.rankedSolo.tier, riotStats.rankedSolo.rank) : undefined,
    valorantStats?.currentRank
  );

  // Calculate tier border gradient with fallback
  const tierBorderGradient = calculateTierBorderGradient(
    riotStats?.rankedSolo ? formatRank(riotStats.rankedSolo.tier, riotStats.rankedSolo.rank) : undefined,
    valorantStats?.currentRank
  ) || ['#333', '#333', '#333'];

  const tierShine = (() => {
    const tier = calculateTier(
      riotStats?.rankedSolo ? formatRank(riotStats.rankedSolo.tier, riotStats.rankedSolo.rank) : undefined,
      valorantStats?.currentRank
    );
    return tier === 'B' || tier === 'A' || tier === 'S';
  })();

  // Show "user not found" screen for deleted accounts
  if (userNotFound) {
    return (
      <ThemedView style={styles.container}>
        {/* Background shimmer — matches tabs pages */}
        <View style={styles.backgroundGlow} pointerEvents="none">
          <View style={styles.shimmerBand} pointerEvents="none">
            <LinearGradient
              colors={[
                'transparent',
                'rgba(255, 255, 255, 0.03)',
                'rgba(255, 255, 255, 0.065)',
                'rgba(255, 255, 255, 0.03)',
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
                'rgba(255, 255, 255, 0.035)',
                'transparent',
              ]}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>
        <View style={{ paddingTop: 70, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol size={20} name="chevron.left" color="#fff" />
          </TouchableOpacity>
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
            style={{ marginTop: 24, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#c42743', borderRadius: 8 }}
            onPress={() => router.back()}
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
              'rgba(255, 255, 255, 0.03)',
              'rgba(255, 255, 255, 0.065)',
              'rgba(255, 255, 255, 0.03)',
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
              'rgba(255, 255, 255, 0.035)',
              'transparent',
            ]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          {/* Cover Photo Area */}
          <View style={styles.coverPhotoWrapper}>
            {viewedUser?.coverPhoto ? (
              <Image
                source={{ uri: viewedUser.coverPhoto }}
                style={styles.coverPhotoImage}
              />
            ) : null}
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
            </View>
          </View>

          {/* Profile Info Section - TikTok style: username+handle+stats left, avatar right */}
          <View style={styles.profileInfoSection}>
            <View style={styles.avatarStatsRow}>
              {/* Left side: Username, handle, stats */}
              <View style={styles.usernameStatsGroup}>
                <ThemedText style={styles.coverPhotoUsername} numberOfLines={1}>{viewedUser?.username || 'User'}</ThemedText>
                {viewedUser?.createdAt && (
                  <ThemedText style={styles.joinedText}>{formatJoinDate(viewedUser.createdAt)}</ThemedText>
                )}

                {/* Stats row */}
                <View style={styles.statsColumns}>
                  <View style={styles.statColumn}>
                    <ThemedText style={styles.statNumber}>{formatCount(viewedUser?.followingCount)}</ThemedText>
                    <ThemedText style={styles.statLabel}>Following</ThemedText>
                  </View>
                  <View style={styles.statColumn}>
                    <ThemedText style={styles.statNumber}>{formatCount(viewedUser?.followersCount)}</ThemedText>
                    <ThemedText style={styles.statLabel}>Followers</ThemedText>
                  </View>
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
                      {viewedUser?.avatar && viewedUser.avatar.startsWith('http') ? (
                        <Image source={{ uri: viewedUser.avatar }} style={styles.profileAvatarImage} />
                      ) : (
                        <ThemedText style={styles.profileAvatarInitial}>
                          {viewedUser?.username?.[0]?.toUpperCase() || 'U'}
                        </ThemedText>
                      )}
                    </View>
                  </GradientBorder>
                ) : (
                  <View style={styles.profileAvatarCircle}>
                    {viewedUser?.avatar && viewedUser.avatar.startsWith('http') ? (
                      <Image source={{ uri: viewedUser.avatar }} style={styles.profileAvatarImage} />
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
              {userId !== currentUser?.id && (
                <TouchableOpacity
                  style={[styles.followButton, isFollowing && styles.followingButton]}
                  onPress={handleFollowToggle}
                  disabled={followLoading}
                  activeOpacity={0.7}
                >
                  <ThemedText style={[styles.followButtonText, isFollowing && styles.followButtonTextFollowing]}>
                    {followLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
                  </ThemedText>
                </TouchableOpacity>
              )}

              <View style={styles.socialIconsGroup}>
                {/* Instagram */}
                {viewedUser?.instagramLink && (
                  <TouchableOpacity
                    style={styles.socialIconButton}
                    onPress={async () => {
                      try {
                        const username = viewedUser.instagramLink!.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
                        await Linking.openURL(`https://instagram.com/${username}`);
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

          {/* Section Divider */}
          <View style={styles.profileSectionDivider} />

          {/* Rank Cards Preview */}
          {userGames.length > 0 && (
            <View style={styles.rankCardsPreview}>
              {/* Header */}
              <View style={styles.rankCardsPreviewHeader}>
                <View style={styles.rankCardsPreviewHeaderLeft}>
                  <ThemedText style={styles.rankCardsPreviewTitle}>Rank Cards</ThemedText>
                  <IconSymbol size={16} name="sparkle" color="rgba(255,255,255,0.4)" />
                </View>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/profilePages/rankCards', params: { userId: viewedUser?.id || '' } })}
                  activeOpacity={0.7}
                  style={styles.rankCardsViewAll}
                >
                  <ThemedText style={styles.rankCardsViewAllText}>View all</ThemedText>
                  <IconSymbol size={14} name="arrow.right" color="#8B7FE8" />
                </TouchableOpacity>
              </View>
              <ThemedText style={styles.rankCardsPreviewSubtitle}>
                {`${viewedUser?.username}'s ranked journey`}
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
                  return (
                    <View key={game.id} style={styles.rankCardPreviewItem}>
                      <View style={styles.rankCardPreviewScale}>
                        <RankCard
                          game={game}
                          username={displayUsername}
                          viewOnly={false}
                          userId={viewedUser?.id}
                          isFocused={true}
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
                  onPress={() => router.push({ pathname: '/profilePages/clips', params: { userId: viewedUser?.id || '' } })}
                  activeOpacity={0.7}
                  style={styles.clipsViewAll}
                >
                  <ThemedText style={styles.clipsViewAllText}>View all</ThemedText>
                  <IconSymbol size={14} name="arrow.right" color="#8B7FE8" />
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
                        onPress={() => router.push({ pathname: '/postViewer', params: { postId: post.id } })}
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

          {/* Achievements Section */}
          <View style={styles.achievementsSection}>
            {/* Header */}
            <View style={styles.achievementsSectionHeader}>
              <View style={styles.achievementsSectionHeaderLeft}>
                <ThemedText style={styles.achievementsSectionTitle}>Achievements</ThemedText>
                <IconSymbol size={18} name="trophy" color="rgba(255,255,255,0.4)" />
              </View>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/profilePages/achievementsBadges', params: { userId: viewedUser?.id || '' } })}
                activeOpacity={0.7}
                style={styles.achievementsViewAll}
              >
                <ThemedText style={styles.achievementsViewAllText}>View all</ThemedText>
                <IconSymbol size={14} name="arrow.right" color="#8B7FE8" />
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
                      onPress={() => router.push({ pathname: '/profilePages/achievementsBadges', params: { userId: viewedUser?.id || '' } })}
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
        </View>
      </ScrollView>

      {/* Post Viewer Modal */}
      <PostViewerModal
        visible={showPostViewer}
        post={selectedPost}
        posts={posts}
        currentIndex={selectedPostIndex}
        userAvatar={viewedUser?.avatar}
        onClose={closePostViewer}
        onNavigate={handleNavigatePost}
        onReport={(post) => {
          setReportingPost(post);
          setShowReportModal(true);
        }}
      />

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
  // Bio section
  bioSection: {
    marginTop: 10,
  },
  bioText: {
    fontSize: 13,
    color: '#b9bbbe',
    lineHeight: 19,
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
  followingButton: {
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
  // Rank Cards Banner
  profileSectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 20,
    marginTop: 16,
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
    color: '#F0D6A2',
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
    backgroundColor: '#8B7FE8',
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
    color: '#F0D6A2',
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
    color: '#F0D6A2',
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
  // Tab bar
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
  sectionContainer: {
    marginHorizontal: 0,
    marginBottom: 4,
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
  emptyStateSubtext: {
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 240,
  },
  horizontalAchievementsContainer: {
    paddingHorizontal: 20,
    gap: 6,
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
});
