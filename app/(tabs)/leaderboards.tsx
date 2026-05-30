import LeaderboardCard from '@/app/components/leaderboardCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LeaderboardsTabSkeleton, LeaderboardCardSkeleton } from '@/components/ui/Skeleton';
import CachedImage from '@/components/ui/CachedImage';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from '@/hooks/useRouter';
import { collection, doc, getDoc, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ActivityIndicator, Animated, Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { formatRankDisplay } from '@/utils/formatRankDisplay';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// League of Legends rank icon mapping
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

// Valorant rank icon mapping
const VALORANT_RANK_ICONS: { [key: string]: any } = {
  iron: require('@/assets/images/valorantranks/iron.png'),
  iron1: require('@/assets/images/valorantranks/iron1.png'),
  iron2: require('@/assets/images/valorantranks/iron2.png'),
  iron3: require('@/assets/images/valorantranks/iron3.png'),
  bronze: require('@/assets/images/valorantranks/bronze.png'),
  bronze1: require('@/assets/images/valorantranks/bronze1.png'),
  bronze2: require('@/assets/images/valorantranks/bronze2.png'),
  bronze3: require('@/assets/images/valorantranks/bronze3.png'),
  silver: require('@/assets/images/valorantranks/silver.png'),
  silver1: require('@/assets/images/valorantranks/silver1.png'),
  silver2: require('@/assets/images/valorantranks/silver2.png'),
  silver3: require('@/assets/images/valorantranks/silver3.png'),
  gold: require('@/assets/images/valorantranks/gold.png'),
  gold1: require('@/assets/images/valorantranks/gold1.png'),
  gold2: require('@/assets/images/valorantranks/gold2.png'),
  gold3: require('@/assets/images/valorantranks/gold3.png'),
  platinum: require('@/assets/images/valorantranks/platinum.png'),
  platinum1: require('@/assets/images/valorantranks/platinum1.png'),
  platinum2: require('@/assets/images/valorantranks/platinum2.png'),
  platinum3: require('@/assets/images/valorantranks/platinum3.png'),
  diamond: require('@/assets/images/valorantranks/diamond.png'),
  diamond1: require('@/assets/images/valorantranks/diamond1.png'),
  diamond2: require('@/assets/images/valorantranks/diamond2.png'),
  diamond3: require('@/assets/images/valorantranks/diamond3.png'),
  ascendant: require('@/assets/images/valorantranks/ascendant.png'),
  ascendant1: require('@/assets/images/valorantranks/ascendant1.png'),
  ascendant2: require('@/assets/images/valorantranks/ascendant2.png'),
  ascendant3: require('@/assets/images/valorantranks/ascendant3.png'),
  immortal: require('@/assets/images/valorantranks/immortal.png'),
  immortal1: require('@/assets/images/valorantranks/immortal1.png'),
  immortal2: require('@/assets/images/valorantranks/immortal2.png'),
  immortal3: require('@/assets/images/valorantranks/immortal3.png'),
  radiant: require('@/assets/images/valorantranks/radiant.png'),
  unranked: require('@/assets/images/valorantranks/unranked.png'),
};

const getLeagueRankIcon = (rank: string) => {
  if (!rank || rank === 'Unranked') return LEAGUE_RANK_ICONS.unranked;
  const tier = rank.split(' ')[0].toLowerCase();
  return LEAGUE_RANK_ICONS[tier] || LEAGUE_RANK_ICONS.unranked;
};

const getValorantRankIcon = (rank: string) => {
  if (!rank || rank === 'Unranked') return VALORANT_RANK_ICONS.unranked;
  const parts = rank.split(' ');
  const tier = parts[0].toLowerCase();
  const division = parts[1];
  // Try exact match first (e.g. "platinum1"), then fall back to tier only
  const exactKey = division ? `${tier}${division}` : tier;
  return VALORANT_RANK_ICONS[exactKey] || VALORANT_RANK_ICONS[tier] || VALORANT_RANK_ICONS.unranked;
};

// Game logo mapping
const GAME_LOGOS: { [key: string]: any } = {
  'Valorant': require('@/assets/images/valorant-red.png'),
  'League of Legends': require('@/assets/images/lol-icon.png'),
  'League': require('@/assets/images/lol-icon.png'),
};

// Helper function to calculate League rank value for sorting
const getLeagueRankValue = (currentRank: string, lp: number): number => {
  const rankOrder: { [key: string]: number } = {
    'CHALLENGER': 10, 'GRANDMASTER': 9, 'MASTER': 8, 'DIAMOND': 7,
    'EMERALD': 6, 'PLATINUM': 5, 'GOLD': 4, 'SILVER': 3,
    'BRONZE': 2, 'IRON': 1, 'UNRANKED': 0,
  };
  const divisionOrder: { [key: string]: number } = { 'I': 4, 'II': 3, 'III': 2, 'IV': 1 };

  const parts = currentRank.toUpperCase().split(' ');
  const tierValue = rankOrder[parts[0]] || 0;
  const divisionValue = divisionOrder[parts[1]] || 0;

  return tierValue * 1000 + divisionValue * 100 + lp;
};

// Helper function to calculate Valorant rank value for sorting
const getValorantRankValue = (currentRank: string, rr: number): number => {
  const rankOrder: { [key: string]: number } = {
    'RADIANT': 9, 'IMMORTAL': 8, 'ASCENDANT': 7, 'DIAMOND': 6,
    'PLATINUM': 5, 'GOLD': 4, 'SILVER': 3, 'BRONZE': 2,
    'IRON': 1, 'UNRANKED': 0,
  };

  const parts = currentRank.toUpperCase().split(' ');
  const tierValue = rankOrder[parts[0]] || 0;
  const divisionValue = parseInt(parts[1]) || 0;

  return tierValue * 1000 + divisionValue * 100 + rr;
};


// --- Rank change tracking ---
const RANK_HISTORY_KEY = 'leaderboard_rank_history';
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

interface RankChangeEntry {
  previousRank: number;
  currentRank: number;
  changedAt: number; // timestamp ms
  joinedAt: number;  // timestamp ms when user first appeared
}

interface RankHistory {
  [game: string]: {
    [userId: string]: RankChangeEntry;
  };
}

const loadRankHistory = async (): Promise<RankHistory> => {
  try {
    const raw = await AsyncStorage.getItem(RANK_HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveRankHistory = async (history: RankHistory) => {
  try {
    await AsyncStorage.setItem(RANK_HISTORY_KEY, JSON.stringify(history));
  } catch {}
};

/**
 * Computes rank change arrows.
 * Returns a map of userId -> 'up' | 'down' | null
 * - New users (joined < 24h ago with no prior position) get null (no arrow)
 * - Position change within 24h shows arrow
 * - After 24h the arrow disappears
 */
const computeRankChanges = async (
  players: { userId: string }[],
  game: string,
): Promise<Record<string, 'up' | 'down' | null>> => {
  const now = Date.now();
  const history = await loadRankHistory();
  if (!history[game]) history[game] = {};

  const gameHistory = history[game];
  const result: Record<string, 'up' | 'down' | null> = {};

  players.forEach((player, index) => {
    const currentPos = index + 1;
    const entry = gameHistory[player.userId];

    if (!entry) {
      // New user — record their join time and position, no arrow
      gameHistory[player.userId] = {
        previousRank: currentPos,
        currentRank: currentPos,
        changedAt: now,
        joinedAt: now,
      };
      result[player.userId] = null;
    } else {
      const isNewUser = (now - entry.joinedAt) < TWENTY_FOUR_HOURS && entry.previousRank === entry.currentRank;

      if (isNewUser) {
        // Still in the grace period since joining, update position silently
        entry.currentRank = currentPos;
        result[player.userId] = null;
      } else if (currentPos !== entry.currentRank) {
        // Position changed
        entry.previousRank = entry.currentRank;
        entry.currentRank = currentPos;
        entry.changedAt = now;
        result[player.userId] = currentPos < entry.previousRank ? 'up' : 'down';
      } else if ((now - entry.changedAt) < TWENTY_FOUR_HOURS && entry.previousRank !== entry.currentRank) {
        // Within 24h window, still show arrow
        result[player.userId] = entry.currentRank < entry.previousRank ? 'up' : 'down';
      } else {
        // No change or expired — reset
        entry.previousRank = currentPos;
        entry.currentRank = currentPos;
        result[player.userId] = null;
      }
    }
  });

  // Clean up users no longer in the leaderboard
  const currentUserIds = new Set(players.map(p => p.userId));
  for (const uid of Object.keys(gameHistory)) {
    if (!currentUserIds.has(uid)) delete gameHistory[uid];
  }

  await saveRankHistory(history);
  return result;
};

// --- Daily progress tracking ---
const DAILY_BASELINE_KEY = 'leaderboard_daily_baseline';

interface DailyBaseline {
  [game: string]: { date: string; rr: number; lp: number };
}

const getDailyGain = async (game: string, currentRR: number, currentLP: number): Promise<number> => {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  try {
    const raw = await AsyncStorage.getItem(DAILY_BASELINE_KEY);
    const baselines: DailyBaseline = raw ? JSON.parse(raw) : {};

    if (!baselines[game] || baselines[game].date !== today) {
      baselines[game] = { date: today, rr: currentRR, lp: currentLP };
      await AsyncStorage.setItem(DAILY_BASELINE_KEY, JSON.stringify(baselines));
      return 0;
    }

    return game === 'valorant'
      ? currentRR - baselines[game].rr
      : currentLP - baselines[game].lp;
  } catch {
    return 0;
  }
};

interface MutualPlayer {
  userId: string;
  username: string;
  avatar: string | null;
  currentRank: string;
  lp: number;
  rr: number;
  isCurrentUser?: boolean;
}

// Module-level cache for lobbies
let cachedLobbies: any[] | null = null;
let prefetchedLobbyImages = new Set<string>();

const MINIMUM_SKELETON_TIME = 400;

const getLobbiesLeagueRankValue = (currentRank: string, lp: number): number => {
  const rankOrder: { [key: string]: number } = {
    'CHALLENGER': 10, 'GRANDMASTER': 9, 'MASTER': 8, 'DIAMOND': 7,
    'EMERALD': 6, 'PLATINUM': 5, 'GOLD': 4, 'SILVER': 3,
    'BRONZE': 2, 'IRON': 1, 'UNRANKED': 0,
  };
  const divisionOrder: { [key: string]: number } = { 'I': 4, 'II': 3, 'III': 2, 'IV': 1 };
  const parts = currentRank.toUpperCase().split(' ');
  return (rankOrder[parts[0]] || 0) * 1000 + (divisionOrder[parts[1]] || 0) * 100 + lp;
};

const getLobbiesValorantRankValue = (currentRank: string, rr: number): number => {
  const rankOrder: { [key: string]: number } = {
    'RADIANT': 9, 'IMMORTAL': 8, 'ASCENDANT': 7, 'DIAMOND': 6,
    'PLATINUM': 5, 'GOLD': 4, 'SILVER': 3, 'BRONZE': 2,
    'IRON': 1, 'UNRANKED': 0,
  };
  const parts = currentRank.toUpperCase().split(' ');
  return (rankOrder[parts[0]] || 0) * 1000 + (parseInt(parts[1]) || 0) * 100 + rr;
};

export default function LeaderboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [mutualIds, setMutualIds] = useState<Set<string>>(new Set());
  const [leaguePlayers, setLeaguePlayers] = useState<MutualPlayer[]>([]);
  const [valorantPlayers, setValorantPlayers] = useState<MutualPlayer[]>([]);
  const [mutualLoading, setMutualLoading] = useState(true);
  const [selectedMutualGame, setSelectedMutualGame] = useState<'league' | 'valorant'>('league');
  const [showGameDropdown, setShowGameDropdown] = useState(false);
  const [updatingStats, setUpdatingStats] = useState(false);
  const [lobbyCount, setLobbyCount] = useState(0);
  const [rankChanges, setRankChanges] = useState<Record<string, 'up' | 'down' | null>>({});
  const [userGameStats, setUserGameStats] = useState<{ rr: number; lp: number; rrToday: number; lpToday: number } | null>(null);
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Lobbies state
  const [lobbies, setLobbies] = useState<any[]>(cachedLobbies || []);
  const [lobbiesLoading, setLobbiesLoading] = useState(!cachedLobbies);
  const [lobbiesSubTab, setLobbiesSubTab] = useState<'all' | 'active'>('all');
  const lobbySkeletonStartTime = useRef<number>(Date.now());
  const isFirstLobbyLoad = useRef(!cachedLobbies);

  // Listen for user's active lobbies count
  useEffect(() => {
    if (!user?.id) return;
    const q = query(collection(db, 'parties'), where('members', 'array-contains', user.id));
    const unsub = onSnapshot(q, (snap) => setLobbyCount(snap.size), () => {});
    return unsub;
  }, [user?.id]);

  const fetchMutualsAndStats = async (showLoading: boolean = true, preserveGame: boolean = false) => {
    if (!user?.id) return;
    if ((user.followersCount || 0) === 0 && (user.followingCount || 0) === 0) {
      setMutualLoading(false);
      return;
    }

    try {
      if (showLoading) setMutualLoading(true);
      const followersRef = collection(db, 'users', user.id, 'followers');
      const followingRef = collection(db, 'users', user.id, 'following');

      const [followersSnapshot, followingSnapshot] = await Promise.all([
        getDocs(followersRef),
        getDocs(followingRef),
      ]);

      const followerIds = new Set(followersSnapshot.docs.map(d => d.data().followerId));
      const followingIds = new Set(followingSnapshot.docs.map(d => d.data().followingId));

      const mutuals = new Set([...followerIds].filter(id => followingIds.has(id)));
      setMutualIds(mutuals);

      const allUserIds = [...mutuals, user.id];

      const leagueResults: MutualPlayer[] = [];
      const valorantResults: MutualPlayer[] = [];

      await Promise.all(
        allUserIds.map(async (userId) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            const userData = userDoc.data();
            const username = userData?.username || 'User';
            const avatar = userData?.avatar || null;

            // Skip League if this user has no Riot account linked
            const hasRiotAccount = !!userData?.riotAccount || !!userData?.riotStats;
            if (hasRiotAccount) {
              const leagueStatsDoc = await getDoc(doc(db, 'users', userId, 'gameStats', 'league'));
              let leagueStats = leagueStatsDoc.data();

              if (!leagueStats?.currentRank && userData?.riotStats?.rankedSolo) {
                leagueStats = {
                  currentRank: `${userData.riotStats.rankedSolo.tier} ${userData.riotStats.rankedSolo.rank}`,
                  lp: userData.riotStats.rankedSolo.leaguePoints || 0,
                };
              }

              leagueResults.push({
                userId,
                username,
                avatar,
                currentRank: leagueStats?.currentRank || 'Unranked',
                lp: leagueStats?.lp || 0,
                rr: 0,
                isCurrentUser: userId === user.id,
              });
            }

            // Skip Valorant if this user has no Valorant account linked
            const hasValorantAccount = !!userData?.valorantAccount || !!userData?.valorantStats;
            if (hasValorantAccount) {
              const valStatsDoc = await getDoc(doc(db, 'users', userId, 'gameStats', 'valorant'));
              let valStats = valStatsDoc.data();

              if (!valStats?.currentRank && userData?.valorantStats) {
                valStats = {
                  currentRank: userData.valorantStats.currentRank || 'Unranked',
                  rr: userData.valorantStats.rankRating || 0,
                };
              }

              valorantResults.push({
                userId,
                username,
                avatar,
                currentRank: valStats?.currentRank || 'Unranked',
                lp: 0,
                rr: valStats?.rr || 0,
                isCurrentUser: userId === user.id,
              });
            }
          } catch (error) {
            console.error(`Error fetching stats for user ${userId}:`, error);
          }
        })
      );

      leagueResults.sort((a, b) => getLeagueRankValue(b.currentRank, b.lp) - getLeagueRankValue(a.currentRank, a.lp));
      valorantResults.sort((a, b) => getValorantRankValue(b.currentRank, b.rr) - getValorantRankValue(a.currentRank, a.rr));

      // Compute rank change arrows
      const activeGame = preserveGame ? selectedMutualGame : (valorantResults.length > leagueResults.length ? 'valorant' : 'league');
      const activePlayers = activeGame === 'league' ? leagueResults : valorantResults;
      const changes = await computeRankChanges(activePlayers, activeGame);
      setRankChanges(changes);

      // Compute daily gain for the current user
      const currentUserInActive = activePlayers.find(p => p.isCurrentUser);
      if (currentUserInActive) {
        const dailyGain = await getDailyGain(
          activeGame,
          currentUserInActive.rr || 0,
          currentUserInActive.lp || 0,
        );
        setUserGameStats({
          rr: currentUserInActive.rr || 0,
          lp: currentUserInActive.lp || 0,
          rrToday: activeGame === 'valorant' ? dailyGain : 0,
          lpToday: activeGame === 'league' ? dailyGain : 0,
        });
      } else {
        setUserGameStats(null);
      }

      setLeaguePlayers(leagueResults);
      setValorantPlayers(valorantResults);
      if (!preserveGame) {
        setSelectedMutualGame(valorantResults.length > leagueResults.length ? 'valorant' : 'league');
      }
      setMutualLoading(false);
    } catch (error) {
      console.error('Error fetching mutual stats:', error);
      setMutualLoading(false);
    }
  };

  const handleUpdateStats = async () => {
    if (updatingStats) return;
    setUpdatingStats(true);
    try {
      await fetchMutualsAndStats(false, true);
    } finally {
      setUpdatingStats(false);
    }
  };

  // Fetch mutual follower IDs and their game stats
  useEffect(() => {
    fetchMutualsAndStats();
  }, [user?.id]);

  // Recompute rank changes & daily gain when switching games
  useEffect(() => {
    const players = selectedMutualGame === 'league' ? leaguePlayers : valorantPlayers;
    if (players.length === 0) return;
    (async () => {
      const changes = await computeRankChanges(players, selectedMutualGame);
      setRankChanges(changes);
      const me = players.find(p => p.isCurrentUser);
      if (me) {
        const dailyGain = await getDailyGain(selectedMutualGame, me.rr || 0, me.lp || 0);
        setUserGameStats({
          rr: me.rr || 0, lp: me.lp || 0,
          rrToday: selectedMutualGame === 'valorant' ? dailyGain : 0,
          lpToday: selectedMutualGame === 'league' ? dailyGain : 0,
        });
      } else {
        setUserGameStats(null);
      }
    })();
  }, [selectedMutualGame, leaguePlayers, valorantPlayers]);

  // Fetch lobbies from Firestore
  useEffect(() => {
    if (!user?.id) {
      setLobbiesLoading(false);
      return;
    }

    const partiesRef = collection(db, 'parties');
    const partiesQuery = query(partiesRef, where('members', 'array-contains', user.id));

    const unsubscribe = onSnapshot(partiesQuery, (snapshot) => {
      setLobbies((prev) => {
        const updated = snapshot.docs
          .map((docSnapshot) => {
            const data = docSnapshot.data();
            const docId = docSnapshot.id;
            if (data.type === 'party') return null;

            const existing = prev.find(p => p.id === docId);

            return {
              id: docId,
              name: data.partyName,
              game: data.game,
              members: data.members?.length || 0,
              maxMembers: data.maxMembers || 10,
              memberIds: data.members || [],
              memberDetails: data.memberDetails || [],
              description: `Created on ${data.startDate}`,
              icon: data.game === 'Valorant' ? '🎯' : data.game === 'League of Legends' ? '💎' : '🎮',
              userRank: existing?.userRank ?? null,
              isJoined: true,
              players: existing?.players || [],
              startDate: data.startDate,
              endDate: data.endDate,
              type: data.type || 'leaderboard',
              coverPhoto: data.coverPhoto || null,
              partyIcon: data.partyIcon || null,
              partyId: data.partyId || docId,
              challengeStatus: data.challengeStatus || 'active',
              challengeParticipants: data.challengeParticipants || [],
            };
          })
          .filter(Boolean);

        cachedLobbies = updated;

        requestAnimationFrame(() => {
          updated.forEach((lb: any) => {
            if (lb.partyIcon && !prefetchedLobbyImages.has(lb.partyIcon)) {
              prefetchedLobbyImages.add(lb.partyIcon);
              Image.prefetch(lb.partyIcon).catch(() => {});
            }
            const members = lb.memberDetails?.length ? lb.memberDetails : lb.players || [];
            members.slice(0, 3).forEach((m: any) => {
              const photo = m?.avatar || m?.photoUrl;
              if (photo && !prefetchedLobbyImages.has(photo)) {
                prefetchedLobbyImages.add(photo);
                Image.prefetch(photo).catch(() => {});
              }
            });
          });
        });

        return updated;
      });

      if (isFirstLobbyLoad.current) {
        const elapsedTime = Date.now() - lobbySkeletonStartTime.current;
        const remainingTime = Math.max(0, MINIMUM_SKELETON_TIME - elapsedTime);
        setTimeout(() => {
          setLobbiesLoading(false);
          isFirstLobbyLoad.current = false;
        }, remainingTime);
      } else {
        setLobbiesLoading(false);
      }
    });

    return () => unsubscribe();
  }, [user?.id]);

  // Enrich lobbies with sorted player rank data
  useEffect(() => {
    if (lobbiesLoading || lobbies.length === 0) return;

    const enrichWithRanks = async () => {
      const enriched = await Promise.all(
        lobbies.map(async (lb: any) => {
          if (lb.players && lb.players.length > 0 && lb.players[0].currentRank) return lb;

          const memberDetails = lb.memberDetails || [];
          if (memberDetails.length === 0) return lb;

          const isLeague = lb.game === 'League of Legends' || lb.game === 'League';
          const gameStatsPath = isLeague ? 'league' : 'valorant';

          try {
            const playerPromises = memberDetails.map(async (member: any) => {
              try {
                const statsDoc = await getDoc(doc(db, 'users', member.userId, 'gameStats', gameStatsPath));
                let stats = statsDoc.data();

                if (!stats?.currentRank) {
                  const userDoc = await getDoc(doc(db, 'users', member.userId));
                  const userData = userDoc.data();
                  if (isLeague && userData?.riotStats?.rankedSolo) {
                    stats = { currentRank: `${userData.riotStats.rankedSolo.tier} ${userData.riotStats.rankedSolo.rank}`, lp: userData.riotStats.rankedSolo.leaguePoints || 0 };
                  } else if (!isLeague && userData?.valorantStats) {
                    stats = { currentRank: userData.valorantStats.currentRank || 'Unranked', rr: userData.valorantStats.rankRating || 0 };
                  }
                }

                return {
                  userId: member.userId,
                  username: member.username,
                  avatar: member.avatar,
                  currentRank: stats?.currentRank || 'Unranked',
                  lp: stats?.lp || 0,
                  rr: stats?.rr || 0,
                };
              } catch {
                return { userId: member.userId, username: member.username, avatar: member.avatar, currentRank: 'Unranked', lp: 0, rr: 0 };
              }
            });

            const players = await Promise.all(playerPromises);
            players.sort((a, b) => {
              if (isLeague) return getLobbiesLeagueRankValue(b.currentRank, b.lp) - getLobbiesLeagueRankValue(a.currentRank, a.lp);
              return getLobbiesValorantRankValue(b.currentRank, b.rr) - getLobbiesValorantRankValue(a.currentRank, a.rr);
            });
            players.forEach((p: any, i: number) => { p.rank = i + 1; });

            return { ...lb, players };
          } catch {
            return lb;
          }
        })
      );

      setLobbies(enriched);
      cachedLobbies = enriched;
    };

    enrichWithRanks();
  }, [lobbiesLoading, lobbies.length]);

  const handleLobbyPress = useCallback((leaderboard: any) => {
    if (leaderboard.challengeStatus === 'completed') {
      router.push({
        pathname: '/partyPages/leaderboardResults',
        params: {
          name: leaderboard.name,
          icon: leaderboard.icon,
          game: leaderboard.game,
          members: leaderboard.members.toString(),
          id: leaderboard.id,
          startDate: leaderboard.startDate,
          endDate: leaderboard.endDate,
        },
      });
    } else {
      router.push({
        pathname: '/partyPages/leaderboardDetail',
        params: {
          name: leaderboard.name,
          icon: leaderboard.icon,
          game: leaderboard.game,
          members: leaderboard.members.toString(),
          players: JSON.stringify(leaderboard.players),
          id: leaderboard.id,
          startDate: leaderboard.startDate,
          endDate: leaderboard.endDate,
        },
      });
    }
  }, [router]);

  const filteredLobbies = useMemo(() => {
    if (lobbiesSubTab === 'active') return lobbies.filter(lb => lb.challengeStatus !== 'completed');
    return lobbies;
  }, [lobbies, lobbiesSubTab]);

  const activeLobbiesCount = useMemo(() => lobbies.filter(lb => lb.challengeStatus !== 'completed').length, [lobbies]);

  const getBorderColor = (rank: number) => {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return '#333';
  };

  const renderMutualLeaderboard = (players: MutualPlayer[], game: 'league' | 'valorant') => {
    if (players.length === 0) return null;

    const isLeague = game === 'league';
    const title = isLeague ? 'League of Legends' : 'Valorant';
    const gameLogo = isLeague ? GAME_LOGOS['League of Legends'] : GAME_LOGOS['Valorant'];
    const otherGame = isLeague ? 'valorant' : 'league';
    const otherTitle = isLeague ? 'Valorant' : 'League of Legends';
    const otherLogo = isLeague ? GAME_LOGOS['Valorant'] : GAME_LOGOS['League of Legends'];
    const otherPlayers = isLeague ? valorantPlayers : leaguePlayers;

    return (
      <View style={styles.mutualSection}>
        <View style={styles.mutualSectionHeader}>
          <TouchableOpacity
            style={styles.gameSwitchButton}
            onPress={() => otherPlayers.length > 0 && setShowGameDropdown(true)}
            activeOpacity={0.7}
          >
            <View style={styles.gameSwitchGlow} />
            <Image source={gameLogo} style={styles.gameLogoSmall} resizeMode="contain" />
            <ThemedText style={styles.mutualSectionTitle}>{title}</ThemedText>
            {otherPlayers.length > 0 && (
              <IconSymbol size={14} name="chevron.down" color="#666" />
            )}
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.updateButton, updatingStats && { opacity: 0.5 }]}
            onPress={handleUpdateStats}
            disabled={updatingStats}
            activeOpacity={0.7}
          >
            {updatingStats ? (
              <ActivityIndicator size={12} color="#888" />
            ) : (
              <IconSymbol size={14} name="arrow.clockwise" color="#888" />
            )}
            <ThemedText style={styles.updateButtonText}>
              {updatingStats ? 'Refreshing...' : 'Refresh'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Top 3 Podium */}
        {players.length > 0 && (() => {
          const renderTop3Card = (player: MutualPlayer, rank: number) => {
            const rankIcon = isLeague
              ? getLeagueRankIcon(player.currentRank)
              : getValorantRankIcon(player.currentRank);
            const points = isLeague ? `${player.lp || 0} LP` : `${player.rr || 0} RR`;

            return (
              <TouchableOpacity
                key={player.userId}
                style={styles.top3Card}
                activeOpacity={player.isCurrentUser ? 1 : 0.7}
                onPress={() => {
                  if (!player.isCurrentUser) {
                    router.push({
                      pathname: '/profilePages/profileView',
                      params: {
                        userId: player.userId,
                        username: player.username,
                        avatar: player.avatar || '',
                        preloadedFollowing: 'true',
                      },
                    });
                  }
                }}
              >
                {/* Top section: rank number + avatar + username */}
                <View style={styles.top3CardTop}>
                  <ThemedText style={[styles.top3RankNumber, { color: getBorderColor(rank) }]}>{rank}</ThemedText>
                  <View style={[styles.top3AvatarRing, { borderColor: getBorderColor(rank) }]}>
                    <View style={styles.top3Avatar}>
                      {player.avatar ? (
                        <CachedImage uri={player.avatar} style={styles.top3AvatarImage} />
                      ) : (
                        <ThemedText style={styles.top3AvatarFallback}>
                          {player.username.charAt(0).toUpperCase()}
                        </ThemedText>
                      )}
                    </View>
                  </View>
                  <ThemedText style={[styles.top3Username, player.isCurrentUser && styles.currentUserName]} numberOfLines={1}>
                    {player.username}
                  </ThemedText>
                </View>

                {/* Center: rank icon + LP/RR */}
                <View style={styles.top3CenterSection}>
                  <View style={styles.top3RankRow}>
                    <Image source={rankIcon} style={styles.top3RankIcon} resizeMode="contain" />
                    <ThemedText style={styles.top3Points}>{points}</ThemedText>
                  </View>
                  <ThemedText style={styles.top3RankLabel}>
                    {formatRankDisplay(player.currentRank)}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            );
          };

          return (
            <View style={styles.top3Podium}>
              {/* 1st place centered on top */}
              <View style={styles.top3FirstRow}>
                {renderTop3Card(players[0], 1)}
              </View>
              {/* 2nd and 3rd side by side below */}
              {players.length >= 2 && (
                <View style={styles.top3SecondRow}>
                  {renderTop3Card(players[1], 2)}
                  {players.length >= 3 && renderTop3Card(players[2], 3)}
                </View>
              )}
            </View>
          );
        })()}

        {/* Remaining Player Rows */}
        {players.length > 3 && (() => {
          const remainingPlayers = players.slice(3);

          // Build visible players for collapsed view
          let visiblePlayers: { player: MutualPlayer; rank: number }[];
          let showSeparator = false;
          let separatorAfterIndex = -1;

          if (leaderboardExpanded) {
            visiblePlayers = remainingPlayers.map((p, i) => ({ player: p, rank: i + 4 }));
          } else {
            const currentUserIdx = remainingPlayers.findIndex(p => p.isCurrentUser);

            if (currentUserIdx >= 0 && currentUserIdx > 2) {
              // User is beyond rank 6 — show ranks 4-6, then separator, then neighbor above, user, neighbor below
              const topSection = remainingPlayers.slice(0, 3).map((p, i) => ({ player: p, rank: i + 4 }));
              const above = currentUserIdx - 1;
              const below = Math.min(currentUserIdx + 1, remainingPlayers.length - 1);
              const userSection: { player: MutualPlayer; rank: number }[] = [];
              if (above >= 3) userSection.push({ player: remainingPlayers[above], rank: above + 4 });
              userSection.push({ player: remainingPlayers[currentUserIdx], rank: currentUserIdx + 4 });
              if (below < remainingPlayers.length && below !== currentUserIdx) {
                userSection.push({ player: remainingPlayers[below], rank: below + 4 });
              }
              visiblePlayers = [...topSection, ...userSection];
              showSeparator = true;
              separatorAfterIndex = topSection.length - 1;
            } else {
              // User is in top 6 or not in list — show first 3 remaining (ranks 4-6)
              visiblePlayers = remainingPlayers.slice(0, 3).map((p, i) => ({ player: p, rank: i + 4 }));
            }
          }

          const hasMore = remainingPlayers.length > visiblePlayers.length && !leaderboardExpanded;

          return (
            <>
              <View style={styles.columnHeaders}>
                <ThemedText style={[styles.columnHeaderText, { width: 40 }]}>RANK</ThemedText>
                <ThemedText style={[styles.columnHeaderText, { flex: 1, paddingLeft: 40 }]}>PLAYER</ThemedText>
                <ThemedText style={[styles.columnHeaderText, { width: 145, marginLeft: 'auto', textAlign: 'center' }]}>
                  CURRENT RANK
                </ThemedText>
              </View>
              <View style={styles.playerList}>
                {visiblePlayers.map(({ player, rank }, index) => {
                  const rankIcon = isLeague
                    ? getLeagueRankIcon(player.currentRank)
                    : getValorantRankIcon(player.currentRank);

                  return (
                    <View key={player.userId}>
                      {showSeparator && index === separatorAfterIndex + 1 && (
                        <View style={styles.leaderboardSeparator}>
                          <View style={styles.separatorDot} />
                          <View style={styles.separatorDot} />
                          <View style={styles.separatorDot} />
                        </View>
                      )}
                      <TouchableOpacity
                        style={[
                          styles.playerRow,
                          index % 2 === 0 ? styles.evenRow : styles.oddRow,
                          player.isCurrentUser && styles.currentUserRow,
                        ]}
                        activeOpacity={player.isCurrentUser ? 1 : 0.7}
                        onPress={() => {
                          if (!player.isCurrentUser) {
                            router.push({
                              pathname: '/profilePages/profileView',
                              params: {
                                userId: player.userId,
                                username: player.username,
                                avatar: player.avatar || '',
                                preloadedFollowing: 'true',
                              },
                            });
                          }
                        }}
                      >
                        <View style={styles.rankContainer}>
                          <ThemedText style={styles.rankNumberText}>{rank}</ThemedText>
                          {rankChanges[player.userId] === 'up' && (
                            <IconSymbol size={10} name="arrowtriangle.up.fill" color="#22C55E" />
                          )}
                          {rankChanges[player.userId] === 'down' && (
                            <IconSymbol size={10} name="arrowtriangle.down.fill" color="#EF4444" />
                          )}
                        </View>
                        <View style={styles.playerInfo}>
                          <View style={styles.playerAvatarRing}>
                            <View style={styles.playerAvatar}>
                              {player.avatar ? (
                                <CachedImage uri={player.avatar} style={styles.playerAvatarImage} />
                              ) : (
                                <ThemedText style={styles.avatarText}>
                                  {player.username.charAt(0).toUpperCase()}
                                </ThemedText>
                              )}
                            </View>
                          </View>
                          <View style={styles.playerNameContainer}>
                            <ThemedText style={[styles.playerName, player.isCurrentUser && styles.currentUserName]} numberOfLines={1}>
                              {player.username}{player.isCurrentUser ? ' (You)' : ''}
                            </ThemedText>
                          </View>
                        </View>
                        <View style={styles.rankInfoContainer}>
                          <Image source={rankIcon} style={styles.rankIconSmall} resizeMode="contain" />
                          <View style={styles.rankTextContainer}>
                            <ThemedText style={styles.currentRankText}>
                              {formatRankDisplay(player.currentRank)}
                            </ThemedText>
                            <ThemedText style={styles.rankPointsText}>
                              {isLeague ? `${player.lp || 0} LP` : `${player.rr || 0} RR`}
                            </ThemedText>
                          </View>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
              {hasMore && (
                <TouchableOpacity
                  style={styles.viewFullButton}
                  onPress={() => setLeaderboardExpanded(true)}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.viewFullButtonText}>View full leaderboard</ThemedText>
                  <IconSymbol size={14} name="chevron.down" color="#8B7FE8" />
                </TouchableOpacity>
              )}
              {leaderboardExpanded && remainingPlayers.length > 3 && (
                <TouchableOpacity
                  style={styles.viewFullButton}
                  onPress={() => setLeaderboardExpanded(false)}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.viewFullButtonText}>Collapse</ThemedText>
                  <IconSymbol size={14} name="chevron.up" color="#8B7FE8" />
                </TouchableOpacity>
              )}
            </>
          );
        })()}
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Background shimmer */}
      <View style={styles.backgroundGlow} pointerEvents="none">
        {/* Fixed shimmer band — diagonal gleam */}
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
        {/* Secondary fainter shimmer */}
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

      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Leaderboards</ThemedText>
        <TouchableOpacity
          style={styles.infoButton}
          onPress={() => setShowInfoModal(true)}
          activeOpacity={0.7}
        >
          <IconSymbol size={20} name="info.circle" color="#666" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.pageContent}
      >
        {/* Leaderboard Section */}
        {mutualLoading ? (
          <LeaderboardsTabSkeleton />
        ) : leaguePlayers.length + valorantPlayers.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyStateTitle}>No friends to{'\n'}rank yet</ThemedText>
            <ThemedText style={styles.emptyStateSubtext}>
              Follow users who follow you back to see mutual rankings.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.leaderboardContainer}>
            {(() => {
              const activePlayers = selectedMutualGame === 'league' ? leaguePlayers : valorantPlayers;
              const fallbackGame = selectedMutualGame === 'league' ? 'valorant' : 'league';
              const fallbackPlayers = selectedMutualGame === 'league' ? valorantPlayers : leaguePlayers;
              const usedPlayers = activePlayers.length > 0 ? activePlayers : fallbackPlayers;
              const usedGame = activePlayers.length > 0 ? selectedMutualGame : fallbackGame;

              return renderMutualLeaderboard(usedPlayers, usedGame);
            })()}
          </View>
        )}

        {/* Active Lobbies Section */}
        <View style={styles.activeLobbiesSection}>
          <View style={styles.activeLobbiesHeader}>
            <View style={styles.activeLobbiesHeaderLeft}>
              <IconSymbol size={20} name="person.2.fill" color="#fff" />
              <ThemedText style={styles.activeLobbiesTitle}>Active Lobbies</ThemedText>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/partyPages/lobbies')}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.activeLobbiesViewAll}>View All</ThemedText>
            </TouchableOpacity>
          </View>

          {lobbiesLoading ? (
            <ActivityIndicator size="small" color="#8B7FE8" style={{ paddingVertical: 24 }} />
          ) : filteredLobbies.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.activeLobbiesScroll}
            >
              {filteredLobbies.map((lobby: any) => {
                const isLeague = lobby.game === 'League of Legends' || lobby.game === 'League';
                const members = lobby.memberDetails || [];
                const displayMembers = members.slice(0, 3);
                const extraCount = Math.max(0, members.length - 3);

                // Calculate average rank
                const players = lobby.players || [];
                let avgRankLabel = 'Unranked';
                let avgRankRaw = 'Unranked';
                if (players.length > 0) {
                  const rankedPlayers = players.filter((p: any) => p.currentRank && p.currentRank !== 'Unranked');
                  if (rankedPlayers.length > 0) {
                    const midIdx = Math.floor(rankedPlayers.length / 2);
                    avgRankRaw = rankedPlayers[midIdx].currentRank;
                    avgRankLabel = formatRankDisplay(avgRankRaw);
                  }
                }
                const avgRankIcon = isLeague
                  ? getLeagueRankIcon(avgRankRaw)
                  : getValorantRankIcon(avgRankRaw);

                return (
                  <TouchableOpacity
                    key={lobby.id}
                    style={styles.lobbyCard}
                    onPress={() => handleLobbyPress(lobby)}
                    activeOpacity={0.8}
                  >
                    {/* Type badge */}
                    <View style={styles.lobbyTypeBadge}>
                      <ThemedText style={styles.lobbyTypeBadgeText}>
                        {lobby.type === 'party' ? 'PARTY' : isLeague ? 'RANKED SOLO' : 'RANKED'}
                      </ThemedText>
                    </View>

                    {/* Stacked avatars */}
                    <View style={styles.lobbyAvatars}>
                      {displayMembers.map((member: any, idx: number) => (
                        <View key={member.userId || idx} style={[styles.lobbyAvatarWrapper, { marginLeft: idx > 0 ? -12 : 0, zIndex: displayMembers.length - idx }]}>
                          {member.avatar ? (
                            <CachedImage uri={member.avatar} style={styles.lobbyAvatarImage} />
                          ) : (
                            <View style={styles.lobbyAvatarFallback}>
                              <ThemedText style={styles.lobbyAvatarFallbackText}>
                                {(member.username || '?').charAt(0).toUpperCase()}
                              </ThemedText>
                            </View>
                          )}
                        </View>
                      ))}
                      {extraCount > 0 && (
                        <View style={[styles.lobbyAvatarWrapper, styles.lobbyAvatarExtra, { marginLeft: -12 }]}>
                          <ThemedText style={styles.lobbyAvatarExtraText}>+{extraCount}</ThemedText>
                        </View>
                      )}
                    </View>

                    {/* Lobby name & description */}
                    <ThemedText style={styles.lobbyCardName} numberOfLines={1}>{lobby.name}</ThemedText>

                    {/* Average rank */}
                    <View style={styles.lobbyRankRow}>
                      <Image source={avgRankIcon} style={styles.lobbyRankIcon} resizeMode="contain" />
                      <ThemedText style={styles.lobbyRankText}>{avgRankLabel}+</ThemedText>
                    </View>

                    {/* Footer: member count + join */}
                    <View style={styles.lobbyCardFooter}>
                      <ThemedText style={styles.lobbyMemberCount}>{lobby.members} / {lobby.maxMembers}</ThemedText>
                      <View style={styles.lobbyJoinButton}>
                        <ThemedText style={styles.lobbyJoinButtonText}>View</ThemedText>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Create new lobby card */}
              <TouchableOpacity
                style={[styles.lobbyCard, styles.lobbyCardCreate]}
                onPress={() => router.push('/partyPages/createLeaderboardName')}
                activeOpacity={0.7}
              >
                <IconSymbol size={32} name="plus.circle.fill" color="#8B7FE8" />
                <ThemedText style={styles.lobbyCardCreateText}>Create Lobby</ThemedText>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <TouchableOpacity
              style={styles.activeLobbiesEmpty}
              onPress={() => router.push('/partyPages/createLeaderboardName')}
              activeOpacity={0.7}
            >
              <IconSymbol size={28} name="plus.circle.fill" color="#8B7FE8" />
              <ThemedText style={styles.activeLobbiesEmptyText}>Create your first lobby</ThemedText>
              <ThemedText style={styles.activeLobbiesEmptySubtext}>Compete with friends on a leaderboard</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Info Modal */}
      <Modal
        visible={showInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <Pressable style={styles.infoModalOverlay} onPress={() => setShowInfoModal(false)}>
          <Pressable style={styles.infoModalBubble} onPress={(e) => e.stopPropagation()}>
            {/* Speech bubble pointer */}
            <View style={styles.infoModalPointer} />
            <View style={styles.infoModalHeader}>
              <IconSymbol size={18} name="info.circle.fill" color="#8B7FE8" />
              <ThemedText style={styles.infoModalTitle}>How Leaderboards Work</ThemedText>
            </View>
            <View style={styles.infoModalBody}>
              <ThemedText style={styles.infoModalText}>
                {'\u2022'} Ranks your mutual friends by their competitive rank and LP/RR.
              </ThemedText>
              <ThemedText style={styles.infoModalText}>
                {'\u2022'} Create lobbies to compete with friends on custom leaderboards.
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

      {/* Game Switcher Dropdown Overlay */}
      {showGameDropdown && (
        <Pressable style={styles.gameDropdownOverlay} onPress={() => setShowGameDropdown(false)}>
          <Pressable style={styles.gameDropdownSheet} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity
              style={[styles.gameDropdownCard, selectedMutualGame === 'league' && styles.gameDropdownCardActive]}
              onPress={() => {
                setSelectedMutualGame('league');
                setShowGameDropdown(false);
              }}
              activeOpacity={0.7}
            >
              <Image source={GAME_LOGOS['League of Legends']} style={styles.gameDropdownLogo} resizeMode="contain" />
              <ThemedText style={[styles.gameDropdownText, selectedMutualGame === 'league' && styles.gameDropdownTextActive]}>
                LEAGUE OF LEGENDS
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.gameDropdownCard, selectedMutualGame === 'valorant' && styles.gameDropdownCardActive]}
              onPress={() => {
                setSelectedMutualGame('valorant');
                setShowGameDropdown(false);
              }}
              activeOpacity={0.7}
            >
              <Image source={GAME_LOGOS['Valorant']} style={styles.gameDropdownLogo} resizeMode="contain" />
              <ThemedText style={[styles.gameDropdownText, selectedMutualGame === 'valorant' && styles.gameDropdownTextActive]}>
                VALORANT
              </ThemedText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 61,
    paddingBottom: 4,
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
    backgroundColor: 'rgba(139, 127, 232, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  infoModalCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8B7FE8',
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
    backgroundColor: '#8B7FE8',
    borderRadius: 1,
  },
  headerTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  headerTabTextActive: {
    color: '#8B7FE8',
  },
  createButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    overflow: 'hidden',
  },
  createButtonInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  createButtonPlaceholder: {
    width: 36,
    height: 36,
  },
  pagerContainer: {
    flex: 1,
  },
  pageContainer: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: 6,
    paddingTop: 20,
  },
  cardsContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: '95%',
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 4,
    gap: 16,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: '#fff',
  },
  tabCount: {
    fontSize: 16,
    fontWeight: '500',
    color: '#444',
  },
  tabCountActive: {
    color: '#888',
  },
  tabDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#333',
  },
  emptyState: {
    paddingHorizontal: 28,
    paddingTop: 40,
  },
  emptyStateTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 36,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 15,
    color: '#555',
  },
  bottomSpacer: {
    height: 40,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  updateButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  // Mutual leaderboard styles
  mutualSection: {
    marginBottom: 0,
  },
  top3Podium: {
    marginBottom: 16,
    gap: 8,
  },
  top3FirstRow: {
    alignItems: 'center',
    marginBottom: -4,
  },
  top3SecondRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  top3Card: {
    width: ((screenWidth - 32) / 3) * 1.32,
    backgroundColor: 'transparent',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
    gap: 12,
  },
  top3CardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  top3RankNumber: {
    fontSize: 20,
    fontWeight: '800',
  },
  top3AvatarRing: {
    borderRadius: 10,
    borderWidth: 2,
    padding: 1,
  },
  top3Avatar: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  top3AvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  top3AvatarFallback: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
  },
  top3Username: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  top3CenterSection: {
    alignItems: 'center',
    gap: 4,
  },
  top3RankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  top3RankIcon: {
    width: 26,
    height: 26,
  },
  top3Points: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  top3RankLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
  },
  mutualSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  gameSwitchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    width: 210,
    overflow: 'hidden',
  },
  gameSwitchGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 30,
    backgroundColor: 'transparent',
  },
  gameLogoSmall: {
    width: 24,
    height: 24,
  },
  mutualSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.3,
  },
  gameSwitchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  gameSwitchLogo: {
    width: 28,
    height: 28,
  },
  gameSwitchText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
    flex: 1,
  },
  gameSwitchTextActive: {
    color: '#fff',
  },
  columnHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 0,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  columnHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  playerList: {
    paddingHorizontal: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingLeft: 12,
    paddingRight: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    position: 'relative',
    borderLeftWidth: 3,
  },
  firstPlaceRow: {
  },
  evenRow: {
    backgroundColor: '#141414',
  },
  oddRow: {
    backgroundColor: '#1a1a1a',
  },
  currentUserRow: {
    backgroundColor: '#252525',
  },
  currentUserName: {
    color: '#8B7FE8',
  },
  rankContainer: {
    width: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  rankNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  playerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerAvatarRing: {
    borderRadius: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 1,
  },
  playerAvatar: {
    width: 28,
    height: 28,
    backgroundColor: '#252525',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playerAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  avatarText: {
    fontSize: 12,
    textAlign: 'center',
    color: '#888',
  },
  playerNameContainer: {
    flexDirection: 'column',
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
  },
  rankInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    width: 145,
    marginLeft: 'auto',
    paddingRight: 4,
  },
  rankIconSmall: {
    width: 22,
    height: 22,
  },
  rankTextContainer: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 2,
  },
  currentRankText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 13,
  },
  rankPointsText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#666',
    lineHeight: 12,
  },
  // Game dropdown overlay styles
  gameDropdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 200,
    paddingTop: 170,
    paddingHorizontal: 6,
  },
  gameDropdownSheet: {
    alignSelf: 'flex-start',
    width: 210,
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 6,
    gap: 4,
  },
  gameDropdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  gameDropdownCardActive: {
    borderColor: 'rgba(139, 127, 232, 0.3)',
    backgroundColor: 'rgba(139, 127, 232, 0.1)',
  },
  gameDropdownLogo: {
    width: 20,
    height: 20,
  },
  gameDropdownText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    letterSpacing: 0.3,
  },
  gameDropdownTextActive: {
    color: '#fff',
  },
  // Your Progress card styles
  yourProgressWrapper: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(139, 127, 232, 0.25)',
    overflow: 'hidden',
  },
  yourProgressHero: {
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 16,
    gap: 10,
    alignItems: 'center',
  },
  yourProgressUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  yourProgressUserLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  youBadge: {
    backgroundColor: 'rgba(139, 127, 232, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  youBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8B7FE8',
    letterSpacing: 1,
  },
  yourProgressAvatarRing: {
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(139, 127, 232, 0.4)',
    padding: 1.5,
  },
  yourProgressAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  yourProgressAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
  },
  yourProgressAvatarFallback: {
    fontSize: 15,
    fontWeight: '700',
    color: '#888',
  },
  yourProgressUsername: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    flexShrink: 1,
  },
  yourProgressRankRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yourProgressRankIcon: {
    width: 28,
    height: 28,
  },
  yourProgressRankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  yourProgressRankPoints: {
    fontSize: 10,
    fontWeight: '500',
    color: '#666',
  },
  yourProgressBottom: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#151515',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    gap: 6,
  },
  dailyGainBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dailyGainBadgeNegative: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  dailyGainText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22C55E',
  },
  dailyGainTextNegative: {
    color: '#EF4444',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#252525',
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8B7FE8',
    borderRadius: 3,
  },
  progressBarLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#555',
    textAlign: 'right',
  },
  // Lobbies tab styles
  lobbiesContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  lobbiesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  lobbiesSubTabs: {
    flexDirection: 'row',
    gap: 20,
  },
  lobbiesSubTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  lobbiesSubTabActive: {
    borderBottomColor: '#8B7FE8',
  },
  lobbiesSubTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  lobbiesSubTabTextActive: {
    color: '#8B7FE8',
  },
  lobbiesSubTabBadge: {
    backgroundColor: '#8B7FE8',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  lobbiesSubTabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 20,
  },
  lobbiesCreateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#8B7FE8',
  },
  lobbiesCreateButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8B7FE8',
  },
  lobbiesEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  lobbiesEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  lobbiesEmptySubtext: {
    fontSize: 13,
    color: '#444',
    textAlign: 'center',
  },
  lobbiesCreateCardWrapper: {
    marginBottom: 12,
    borderRadius: 15,
  },
  lobbiesCreateCard: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(139, 127, 232, 0.3)',
    borderStyle: 'dashed',
    paddingVertical: 24,
    paddingHorizontal: 20,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 120,
  },
  lobbiesCreateCardIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lobbiesCreateCardContent: {
    alignItems: 'center',
    gap: 4,
  },
  lobbiesCreateCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  lobbiesCreateCardSubtitle: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  // Leaderboard container
  leaderboardContainer: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 6,
    paddingBottom: 0,
    overflow: 'hidden',
  },
  viewFullButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 16,
  },
  leaderboardSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  separatorDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#444',
  },
  viewFullButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B7FE8',
  },
  // Active Lobbies Section
  activeLobbiesSection: {
    marginTop: 28,
    paddingBottom: 8,
  },
  activeLobbiesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  activeLobbiesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeLobbiesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  activeLobbiesViewAll: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B7FE8',
  },
  activeLobbiesScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  lobbyCard: {
    width: 170,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    gap: 10,
  },
  lobbyCardCreate: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderColor: 'rgba(139, 127, 232, 0.3)',
  },
  lobbyCardCreateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8B7FE8',
    marginTop: 8,
  },
  lobbyTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#B4A7F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lobbyTypeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B4A7F5',
    letterSpacing: 0.5,
  },
  lobbyAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lobbyAvatarWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#1a1a1a',
    overflow: 'hidden',
  },
  lobbyAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  lobbyAvatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(139, 127, 232, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lobbyAvatarFallbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8B7FE8',
  },
  lobbyAvatarExtra: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lobbyAvatarExtraText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 32,
  },
  lobbyCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  lobbyRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lobbyRankIcon: {
    width: 20,
    height: 20,
  },
  lobbyRankText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
  },
  lobbyCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  lobbyMemberCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  lobbyJoinButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  lobbyJoinButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  activeLobbiesEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 32,
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  activeLobbiesEmptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  activeLobbiesEmptySubtext: {
    fontSize: 13,
    color: '#555',
  },
});
