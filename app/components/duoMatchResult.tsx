import CompactDuoCard from '@/app/components/compactDuoCard';
import { ThemedText } from '@/components/themed-text';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useEffect, useRef } from 'react';
import { DuoMatchCardData } from '@/services/duoMatchService';

interface DuoMatchResultProps {
  game: 'valorant' | 'league';
  matchedUser: DuoMatchCardData;
  myInGameName?: string;
  onAutoNavigate: () => void;
  onViewProfile: () => void;
  onSearchAgain: () => void;
}

export default function DuoMatchResult({
  game,
  matchedUser,
  myInGameName,
  onAutoNavigate,
  onViewProfile,
  onSearchAgain,
}: DuoMatchResultProps) {
  const autoNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animations
  const matchedScale = useSharedValue(0);
  const matchedOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(30);
  const statusOpacity = useSharedValue(0);

  useEffect(() => {
    // Ring burst
    ringScale.value = withTiming(2.5, { duration: 600, easing: Easing.out(Easing.ease) });
    ringOpacity.value = withSequence(
      withTiming(0.6, { duration: 200 }),
      withDelay(200, withTiming(0, { duration: 400 })),
    );

    // "Duo Accepted!" text pop
    matchedOpacity.value = withDelay(100, withTiming(1, { duration: 300 }));
    matchedScale.value = withDelay(100, withSpring(1, { damping: 8, stiffness: 150 }));

    // Card slide up
    cardOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));
    cardTranslateY.value = withDelay(400, withSpring(0, { damping: 12, stiffness: 100 }));

    // "Opening chat..." fade in
    statusOpacity.value = withDelay(2000, withTiming(1, { duration: 400 }));

    // Auto-navigate after 5 seconds
    autoNavTimer.current = setTimeout(() => {
      onAutoNavigate();
    }, 5000);

    return () => {
      if (autoNavTimer.current) clearTimeout(autoNavTimer.current);
    };
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const matchedStyle = useAnimatedStyle(() => ({
    opacity: matchedOpacity.value,
    transform: [{ scale: matchedScale.value }],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const statusStyle = useAnimatedStyle(() => ({
    opacity: statusOpacity.value,
  }));

  return (
    <View style={styles.container}>
      {/* Ring burst animation */}
      <View style={styles.ringContainer}>
        <Animated.View style={[styles.ring, ringStyle]} />
      </View>

      {/* Duo Accepted! header */}
      <Animated.View style={[styles.headerContainer, matchedStyle]}>
        <ThemedText style={styles.matchedText}>Duo Accepted!</ThemedText>
      </Animated.View>

      {/* Matched user card */}
      <Animated.View style={[styles.cardContainer, cardStyle]}>
        <CompactDuoCard
          game={game}
          username={matchedUser.username}
          avatar={matchedUser.avatar || undefined}
          inGameName={matchedUser.inGameName || matchedUser.username}
          inGameIcon={matchedUser.inGameIcon || undefined}
          currentRank={matchedUser.currentRank || undefined}
          mainRole={matchedUser.mainRole || undefined}
          mainAgent={matchedUser.mainAgent || undefined}
          showContent={true}
        />
      </Animated.View>

      {/* Opening chat indicator */}
      <Animated.View style={[styles.statusContainer, statusStyle]}>
        <ActivityIndicator size="small" color="#888" />
        <ThemedText style={styles.statusText}>Opening chat...</ThemedText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  ringContainer: {
    position: 'absolute',
    alignSelf: 'center',
  },
  ring: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#fff',
  },
  headerContainer: {
    marginBottom: 24,
  },
  matchedText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  cardContainer: {
    width: '100%',
    paddingHorizontal: 4,
    overflow: 'visible',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  statusText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
});
