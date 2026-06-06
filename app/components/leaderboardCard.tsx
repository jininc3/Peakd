import React from 'react';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

const GAME_LOGOS: { [key: string]: any } = {
  'Valorant': require('@/assets/images/valorant-red.png'),
  'League of Legends': require('@/assets/images/lol-icon.png'),
  'League': require('@/assets/images/lol-icon.png'),
  'Apex Legends': require('@/assets/images/apex.png'),
};

interface Leaderboard {
  id: string;
  name: string;
  icon: string;
  game: string;
  members: number;
  maxMembers?: number;
  userRank?: number | null;
  isJoined?: boolean;
  players?: any[];
  startDate?: any;
  endDate?: any;
  type?: 'party' | 'leaderboard';
  coverPhoto?: string;
  partyIcon?: string;
  challengeType?: 'climbing' | 'rank';
  challengeStatus?: 'none' | 'pending' | 'active';
  memberDetails?: any[];
  challengeParticipants?: string[];
}

interface LeaderboardCardProps {
  leaderboard: Leaderboard;
  onPress: (leaderboard: Leaderboard) => void;
  showDivider?: boolean;
  currentUserId?: string;
}

const calculateDaysInfo = (startDate: any, endDate: any): { currentDay: number; totalDays: number; daysLeft: number } | null => {
  if (!startDate || !endDate) return null;

  const parseDate = (date: any): Date | null => {
    if (date.toDate && typeof date.toDate === 'function') return date.toDate();
    if (date instanceof Date) return date;
    if (typeof date === 'string') {
      const parts = date.split('/');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
      }
      return new Date(date);
    }
    return null;
  };

  const startDateObj = parseDate(startDate);
  const endDateObj = parseDate(endDate);
  if (!startDateObj || !endDateObj || isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  startDateObj.setHours(0, 0, 0, 0);
  endDateObj.setHours(0, 0, 0, 0);

  const totalDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
  const currentDay = Math.min(Math.ceil((today.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1, totalDays);
  const daysLeft = Math.max(0, totalDays - currentDay + 1);

  return { currentDay: Math.max(1, currentDay), totalDays, daysLeft };
};

function LeaderboardCard({ leaderboard, onPress, currentUserId }: LeaderboardCardProps) {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const daysInfo = calculateDaysInfo(leaderboard.startDate, leaderboard.endDate);
  const gameLogo = GAME_LOGOS[leaderboard.game];
  const isActive = leaderboard.challengeStatus === 'active';

  // Use memberDetails for stacked avatars display
  const displayMembers = (leaderboard.memberDetails || leaderboard.players || []).filter(
    (m: any) => m && (m.avatar || m.photoUrl || m.username || m.displayName)
  );
  // Use sorted players (with rank data) for ranking; fall back to memberDetails
  const rankedPlayers = leaderboard.players?.length && leaderboard.players[0]?.currentRank
    ? leaderboard.players
    : displayMembers;
  const currentUserPlayer = rankedPlayers.find((p: any) => p.userId === currentUserId);
  const userRank = currentUserPlayer
    ? (currentUserPlayer.rank || (rankedPlayers.indexOf(currentUserPlayer) + 1))
    : null;
  const getRankColor = (rank: number) => {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return '#fff';
  };

  // Prefetch all remote image URLs so they render together with the card
  React.useEffect(() => {
    const urls: string[] = [];
    if (leaderboard.partyIcon) urls.push(leaderboard.partyIcon);
    displayMembers.slice(0, 4).forEach((p: any) => {
      const photo = p.avatar || p.photoUrl;
      if (photo) urls.push(photo);
    });
    if (currentUserPlayer?.avatar || currentUserPlayer?.photoUrl) {
      urls.push(currentUserPlayer.avatar || currentUserPlayer.photoUrl);
    }
    if (urls.length > 0) {
      ExpoImage.prefetch(urls);
    }
  }, [leaderboard.partyIcon, displayMembers, currentUserPlayer]);

  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  return (
    <Animated.View style={[styles.cardWrapper, { transform: [{ scale: scaleAnim }], opacity: fadeAnim }]}>
      <View style={styles.cardBase}>
        <View style={styles.card}>
        <Pressable
          onPress={() => onPress(leaderboard)}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          {/* Face gradient */}
          <LinearGradient
            colors={['rgba(255,255,255,0.03)', 'transparent', 'rgba(0,0,0,0.08)']}
            locations={[0, 0.55, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* Inner purple glow - top */}
          <LinearGradient
            colors={['rgba(139,127,232,0.18)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.innerGlowTop}
            pointerEvents="none"
          />
          {/* Inner purple glow - left */}
          <LinearGradient
            colors={['rgba(139,127,232,0.12)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.innerGlowLeft}
            pointerEvents="none"
          />
          {/* Inner purple glow - right */}
          <LinearGradient
            colors={['rgba(139,127,232,0.12)', 'transparent']}
            start={{ x: 1, y: 0.5 }}
            end={{ x: 0, y: 0.5 }}
            style={styles.innerGlowRight}
            pointerEvents="none"
          />
          {/* Inner purple glow - bottom */}
          <LinearGradient
            colors={['rgba(139,127,232,0.10)', 'transparent']}
            start={{ x: 0.5, y: 1 }}
            end={{ x: 0.5, y: 0 }}
            style={styles.innerGlowBottom}
            pointerEvents="none"
          />

          {/* Top highlight bevel */}
          <LinearGradient
            colors={['rgba(139,127,232,0.4)', 'rgba(139,127,232,0.15)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentLine}
          />

          {/* Main content row with optional rank square */}
          <View style={styles.cardBody}>
            <View style={styles.cardLeft}>
              <View style={styles.mainSection}>
                {leaderboard.partyIcon ? (
                  <ExpoImage source={{ uri: leaderboard.partyIcon }} style={styles.icon} contentFit="cover" cachePolicy="memory-disk" recyclingKey={leaderboard.partyIcon} />
                ) : gameLogo ? (
                  <Image source={gameLogo} style={styles.icon} resizeMode="contain" />
                ) : (
                  <View style={styles.iconPlaceholder}>
                    <ThemedText style={styles.iconPlaceholderText}>
                      {leaderboard.name.charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                )}

                <View style={styles.info}>
                  <ThemedText style={styles.name} numberOfLines={1}>{leaderboard.name}</ThemedText>
                  <ThemedText style={styles.meta} numberOfLines={1}>
                    {leaderboard.game}
                    <ThemedText style={styles.metaSep}> · </ThemedText>
                    <ThemedText style={isActive ? styles.challengeModeActive : styles.meta}>
                      {isActive ? 'Challenge Mode' : 'Leaderboard'}
                    </ThemedText>
                  </ThemedText>
                </View>
              </View>

              {/* Stacked member avatars */}
              {displayMembers.length > 0 && (
                <View style={styles.membersRow}>
                  <View style={styles.stackedAvatarsInline}>
                    {displayMembers.slice(0, 3).map((player: any, index: number) => {
                      const photo = player.avatar || player.photoUrl;
                      const name = player.username || player.displayName || '?';
                      return (
                        <View
                          key={player.userId || index}
                          style={[styles.avatarWrapInline, { marginLeft: index === 0 ? 0 : -8, zIndex: 10 - index }]}
                        >
                          {photo ? (
                            <ExpoImage source={{ uri: photo }} style={styles.avatarImgInline} cachePolicy="memory-disk" recyclingKey={photo} />
                          ) : (
                            <View style={styles.avatarFallbackInline}>
                              <ThemedText style={styles.avatarFallbackTextInline}>{name.charAt(0)}</ThemedText>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    {displayMembers.length > 3 && (
                      <View style={[styles.avatarWrapInline, styles.overflowBadge, { marginLeft: -8, zIndex: 6 }]}>
                        <ThemedText style={styles.overflowText}>+{displayMembers.length - 3}</ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* User rank square on the right */}
            {currentUserPlayer && userRank && (
              <View style={styles.userRankSquare}>
                <View style={styles.userRankAvatarWrap}>
                  {(currentUserPlayer.avatar || currentUserPlayer.photoUrl) ? (
                    <ExpoImage source={{ uri: currentUserPlayer.avatar || currentUserPlayer.photoUrl }} style={styles.userRankAvatarImg} cachePolicy="memory-disk" recyclingKey={currentUserPlayer.avatar || currentUserPlayer.photoUrl} />
                  ) : (
                    <View style={styles.userRankAvatarFallback}>
                      <ThemedText style={styles.userRankAvatarText}>
                        {(currentUserPlayer.username || currentUserPlayer.displayName || '?').charAt(0).toUpperCase()}
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText style={[styles.userRankNumber, { color: getRankColor(userRank) }]}>
                  #{userRank}
                </ThemedText>
                <ThemedText style={styles.userRankLabel}>(you)</ThemedText>
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footerPanel}>
            <View style={styles.footerLeft}>
              <IconSymbol size={13} name="person.2.fill" color="#666" />
              <ThemedText style={styles.memberCount}>
                {leaderboard.members} player{leaderboard.members !== 1 ? 's' : ''}
              </ThemedText>
            </View>
            {daysInfo && (
              <View style={styles.footerRight}>
                <IconSymbol size={12} name="calendar" color="#666" />
                <ThemedText style={[styles.daysLeft, daysInfo.daysLeft < 7 && styles.daysLeftUrgent]}>
                  {daysInfo.daysLeft} days left
                </ThemedText>
              </View>
            )}
          </View>
        </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

export default React.memo(LeaderboardCard);

const styles = StyleSheet.create({
  cardWrapper: {
    marginBottom: 12,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  cardBase: {
    backgroundColor: '#0a0a0a',
    borderRadius: 15,
    paddingBottom: 2,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(139,127,232,0.4)',
    borderTopColor: 'rgba(139,127,232,0.55)',
  },
  innerGlowTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    zIndex: 1,
  },
  innerGlowLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 30,
    zIndex: 1,
  },
  innerGlowRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 30,
    zIndex: 1,
  },
  innerGlowBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    zIndex: 1,
  },
  accentLine: {
    height: 1.5,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
  },
  mainSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingBottom: 12,
    gap: 12,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
  },
  iconPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholderText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#444',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  meta: {
    fontSize: 13,
    color: '#666',
  },
  challengeModeActive: {
    fontSize: 13,
    color: '#FFD700',
    fontWeight: '600',
  },
  metaSep: {
    color: '#333',
  },
  // Stacked avatars row
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 10,
  },
  stackedAvatarsInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapInline: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#1a1a1a',
    overflow: 'hidden',
  },
  avatarImgInline: {
    width: '100%',
    height: '100%',
  },
  avatarFallbackInline: {
    width: '100%',
    height: '100%',
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackTextInline: {
    fontSize: 10,
    fontWeight: '600',
    color: '#555',
  },
  overflowBadge: {
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#999',
  },
  // User rank square
  userRankSquare: {
    width: 64,
    height: 78,
    marginRight: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  userRankAvatarWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  userRankAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  userRankAvatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#252525',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userRankAvatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
  userRankNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 14,
  },
  userRankLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: '#666',
    lineHeight: 10,
  },
  // Footer
  footerPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#131313',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stackedAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#131313',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#555',
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  challengeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#D4B878',
  },
  challengeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
  },
  daysLeft: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
  },
  daysLeftUrgent: {
    color: '#ef4444',
  },
  memberCount: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
  },
});
