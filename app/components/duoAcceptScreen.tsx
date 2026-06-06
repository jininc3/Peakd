import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { DuoMatchCardData } from '@/services/duoMatchService';
import { formatRankDisplay } from '@/utils/formatRankDisplay';
import { isRemoteAvatar, getDefaultAvatarSource } from '@/utils/resolveAvatar';
import CachedImage from '@/components/ui/CachedImage';

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
  if (game === 'league') return LEAGUE_RANK_ICONS[tier] || LEAGUE_RANK_ICONS.unranked;
  return VALORANT_RANK_ICONS[fullKey] || VALORANT_RANK_ICONS[tier] || VALORANT_RANK_ICONS.unranked;
};

interface DuoAcceptScreenProps {
  matchedUser: DuoMatchCardData;
  game: 'valorant' | 'league';
  expiresAt: Date;
  hasAccepted: boolean;
  otherAccepted: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onViewProfile?: () => void;
}

export default function DuoAcceptScreen({
  matchedUser,
  game,
  expiresAt,
  hasAccepted,
  otherAccepted,
  onAccept,
  onDecline,
  onViewProfile,
}: DuoAcceptScreenProps) {
  const [timeLeft, setTimeLeft] = useState(30);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const ringPulse = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const remaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [expiresAt]);

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 0.3, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 0.1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const progress = timeLeft / 30;
  const isUrgent = timeLeft <= 10;
  const rankDisplay = formatRankDisplay(matchedUser.currentRank || 'Unranked');

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn }]}>
      {/* Hero: opponent avatar with pulsing ring */}
      <TouchableOpacity
        style={styles.heroSection}
        onPress={onViewProfile}
        activeOpacity={onViewProfile ? 0.8 : 1}
        disabled={!onViewProfile}
      >
        <Animated.View style={[styles.heroRing, { opacity: ringPulse }]} />
        {isRemoteAvatar(matchedUser.avatar) ? (
          <CachedImage uri={matchedUser.avatar!} style={styles.heroAvatar} />
        ) : getDefaultAvatarSource(matchedUser.avatar) ? (
          <Image source={getDefaultAvatarSource(matchedUser.avatar)!} style={styles.heroAvatar} />
        ) : (
          <View style={styles.heroAvatarPlaceholder}>
            <ThemedText style={styles.heroAvatarInitial}>
              {matchedUser.username?.[0]?.toUpperCase() || '?'}
            </ThemedText>
          </View>
        )}
      </TouchableOpacity>

      {/* Title */}
      <ThemedText style={styles.matchFoundText}>MATCH FOUND</ThemedText>

      {/* Username + rank */}
      <View style={styles.infoSection}>
        <ThemedText style={styles.username}>{matchedUser.username}</ThemedText>
        <View style={styles.rankPill}>
          <Image
            source={getRankIcon(matchedUser.currentRank || 'Unranked', game)}
            style={styles.rankPillIcon}
            resizeMode="contain"
          />
          <ThemedText style={styles.rankPillText}>{rankDisplay}</ThemedText>
        </View>
      </View>

      {/* Timer */}
      <View style={styles.timerSection}>
        <ThemedText style={[styles.timerText, isUrgent && styles.timerTextUrgent]}>
          {timeLeft}s
        </ThemedText>
        <ThemedText style={styles.timerLabel}>REMAINING</ThemedText>
        <View style={styles.timerBarBg}>
          <View style={[
            styles.timerBarFill,
            { width: `${progress * 100}%` },
            isUrgent && styles.timerBarUrgent,
          ]} />
        </View>
      </View>

      {/* Status dots */}
      <View style={styles.statusRow}>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, hasAccepted && styles.statusDotAccepted]} />
          <ThemedText style={styles.statusLabel}>You</ThemedText>
        </View>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, otherAccepted && styles.statusDotAccepted]} />
          <ThemedText style={styles.statusLabel}>Opponent</ThemedText>
        </View>
      </View>

      {/* Buttons */}
      {!hasAccepted ? (
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.declineButton} onPress={onDecline} activeOpacity={0.7}>
            <IconSymbol size={14} name="xmark" color="#888" />
            <ThemedText style={styles.declineButtonText}>Decline</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptButton} onPress={onAccept} activeOpacity={0.8}>
            <ThemedText style={styles.acceptButtonText}>Accept</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.waitingPill}>
          <ThemedText style={styles.waitingText}>Waiting for opponent...</ThemedText>
        </View>
      )}
    </Animated.View>
  );
}

const RING_SIZE = 140;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  // Hero avatar with ring
  heroSection: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRing: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: '#4ADE80',
    backgroundColor: 'rgba(74, 222, 128, 0.04)',
  },
  heroAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  heroAvatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarInitial: {
    fontSize: 32,
    fontWeight: '700',
    color: '#888',
  },

  // Title
  matchFoundText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#4ADE80',
    letterSpacing: 2,
  },

  // Info
  infoSection: {
    alignItems: 'center',
    gap: 8,
  },
  username: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
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

  // Timer
  timerSection: {
    alignItems: 'center',
    gap: 4,
    width: '100%',
    paddingHorizontal: 24,
    marginTop: 4,
  },
  timerText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
    lineHeight: 42,
  },
  timerTextUrgent: {
    color: '#EF4444',
  },
  timerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  timerBarBg: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  timerBarFill: {
    height: '100%',
    backgroundColor: '#4ADE80',
    borderRadius: 2,
  },
  timerBarUrgent: {
    backgroundColor: '#EF4444',
  },

  // Status
  statusRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 4,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  statusDotAccepted: {
    backgroundColor: '#4ADE80',
  },
  statusLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    paddingHorizontal: 24,
    marginTop: 8,
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#888',
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f0f0f',
  },
  waitingPill: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginTop: 8,
  },
  waitingText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
});
