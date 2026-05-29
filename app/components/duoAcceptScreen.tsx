import { ThemedText } from '@/components/themed-text';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { DuoMatchCardData } from '@/services/duoMatchService';
import { formatRankDisplay } from '@/utils/formatRankDisplay';

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
  }, []);

  const progress = timeLeft / 30;
  const isUrgent = timeLeft <= 10;

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn }]}>
      <ThemedText style={styles.matchFoundText}>MATCH FOUND</ThemedText>

      {/* Timer */}
      <View style={styles.timerSection}>
        <View style={styles.timerBarBg}>
          <View style={[
            styles.timerBarFill,
            { width: `${progress * 100}%` },
            isUrgent && styles.timerBarUrgent,
          ]} />
        </View>
        <ThemedText style={[styles.timerText, isUrgent && styles.timerTextUrgent]}>
          {timeLeft}s
        </ThemedText>
      </View>

      {/* Player Card */}
      <TouchableOpacity
        style={styles.playerCard}
        onPress={onViewProfile}
        activeOpacity={onViewProfile ? 0.7 : 1}
        disabled={!onViewProfile}
      >
        {matchedUser.avatar ? (
          <Image source={{ uri: matchedUser.avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <ThemedText style={styles.avatarInitial}>
              {matchedUser.username?.[0]?.toUpperCase() || '?'}
            </ThemedText>
          </View>
        )}
        <ThemedText style={styles.username}>{matchedUser.username}</ThemedText>
        <ThemedText style={styles.rank}>{formatRankDisplay(matchedUser.currentRank || 'Unranked')}</ThemedText>
        {onViewProfile && (
          <ThemedText style={styles.viewProfileHint}>Tap to view duo profile</ThemedText>
        )}

        {/* Status */}
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
      </TouchableOpacity>

      {/* Buttons */}
      {!hasAccepted ? (
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.declineButton} onPress={onDecline} activeOpacity={0.8}>
            <ThemedText style={styles.declineButtonText}>Decline</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptButton} onPress={onAccept} activeOpacity={0.8}>
            <ThemedText style={styles.acceptButtonText}>Accept</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <ThemedText style={styles.waitingText}>Waiting for opponent...</ThemedText>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  matchFoundText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#D4A843',
    letterSpacing: 1.5,
    marginBottom: 20,
  },
  timerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginBottom: 28,
  },
  timerBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: '#1a1a1a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  timerBarFill: {
    height: '100%',
    backgroundColor: '#D4A843',
    borderRadius: 2,
  },
  timerBarUrgent: {
    backgroundColor: '#ef4444',
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D4A843',
    minWidth: 30,
    textAlign: 'right',
  },
  timerTextUrgent: {
    color: '#ef4444',
  },
  playerCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#151515',
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  username: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  rank: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    marginBottom: 6,
  },
  viewProfileHint: {
    fontSize: 11,
    color: '#444',
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  statusDotAccepted: {
    backgroundColor: '#22c55e',
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888',
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: '#D4A843',
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  waitingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});
