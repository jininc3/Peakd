import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StyleSheet, View, Image, TouchableOpacity, Dimensions } from 'react-native';
import { formatRankDisplay } from '@/utils/formatRankDisplay';
import { Skeleton } from '@/components/ui/Skeleton';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

const { width: screenWidth } = Dimensions.get('window');

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

const GAME_ICONS: { [key: string]: any } = {
  valorant: require('@/assets/images/valorant-red.png'),
  league: require('@/assets/images/lol-icon.png'),
};

const getRankIcon = (rank: string, game: 'valorant' | 'league') => {
  if (!rank || rank === 'Unranked') {
    return game === 'valorant' ? VALORANT_RANK_ICONS.unranked : LEAGUE_RANK_ICONS.unranked;
  }
  const tier = rank.split(' ')[0].toLowerCase();
  if (game === 'valorant') return VALORANT_RANK_ICONS[tier] || VALORANT_RANK_ICONS.unranked;
  return LEAGUE_RANK_ICONS[tier] || LEAGUE_RANK_ICONS.unranked;
};

interface LiveSearchIdleProps {
  cardsLoaded?: boolean;
  hasCards: boolean;
  valorantCard: any;
  leagueCard: any;
  searchModePick: 'lfg' | 'duo' | null;
  onPickMode: (mode: 'lfg' | 'duo' | null) => void;
  searchGamePick: 'valorant' | 'league' | null;
  onPickGame: (game: 'valorant' | 'league') => void;
  onSearch: () => void;
  onCreateCard: () => void;
  valorantInGameName?: string;
  leagueInGameName?: string;
  valorantInGameIcon?: string;
  leagueInGameIcon?: string;
  username?: string;
  avatar?: string;
  valorantWinRate?: number;
  valorantGamesPlayed?: number;
  leagueWinRate?: number;
  leagueGamesPlayed?: number;
}

