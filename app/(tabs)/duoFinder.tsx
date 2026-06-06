import DuoCard from '@/app/components/duoCard';
import { LinearGradient } from 'expo-linear-gradient';
export interface DuoCardData {
  game: 'valorant' | 'league';
  username: string;
  currentRank: string;
  region: string;
  mainRole: string;
  peakRank: string;
  mainAgent?: string;
  lookingFor?: string;
  disabled?: boolean;
}
import EditDuoCard from '@/app/components/editDuoCard';
import DuoFilterModal, { DuoFilterOptions } from '@/app/profilePages/duoFilterModal';
import DuoCardDetailModal from '@/app/components/duoCardProfile';
import PostDuoCard from '@/app/components/postDuoCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { DuoCardSkeleton, DuoFeedCardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, Dimensions, ScrollView, FlatList, ActivityIndicator, Pressable, StyleSheet, TouchableOpacity, View, RefreshControl, Image, Modal, Animated, Easing } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const GRID_SIZE = 40;
import { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useRouter } from '@/hooks/useRouter';

// Rank icons
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
};

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
};

// Get user's current rank icon
const getRankRange = (rank: string, game: 'valorant' | 'league'): any[] => {
  if (!rank) return [];

  const tier = rank.split(' ')[0].toLowerCase();
  const icons = game === 'valorant' ? VALORANT_RANK_ICONS : LEAGUE_RANK_ICONS;

  const icon = icons[tier];
  if (!icon) return [];

  return [icon];
};

interface DuoCardWithId extends DuoCardData {
  id: string;
  userId: string;
  updatedAt?: any;
  avatar?: string;
  inGameIcon?: string;
  inGameName?: string;
  winRate?: number;
  gamesPlayed?: number;
  rankUpUsername?: string;
}

interface DuoPostWithId {
  id: string;
  userId: string;
  username: string;
  game: 'valorant' | 'league';
  currentRank: string;
  peakRank: string;
  mainRole: string;
  mainAgent: string;
  region: string;
  lookingFor: string;
  avatar?: string;
  inGameIcon?: string;
  inGameName?: string;
  winRate?: number;
  gamesPlayed?: number;
  message: string;
  createdAt: any;
  expiresAt: any;
}

// Module-level caches for instant re-visits
let cachedDuoCards: DuoCardWithId[] | null = null;
let cachedDuoPosts: DuoPostWithId[] | null = null;

