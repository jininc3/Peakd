import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, TouchableOpacity, View, Image, Alert, ActivityIndicator, Modal, Animated, PanResponder, Dimensions } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { db } from '@/config/firebase';
import { doc, onSnapshot, getDoc, updateDoc, collection, query, where, getDocs, deleteDoc, addDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { getRankHistorySince, RankHistoryEntry } from '@/services/rankHistoryService';
import LPLineChart from '@/app/components/LPLineChart';

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
  iron1: require('@/assets/images/valorantranks/iron1.png'),
  iron2: require('@/assets/images/valorantranks/iron2.png'),
  iron3: require('@/assets/images/valorantranks/iron3.png'),
  bronze1: require('@/assets/images/valorantranks/bronze1.png'),
  bronze2: require('@/assets/images/valorantranks/bronze2.png'),
  bronze3: require('@/assets/images/valorantranks/bronze3.png'),
  silver1: require('@/assets/images/valorantranks/silver1.png'),
  silver2: require('@/assets/images/valorantranks/silver2.png'),
  silver3: require('@/assets/images/valorantranks/silver3.png'),
  gold1: require('@/assets/images/valorantranks/gold1.png'),
  gold2: require('@/assets/images/valorantranks/gold2.png'),
  gold3: require('@/assets/images/valorantranks/gold3.png'),
  platinum1: require('@/assets/images/valorantranks/platinum1.png'),
  platinum2: require('@/assets/images/valorantranks/platinum2.png'),
  platinum3: require('@/assets/images/valorantranks/platinum3.png'),
  diamond1: require('@/assets/images/valorantranks/diamond1.png'),
  diamond2: require('@/assets/images/valorantranks/diamond2.png'),
  diamond3: require('@/assets/images/valorantranks/diamond3.png'),
  ascendant1: require('@/assets/images/valorantranks/ascendant1.png'),
  ascendant2: require('@/assets/images/valorantranks/ascendant2.png'),
  ascendant3: require('@/assets/images/valorantranks/ascendant3.png'),
  immortal1: require('@/assets/images/valorantranks/immortal1.png'),
  immortal2: require('@/assets/images/valorantranks/immortal2.png'),
  immortal3: require('@/assets/images/valorantranks/immortal3.png'),
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
  const subdivision = parts[1];
  if (subdivision) {
    const key = tier + subdivision;
    if (VALORANT_RANK_ICONS[key]) return VALORANT_RANK_ICONS[key];
  }
  return VALORANT_RANK_ICONS[tier] || VALORANT_RANK_ICONS.unranked;
};

const GRAPH_COLORS = [
  '#ff4655', '#3B82F6', '#22C55E', '#F59E0B', '#A855F7',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#EF4444',
];

const getLeagueRankValue = (currentRank: string, lp: number): number => {
  const rankOrder: { [key: string]: number } = {
    'CHALLENGER': 10, 'GRANDMASTER': 9, 'MASTER': 8, 'DIAMOND': 7,
    'EMERALD': 6, 'PLATINUM': 5, 'GOLD': 4, 'SILVER': 3, 'BRONZE': 2, 'IRON': 1, 'UNRANKED': 0,
  };
  const divisionOrder: { [key: string]: number } = { 'I': 4, 'II': 3, 'III': 2, 'IV': 1 };
  const parts = currentRank.toUpperCase().split(' ');
  return (rankOrder[parts[0]] || 0) * 1000 + (divisionOrder[parts[1] || ''] || 0) * 100 + lp;
};

const getValorantRankValue = (currentRank: string, rr: number): number => {
  const rankOrder: { [key: string]: number } = {
    'RADIANT': 9, 'IMMORTAL': 8, 'ASCENDANT': 7, 'DIAMOND': 6,
    'PLATINUM': 5, 'GOLD': 4, 'SILVER': 3, 'BRONZE': 2, 'IRON': 1, 'UNRANKED': 0,
  };
  const parts = currentRank.toUpperCase().split(' ');
  return (rankOrder[parts[0]] || 0) * 1000 + (parseInt(parts[1]) || 0) * 100 + rr;
};

interface Player {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  isCurrentUser?: boolean;
  currentRank: string;
  lp?: number;
  rr?: number;
  challengeWins?: number;
  challengeLosses?: number;
  challengeKDA?: string;
}