export default function LiveSearchIdle({
  cardsLoaded,
  hasCards,
  valorantCard,
  leagueCard,
  searchModePick,
  onPickMode,
  searchGamePick,
  onPickGame,
  onSearch,
  onCreateCard,
  valorantInGameName,
  leagueInGameName,
  username,
  avatar,
  valorantWinRate,
  valorantGamesPlayed,
  leagueWinRate,
  leagueGamesPlayed,
}: LiveSearchIdleProps) {
  const activeCard = searchGamePick === 'valorant' ? valorantCard : searchGamePick === 'league' ? leagueCard : null;
  const activeInGameName = searchGamePick === 'valorant' ? valorantInGameName : searchGamePick === 'league' ? leagueInGameName : undefined;
  const activeWinRate = searchGamePick === 'valorant' ? (valorantWinRate || 0) : (leagueWinRate || 0);
  const activeGamesPlayed = searchGamePick === 'valorant' ? (valorantGamesPlayed || 0) : (leagueGamesPlayed || 0);

  // Auto-select game
  useEffect(() => {
    if (!searchGamePick && hasCards) {
      if (valorantCard) onPickGame('valorant');
      else if (leagueCard) onPickGame('league');
    }
  }, [hasCards, valorantCard, leagueCard]);

  // Animations
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(12);
  const ringPulse = useSharedValue(0.3);

  useEffect(() => {
    contentOpacity.value = withDelay(100, withTiming(1, { duration: 500 }));
    contentTranslateY.value = withDelay(100, withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) }));
    ringPulse.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, false
    );
  }, []);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringPulse.value,
  }));

  const canSearch = !!searchGamePick && !!searchModePick;
  const hasBothGames = !!valorantCard && !!leagueCard;

  if (!cardsLoaded) {
    return (
      <View style={styles.container}>
        <View style={[styles.content, { gap: 24 }]}>
          {/* Game toggle skeleton */}
          <Skeleton width="100%" height={48} borderRadius={14} />
          {/* Rank emblem skeleton */}
          <View style={{ alignItems: 'center', height: 180, justifyContent: 'center' }}>
            <Skeleton width={140} height={140} borderRadius={70} />
          </View>
          {/* Rank name skeleton */}
          <View style={{ alignItems: 'center', gap: 8, marginTop: -8 }}>
            <Skeleton width={180} height={28} borderRadius={6} />
            <Skeleton width={140} height={16} borderRadius={4} />
          </View>
          {/* Stats row skeleton */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Skeleton width="100%" height={64} borderRadius={12} /></View>
            <View style={{ flex: 1 }}><Skeleton width="100%" height={64} borderRadius={12} /></View>
            <View style={{ flex: 1 }}><Skeleton width="100%" height={64} borderRadius={12} /></View>
          </View>
          {/* Mode toggle skeleton */}
          <Skeleton width="100%" height={48} borderRadius={14} />
          {/* Button skeleton */}
          <Skeleton width="100%" height={52} borderRadius={28} />
        </View>
      </View>
    );
  }

  if (!hasCards) {
    return (
      <View style={styles.container}>
        <View style={styles.noCardCenter}>
          <ThemedText style={styles.noCardTitle}>Create a Rank Card</ThemedText>
          <ThemedText style={styles.noCardSub}>You need a rank card to queue for live search</ThemedText>
          <TouchableOpacity style={styles.createCardBtn} onPress={onCreateCard} activeOpacity={0.8}>
            <ThemedText style={styles.createCardBtnText}>Create Card</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, contentStyle]}>
        {/* Game Toggle */}
        <View style={styles.gameToggleRow}>
          <TouchableOpacity
            style={[styles.gameToggle, searchGamePick === 'valorant' && styles.gameToggleActive]}
            onPress={() => onPickGame('valorant')}
            activeOpacity={0.7}
            disabled={!valorantCard}
          >
            <Image source={GAME_ICONS.valorant} style={styles.gameToggleIcon} resizeMode="contain" />
            <ThemedText style={[styles.gameToggleText, searchGamePick === 'valorant' && styles.gameToggleTextActive]}>
              Valorant
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.gameToggle, searchGamePick === 'league' && styles.gameToggleActive]}
            onPress={() => onPickGame('league')}
            activeOpacity={0.7}
            disabled={!leagueCard}
          >
            <Image source={GAME_ICONS.league} style={styles.gameToggleIconLg} resizeMode="contain" />
            <ThemedText style={[styles.gameToggleText, searchGamePick === 'league' && styles.gameToggleTextActive]}>
              League
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Hero Rank Emblem */}
        {activeCard && searchGamePick && (
          <View style={styles.heroSection}>
            {/* Outer glow ring */}
            <Animated.View style={[styles.heroRingOuter, ringStyle]} />
            <View style={styles.heroRingInner} />
            <Image
              source={getRankIcon(activeCard.currentRank, searchGamePick)}
              style={styles.heroRankIcon}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Rank Name + IGN */}
        {activeCard && (
          <View style={styles.infoSection}>
            <ThemedText style={styles.rankName}>
              {formatRankDisplay(activeCard.currentRank || 'Unranked')}
            </ThemedText>
            {activeInGameName && (
              <ThemedText style={styles.ignText}>{activeInGameName}</ThemedText>
            )}
          </View>
        )}

        {/* Stats Row */}
        <View style={styles.statsRow}>
          {activeWinRate > 0 && (
            <View style={styles.statCard}>
              <ThemedText style={styles.statValue}>{activeWinRate}%</ThemedText>
              <ThemedText style={styles.statLabel}>WIN RATE</ThemedText>
            </View>
          )}
          {activeGamesPlayed > 0 && (
            <View style={styles.statCard}>
              <ThemedText style={styles.statValue}>{activeGamesPlayed}</ThemedText>
              <ThemedText style={styles.statLabel}>GAMES</ThemedText>
            </View>
          )}
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>~18s</ThemedText>
            <ThemedText style={styles.statLabel}>AVG WAIT</ThemedText>
          </View>
        </View>

        {/* Mode Toggle */}
        <View style={styles.modeToggleRow}>
          <TouchableOpacity
            style={[styles.modeToggle, searchModePick === 'lfg' && styles.modeToggleActive]}
            onPress={() => onPickMode('lfg')}
            activeOpacity={0.7}
          >
            <IconSymbol size={15} name="person.3.fill" color={searchModePick === 'lfg' ? '#fff' : '#555'} />
            <ThemedText style={[styles.modeToggleText, searchModePick === 'lfg' && styles.modeToggleTextActive]}>
              LFG
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeToggle, searchModePick === 'duo' && styles.modeToggleActive]}
            onPress={() => onPickMode('duo')}
            activeOpacity={0.7}
          >
            <IconSymbol size={15} name="person.2.fill" color={searchModePick === 'duo' ? '#fff' : '#555'} />
            <ThemedText style={[styles.modeToggleText, searchModePick === 'duo' && styles.modeToggleTextActive]}>
              Find Duo
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Find Match Button */}
        <TouchableOpacity
          style={[styles.findMatchBtn, !canSearch && styles.findMatchBtnDisabled]}
          onPress={onSearch}
          activeOpacity={0.8}
          disabled={!canSearch}
        >
          <ThemedText style={styles.findMatchText}>Find Match</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
  },
  content: {
    flex: 1,
    paddingTop: 8,
    gap: 24,
  },

  // No card state
  noCardCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  noCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  noCardSub: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  createCardBtn: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    backgroundColor: '#fff',
  },
  createCardBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f0f0f',
  },

  // Game toggle
  gameToggleRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 4,
  },
  gameToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 11,
  },
  gameToggleActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  gameToggleIcon: {
    width: 20,
    height: 20,
  },
  gameToggleIconLg: {
    width: 24,
    height: 24,
  },
  gameToggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  gameToggleTextActive: {
    color: '#fff',
  },

  // Hero rank emblem
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 180,
  },
  heroRingOuter: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  heroRingInner: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.015)',
  },
  heroRankIcon: {
    width: 110,
    height: 110,
  },

  // Info
  infoSection: {
    alignItems: 'center',
    gap: 4,
    marginTop: -8,
  },
  rankName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  ignText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#F0D6A2',
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.8,
  },

  // Mode toggle
  modeToggleRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 4,
  },
  modeToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 11,
  },
  modeToggleActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  modeToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  modeToggleTextActive: {
    color: '#fff',
  },

  // Find Match button
  findMatchBtn: {
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  findMatchBtnDisabled: {
    opacity: 0.4,
  },
  findMatchText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f0f0f',
  },
});
