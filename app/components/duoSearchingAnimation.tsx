import { ThemedText } from '@/components/themed-text';
import { StyleSheet, View, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

interface DuoSearchingAnimationProps {
  game: 'valorant' | 'league';
  onCancel: () => void;
  currentRank?: string;
  mainRole?: string;
  region?: string;
}

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

const getRankIcon = (rank: string, game: 'valorant' | 'league') => {
  if (!rank || rank === 'Unranked') {
    return game === 'valorant' ? VALORANT_RANK_ICONS.unranked : LEAGUE_RANK_ICONS.unranked;
  }
  const tier = rank.split(' ')[0].toLowerCase();
  if (game === 'valorant') return VALORANT_RANK_ICONS[tier] || VALORANT_RANK_ICONS.unranked;
  return LEAGUE_RANK_ICONS[tier] || LEAGUE_RANK_ICONS.unranked;
};

const formatElapsed = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function DuoSearchingAnimation({ game, onCancel, currentRank, mainRole, region }: DuoSearchingAnimationProps) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dotOpacity = useSharedValue(0.4);
  const dot1Opacity = useSharedValue(0);
  const dot2Opacity = useSharedValue(0);
  const dot3Opacity = useSharedValue(0);

  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, false
    );

    const dotDuration = 400;
    dot1Opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: dotDuration }), withTiming(0.3, { duration: dotDuration })),
      -1, true
    );
    dot2Opacity.value = withDelay(200,
      withRepeat(
        withSequence(withTiming(1, { duration: dotDuration }), withTiming(0.3, { duration: dotDuration })),
        -1, true
      )
    );
    dot3Opacity.value = withDelay(400,
      withRepeat(
        withSequence(withTiming(1, { duration: dotDuration }), withTiming(0.3, { duration: dotDuration })),
        -1, true
      )
    );

    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const dotPulseStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));
  const d1Style = useAnimatedStyle(() => ({ opacity: dot1Opacity.value }));
  const d2Style = useAnimatedStyle(() => ({ opacity: dot2Opacity.value }));
  const d3Style = useAnimatedStyle(() => ({ opacity: dot3Opacity.value }));

  const summaryParts: string[] = [];
  if (currentRank) summaryParts.push(currentRank);
  if (mainRole) summaryParts.push(mainRole);
  if (region) summaryParts.push(region);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <LinearGradient
          colors={['rgba(74, 222, 128, 0.08)', 'rgba(139, 127, 232, 0.04)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Live Search label */}
        <View style={styles.liveRow}>
          <Animated.View style={[styles.liveDot, dotPulseStyle]} />
          <ThemedText style={styles.liveText}>LIVE SEARCH</ThemedText>
        </View>

        {/* Finding teammates... */}
        <View style={styles.titleRow}>
          <ThemedText style={styles.titleText}>Finding teammates</ThemedText>
          <Animated.Text style={[styles.titleDot, d1Style]}>.</Animated.Text>
          <Animated.Text style={[styles.titleDot, d2Style]}>.</Animated.Text>
          <Animated.Text style={[styles.titleDot, d3Style]}>.</Animated.Text>
        </View>

        {/* Summary row */}
        {summaryParts.length > 0 && (
          <View style={styles.summaryRow}>
            {currentRank && (
              <Image
                source={getRankIcon(currentRank, game)}
                style={styles.rankIcon}
                resizeMode="contain"
              />
            )}
            {summaryParts.map((part, i) => (
              <View key={i} style={styles.summaryItemRow}>
                {i > 0 && <ThemedText style={styles.summaryBullet}>•</ThemedText>}
                <ThemedText style={styles.summaryItemText}>{part}</ThemedText>
              </View>
            ))}
          </View>
        )}

        {/* Bottom row: elapsed + leave queue */}
        <View style={styles.bottomRow}>
          <View style={styles.elapsedRow}>
            <IconSymbol size={14} name="clock" color="#666" />
            <ThemedText style={styles.elapsedText}>{formatElapsed(elapsed)} elapsed</ThemedText>
          </View>
          <TouchableOpacity style={styles.leaveButton} onPress={onCancel} activeOpacity={0.7}>
            <ThemedText style={styles.leaveText}>Leave Queue</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: 20,
    gap: 10,
    overflow: 'hidden',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4ADE80',
    letterSpacing: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  titleText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  titleDot: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  rankIcon: {
    width: 20,
    height: 20,
  },
  summaryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryBullet: {
    fontSize: 14,
    color: '#555',
  },
  summaryItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  elapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  elapsedText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  leaveButton: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
  },
  leaveText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
});