export default function DuoFinderScreen() {
  const { user, isUserBlocked } = useAuth();
  const router = useRouter();

  // Pulse animation for live search banner
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const bannerScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);


  const [showMyCards, setShowMyCards] = useState(false);
  const [valorantCard, setValorantCard] = useState<DuoCardData | null>(null);
  const [leagueCard, setLeagueCard] = useState<DuoCardData | null>(null);
  const [hasValorantAccount, setHasValorantAccount] = useState(false);
  const [hasLeagueAccount, setHasLeagueAccount] = useState(false);
  const [enabledRankCards, setEnabledRankCards] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Find Duo state (legacy cards still used for live search)
  const [duoCards, setDuoCards] = useState<DuoCardWithId[]>(cachedDuoCards || []);
  const [loadingDuoCards, setLoadingDuoCards] = useState(false);

  // Duo Posts feed state
  const [duoPosts, setDuoPosts] = useState<DuoPostWithId[]>(cachedDuoPosts || []);
  const [displayedPosts, setDisplayedPosts] = useState<DuoPostWithId[]>((cachedDuoPosts || []).slice(0, 10));
  const [loadingDuoPosts, setLoadingDuoPosts] = useState(!cachedDuoPosts);
  const [refreshingPosts, setRefreshingPosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showPostDuoCard, setShowPostDuoCard] = useState(false);
  const POSTS_PER_PAGE = 10;

  // Filter state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<DuoFilterOptions>({
    game: null,
    role: null,
    minRank: null,
    maxRank: null,
  });

  // Game filter state (both selected by default to show all)
  const [selectedGames, setSelectedGames] = useState<{ valorant: boolean; league: boolean }>({
    valorant: true,
    league: true,
  });

  // Toggle game selection
  const toggleGameFilter = (game: 'valorant' | 'league') => {
    setSelectedGames(prev => ({
      ...prev,
      [game]: !prev[game],
    }));
  };

  // Count active filters
  const activeFilterCount = [
    filters.game,
    filters.role,
    filters.minRank,
    filters.maxRank,
  ].filter(Boolean).length;

  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedDuoCard, setSelectedDuoCard] = useState<DuoCardWithId | null>(null);
  const [editingGame, setEditingGame] = useState<'valorant' | 'league' | null>(null);

  // User's in-game icons, names, and stats for their own cards
  const [valorantInGameIcon, setValorantInGameIcon] = useState<string | undefined>(undefined);
  const [valorantInGameName, setValorantInGameName] = useState<string | undefined>(undefined);
  const [valorantWinRate, setValorantWinRate] = useState<number | undefined>(undefined);
  const [valorantGamesPlayed, setValorantGamesPlayed] = useState<number | undefined>(undefined);
  const [leagueInGameIcon, setLeagueInGameIcon] = useState<string | undefined>(undefined);
  const [leagueInGameName, setLeagueInGameName] = useState<string | undefined>(undefined);
  const [leagueWinRate, setLeagueWinRate] = useState<number | undefined>(undefined);
  const [leagueGamesPlayed, setLeagueGamesPlayed] = useState<number | undefined>(undefined);
  const [hasActiveValorantPost, setHasActiveValorantPost] = useState(false);
  const [hasActiveLeaguePost, setHasActiveLeaguePost] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Function to sync duo cards with rank stats
  const syncDuoCardsWithStats = async (isManualRefresh: boolean = false, onlyGame?: 'valorant' | 'league') => {
    if (isManualRefresh) {
      setRefreshing(true);
    }
    if (!user?.id) return;

    try {
      // Get user's current stats from their profile
      const userDocRef = doc(db, 'users', user.id);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();

        // Set linked account state (eliminates separate checkLinkedAccounts call)
        setHasValorantAccount(!!userData.valorantAccount);
        setHasLeagueAccount(!!userData.riotAccount);
        setEnabledRankCards(userData.enabledRankCards || []);

        // Extract in-game icons, names, and stats from user stats
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
        if (userData.valorantStats?.gamesPlayed !== undefined) {
          setValorantGamesPlayed(userData.valorantStats.gamesPlayed);
        }
        // League stores profileIconId, need to construct URL
        if (userData.riotStats?.profileIconId) {
          setLeagueInGameIcon(`https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${userData.riotStats.profileIconId}.png`);
        }
        if (userData.riotAccount?.gameName) {
          const tagLine = userData.riotAccount.tagLine || '';
          setLeagueInGameName(`${userData.riotAccount.gameName}#${tagLine}`);
        }
        // League ranked stats
        if (userData.riotStats?.rankedSolo) {
          const rankedSolo = userData.riotStats.rankedSolo;
          if (rankedSolo.winRate !== undefined) {
            setLeagueWinRate(rankedSolo.winRate);
          }
          const wins = rankedSolo.wins || 0;
          const losses = rankedSolo.losses || 0;
          if (wins > 0 || losses > 0) {
            setLeagueGamesPlayed(wins + losses);
          }
        }

        // Load and sync Valorant card
        const valorantCardRef = doc(db, 'duoCards', `${user.id}_valorant`);
        const valorantCardDoc = await getDoc(valorantCardRef);
        if (valorantCardDoc.exists()) {
          const cardData = valorantCardDoc.data();

          // Check if we have newer stats from user profile (updated within last 6 hours)
          const valorantStats = userData.valorantStats;
          if (valorantStats?.lastUpdated) {
            const statsUpdatedAt = valorantStats.lastUpdated.toDate().getTime();
            const cardUpdatedAt = cardData.updatedAt?.toDate()?.getTime() || 0;

            // If stats are newer than card, update the card
            if (statsUpdatedAt > cardUpdatedAt) {
              console.log('Syncing Valorant duo card with updated stats...');

              // Get peak rank from valorantStats (it's an object with tier and season)
              const peakRankTier = valorantStats.peakRank?.tier || cardData.peakRank || valorantStats.currentRank;

              const updatedCardData = {
                ...cardData,
                currentRank: valorantStats.currentRank || cardData.currentRank,
                peakRank: peakRankTier,
                updatedAt: serverTimestamp(),
              };

              await setDoc(valorantCardRef, updatedCardData);

              setValorantCard({
                game: 'valorant',
                username: user.username || '',
                currentRank: updatedCardData.currentRank,
                region: updatedCardData.region,
                mainRole: updatedCardData.mainRole,
                peakRank: updatedCardData.peakRank,
                mainAgent: updatedCardData.mainAgent,
                lookingFor: updatedCardData.lookingFor || 'Any',
                disabled: cardData.disabled || false,
              });
            } else {
              // Use existing card data
              setValorantCard({
                game: 'valorant',
                username: user.username || '',
                currentRank: cardData.currentRank,
                region: cardData.region,
                mainRole: cardData.mainRole,
                peakRank: cardData.peakRank,
                mainAgent: cardData.mainAgent,
                lookingFor: cardData.lookingFor || 'Any',
                disabled: cardData.disabled || false,
              });
            }
          } else {
            // No stats available, just use card data
            setValorantCard({
              game: 'valorant',
              username: user.username || '',
              currentRank: cardData.currentRank,
              region: cardData.region,
              mainRole: cardData.mainRole,
              peakRank: cardData.peakRank,
              mainAgent: cardData.mainAgent,
              lookingFor: cardData.lookingFor || 'Any',
              disabled: cardData.disabled || false,
            });
          }
        } else if ((!onlyGame || onlyGame === 'valorant') && userData.enabledRankCards?.includes('valorant') && userData.valorantStats) {
          // Auto-create Valorant duo card from RankCard stats
          const stats = userData.valorantStats;
          const peakRank = stats.peakRank?.tier || stats.currentRank || 'Unranked';
          const username = user.username || userData.username || '';
          const region = userData.valorantAccount?.region || 'NA';
          const newCard = {
            userId: user.id,
            game: 'valorant',
            username,
            currentRank: stats.currentRank || 'Unranked',
            peakRank,
            region,
            mainRole: '',
            mainAgent: '',
            lookingFor: 'Any',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            status: 'active',
          };
          await setDoc(valorantCardRef, newCard);
          setValorantCard({ game: 'valorant', username, currentRank: newCard.currentRank as string, peakRank, region, mainRole: '', mainAgent: '', lookingFor: 'Any' });
        } else {
          setValorantCard(null);
        }

        // Load and sync League card
        const leagueCardRef = doc(db, 'duoCards', `${user.id}_league`);
        const leagueCardDoc = await getDoc(leagueCardRef);
        if (leagueCardDoc.exists()) {
          const cardData = leagueCardDoc.data();

          // Check if we have newer stats from user profile
          const riotStats = userData.riotStats;
          if (riotStats?.lastUpdated) {
            const statsUpdatedAt = riotStats.lastUpdated.toDate().getTime();
            const cardUpdatedAt = cardData.updatedAt?.toDate()?.getTime() || 0;

            // If stats are newer than card, update the card
            if (statsUpdatedAt > cardUpdatedAt) {
              console.log('Syncing League duo card with updated stats...');

              // Format current rank from riot stats
              let currentRank = 'Unranked';
              if (riotStats.rankedSolo) {
                const tier = riotStats.rankedSolo.tier || 'UNRANKED';
                const rank = riotStats.rankedSolo.rank || '';
                currentRank = tier === 'UNRANKED' ? 'Unranked' : `${tier.charAt(0) + tier.slice(1).toLowerCase()} ${rank}`;
              }

              const updatedCardData = {
                ...cardData,
                currentRank: currentRank,
                peakRank: currentRank,
                updatedAt: serverTimestamp(),
              };

              await setDoc(leagueCardRef, updatedCardData);

              setLeagueCard({
                game: 'league',
                username: user.username || '',
                currentRank: updatedCardData.currentRank,
                region: updatedCardData.region,
                mainRole: updatedCardData.mainRole,
                peakRank: updatedCardData.peakRank,
                mainAgent: updatedCardData.mainAgent,
                lookingFor: updatedCardData.lookingFor || 'Any',
                disabled: cardData.disabled || false,
              });
            } else {
              // Use existing card data
              setLeagueCard({
                game: 'league',
                username: user.username || '',
                currentRank: cardData.currentRank,
                region: cardData.region,
                mainRole: cardData.mainRole,
                peakRank: cardData.peakRank,
                mainAgent: cardData.mainAgent,
                lookingFor: cardData.lookingFor || 'Any',
                disabled: cardData.disabled || false,
              });
            }
          } else {
            // No stats available, just use card data
            setLeagueCard({
              game: 'league',
              username: user.username || '',
              currentRank: cardData.currentRank,
              region: cardData.region,
              mainRole: cardData.mainRole,
              peakRank: cardData.peakRank,
              mainAgent: cardData.mainAgent,
              lookingFor: cardData.lookingFor || 'Any',
              disabled: cardData.disabled || false,
            });
          }
        } else if ((!onlyGame || onlyGame === 'league') && userData.enabledRankCards?.includes('league') && userData.riotStats) {
          // Auto-create League duo card from RankCard stats
          let currentRank = 'Unranked';
          if (userData.riotStats.rankedSolo) {
            const tier = userData.riotStats.rankedSolo.tier || 'UNRANKED';
            const rank = userData.riotStats.rankedSolo.rank || '';
            currentRank = tier === 'UNRANKED' ? 'Unranked' : `${tier.charAt(0) + tier.slice(1).toLowerCase()} ${rank}`;
          }
          const username = user.username || userData.username || '';
          const region = userData.riotAccount?.region || 'NA';
          const newCard = {
            userId: user.id,
            game: 'league',
            username,
            currentRank,
            peakRank: currentRank,
            region,
            mainRole: '',
            mainAgent: '',
            lookingFor: 'Any',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            status: 'active',
          };
          await setDoc(leagueCardRef, newCard);
          setLeagueCard({ game: 'league', username, currentRank, peakRank: currentRank, region, mainRole: '', mainAgent: '', lookingFor: 'Any' });
        } else {
          setLeagueCard(null);
        }

        // Check if user has active duo posts in the feed
        const valorantPostRef = doc(db, 'duoPosts', `${user.id}_valorant`);
        const leaguePostRef = doc(db, 'duoPosts', `${user.id}_league`);
        const [valorantPostDoc, leaguePostDoc] = await Promise.all([
          getDoc(valorantPostRef),
          getDoc(leaguePostRef),
        ]);
        setHasActiveValorantPost(valorantPostDoc.exists());
        setHasActiveLeaguePost(leaguePostDoc.exists());
      }
    } catch (error) {
      console.error('Error syncing duo cards:', error);
    } finally {
      if (isManualRefresh) {
        setRefreshing(false);
      }
    }
  };



  // Re-sync duo cards every time the tab gains focus (picks up newly added rank cards)
  // Also sets linked account state (hasValorantAccount, hasLeagueAccount, enabledRankCards)
  useFocusEffect(
    useCallback(() => {
      syncDuoCardsWithStats(false);
    }, [user?.id])
  );

  // Handle pull-to-refresh
  const onRefresh = useCallback(() => {
    syncDuoCardsWithStats(true);
  }, [user?.id]);

  // Helper to get rank tier from full rank string
  const getRankTier = (rank: string): string => {
    if (!rank) return '';
    const tier = rank.split(' ')[0];
    return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  };

  // Helper to compare ranks
  const VALORANT_RANK_ORDER = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'];
  const LEAGUE_RANK_ORDER = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger'];

  const isRankInRange = (rank: string, game: 'valorant' | 'league', minRank: string | null, maxRank: string | null): boolean => {
    if (!minRank && !maxRank) return true;

    const tier = getRankTier(rank);
    const rankOrder = game === 'valorant' ? VALORANT_RANK_ORDER : LEAGUE_RANK_ORDER;
    const rankIndex = rankOrder.findIndex(r => r.toLowerCase() === tier.toLowerCase());

    if (rankIndex === -1) return true; // Unknown rank, include it

    const minIndex = minRank ? rankOrder.findIndex(r => r.toLowerCase() === minRank.toLowerCase()) : 0;
    const maxIndex = maxRank ? rankOrder.findIndex(r => r.toLowerCase() === maxRank.toLowerCase()) : rankOrder.length - 1;

    return rankIndex >= minIndex && rankIndex <= maxIndex;
  };

  // Fetch duo cards from Firebase
  const fetchDuoCards = async () => {
    if (!user?.id) return;

    // Only show skeleton on initial load when no cards are cached
    if (duoCards.length === 0) {
      setLoadingDuoCards(true);
    }
    try {
      const duoCardsRef = collection(db, 'duoCards');

      // Determine which games to fetch based on selected game buttons
      const gamesToFetch: ('valorant' | 'league')[] = [];
      if (selectedGames.valorant) gamesToFetch.push('valorant');
      if (selectedGames.league) gamesToFetch.push('league');

      // If no games selected, don't fetch any cards
      if (gamesToFetch.length === 0) {
        setDuoCards([]);
        setLoadingDuoCards(false);
        return;
      }

      // Fetch all game queries in parallel
      const snapshots = await Promise.all(
        gamesToFetch.map(game =>
          getDocs(query(
            duoCardsRef,
            where('game', '==', game),
            where('status', '==', 'active'),
            orderBy('updatedAt', 'desc'),
            limit(50)
          ))
        )
      );

      // Collect all card docs (excluding own)
      const allCardDocs: { id: string; data: any }[] = [];
      snapshots.forEach(snapshot => {
        snapshot.docs.forEach(docSnapshot => {
          if (docSnapshot.data().userId !== user.id) {
            allCardDocs.push({ id: docSnapshot.id, data: docSnapshot.data() });
          }
        });
      });

      // Batch-fetch all unique user docs
      const uniqueUserIds = [...new Set(allCardDocs.map(c => c.data.userId))];
      const userDataMap = new Map<string, any>();
      const batchSize = 10;
      const userBatches: string[][] = [];
      for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
        userBatches.push(uniqueUserIds.slice(i, i + batchSize));
      }
      const userResults = await Promise.all(
        userBatches.map(batch =>
          getDocs(query(collection(db, 'users'), where('__name__', 'in', batch)))
            .catch(() => null)
        )
      );
      userResults.forEach(snapshot => {
        snapshot?.docs.forEach(d => userDataMap.set(d.id, d.data()));
      });

      // Enrich cards with user data
      const enrichedCards: DuoCardWithId[] = allCardDocs.map(({ id: cardId, data: cardData }) => {
        const userData = userDataMap.get(cardData.userId);
        let avatar = undefined;
        let inGameIcon = undefined;
        let inGameName = undefined;
        let winRate = undefined;
        let gamesPlayed = undefined;
        let rankUpUsername = undefined;

        if (userData) {
          avatar = userData.avatar;
          rankUpUsername = userData.username;
          if (cardData.game === 'valorant') {
            if (userData.valorantStats?.card?.small) inGameIcon = userData.valorantStats.card.small;
            if (userData.valorantStats?.gameName) {
              const tagLine = userData.valorantAccount?.tag || userData.valorantAccount?.tagLine || '';
              inGameName = tagLine ? `${userData.valorantStats.gameName}#${tagLine}` : userData.valorantStats.gameName;
            }
            if (userData.valorantStats?.winRate !== undefined) winRate = userData.valorantStats.winRate;
            if (userData.valorantStats?.gamesPlayed !== undefined) gamesPlayed = userData.valorantStats.gamesPlayed;
          } else if (cardData.game === 'league') {
            if (userData.riotStats?.profileIconId) {
              inGameIcon = `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${userData.riotStats.profileIconId}.png`;
            }
            if (userData.riotAccount?.gameName) {
              const tagLine = userData.riotAccount.tagLine || '';
              inGameName = `${userData.riotAccount.gameName}#${tagLine}`;
            }
            if (userData.riotStats?.rankedSolo) {
              const rankedSolo = userData.riotStats.rankedSolo;
              if (rankedSolo.winRate !== undefined) winRate = rankedSolo.winRate;
              const wins = rankedSolo.wins || 0;
              const losses = rankedSolo.losses || 0;
              if (wins > 0 || losses > 0) gamesPlayed = wins + losses;
            }
          }
        }

        return {
          id: cardId,
          userId: cardData.userId,
          game: cardData.game,
          username: rankUpUsername || cardData.username,
          currentRank: cardData.currentRank,
          region: cardData.region,
          mainRole: cardData.mainRole,
          peakRank: cardData.peakRank,
          mainAgent: cardData.mainAgent,
          lookingFor: cardData.lookingFor || 'Any',
          updatedAt: cardData.updatedAt,
          avatar, inGameIcon, inGameName, winRate, gamesPlayed, rankUpUsername,
        };
      });

      // Apply client-side filters
      const filteredCards = enrichedCards.filter(card => {
        if (filters.role && card.mainRole !== filters.role) return false;
        if (!isRankInRange(card.currentRank, card.game, filters.minRank, filters.maxRank)) return false;
        return true;
      });

      // Limit to 10 cards
      const finalCards = filteredCards.slice(0, 10);
      setDuoCards(finalCards);
      cachedDuoCards = finalCards;
    } catch (error) {
      console.error('Error fetching duo cards:', error);
      Alert.alert('Error', 'Failed to load duo cards. Please try again.');
    } finally {
      setLoadingDuoCards(false);
    }
  };

  // Fetch duo cards on mount and when filters or selected games change
  useEffect(() => {
    fetchDuoCards();
  }, [filters, selectedGames]);

  // Manual refresh for duo cards
  const handleRefreshDuoCards = () => {
    fetchDuoCards();
  };

  // Fetch duo posts for the feed
  const fetchDuoPosts = async (showLoading: boolean = true) => {
    if (!user?.id) return;

    if (showLoading) setLoadingDuoPosts(true);
    try {
      const postsRef = collection(db, 'duoPosts');
      const now = Timestamp.now();

      // Determine which games to fetch
      const gamesToFetch: string[] = [];
      if (selectedGames.valorant) gamesToFetch.push('valorant');
      if (selectedGames.league) gamesToFetch.push('league');

      if (gamesToFetch.length === 0) {
        setDuoPosts([]);
        setLoadingDuoPosts(false);
        return;
      }

      // Fetch all game queries in parallel
      const snapshots = await Promise.all(
        gamesToFetch.map(game =>
          getDocs(query(
            postsRef,
            where('status', '==', 'active'),
            where('game', '==', game),
            orderBy('createdAt', 'desc'),
            limit(20)
          ))
        )
      );

      let allPosts: DuoPostWithId[] = [];
      snapshots.forEach(snapshot => {
        const posts = snapshot.docs
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as DuoPostWithId))
          .filter(post => {
            if (post.expiresAt && post.expiresAt.toDate() < new Date()) return false;
            return true;
          });
        allPosts = [...allPosts, ...posts];
      });

      // Sort all posts by createdAt desc
      allPosts.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
        const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
        return bTime - aTime;
      });

      // Apply client-side filters
      const filtered = allPosts.filter(post => {
        if (filters.role && post.mainRole !== filters.role) return false;
        if (!isRankInRange(post.currentRank, post.game, filters.minRank, filters.maxRank)) return false;
        return true;
      });

      // Prefetch remote images so duo cards render all at once
      filtered.forEach(post => {
        if (post.inGameIcon) Image.prefetch(post.inGameIcon).catch(() => {});
        else if (post.avatar && post.avatar.startsWith('http')) Image.prefetch(post.avatar).catch(() => {});
        // Prefetch League champion icons from DDragon
        if (post.game === 'league' && post.mainAgent) {
          Image.prefetch(`https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/${post.mainAgent.replace(/[\s'.]/g, '')}.png`).catch(() => {});
        }
      });

      // Filter out blocked users
      const withoutBlocked = filtered.filter(post => !isUserBlocked(post.userId));
      setDuoPosts(withoutBlocked);
      setDisplayedPosts(withoutBlocked.slice(0, POSTS_PER_PAGE));
      cachedDuoPosts = withoutBlocked;
    } catch (error) {
      console.error('Error fetching duo posts:', error);
    } finally {
      setLoadingDuoPosts(false);
    }
  };

  // Refresh posts (for refresh button and pull-to-refresh)
  const refreshPosts = async () => {
    setRefreshingPosts(true);
    await fetchDuoPosts(false);
    setRefreshingPosts(false);
  };

  // Load more posts when user scrolls to bottom
  const loadMorePosts = () => {
    if (loadingMore || displayedPosts.length >= duoPosts.length) return;
    setLoadingMore(true);
    const nextPosts = duoPosts.slice(0, displayedPosts.length + POSTS_PER_PAGE);
    setDisplayedPosts(nextPosts);
    setLoadingMore(false);
  };

  // Fetch duo posts when filters or games change
  // Skip loading skeleton if we have cached data
  useEffect(() => {
    fetchDuoPosts(!cachedDuoPosts);
  }, [filters, selectedGames, user?.id]);

  // Delete a duo post
  const handleDeletePost = (post: DuoPostWithId) => {
    Alert.alert('Remove Post', 'Remove your duo post from the feed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'duoPosts', post.id));
            setDuoPosts(prev => prev.filter(p => p.id !== post.id));
            setDisplayedPosts(prev => prev.filter(p => p.id !== post.id));
            if (post.id === `${user?.id}_valorant`) setHasActiveValorantPost(false);
            if (post.id === `${user?.id}_league`) setHasActiveLeaguePost(false);
          } catch (error) {
            console.error('Error deleting post:', error);
          }
        },
      },
    ]);
  };

  // Message a duo post user
  const handleDuoPostMessage = (post: DuoPostWithId) => {
    if (!user?.id) return;
    router.push({
      pathname: '/chatPages/chatScreen',
      params: {
        otherUserId: post.userId,
        otherUsername: post.username,
        otherUserAvatar: post.avatar || '',
        focusInput: 'true',
      },
    });
  };

  const hasCards = valorantCard !== null || leagueCard !== null;

  const handleCardPress = (game: 'valorant' | 'league') => {
    const cardData = game === 'valorant' ? valorantCard : leagueCard;
    if (cardData) {
      setSelectedDuoCard({
        id: `${user?.id}_${game}`,
        userId: user?.id || '',
        game: cardData.game,
        username: cardData.username,
        currentRank: cardData.currentRank,
        region: cardData.region,
        mainRole: cardData.mainRole,
        peakRank: cardData.peakRank,
        mainAgent: cardData.mainAgent,
        lookingFor: cardData.lookingFor || 'Any',
        avatar: user?.avatar,
        inGameIcon: game === 'valorant' ? valorantInGameIcon : leagueInGameIcon,
        inGameName: game === 'valorant' ? valorantInGameName : leagueInGameName,
        winRate: game === 'valorant' ? valorantWinRate : leagueWinRate,
        gamesPlayed: game === 'valorant' ? valorantGamesPlayed : leagueGamesPlayed,
        rankUpUsername: user?.username,
        lp: 0,
        rr: 0,
      } as DuoCardWithId);
    }
  };

  const handleFindDuoCardPress = (card: DuoCardWithId) => {
    setSelectedDuoCard(card);
  };

  const handleDuoCardMessage = (card: DuoCardWithId) => {
    if (!user?.id) return;
    router.push({
      pathname: '/chatPages/chatScreen',
      params: {
        otherUserId: card.userId,
        otherUsername: card.username,
        otherUserAvatar: card.avatar || '',
        focusInput: 'true',
      },
    });
  };

  const handleSaveEdit = async (mainRole: string, mainAgent: string, lookingFor: string) => {
    if (!user?.id || !editingGame) return;

    try {
      // Update in Firebase
      const duoCardRef = doc(db, 'duoCards', `${user.id}_${editingGame}`);
      await setDoc(duoCardRef, {
        mainRole,
        mainAgent,
        lookingFor,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Update local state
      if (editingGame === 'valorant') {
        setValorantCard(prev => prev ? { ...prev, mainRole, mainAgent, lookingFor } : null);
      } else {
        setLeagueCard(prev => prev ? { ...prev, mainRole, mainAgent, lookingFor } : null);
      }

      Alert.alert('Success', 'Your duo card has been updated!');
      setShowEditModal(false);
      setEditingGame(null);
    } catch (error) {
      console.error('Error updating duo card:', error);
      Alert.alert('Error', 'Failed to update your duo card. Please try again.');
    }
  };

  const handleDisableFromEdit = async () => {
    if (!user?.id || !editingGame) return;

    const currentCard = editingGame === 'valorant' ? valorantCard : leagueCard;
    const newDisabledState = !(currentCard?.disabled || false);

    try {
      const duoCardRef = doc(db, 'duoCards', `${user.id}_${editingGame}`);
      await updateDoc(duoCardRef, { disabled: newDisabledState });

      // If disabling, also remove the active post from the feed
      if (newDisabledState) {
        const postId = `${user.id}_${editingGame}`;
        const hasActivePost = editingGame === 'valorant' ? hasActiveValorantPost : hasActiveLeaguePost;
        if (hasActivePost) {
          await deleteDoc(doc(db, 'duoPosts', postId));
          setDuoPosts(prev => prev.filter(p => p.id !== postId));
          setDisplayedPosts(prev => prev.filter(p => p.id !== postId));
          if (editingGame === 'valorant') setHasActiveValorantPost(false);
          else setHasActiveLeaguePost(false);
        }
      }

      if (editingGame === 'valorant') {
        setValorantCard(prev => prev ? { ...prev, disabled: newDisabledState } : null);
      } else {
        setLeagueCard(prev => prev ? { ...prev, disabled: newDisabledState } : null);
      }

      Alert.alert('Success', newDisabledState ? 'Your duo card has been disabled.' : 'Your duo card has been enabled.');
      setShowEditModal(false);
      setEditingGame(null);
    } catch (error) {
      console.error('Error updating duo card:', error);
      Alert.alert('Error', `Failed to ${newDisabledState ? 'disable' : 'enable'} your duo card. Please try again.`);
    }
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingGame(null);
  };

  // --- Live Search Functions ---
  return (
    <ThemedView style={styles.container}>
      {/* Grid background */}
      <View style={styles.gridOverlay} pointerEvents="none">
        {Array.from({ length: Math.ceil(screenWidth / GRID_SIZE) + 1 }).map((_, i) => (
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

      {/* Background shimmer */}
      <View style={styles.backgroundGlow} pointerEvents="none">
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

      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Duo/Team Finder</ThemedText>
        <TouchableOpacity
          style={styles.infoButton}
          onPress={() => setShowInfoModal(true)}
          activeOpacity={0.7}
        >
          <IconSymbol size={20} name="info.circle" color="#666" />
        </TouchableOpacity>
      </View>

      {/* Posts feed */}
      <FlatList
            data={displayedPosts}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.feedContent}
            onEndReached={loadMorePosts}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl
                refreshing={refreshingPosts}
                onRefresh={refreshPosts}
                tintColor="#A08845"
                colors={['#A08845']}
              />
            }
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator size="small" color="#A08845" style={{ paddingVertical: 16 }} />
              ) : null
            }
            ListHeaderComponent={
              <View>
                {/* Live Search Banner */}
                <View style={styles.liveSearchBannerOuter}>
                  <TouchableOpacity
                    style={styles.liveSearchBannerCard}
                    activeOpacity={1}
                    onPress={() => router.push('/partyPages/liveSearch')}
                    onPressIn={() => {
                      Animated.spring(bannerScale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
                    }}
                    onPressOut={() => {
                      Animated.spring(bannerScale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
                    }}
                  >
                    <Animated.View style={[styles.liveSearchBannerContent, { transform: [{ scale: bannerScale }] }]}>
                      {/* Top row: Logo + Game Icons */}
                      <View style={styles.liveSearchBannerTopRow}>
                        <Image
                          source={require('@/assets/images/peakdlogo2.png')}
                          style={styles.liveSearchBannerLogo}
                          resizeMode="contain"
                        />
                        <View style={styles.liveSearchBannerIconsRow}>
                          <View style={styles.liveSearchBannerGameIcon}>
                            <Image source={require('@/assets/images/valorant-red.png')} style={styles.liveSearchBannerValorantImg} resizeMode="contain" />
                          </View>
                          <View style={styles.liveSearchBannerLeagueIcon}>
                            <Image source={require('@/assets/images/lol-icon.png')} style={styles.liveSearchBannerLeagueImg} resizeMode="contain" />
                          </View>
                        </View>
                      </View>

                      {/* Bottom row: Title/Subtitle + Join Button */}
                      <View style={styles.liveSearchBannerBottomRow}>
                        <View style={styles.liveSearchBannerTextCol}>
                          <ThemedText style={styles.liveSearchBannerTagline}>FIND YOUR TEAMMATE</ThemedText>
                          <ThemedText style={styles.liveSearchBannerSubtext}>
                            Find teammates queuing right now
                          </ThemedText>
                        </View>
                        <TouchableOpacity
                          style={styles.liveSearchBannerJoinBtn}
                          activeOpacity={0.8}
                          onPress={() => router.push('/partyPages/liveSearch')}
                        >
                          <ThemedText style={styles.liveSearchBannerJoinText}>Join Queue</ThemedText>
                          <IconSymbol size={14} name="chevron.right" color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </Animated.View>

                  </TouchableOpacity>
                </View>

                {/* Tabs */}
                <View style={styles.tabsWrapper}>
                  <View style={styles.tabsContainer}>
                    <View style={styles.tabButton}>
                      <ThemedText style={styles.tabButtonText}>Recent</ThemedText>
                      <View style={styles.tabBadge}>
                        <ThemedText style={styles.tabBadgeText}>{duoPosts.length}</ThemedText>
                      </View>
                    </View>
                    <View style={styles.spacer} />
                    <TouchableOpacity
                      style={styles.postToFeedTab}
                      onPress={() => setShowPostDuoCard(true)}
                      activeOpacity={0.7}
                    >
                      <IconSymbol size={14} name="plus.circle" color="#fff" />
                      <ThemedText style={styles.postToFeedTabText}>Post to Feed</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.myCardsIconButton}
                      onPress={() => setShowMyCards(true)}
                      activeOpacity={0.7}
                    >
                      <IconSymbol size={18} name="square.stack.3d.up" color="#D4B878" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.advancedFiltersTab, activeFilterCount > 0 && styles.advancedFiltersTabActive]}
                      onPress={() => setShowFilterModal(true)}
                      activeOpacity={0.7}
                    >
                      <IconSymbol size={16} name="slider.horizontal.3" color={activeFilterCount > 0 ? '#D4B878' : '#fff'} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.tabsDivider} />
                </View>
              </View>
            }
            ListEmptyComponent={
              loadingDuoPosts ? (
                <View style={{ paddingHorizontal: 16 }}>
                  {[1, 2, 3].map((i) => (
                    <DuoFeedCardSkeleton key={i} />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <ThemedText style={styles.emptyTitle}>No duo posts{'\n'}yet</ThemedText>
                  <ThemedText style={styles.emptySubtitle}>
                    {hasCards
                      ? 'Be the first to post your duo card to the feed!'
                      : 'Create a Rank Card on your profile to get started.'}
                  </ThemedText>
                  {hasCards && (
                    <TouchableOpacity
                      style={styles.emptyButton}
                      onPress={() => setShowPostDuoCard(true)}
                      activeOpacity={0.8}
                    >
                      <ThemedText style={styles.emptyButtonText}>Post to Feed</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              )
            }
            renderItem={({ item: post }) => {
              const isOwn = post.userId === user?.id;
              return (
                <View style={styles.feedCardWrapper}>
                  <DuoCard
                    duo={{
                      id: 0,
                      username: isOwn ? (user?.username || post.username) : post.username,
                      status: 'active',
                      matchPercentage: 0,
                      currentRank: post.currentRank,
                      peakRank: post.peakRank,
                      favoriteAgent: post.mainAgent || '',
                      favoriteRole: post.mainRole || '',
                      winRate: post.winRate || 0,
                      gamesPlayed: post.gamesPlayed || 0,
                      game: post.game === 'valorant' ? 'Valorant' : 'League of Legends',
                      avatar: isOwn ? (user?.avatar || post.avatar) : post.avatar,
                      inGameIcon: post.inGameIcon,
                      inGameName: post.inGameName,
                      message: post.message || undefined,
                      isOwnPost: isOwn,
                      createdAt: post.createdAt,
                    }}
                    onPress={() => !isOwn ? handleFindDuoCardPress({
                      ...post,
                      mainAgent: post.mainAgent,
                      lookingFor: post.lookingFor,
                    } as DuoCardWithId) : undefined}
                    onMessage={!isOwn ? () => handleDuoPostMessage(post) : undefined}
                    onViewProfile={!isOwn ? () => router.push({
                      pathname: '/profilePages/profileView',
                      params: { userId: post.userId, username: post.username, avatar: post.avatar || '' },
                    }) : undefined}
                    onDelete={undefined}
                  />
                </View>
              );
            }}
            ListFooterComponent={<View style={styles.bottomSpacer} />}
          />

      {/* My Cards Modal */}
      <Modal
        visible={showMyCards}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMyCards(false)}
      >
        <View style={styles.myCardsModal}>
          {/* Ambient background glow */}
          <View style={styles.backgroundGlow} pointerEvents="none">
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
          <View style={styles.myCardsModalHeader}>
            <ThemedText style={styles.myCardsModalTitle}>MY CARDS</ThemedText>
            <TouchableOpacity
              onPress={() => setShowMyCards(false)}
              activeOpacity={0.7}
              style={styles.myCardsCloseButton}
            >
              <IconSymbol size={22} name="xmark" color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.myCardsModalContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#c42743"
                colors={['#c42743']}
              />
            }
          >
            {hasCards && (
              <View style={styles.compactCardsContainer}>
                <View style={styles.myCardsRow}>
                  {valorantCard && (
                    <DuoCard
                      duo={{
                        id: 0,
                        username: user?.username || valorantCard.username,
                        status: 'active',
                        matchPercentage: 0,
                        currentRank: valorantCard.currentRank,
                        peakRank: valorantCard.peakRank,
                        favoriteAgent: valorantCard.mainAgent || '',
                        favoriteRole: valorantCard.mainRole || '',
                        winRate: valorantWinRate || 0,
                        gamesPlayed: valorantGamesPlayed || 0,
                        game: 'Valorant',
                        avatar: user?.avatar,
                        isOwnPost: true,
                      }}
                      onPress={() => {
                        setShowMyCards(false);
                        handleCardPress('valorant');
                      }}
                      onRemovePost={hasActiveValorantPost ? () => {
                        Alert.alert(
                          'Remove Post',
                          'Remove your Valorant duo card from the feed?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await deleteDoc(doc(db, 'duoPosts', `${user?.id}_valorant`));
                                  setDuoPosts(prev => prev.filter(p => p.id !== `${user?.id}_valorant`));
                                  setDisplayedPosts(prev => prev.filter(p => p.id !== `${user?.id}_valorant`));
                                  setHasActiveValorantPost(false);
                                } catch (error) {
                                  console.error('Error removing duo post:', error);
                                }
                              },
                            },
                          ]
                        );
                      } : undefined}
                    />
                  )}
                  {leagueCard && (
                    <DuoCard
                      duo={{
                        id: 0,
                        username: user?.username || leagueCard.username,
                        status: 'active',
                        matchPercentage: 0,
                        currentRank: leagueCard.currentRank,
                        peakRank: leagueCard.peakRank,
                        favoriteAgent: leagueCard.mainAgent || '',
                        favoriteRole: leagueCard.mainRole || '',
                        winRate: leagueWinRate || 0,
                        gamesPlayed: leagueGamesPlayed || 0,
                        game: 'League of Legends',
                        avatar: user?.avatar,
                        isOwnPost: true,
                      }}
                      onPress={() => {
                        setShowMyCards(false);
                        handleCardPress('league');
                      }}
                      onRemovePost={hasActiveLeaguePost ? () => {
                        Alert.alert(
                          'Remove Post',
                          'Remove your League duo card from the feed?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await deleteDoc(doc(db, 'duoPosts', `${user?.id}_league`));
                                  setDuoPosts(prev => prev.filter(p => p.id !== `${user?.id}_league`));
                                  setDisplayedPosts(prev => prev.filter(p => p.id !== `${user?.id}_league`));
                                  setHasActiveLeaguePost(false);
                                } catch (error) {
                                  console.error('Error removing duo post:', error);
                                }
                              },
                            },
                          ]
                        );
                      } : undefined}
                    />
                  )}
                </View>
              </View>
            )}
            {!valorantCard && enabledRankCards.includes('valorant') && (
              <TouchableOpacity
                style={styles.addCardTemplate}
                onPress={() => syncDuoCardsWithStats(true, 'valorant')}
                activeOpacity={0.7}
              >
                <View style={styles.addCardTemplateTop}>
                  <View style={styles.addCardTemplateNameRow}>
                    <View style={styles.addCardTemplateAvatar}>
                      <IconSymbol size={18} name="person.fill" color="#333" />
                    </View>
                    <View style={styles.addCardTemplateNameCol}>
                      <View style={styles.addCardTemplateLine} />
                      <View style={[styles.addCardTemplateLine, { width: '50%' }]} />
                    </View>
                    <Image
                      source={require('@/assets/images/valorant-red.png')}
                      style={styles.addCardTemplateGameIcon}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={styles.addCardTemplateStats}>
                    <View style={styles.addCardTemplateRankPlaceholder} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={styles.addCardTemplateLine} />
                      <View style={[styles.addCardTemplateLine, { width: '60%' }]} />
                    </View>
                  </View>
                </View>
                <View style={styles.addCardTemplateBottom}>
                  <View style={styles.addCardTemplateCta}>
                    <IconSymbol size={18} name="plus.circle.fill" color="#A08845" />
                    <ThemedText style={styles.addCardTemplateCtaText}>Create Valorant Card</ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            {!leagueCard && enabledRankCards.includes('league') && (
              <TouchableOpacity
                style={styles.addCardTemplate}
                onPress={() => syncDuoCardsWithStats(true, 'league')}
                activeOpacity={0.7}
              >
                <View style={styles.addCardTemplateTop}>
                  <View style={styles.addCardTemplateNameRow}>
                    <View style={styles.addCardTemplateAvatar}>
                      <IconSymbol size={18} name="person.fill" color="#333" />
                    </View>
                    <View style={styles.addCardTemplateNameCol}>
                      <View style={styles.addCardTemplateLine} />
                      <View style={[styles.addCardTemplateLine, { width: '50%' }]} />
                    </View>
                    <Image
                      source={require('@/assets/images/lol-icon.png')}
                      style={styles.addCardTemplateGameIconLarge}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={styles.addCardTemplateStats}>
                    <View style={styles.addCardTemplateRankPlaceholder} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={styles.addCardTemplateLine} />
                      <View style={[styles.addCardTemplateLine, { width: '60%' }]} />
                    </View>
                  </View>
                </View>
                <View style={styles.addCardTemplateBottom}>
                  <View style={styles.addCardTemplateCta}>
                    <IconSymbol size={18} name="plus.circle.fill" color="#A08845" />
                    <ThemedText style={styles.addCardTemplateCtaText}>Create League Card</ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            {!hasCards && !enabledRankCards.includes('valorant') && !enabledRankCards.includes('league') && (
              <View style={styles.emptyCardState}>
                <ThemedText style={styles.emptyCardTitle}>No Duo Cards</ThemedText>
                <ThemedText style={styles.emptyCardText}>
                  Link your game account and create a Rank Card on your profile to see your duo cards here.
                </ThemedText>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Duo Card Modal */}
      {editingGame && (
        <EditDuoCard
          visible={showEditModal}
          onClose={handleCloseEditModal}
          onSave={handleSaveEdit}
          onDisable={handleDisableFromEdit}
          isDisabled={editingGame === 'valorant' ? (valorantCard?.disabled || false) : (leagueCard?.disabled || false)}
          game={editingGame}
          username={editingGame === 'valorant' ? (valorantCard?.username || '') : (leagueCard?.username || '')}
          currentRank={editingGame === 'valorant' ? (valorantCard?.currentRank || 'Unranked') : (leagueCard?.currentRank || 'Unranked')}
          region={editingGame === 'valorant' ? (valorantCard?.region || 'NA') : (leagueCard?.region || 'NA')}
          peakRank={editingGame === 'valorant' ? (valorantCard?.peakRank || 'Unranked') : (leagueCard?.peakRank || 'Unranked')}
          initialMainRole={editingGame === 'valorant' ? (valorantCard?.mainRole || '') : (leagueCard?.mainRole || '')}
          initialMainAgent={editingGame === 'valorant' ? (valorantCard?.mainAgent || '') : (leagueCard?.mainAgent || '')}
          initialLookingFor={editingGame === 'valorant' ? (valorantCard?.lookingFor || 'Any') : (leagueCard?.lookingFor || 'Any')}
        />
      )}

      {/* Duo Filter Modal */}
      <DuoFilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filters={filters}
        onApplyFilters={setFilters}
      />

      {/* Duo Card Detail Modal */}
      <DuoCardDetailModal
        visible={selectedDuoCard !== null}
        onClose={() => setSelectedDuoCard(null)}
        card={selectedDuoCard ? {
          game: selectedDuoCard.game,
          username: selectedDuoCard.username,
          avatar: selectedDuoCard.avatar,
          inGameIcon: selectedDuoCard.inGameIcon,
          inGameName: selectedDuoCard.inGameName,
          currentRank: selectedDuoCard.currentRank,
          peakRank: selectedDuoCard.peakRank,
          mainRole: selectedDuoCard.mainRole,
          mainAgent: selectedDuoCard.mainAgent,
          lookingFor: selectedDuoCard.lookingFor,
          winRate: selectedDuoCard.winRate,
          gamesPlayed: selectedDuoCard.gamesPlayed,
          rankUpUsername: selectedDuoCard.rankUpUsername,
          userId: selectedDuoCard.userId,
        } : null}
      />

      {/* Post Duo Card Modal */}
      <PostDuoCard
        visible={showPostDuoCard}
        onClose={() => setShowPostDuoCard(false)}
        onPostCreated={() => {
          fetchDuoPosts();
          // Refresh active post state
          syncDuoCardsWithStats();
        }}
        valorantCard={valorantCard}
        leagueCard={leagueCard}
        userAvatar={user?.avatar}
        valorantInGameIcon={valorantInGameIcon}
        valorantInGameName={valorantInGameName}
        valorantWinRate={valorantWinRate}
        leagueInGameIcon={leagueInGameIcon}
        leagueInGameName={leagueInGameName}
        leagueWinRate={leagueWinRate}
        valorantGamesPlayed={valorantGamesPlayed}
        leagueGamesPlayed={leagueGamesPlayed}
      />

      {/* Info Modal */}
      <Modal
        visible={showInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <Pressable style={styles.infoModalOverlay} onPress={() => setShowInfoModal(false)}>
          <Pressable style={styles.infoModalBubble} onPress={(e) => e.stopPropagation()}>
            <View style={styles.infoModalPointer} />
            <View style={styles.infoModalHeader}>
              <IconSymbol size={18} name="info.circle.fill" color="#D4B878" />
              <ThemedText style={styles.infoModalTitle}>How Duo/Team Finder Works</ThemedText>
            </View>
            <View style={styles.infoModalBody}>
              <ThemedText style={styles.infoModalText}>
                {'\u2022'} Live Search matches you with a player in real time.
              </ThemedText>
              <ThemedText style={styles.infoModalText}>
                {'\u2022'} Post Feed lets you browse and post duo cards to find teammates.
              </ThemedText>
            </View>
            <TouchableOpacity
              style={styles.infoModalClose}
              onPress={() => setShowInfoModal(false)}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.infoModalCloseText}>Got it</ThemedText>
            </TouchableOpacity>
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
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 0,
  },
  infoButton: {
    padding: 4,
  },
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 100,
    paddingRight: 16,
  },
  infoModalBubble: {
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 18,
    width: 290,
    gap: 14,
  },
  infoModalPointer: {
    position: 'absolute',
    top: -8,
    right: 18,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#1e1e1e',
  },
  infoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoModalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  infoModalBody: {
    gap: 10,
  },
  infoModalText: {
    fontSize: 13,
    color: '#aaa',
    lineHeight: 18,
  },
  infoModalClose: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(212, 184, 120, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  infoModalCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F0D6A2',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#888',
    marginTop: 2,
  },
  headerTabs: {
    flexDirection: 'row',
    marginTop: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
  },
  headerTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 10,
  },
  headerTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerTabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    width: '50%',
    height: 2,
    backgroundColor: '#D4B878',
    borderRadius: 1,
  },
  headerTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  headerTabTextActive: {
    color: '#F0D6A2',
  },
  myCardsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(212, 184, 120, 0.12)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212, 184, 120, 0.2)',
  },
  myCardsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // Live Search Banner
  liveSearchBannerOuter: {
    marginTop: 8,
    marginBottom: 4,
  },
  liveSearchBannerCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.7,
    shadowRadius: 30,
    elevation: 6,
  },
  liveSearchBannerContent: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
  },
  liveSearchBannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveSearchBannerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveSearchBannerTextCol: {
    flex: 1,
  },
  liveSearchBannerIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveSearchBannerGameIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveSearchBannerValorantImg: {
    width: 20,
    height: 20,
  },
  liveSearchBannerLeagueIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveSearchBannerLeagueImg: {
    width: 34,
    height: 34,
  },
  liveSearchBannerLogo: {
    width: 156,
    height: 58,
    marginLeft: -18,
  },
  liveSearchBannerTagline: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  liveSearchBannerSubtext: {
    fontSize: 13,
    color: '#888',
  },
  liveSearchBannerJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveSearchBannerJoinText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  liveSearchBannerGlow: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 1,
  },
  // Tabs
  tabsWrapper: {
    marginTop: 10,
    marginBottom: 12,
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 3,
    borderBottomColor: '#D4B878',
  },
  tabButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  tabsDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  spacer: {
    flex: 1,
  },
  postToFeedTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 8,
  },
  postToFeedTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  advancedFiltersTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 8,
  },
  myCardsIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    backgroundColor: 'rgba(212, 184, 120, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212, 184, 120, 0.2)',
    marginBottom: 8,
  },
  advancedFiltersTabActive: {
    backgroundColor: 'rgba(212, 184, 120, 0.12)',
    borderColor: 'rgba(212, 184, 120, 0.2)',
  },
  advancedFiltersText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  advancedFiltersTextActive: {
    color: '#F0D6A2',
  },
  // Pager
  pagerContainer: {
    flex: 1,
  },
  pageContainer: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    flexGrow: 1,
  },
  bottomSpacer: {
    height: 40,
  },
  feedContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  feedContainer: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingTop: 4,
    paddingBottom: 4,
    marginBottom: 12,
  },
  // Live Search Banner
  liveSearchBannerWrapper: {
    marginHorizontal: 0,
    marginBottom: 12,
    position: 'relative',
  },
  liveSearchGlow: {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: 17,
    backgroundColor: '#D4B878',
    opacity: 0.25,
  },
  liveSearchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f0f14',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212, 184, 120, 0.4)',
    borderTopColor: 'rgba(212, 184, 120, 0.55)',
    paddingVertical: 18,
    paddingHorizontal: 20,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#D4B878',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  liveSearchLeft: {
    flex: 1,
    gap: 8,
  },
  liveSearchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveSearchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  liveSearchLiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4ADE80',
    letterSpacing: 0.5,
  },
  liveSearchTextContent: {
    gap: 4,
  },
  liveSearchTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
  },
  liveSearchSubtitle: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
  liveSearchRight: {
    alignItems: 'flex-end',
    gap: 12,
  },
  liveSearchWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  waveformBar: {
    width: 3,
    backgroundColor: '#4ADE80',
    borderRadius: 1.5,
  },
  joinQueueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#000',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 184, 120, 0.5)',
  },
  joinQueueText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  rankIconsColumn: {
    flexDirection: 'column',
    gap: 4,
  },
  rankIconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rankIconSmall: {
    width: 24,
    height: 24,
  },
  refineSearchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  refineSearchText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  feedCardWrapper: {
    marginBottom: 4,
  },
  // Section Headers - Parties style
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  playerCount: {
    fontSize: 12,
    fontWeight: '500',
    color: '#555',
  },
  // My Card Content
  myCardContent: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 16,
  },
  myCardsContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
  },
  addCardTemplate: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderStyle: 'dashed',
  },
  addCardTemplateTop: {
    padding: 16,
    gap: 12,
  },
  addCardTemplateNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addCardTemplateAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCardTemplateNameCol: {
    flex: 1,
    gap: 6,
  },
  addCardTemplateLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    width: '75%',
  },
  addCardTemplateGameIcon: {
    width: 28,
    height: 28,
    opacity: 0.4,
  },
  addCardTemplateGameIconLarge: {
    width: 50,
    height: 50,
    opacity: 0.4,
  },
  addCardTemplateStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  addCardTemplateRankPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  addCardTemplateBottom: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
  },
  addCardTemplateCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(160,136,69,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(160,136,69,0.2)',
  },
  addCardTemplateCtaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#A08845',
  },
  emptyCardState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyCardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  emptyCardText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  addCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 28,
    backgroundColor: '#c42743',
    borderRadius: 12,
  },
  addCardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  compactCardsContainer: {
    gap: 10,
    paddingHorizontal: 0,
    paddingVertical: 16,
  },
  myCardsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.5,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  myCardsRow: {
    gap: 12,
  },
  // Find Duo Content
  findDuoContent: {
    flex: 1,
  },
  findDuoContainer: {
    flex: 1,
    marginHorizontal: 8,
    marginTop: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
  },
  headerRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  postToFeedButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  postToFeedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
  },
  filterLabelActive: {
    color: '#fff',
  },
  emptyState: {
    paddingHorizontal: 28,
    paddingTop: 40,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 36,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#555',
  },
  emptyButton: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f0f0f',
  },
  cardsList: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 10,
  },
  // My Cards Modal
  myCardsModal: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  myCardsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  myCardsModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  myCardsCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myCardsModalContent: {
    padding: 16,
    flexGrow: 1,
  },
});
