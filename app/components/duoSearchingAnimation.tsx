import { ThemedText } from '@/components/themed-text';
import { StyleSheet, View, Image, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useEffect, useState, useRef } from 'react';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { formatRankDisplay } from '@/utils/formatRankDisplay';

interface DuoSearchingAnimationProps {
  game: 'valorant' | 'league';
  onCancel: () => void;
  currentRank?: string;
  mainRole?: string;
  region?: string;
}

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

const getRankIcon = (rank: string, game: 'valorant' | 'league') => {
  if (!rank || rank === 'Unranked') {
    return game === 'valorant' ? VALORANT_RANK_ICONS.unranked : LEAGUE_RANK_ICONS.unranked;
  }
  const parts = rank.split(' ');
  const tier = parts[0].toLowerCase();
  const division = parts[1] || '';
  const fullKey = (tier + division).toLowerCase();
  if (game === 'league') {
    return LEAGUE_RANK_ICONS[tier] || LEAGUE_RANK_ICONS.unranked;
  }
  return VALORANT_RANK_ICONS[fullKey] || VALORANT_RANK_ICONS[tier] || VALORANT_RANK_ICONS.unranked;
};

const formatElapsed = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function DuoSearchingAnimation({ game, onCancel, currentRank, mainRole, region }: DuoSearchingAnimationProps) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Spinning ring
  const spinRotation = useSharedValue(0);
  // Pulsing inner ring
  const ringPulse = useSharedValue(0.1);
  // Animated dots for title
  const dot1Opacity = useSharedValue(0);
  const dot2Opacity = useSharedValue(0);
  const dot3Opacity = useSharedValue(0);

  useEffect(() => {
    // Continuous spin
    spinRotation.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1, false
    );
    // Inner ring pulse
    ringPulse.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.08, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ), -1, false
    );
    // Animated dots
    const dotDuration = 400;
    dot1Opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: dotDuration }), withTiming(0.3, { duration: dotDuration })),
      -1, true
    );
    dot2Opacity.value = withDelay(200, withRepeat(
      withSequence(withTiming(1, { duration: dotDuration }), withTiming(0.3, { duration: dotDuration })),
      -1, true
    ));
    dot3Opacity.value = withDelay(400, withRepeat(
      withSequence(withTiming(1, { duration: dotDuration }), withTiming(0.3, { duration: dotDuration })),
      -1, true
    ));

    intervalRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinRotation.value}deg` }],
  }));
  const ringPulseStyle = useAnimatedStyle(() => ({
    opacity: ringPulse.value,
  }));
  const d1Style = useAnimatedStyle(() => ({ opacity: dot1Opacity.value }));
  const d2Style = useAnimatedStyle(() => ({ opacity: dot2Opacity.value }));
  const d3Style = useAnimatedStyle(() => ({ opacity: dot3Opacity.value }));

  const rankDisplay = formatRankDisplay(currentRank || 'Unranked');

  return (
    <View style={styles.container}>
      {/* Hero: rank icon with spinning ring */}
      <View style={styles.heroSection}>
        {/* Static inner glow */}
        <Animated.View style={[styles.ringInner, ringPulseStyle]} />
        {/* Spinning outer ring with arc gap */}
        <Animated.View style={[styles.spinnerContainer, spinStyle]}>
          <View style={styles.spinnerArc} />
        </Animated.View>
        <Image
          source={getRankIcon(currentRank || 'Unranked', game)}
          style={styles.heroRankIcon}
          resizeMode="contain"
        />
      </View>

      {/* Title */}
      <View style={styles.titleRow}>
        <ThemedText style={styles.titleText}>FINDING TEAMMATES</ThemedText>
        <Animated.Text style={[styles.titleDot, d1Style]}>.</Animated.Text>
        <Animated.Text style={[styles.titleDot, d2Style]}>.</Animated.Text>
        <Animated.Text style={[styles.titleDot, d3Style]}>.</Animated.Text>
      </View>

      {/* Rank + Region pill */}
      <View style={styles.rankPill}>
        <Image
          source={getRankIcon(currentRank || 'Unranked', game)}
          style={styles.rankPillIcon}
          resizeMode="contain"
        />
        <ThemedText style={styles.rankPillText}>{rankDisplay}</ThemedText>
        {region && (
          <>
            <ThemedText style={styles.rankPillDot}>{'\u00B7'}</ThemedText>
            <ThemedText style={styles.rankPillRegion}>{region.toUpperCase()}</ThemedText>
          </>
        )}
      </View>

      {/* Timer */}
      <View style={styles.timerSection}>
        <ThemedText style={styles.timerText}>{formatElapsed(elapsed)}</ThemedText>
        <ThemedText style={styles.timerLabel}>ELAPSED</ThemedText>
      </View>

      {/* Status hint */}
      <View style={styles.hintPill}>
        <ThemedText style={styles.hintIcon}>💡</ThemedText>
        <ThemedText style={styles.hintText}>Matching you with players near {rankDisplay}</ThemedText>
      </View>

      {/* Leave Queue */}
      <View style={styles.bottomSection}>
        <TouchableOpacity style={styles.leaveButton} onPress={onCancel} activeOpacity={0.7}>
          <IconSymbol size={14} name="xmark" color="#EF4444" />
          <ThemedText style={styles.leaveText}>Leave Queue</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const RING_SIZE = 160;
const SPINNER_SIZE = 175;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 16,
    paddingTop: 20,
  },

  // Hero rank emblem
  heroSection: {
    width: SPINNER_SIZE,
    height: SPINNER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: 'rgba(74, 222, 128, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.12)',
  },
  spinnerContainer: {
    position: 'absolute',
    width: SPINNER_SIZE,
    height: SPINNER_SIZE,
  },
  spinnerArc: {
    position: 'absolute',
    width: SPINNER_SIZE,
    height: SPINNER_SIZE,
    borderRadius: SPINNER_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(74, 222, 128, 0.25)',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  heroRankIcon: {
    width: 85,
    height: 85,
  },

  // Title
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  titleText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
  titleDot: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },

  // Rank pill
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  rankPillIcon: {
    width: 20,
    height: 20,
  },
  rankPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  rankPillDot: {
    fontSize: 14,
    color: '#555',
  },
  rankPillRegion: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },

  // Timer
  timerSection: {
    alignItems: 'center',
    gap: 2,
    marginTop: 8,
  },
  timerText: {
    fontSize: 40,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
    lineHeight: 48,
  },
  timerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 1.5,
  },

  // Hint
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  hintIcon: {
    fontSize: 14,
  },
  hintText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },

  // Leave queue
  bottomSection: {
    marginTop: 8,
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
  },
  leaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
  },
});
