import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StyleSheet, View, Image, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DuoCard from '@/app/components/duoCard';

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

const getRankIcon = (rank: string, game: 'valorant' | 'league') => {
  if (!rank || rank === 'Unranked') {
    return game === 'valorant' ? VALORANT_RANK_ICONS.unranked : LEAGUE_RANK_ICONS.unranked;
  }
  const tier = rank.split(' ')[0].toLowerCase();
  if (game === 'valorant') return VALORANT_RANK_ICONS[tier] || VALORANT_RANK_ICONS.unranked;
  return LEAGUE_RANK_ICONS[tier] || LEAGUE_RANK_ICONS.unranked;
};

interface LiveSearchIdleProps {
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
  valorantInGameIcon,
  leagueInGameIcon,
  username,
  avatar,
  valorantWinRate,
  valorantGamesPlayed,
  leagueWinRate,
  leagueGamesPlayed,
}: LiveSearchIdleProps) {
  const activeCard = searchGamePick === 'valorant' ? valorantCard : searchGamePick === 'league' ? leagueCard : null;
  const activeInGameName = searchGamePick === 'valorant' ? valorantInGameName : searchGamePick === 'league' ? leagueInGameName : undefined;
  const activeInGameIcon = searchGamePick === 'valorant' ? valorantInGameIcon : searchGamePick === 'league' ? leagueInGameIcon : undefined;

  // Auto-select game if none selected
  useEffect(() => {
    if (!searchGamePick && hasCards) {
      if (valorantCard) onPickGame('valorant');
      else if (leagueCard) onPickGame('league');
    }
  }, [hasCards, valorantCard, leagueCard]);

  // Animations
  const dotOpacity = useSharedValue(0.4);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(16);

  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false
    );
    contentOpacity.value = withDelay(200, withTiming(1, { duration: 500 }));
    contentTranslateY.value = withDelay(200, withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) }));
  }, []);

  const dotPulseStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  const handleGameChange = () => {
    if (valorantCard && leagueCard) {
      onPickGame(searchGamePick === 'valorant' ? 'league' : 'valorant');
    }
  };

  const canSearch = !!searchGamePick && !!searchModePick;

  return (
    <View style={styles.container}>
      {/* Summary Banner */}
      <Animated.View style={[styles.summaryCard, contentStyle]}>
        <LinearGradient
          colors={['#1e1e22', '#161618']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.summaryContent}>
          <View style={styles.summaryTopRow}>
            <Image
              source={require('@/assets/images/peakdlogo2.png')}
              style={styles.summaryLogo}
              resizeMode="contain"
            />
            <View style={styles.summaryIconsRow}>
              <View style={styles.summaryGameIcon}>
                <Image source={require('@/assets/images/valorant-red.png')} style={styles.summaryValorantImg} resizeMode="contain" />
              </View>
              <View style={styles.summaryGameIcon}>
                <Image source={require('@/assets/images/lol-icon.png')} style={styles.summaryLeagueImg} resizeMode="contain" />
              </View>
            </View>
          </View>

          <View style={styles.summaryBottomRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.summaryTagline}>FIND YOUR TEAMMATE</ThemedText>
              <ThemedText style={styles.summarySubtext}>Find teammates queuing right now</ThemedText>
            </View>
            <View style={styles.summaryLiveRow}>
              <Animated.View style={[styles.summaryDot, dotPulseStyle]} />
              <ThemedText style={styles.summaryLiveText}>LIVE</ThemedText>
            </View>
          </View>
        </View>

        {/* Bottom glow */}
        <LinearGradient
          colors={['transparent', 'rgba(100, 120, 255, 0.5)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.summaryGlow}
        />
      </Animated.View>

      <Animated.View style={[styles.content, contentStyle]}>
        {/* Duo Card Preview */}
        {hasCards && activeCard && searchGamePick && (
          <View style={styles.duoCardSection}>
            <DuoCard
              duo={{
                id: 0,
                username: username || activeCard.username || 'You',
                status: 'online',
                matchPercentage: 0,
                currentRank: activeCard.currentRank || 'Unranked',
                peakRank: activeCard.peakRank || '',
                favoriteAgent: activeCard.mainAgent || '',
                favoriteRole: activeCard.mainRole || '',
                winRate: searchGamePick === 'valorant' ? (valorantWinRate || 0) : (leagueWinRate || 0),
                gamesPlayed: searchGamePick === 'valorant' ? (valorantGamesPlayed || 0) : (leagueGamesPlayed || 0),
                game: searchGamePick === 'valorant' ? 'Valorant' : 'League of Legends',
                avatar: avatar,
                inGameIcon: activeInGameIcon,
                inGameName: activeInGameName,
              }}
              noShadow
            />
          </View>
        )}

        {/* Mode Picker */}
        {hasCards && (
          <View style={styles.modeSection}>
            <ThemedText style={styles.sectionLabel}>CHOOSE A MODE</ThemedText>
            <View style={styles.modeCards}>
              <TouchableOpacity
                style={[styles.modeCard, searchModePick === 'lfg' && styles.modeCardActive]}
                onPress={() => onPickMode(searchModePick === 'lfg' ? null : 'lfg')}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={searchModePick === 'lfg' ? ['#1e1e22', '#161618'] : ['#141416', '#111113']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.modeCardContent}>
                  <View style={styles.modeCardTopRow}>
                    <IconSymbol size={22} name="person.3.fill" color={searchModePick === 'lfg' ? '#fff' : '#555'} />
                    {searchModePick === 'lfg' && (
                      <View style={styles.modeCheckBadge}>
                        <IconSymbol size={11} name="checkmark" color="#fff" />
                      </View>
                    )}
                  </View>
                  <View>
                    <ThemedText style={[styles.modeCardTitle, searchModePick === 'lfg' && styles.modeCardTitleActive]}>
                      LFG
                    </ThemedText>
                    <ThemedText style={styles.modeCardDesc}>
                      Need one more for a 5 stack?
                    </ThemedText>
                  </View>
                </View>
                {searchModePick === 'lfg' && (
                  <LinearGradient
                    colors={['transparent', 'rgba(100, 120, 255, 0.5)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modeCardGlow}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeCard, searchModePick === 'duo' && styles.modeCardActive]}
                onPress={() => onPickMode(searchModePick === 'duo' ? null : 'duo')}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={searchModePick === 'duo' ? ['#1e1e22', '#161618'] : ['#141416', '#111113']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.modeCardContent}>
                  <View style={styles.modeCardTopRow}>
                    <IconSymbol size={22} name="person.2.fill" color={searchModePick === 'duo' ? '#fff' : '#555'} />
                    {searchModePick === 'duo' && (
                      <View style={styles.modeCheckBadge}>
                        <IconSymbol size={11} name="checkmark" color="#fff" />
                      </View>
                    )}
                  </View>
                  <View>
                    <ThemedText style={[styles.modeCardTitle, searchModePick === 'duo' && styles.modeCardTitleActive]}>
                      Find Duo
                    </ThemedText>
                    <ThemedText style={styles.modeCardDesc}>
                      Find one teammate near your rank
                    </ThemedText>
                  </View>
                </View>
                {searchModePick === 'duo' && (
                  <LinearGradient
                    colors={['transparent', 'rgba(100, 120, 255, 0.5)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modeCardGlow}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Start Match */}
        <TouchableOpacity
          style={[
            styles.searchBtn,
            hasCards && !canSearch && styles.searchBtnDisabled,
          ]}
          onPress={hasCards ? onSearch : onCreateCard}
          activeOpacity={0.85}
          disabled={hasCards && !canSearch}
        >
          <LinearGradient
            colors={['#1e1e22', '#161618']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.searchBtnContent}>
            <View>
              <ThemedText style={styles.searchBtnText}>
                {hasCards ? 'Start Match' : 'Create a Rank Card'}
              </ThemedText>
              {hasCards && (
                <ThemedText style={styles.searchBtnSub}>~18s estimated wait</ThemedText>
              )}
            </View>
            <IconSymbol size={18} name="chevron.right" color="rgba(255,255,255,0.4)" />
          </View>
          <LinearGradient
            colors={['transparent', 'rgba(100, 120, 255, 0.5)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.searchBtnGlow}
          />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
    overflow: 'visible',
  },

  // Summary Banner
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(100, 120, 255, 0.15)',
    overflow: 'hidden',
    marginTop: 16,
    marginBottom: 20,
    shadowColor: 'rgba(100, 120, 255, 0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 6,
  },
  summaryContent: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLogo: {
    width: 156,
    height: 58,
    marginLeft: -18,
  },
  summaryIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryGameIcon: {
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
  summaryValorantImg: {
    width: 20,
    height: 20,
  },
  summaryLeagueImg: {
    width: 34,
    height: 34,
  },
  summaryBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryTagline: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  summarySubtext: {
    fontSize: 13,
    color: '#888',
  },
  summaryLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  summaryLiveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4ADE80',
    letterSpacing: 1,
  },
  summaryGlow: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
  },

  content: {
    flex: 1,
    width: '100%',
  },
  duoCardSection: {
    marginBottom: 16,
  },

  // Section Label
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 1.5,
    marginBottom: 12,
  },

  // Mode Section
  modeSection: {
    marginBottom: 16,
  },
  modeCards: {
    flexDirection: 'row',
    gap: 12,
  },
  modeCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  modeCardActive: {
    borderColor: 'rgba(100, 120, 255, 0.15)',
    shadowColor: 'rgba(100, 120, 255, 0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 4,
  },
  modeCardContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  modeCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modeCheckBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#4ADE80',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666',
    marginBottom: 2,
  },
  modeCardTitleActive: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  modeCardDesc: {
    fontSize: 12,
    color: '#888',
    lineHeight: 17,
  },
  modeCardGlow: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
  },

  // Game & Rank Bar
  settingsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  settingItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingItemIcon: {
    width: 32,
    height: 32,
  },
  settingItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ddd',
  },
  settingItemSub: {
    fontSize: 11,
    color: '#666',
    marginTop: 1,
  },
  settingChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  settingChangeText: {
    fontSize: 12,
    color: '#F0D6A2',
    fontWeight: '500',
  },
  settingDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 12,
  },

  // Start Match Button
  searchBtn: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(100, 120, 255, 0.15)',
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: 'rgba(100, 120, 255, 0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 4,
  },
  searchBtnDisabled: {
    opacity: 0.35,
  },
  searchBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  searchBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  searchBtnSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  searchBtnGlow: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
  },

  // Footer
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  footerText: {
    fontSize: 12,
    color: '#555',
  },
});