export default function ChallengeDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();

  const id = params.id as string;
  const game = params.game as string;
  const isLeague = game === 'League of Legends' || game === 'League';

  const [partyData, setPartyData] = useState<any>(null);
  const [participants, setParticipants] = useState<Player[]>([]);
  const [spectators, setSpectators] = useState<Player[]>([]);
  const [startingChallenge, setStartingChallenge] = useState(false);
  const [acceptingChallenge, setAcceptingChallenge] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitingUsers, setInvitingUsers] = useState<Set<string>>(new Set());
  const [invitedUsers, setInvitedUsers] = useState<Set<string>>(new Set());
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [selectedGraphUser, setSelectedGraphUser] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<{ [userId: string]: { value: number; date: Date; rank: string }[] }>({});
  const [graphLoading, setGraphLoading] = useState(false);
  const inviteModalY = useRef(new Animated.Value(0)).current;
  const invitePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
      onPanResponderMove: (_, g) => { if (g.dy > 0) inviteModalY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 0.5) {
          Animated.timing(inviteModalY, { toValue: Dimensions.get('window').height, duration: 200, useNativeDriver: true }).start(() => {
            setShowInviteModal(false);
            inviteModalY.setValue(0);
          });
        } else {
          Animated.spring(inviteModalY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const graphModalY = useRef(new Animated.Value(0)).current;
  const graphPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
      onPanResponderMove: (_, g) => { if (g.dy > 0) graphModalY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 0.5) {
          Animated.timing(graphModalY, { toValue: Dimensions.get('window').height, duration: 200, useNativeDriver: true }).start(() => {
            setShowGraphModal(false);
          });
        } else {
          Animated.spring(graphModalY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const isCreator = partyData?.createdBy === user?.id;
  const challengeStatus = partyData?.challengeStatus || 'none';
  const isPending = challengeStatus === 'pending';
  const isActive = challengeStatus === 'active';
  const challengeParticipants: string[] = partyData?.challengeParticipants || [];
  const challengeInvites: any[] = partyData?.challengeInvites || [];
  const myInvite = challengeInvites.find((inv: any) => inv.userId === user?.id);
  const isInvitedPending = isPending && myInvite?.status === 'pending';

  // Convert date helper
  const convertToDate = (dateValue: any): Date | null => {
    if (!dateValue) return null;
    if (dateValue.toDate && typeof dateValue.toDate === 'function') return dateValue.toDate();
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'string') {
      const parts = dateValue.split('/');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
        if (!isNaN(d.getTime())) return d;
      }
      const parsed = new Date(dateValue);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  };

  const formatDisplayDate = (dateValue: any): string => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = convertToDate(dateValue);
    if (!d) return String(dateValue);
    return `${d.getDate()}${months[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
  };

  const calculateDaysRemaining = () => {
    const start = convertToDate(partyData?.startDate);
    const end = convertToDate(partyData?.endDate);
    if (!start || !end) return null;
    const today = new Date();
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const msElapsed = today.getTime() - start.getTime();
    const completedDays = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
    const msLeft = Math.max(0, end.getTime() - today.getTime());
    const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
    const minutesLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
    const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
    return { currentDay: Math.max(0, Math.min(completedDays, totalDays)), totalDays, daysLeft, hoursLeft, minutesLeft };
  };

  const daysInfo = calculateDaysRemaining();
  const progress = daysInfo ? (daysInfo.currentDay / daysInfo.totalDays) * 100 : 0;

  // Real-time listener
  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, 'parties', id), async (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setPartyData(data);

      const activeParticipants: string[] = data.challengeParticipants || [];
      const memberDetails: any[] = data.memberDetails || [];
      const allMemberIds: string[] = data.members || [];

      // Fetch stats for all members
      const startingStatsArr: any[] = data.startingStats || [];
      const challengeStartDate = convertToDate(data.startDate);

      const fetchPlayer = async (userId: string): Promise<Player> => {
        const member = memberDetails.find((m: any) => m.userId === userId);
        try {
          const gameStatsPath = isLeague ? 'league' : 'valorant';
          const statsDoc = await getDoc(doc(db, 'users', userId, 'gameStats', gameStatsPath));
          const stats = statsDoc.data();

          let currentRank = stats?.currentRank || 'Unranked';
          let lp = stats?.lp || 0;
          let rr = stats?.rr || 0;

          const userDoc = await getDoc(doc(db, 'users', userId));
          const userData = userDoc.data();

          if (!stats?.currentRank) {
            if (isLeague && userData?.riotStats?.rankedSolo) {
              currentRank = `${userData.riotStats.rankedSolo.tier} ${userData.riotStats.rankedSolo.rank}`;
              lp = userData.riotStats.rankedSolo.leaguePoints || 0;
            } else if (!isLeague && userData?.valorantStats) {
              currentRank = userData.valorantStats.currentRank || 'Unranked';
              rr = userData.valorantStats.rankRating || 0;
            }
          }

          // Calculate challenge W/L and KDA since challenge start
          let challengeWins = 0;
          let challengeLosses = 0;
          let challengeKDA: string | undefined;

          const startingStat = startingStatsArr.find((s: any) => s.userId === userId);

          if (isLeague && userData?.riotStats?.rankedSolo) {
            const currentWins = userData.riotStats.rankedSolo.wins || 0;
            const currentLosses = userData.riotStats.rankedSolo.losses || 0;
            const startW = startingStat?.wins ?? currentWins;
            const startL = startingStat?.losses ?? currentLosses;
            challengeWins = Math.max(0, currentWins - startW);
            challengeLosses = Math.max(0, currentLosses - startL);
          } else if (!isLeague && userData?.valorantStats) {
            const currentWins = userData.valorantStats.wins || 0;
            const currentLosses = userData.valorantStats.losses || 0;
            const startW = startingStat?.wins ?? currentWins;
            const startL = startingStat?.losses ?? currentLosses;
            challengeWins = Math.max(0, currentWins - startW);
            challengeLosses = Math.max(0, currentLosses - startL);
          }

          // Calculate KDA from match history played during the challenge
          if (!isLeague && userData?.valorantStats?.matchHistory && challengeStartDate) {
            const challengeMatches = (userData.valorantStats.matchHistory as any[]).filter((m: any) => {
              const playedAt = m.playedAt || (m.gameStart ? m.gameStart * 1000 : 0);
              return playedAt >= challengeStartDate.getTime();
            });
            if (challengeMatches.length > 0) {
              const totals = challengeMatches.reduce((acc: any, m: any) => ({
                kills: acc.kills + (m.kills || 0),
                deaths: acc.deaths + (m.deaths || 0),
                assists: acc.assists + (m.assists || 0),
              }), { kills: 0, deaths: 0, assists: 0 });
              const avg = (v: number) => (v / challengeMatches.length).toFixed(1);
              const kdaRatio = totals.deaths === 0
                ? (totals.kills + totals.assists).toFixed(1)
                : ((totals.kills + totals.assists) / totals.deaths).toFixed(1);
              challengeKDA = `${avg(totals.kills)} / ${avg(totals.deaths)} / ${avg(totals.assists)}  (${kdaRatio} KDA)`;
            }
          }

          return { rank: 0, userId, username: member?.username || 'Unknown', avatar: member?.avatar || '', isCurrentUser: userId === user?.id, currentRank, lp, rr, challengeWins, challengeLosses, challengeKDA };
        } catch {
          return { rank: 0, userId, username: member?.username || 'Unknown', avatar: member?.avatar || '', isCurrentUser: userId === user?.id, currentRank: 'Unranked', lp: 0, rr: 0 };
        }
      };

      const sortPlayers = (players: Player[]) => {
        players.sort((a, b) => {
          if (isLeague) return getLeagueRankValue(b.currentRank, b.lp || 0) - getLeagueRankValue(a.currentRank, a.lp || 0);
          return getValorantRankValue(b.currentRank, b.rr || 0) - getValorantRankValue(a.currentRank, a.rr || 0);
        });
      };

      // Fetch participants
      const participantPlayers = await Promise.all(activeParticipants.map(fetchPlayer));
      sortPlayers(participantPlayers);
      participantPlayers.forEach((p, i) => { p.rank = i + 1; });
      setParticipants(participantPlayers);

      // Fetch spectators (members not in challenge)
      const spectatorIds = allMemberIds.filter((uid: string) => !activeParticipants.includes(uid));
      const spectatorPlayers = await Promise.all(spectatorIds.map(fetchPlayer));
      sortPlayers(spectatorPlayers);
      setSpectators(spectatorPlayers);
    });
    return () => unsubscribe();
  }, [id, user?.id]);

  const handleAcceptChallenge = async () => {
    if (!user?.id || !id) return;
    setAcceptingChallenge(true);
    try {
      const partyRef = doc(db, 'parties', id as string);
      const partySnapshot = await getDoc(partyRef);
      if (!partySnapshot.exists()) {
        Alert.alert('Error', 'This leaderboard no longer exists.');
        setAcceptingChallenge(false);
        return;
      }
      const data = partySnapshot.data();

      // Update invite status to accepted
      const updatedInvites = (data.challengeInvites || []).map((inv: any) =>
        inv.userId === user.id ? { ...inv, status: 'accepted' } : inv
      );
      const updatedParticipants = [...(data.challengeParticipants || [])];
      if (!updatedParticipants.includes(user.id)) {
        updatedParticipants.push(user.id);
      }

      await updateDoc(partyRef, {
        challengeInvites: updatedInvites,
        challengeParticipants: updatedParticipants,
      });

      // Delete the challenge_invite notification for this user
      try {
        const notifRef = collection(db, `users/${user.id}/notifications`);
        const notifQuery = query(notifRef, where('type', '==', 'challenge_invite'), where('partyId', '==', id));
        const notifSnapshot = await getDocs(notifQuery);
        for (const notifDoc of notifSnapshot.docs) {
          await deleteDoc(notifDoc.ref);
        }
      } catch {
        // Non-critical, ignore
      }
    } catch (error) {
      console.error('Error accepting challenge:', error);
      Alert.alert('Error', 'Failed to accept challenge.');
    } finally {
      setAcceptingChallenge(false);
    }
  };

  const handleInviteToChallenge = async (spectator: Player) => {
    if (!user?.id || !id || invitingUsers.has(spectator.userId)) return;
    setInvitingUsers(prev => new Set(prev).add(spectator.userId));
    try {
      const partyRef = doc(db, 'parties', id as string);

      // Add to challengeInvites
      const newInvite = {
        userId: spectator.userId,
        username: spectator.username,
        avatar: spectator.avatar || '',
        status: 'pending',
        invitedAt: new Date().toISOString(),
      };
      await updateDoc(partyRef, {
        challengeInvites: arrayUnion(newInvite),
      });

      // Send notification
      const notifRef = collection(db, `users/${spectator.userId}/notifications`);
      await addDoc(notifRef, {
        type: 'challenge_invite',
        fromUserId: user.id,
        fromUsername: user.username || '',
        fromAvatar: user.avatar || '',
        fromUserAvatar: user.avatar || '',
        partyId: id,
        partyName: partyData?.partyName || '',
        game: game,
        read: false,
        createdAt: serverTimestamp(),
      });

      setInvitedUsers(prev => new Set(prev).add(spectator.userId));
    } catch (error) {
      console.error('Error inviting to challenge:', error);
      Alert.alert('Error', 'Failed to send invite.');
    } finally {
      setInvitingUsers(prev => {
        const next = new Set(prev);
        next.delete(spectator.userId);
        return next;
      });
    }
  };

  const handleStartChallenge = async () => {
    if (!id || !isCreator) return;
    if (challengeParticipants.length < 2) {
      Alert.alert('Not Enough Participants', 'At least 2 people must accept the challenge before you can start.');
      return;
    }

    Alert.alert('Start Challenge', `Start with ${challengeParticipants.length} participants? The timer will begin.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start', onPress: async () => {
        setStartingChallenge(true);
        try {
          const partyRef = doc(db, 'parties', id);
          const duration = partyData?.duration || 30;
          const now = new Date();
          const end = new Date(now);
          end.setDate(end.getDate() + duration);
          end.setHours(23, 59, 59, 999);
          const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

          let startingStats: any[] = [];
          const gameStatsPath = isLeague ? 'league' : 'valorant';
          startingStats = await Promise.all(challengeParticipants.map(async (userId: string) => {
            try {
              const statsDoc = await getDoc(doc(db, 'users', userId, 'gameStats', gameStatsPath));
              const stats = statsDoc.data();
              const userDoc = await getDoc(doc(db, 'users', userId));
              const userData = userDoc.data();

              let wins = 0, losses = 0;
              if (isLeague && userData?.riotStats?.rankedSolo) {
                wins = userData.riotStats.rankedSolo.wins || 0;
                losses = userData.riotStats.rankedSolo.losses || 0;
              } else if (!isLeague && userData?.valorantStats) {
                wins = userData.valorantStats.wins || 0;
                losses = userData.valorantStats.losses || 0;
              }

              return {
                userId,
                lp: isLeague ? (stats?.lp || 0) : 0,
                rr: !isLeague ? (stats?.rr || 0) : 0,
                wins,
                losses,
              };
            } catch { return { userId, lp: 0, rr: 0, wins: 0, losses: 0 }; }
          }));

          await updateDoc(partyRef, {
            challengeStatus: 'active',
            startDate: fmt(now),
            endDate: fmt(end),
            pendingInvites: [],
            startingStats,
          });
        } catch (error) {
          console.error('Error starting challenge:', error);
          Alert.alert('Error', 'Failed to start challenge');
        } finally {
          setStartingChallenge(false);
        }
      }},
    ]);
  };

  const getBorderColor = (rank: number) => {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return '#333';
  };

  const handlePlayerPress = (player: Player) => {
    if (player.isCurrentUser) {
      router.push('/(tabs)/profile');
    } else {
      router.push({ pathname: '/profilePages/profileView', params: { userId: player.userId, username: player.username || '', avatar: player.avatar || '' } });
    }
  };

  const handleOpenGraph = async () => {
    graphModalY.setValue(0);
    setShowGraphModal(true);
    if (!selectedGraphUser && participants.length > 0) {
      setSelectedGraphUser(participants[0].userId);
    }

    const startDate = convertToDate(partyData?.startDate);
    if (!startDate || participants.length === 0) return;

    setGraphLoading(true);
    try {
      const gameName = isLeague ? 'league' : 'valorant';
      const results: { [userId: string]: { value: number; date: Date; rank: string }[] } = {};

      await Promise.all(participants.map(async (p) => {
        const history = await getRankHistorySince(p.userId, gameName, startDate);
        const startingStat = (partyData?.startingStats || []).find((s: any) => s.userId === p.userId);
        const startingValue = isLeague ? (startingStat?.lp || 0) : (startingStat?.rr || 0);

        // Prepend starting stat as first data point if history doesn't include it
        const chartData: { value: number; date: Date; rank: string }[] = [];
        if (history.length === 0 || history[0].timestamp.getTime() > startDate.getTime()) {
          chartData.push({ value: startingValue, date: startDate, rank: p.currentRank });
        }
        history.forEach(entry => {
          chartData.push({ value: entry.value, date: entry.timestamp, rank: entry.rank });
        });

        results[p.userId] = chartData;
      }));

      setGraphData(results);
    } catch (error) {
      console.error('Error fetching graph data:', error);
    } finally {
      setGraphLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Top background gradient */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.02)', 'transparent']}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topGradient}
        pointerEvents="none"
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol size={20} name="chevron.left" color="#fff" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Challenge</ThemedText>
          <View style={{ width: 36 }} />
        </View>

        {/* Info Grid */}
        <View style={styles.infoSection}>
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <ThemedText style={styles.gridLabel}>TYPE</ThemedText>
              <View style={styles.gridValueRow}>
                <IconSymbol size={14} name={partyData?.challengeType === 'rank' ? 'trophy.fill' : 'chart.line.uptrend.xyaxis'} color="#fff" />
                <ThemedText style={styles.gridValue}>
                  {partyData?.challengeType === 'rank' ? 'Highest Rank' : isLeague ? 'LP Climbing' : 'RR Climbing'}
                </ThemedText>
              </View>
            </View>
            <View style={styles.gridItem}>
              <ThemedText style={styles.gridLabel}>DURATION</ThemedText>
              <ThemedText style={styles.gridValue}>{partyData?.duration || 30} days</ThemedText>
            </View>
            <View style={styles.gridItem}>
              <ThemedText style={styles.gridLabel}>STARTED</ThemedText>
              <ThemedText style={styles.gridValue}>
                {isActive && partyData?.startDate ? formatDisplayDate(partyData.startDate) : '—'}
              </ThemedText>
            </View>
            <View style={styles.gridItem}>
              <ThemedText style={styles.gridLabel}>PARTICIPANTS</ThemedText>
              <ThemedText style={styles.gridValue}>{challengeParticipants.length}</ThemedText>
            </View>
          </View>

          {/* Progress bar */}
          {isActive && daysInfo && (
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <ThemedText style={styles.progressLabel}>Progress</ThemedText>
                <ThemedText style={styles.progressDays}>
                  {daysInfo.daysLeft <= 1 ? `${daysInfo.hoursLeft}h ${daysInfo.minutesLeft}m left` : `${daysInfo.daysLeft}d ${daysInfo.hoursLeft % 24}h left`}
                </ThemedText>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
            </View>
          )}

          {/* Stats button for active challenges */}
          {isActive && (
            <TouchableOpacity
              style={styles.graphButton}
              onPress={handleOpenGraph}
              activeOpacity={0.8}
            >
              <IconSymbol size={14} name="chart.line.uptrend.xyaxis" color="#fff" />
              <ThemedText style={styles.graphButtonText}>Stats</ThemedText>
            </TouchableOpacity>
          )}

          {/* Accept button for invited users */}
          {isInvitedPending && (
            <TouchableOpacity
              style={[styles.acceptButton, acceptingChallenge && { opacity: 0.5 }]}
              onPress={handleAcceptChallenge}
              disabled={acceptingChallenge}
              activeOpacity={0.8}
            >
              {acceptingChallenge ? (
                <ActivityIndicator size={14} color="#0f0f0f" />
              ) : (
                <IconSymbol size={14} name="checkmark" color="#0f0f0f" />
              )}
              <ThemedText style={styles.acceptButtonText}>
                {acceptingChallenge ? 'Accepting...' : 'Accept Challenge'}
              </ThemedText>
            </TouchableOpacity>
          )}

          {/* Invite button for pending challenge (creator only) */}
          {isPending && isCreator && (
            <TouchableOpacity
              style={styles.inviteButton}
              onPress={() => setShowInviteModal(true)}
              activeOpacity={0.8}
            >
              <IconSymbol size={14} name="person.badge.plus" color="#fff" />
              <ThemedText style={styles.inviteButtonText}>Invite Members</ThemedText>
            </TouchableOpacity>
          )}

          {/* Start button for pending */}
          {isPending && isCreator && (
            <TouchableOpacity
              style={[styles.startButton, startingChallenge && { opacity: 0.5 }]}
              onPress={handleStartChallenge}
              disabled={startingChallenge}
              activeOpacity={0.8}
            >
              {startingChallenge ? (
                <ActivityIndicator size={14} color="#000" />
              ) : (
                <IconSymbol size={14} name="play.fill" color="#000" />
              )}
              <ThemedText style={styles.startButtonText}>
                {startingChallenge ? 'Starting...' : 'Start Challenge'}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {/* Participants Table */}
        {participants.length > 0 && (
          <>
            <View style={styles.columnHeaders}>
              <ThemedText style={[styles.columnHeaderText, { width: 40 }]}>RANK</ThemedText>
              <ThemedText style={[styles.columnHeaderText, { flex: 1, paddingLeft: 40 }]}>PLAYER</ThemedText>
              <ThemedText style={[styles.columnHeaderText, { width: 130, marginLeft: 'auto', textAlign: 'center' }]}>
                CURRENT RANK
              </ThemedText>
            </View>

            <View style={styles.playerList}>
              {participants.map((player, index) => {
                const rankIcon = isLeague ? getLeagueRankIcon(player.currentRank) : getValorantRankIcon(player.currentRank);
                return (
                  <TouchableOpacity
                    key={player.userId}
                    style={[
                      styles.playerRow,
                      index % 2 === 0 ? styles.evenRow : styles.oddRow,
                      player.isCurrentUser && styles.currentUserRow,
                      { borderLeftWidth: 4, borderLeftColor: getBorderColor(player.rank) },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => handlePlayerPress(player)}
                  >
                    <View style={styles.rankContainer}>
                      <ThemedText style={styles.rankText}>{player.rank}</ThemedText>
                    </View>
                    <View style={styles.playerInfo}>
                      <View style={styles.playerAvatar}>
                        {player.avatar && player.avatar.startsWith('http') ? (
                          <Image source={{ uri: player.avatar }} style={styles.playerAvatarImage} />
                        ) : (
                          <ThemedText style={styles.avatarText}>{player.username?.[0]?.toUpperCase()}</ThemedText>
                        )}
                      </View>
                      <ThemedText style={styles.playerName} numberOfLines={1}>{player.username}</ThemedText>
                    </View>
                    <View style={styles.rankInfoContainer}>
                      <Image source={rankIcon} style={styles.rankIconSmall} resizeMode="contain" />
                      <View style={styles.rankTextContainer}>
                        <ThemedText style={styles.currentRankText}>
                          {player.currentRank}{' '}
                          <ThemedText style={styles.rankPointsText}>
                            {isLeague ? `(${player.lp || 0} LP)` : `(${player.rr || 0} RR)`}
                          </ThemedText>
                        </ThemedText>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Spectators Section */}
        {spectators.length > 0 && isActive && (
          <View style={styles.spectatorsSection}>
            <View style={styles.spectatorsHeaderRow}>
              <IconSymbol size={14} name="eye.fill" color="#555" />
              <ThemedText style={styles.spectatorsHeaderText}>Spectators</ThemedText>
            </View>
            {spectators.map((spectator, index) => {
              const rankIcon = isLeague ? getLeagueRankIcon(spectator.currentRank) : getValorantRankIcon(spectator.currentRank);
              return (
                <View
                  key={spectator.userId}
                  style={[
                    styles.playerRow,
                    index % 2 === 0 ? styles.evenRow : styles.oddRow,
                    spectator.isCurrentUser && styles.currentUserRow,
                    { borderLeftWidth: 4, borderLeftColor: '#333', marginHorizontal: 16 },
                  ]}
                >
                  <View style={styles.rankContainer}>
                    <ThemedText style={[styles.rankText, { color: '#444' }]}>—</ThemedText>
                  </View>
                  <View style={styles.playerInfo}>
                    <View style={styles.playerAvatar}>
                      {spectator.avatar && spectator.avatar.startsWith('http') ? (
                        <Image source={{ uri: spectator.avatar }} style={styles.playerAvatarImage} />
                      ) : (
                        <ThemedText style={styles.avatarText}>{spectator.username?.[0]?.toUpperCase()}</ThemedText>
                      )}
                    </View>
                    <ThemedText style={[styles.playerName, { color: '#666' }]} numberOfLines={1}>{spectator.username}</ThemedText>
                  </View>
                  <View style={styles.rankInfoContainer}>
                    <Image source={rankIcon} style={[styles.rankIconSmall, { opacity: 0.5 }]} resizeMode="contain" />
                    <View style={styles.rankTextContainer}>
                      <ThemedText style={[styles.currentRankText, { color: '#555' }]}>{spectator.currentRank}</ThemedText>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Invited (pending challenge) */}
        {isPending && challengeInvites.filter((inv: any) => inv.status !== 'accepted').length > 0 && (
          <View style={styles.invitedSection}>
            <ThemedText style={styles.sectionLabel}>INVITED</ThemedText>
            {challengeInvites
              .filter((inv: any) => inv.status !== 'accepted')
              .map((inv: any) => (
                <View key={inv.userId} style={styles.invitedRow}>
                  <View style={styles.invitedInfo}>
                    {inv.avatar && inv.avatar.startsWith('http') ? (
                      <Image source={{ uri: inv.avatar }} style={styles.invitedAvatar} />
                    ) : (
                      <View style={styles.invitedAvatarPlaceholder}>
                        <ThemedText style={styles.invitedAvatarText}>{inv.username?.[0]?.toUpperCase()}</ThemedText>
                      </View>
                    )}
                    <ThemedText style={styles.invitedName}>{inv.username}</ThemedText>
                  </View>
                  <ThemedText style={[styles.inviteStatus, inv.status === 'rejected' && { color: '#666' }]}>
                    {inv.status === 'pending' ? 'Pending' : 'Declined'}
                  </ThemedText>
                </View>
              ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Invite to Challenge Modal */}
      <Modal visible={showInviteModal} transparent animationType="fade" onRequestClose={() => setShowInviteModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowInviteModal(false)}>
          <Animated.View
            style={[styles.modalSheet, { transform: [{ translateY: inviteModalY }] }]}
            {...invitePanResponder.panHandlers}
          >
            <TouchableOpacity activeOpacity={1}>
              <View style={styles.modalHandle} />
              <ThemedText style={styles.modalTitle}>Invite to Challenge</ThemedText>

              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {spectators.filter(s => {
                  const alreadyInvited = challengeInvites.some((inv: any) => inv.userId === s.userId);
                  return !alreadyInvited;
                }).length === 0 ? (
                  <ThemedText style={styles.modalEmptyText}>All members have been invited</ThemedText>
                ) : (
                  spectators
                    .filter(s => !challengeInvites.some((inv: any) => inv.userId === s.userId))
                    .map(spectator => (
                      <View key={spectator.userId} style={styles.modalUserRow}>
                        <View style={styles.modalUserInfo}>
                          {spectator.avatar && spectator.avatar.startsWith('http') ? (
                            <Image source={{ uri: spectator.avatar }} style={styles.modalUserAvatar} />
                          ) : (
                            <View style={styles.modalUserAvatarPlaceholder}>
                              <ThemedText style={styles.modalUserAvatarText}>
                                {spectator.username?.[0]?.toUpperCase()}
                              </ThemedText>
                            </View>
                          )}
                          <View>
                            <ThemedText style={styles.modalUsername}>{spectator.username}</ThemedText>
                            <ThemedText style={styles.modalUserRank}>{spectator.currentRank}</ThemedText>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.modalInviteBtn,
                            invitedUsers.has(spectator.userId) && styles.modalInviteBtnDone,
                          ]}
                          onPress={() => handleInviteToChallenge(spectator)}
                          disabled={invitingUsers.has(spectator.userId) || invitedUsers.has(spectator.userId)}
                          activeOpacity={0.7}
                        >
                          {invitingUsers.has(spectator.userId) ? (
                            <ActivityIndicator size={12} color="#fff" />
                          ) : invitedUsers.has(spectator.userId) ? (
                            <ThemedText style={styles.modalInviteBtnText}>Invited</ThemedText>
                          ) : (
                            <ThemedText style={styles.modalInviteBtnText}>Invite</ThemedText>
                          )}
                        </TouchableOpacity>
                      </View>
                    ))
                )}
              </ScrollView>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
      {/* Stats Modal */}
      <Modal visible={showGraphModal} transparent animationType="none" onRequestClose={() => setShowGraphModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => {
          Animated.timing(graphModalY, { toValue: Dimensions.get('window').height, duration: 200, useNativeDriver: true }).start(() => {
            setShowGraphModal(false);
          });
        }}>
          <Animated.View
            style={[styles.graphModalSheet, { transform: [{ translateY: graphModalY }] }]}
            {...graphPanResponder.panHandlers}
          >
            <TouchableOpacity activeOpacity={1}>
              <View style={styles.modalHandle} />
              <ThemedText style={styles.modalTitle}>Stats</ThemedText>

              {/* Participant selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.graphUserSelector}>
                {participants.map((p, i) => {
                  const color = GRAPH_COLORS[i % GRAPH_COLORS.length];
                  const isSelected = selectedGraphUser === p.userId;
                  return (
                    <TouchableOpacity
                      key={p.userId}
                      style={[
                        styles.graphUserPill,
                        isSelected && styles.graphUserPillActive,
                      ]}
                      onPress={() => setSelectedGraphUser(p.userId)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.graphUserPillAvatarWrap, { borderColor: color }]}>
                        {p.avatar && p.avatar.startsWith('http') ? (
                          <Image source={{ uri: p.avatar }} style={styles.graphUserPillAvatar} />
                        ) : (
                          <ThemedText style={styles.graphUserPillInitial}>{p.username?.[0]?.toUpperCase()}</ThemedText>
                        )}
                      </View>
                      <ThemedText
                        style={[
                          styles.graphUserPillText,
                          isSelected && styles.graphUserPillTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {p.username}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Dimensions.get('window').height * 0.55 }}>
                {/* W/L, Win Rate, Games, KDA */}
                {(() => {
                  const selectedPlayer = participants.find(p => p.userId === selectedGraphUser);
                  if (!selectedPlayer) return null;
                  const w = selectedPlayer.challengeWins || 0;
                  const l = selectedPlayer.challengeLosses || 0;
                  const total = w + l;
                  return (
                    <View style={styles.statsCardsRow}>
                      <View style={styles.statsCard}>
                        <ThemedText style={styles.statsCardLabel}>Record</ThemedText>
                        <ThemedText style={styles.statsCardValue}>
                          <ThemedText style={styles.challengeStatWin}>{w}W</ThemedText>
                          {'  '}
                          <ThemedText style={styles.challengeStatLoss}>{l}L</ThemedText>
                        </ThemedText>
                      </View>
                      <View style={styles.statsCard}>
                        <ThemedText style={styles.statsCardLabel}>Win Rate</ThemedText>
                        <ThemedText style={styles.statsCardValue}>
                          {total > 0 ? `${Math.round((w / total) * 100)}%` : '-'}
                        </ThemedText>
                      </View>
                      <View style={styles.statsCard}>
                        <ThemedText style={styles.statsCardLabel}>Games</ThemedText>
                        <ThemedText style={styles.statsCardValue}>{total}</ThemedText>
                      </View>
                      <View style={styles.statsCardFull}>
                        <ThemedText style={styles.statsCardLabel}>Avg KDA</ThemedText>
                        <ThemedText style={styles.statsCardValue}>{selectedPlayer.challengeKDA || '-'}</ThemedText>
                      </View>
                    </View>
                  );
                })()}

                {/* LP/RR Chart — all participants on same graph */}
                <ThemedText style={styles.statsChartLabel}>{isLeague ? 'LP' : 'RR'} Progression</ThemedText>
                <View style={styles.graphChartContainer}>
                  {graphLoading ? (
                    <View style={styles.graphLoadingContainer}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  ) : Object.keys(graphData).length > 0 ? (
                    <LPLineChart
                      series={participants.map((p, i) => ({
                        data: graphData[p.userId] || [],
                        color: GRAPH_COLORS[i % GRAPH_COLORS.length],
                        username: p.username,
                      }))}
                      width={Dimensions.get('window').width - 56}
                      height={200}
                      label={isLeague ? 'LP' : 'RR'}
                      highlightIndex={participants.findIndex(p => p.userId === selectedGraphUser)}
                    />
                  ) : (
                    <View style={styles.graphLoadingContainer}>
                      <ThemedText style={styles.graphEmptyText}>No data available</ThemedText>
                    </View>
                  )}
                </View>
              </ScrollView>
            </TouchableOpacity>
          </Animated.View>
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
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '50%',
    paddingVertical: 12,
    gap: 4,
  },
  gridLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.5,
  },
  gridValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
  },
  gridValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D4A843',
  },
  datesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 14,
    marginTop: 4,
    marginBottom: 4,
  },
  dateItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  dateDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressSection: {
    gap: 6,
    marginTop: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  progressDays: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  progressBarBg: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 28,
    marginTop: 16,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f0f0f',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D4A843',
    paddingVertical: 14,
    borderRadius: 24,
    marginTop: 16,
  },
  startButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  columnHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
    marginHorizontal: 6,
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
    marginHorizontal: 6,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  evenRow: { backgroundColor: '#141414' },
  oddRow: { backgroundColor: '#1a1a1a' },
  currentUserRow: { backgroundColor: '#252525' },
  rankContainer: {
    width: 40,
    alignItems: 'flex-start',
  },
  rankText: {
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
  playerAvatar: {
    width: 32,
    height: 32,
    backgroundColor: '#252525',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playerAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  avatarText: {
    fontSize: 12,
    textAlign: 'center',
    color: '#888',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  rankInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginLeft: 'auto',
  },
  rankIconSmall: {
    width: 26,
    height: 26,
  },
  rankTextContainer: {
    alignItems: 'flex-end',
  },
  currentRankText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 14,
  },
  rankPointsText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#666',
    lineHeight: 13,
  },
  challengeStatWin: {
    fontSize: 15,
    fontWeight: '700',
    color: '#22C55E',
  },
  challengeStatLoss: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
  },
  statsCardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  statsCard: {
    flex: 1,
    minWidth: '28%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statsCardFull: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statsCardLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
  },
  statsCardValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  statsChartLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  spectatorsSection: {
    marginTop: 16,
  },
  spectatorsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  spectatorsHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  invitedSection: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  invitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  invitedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  invitedAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  invitedAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitedAvatarText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  invitedName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ccc',
  },
  inviteStatus: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 24,
    marginTop: 10,
  },
  inviteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: Dimensions.get('window').height * 0.6,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  modalScroll: {
    maxHeight: 350,
  },
  modalEmptyText: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    paddingVertical: 24,
  },
  modalUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  modalUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  modalUserAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalUserAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666',
  },
  modalUsername: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  modalUserRank: {
    fontSize: 12,
    color: '#666',
  },
  modalInviteBtn: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modalInviteBtnDone: {
    opacity: 0.5,
  },
  modalInviteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f0f0f',
  },
  graphButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 12,
  },
  graphButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  graphModalSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: Dimensions.get('window').height * 0.75,
  },
  graphUserSelector: {
    flexDirection: 'row',
    marginBottom: 16,
    maxHeight: 38,
  },
  graphUserPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 8,
  },
  graphUserPillActive: {
    backgroundColor: '#fff',
  },
  graphUserPillAvatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
  },
  graphUserPillAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  graphUserPillInitial: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
  },
  graphUserPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  graphUserPillTextActive: {
    color: '#0f0f0f',
  },
  graphChartContainer: {
    alignItems: 'center',
    minHeight: 200,
    justifyContent: 'center',
  },
  graphLoadingContainer: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphEmptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
});
