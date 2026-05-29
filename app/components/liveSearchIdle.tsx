import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StyleSheet, View, Image, TouchableOpacity, Dimensions } from 'react-native';
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
      {/* Summary Card */}
      <Animated.View style={[styles.summaryCard, contentStyle]}>
        <LinearGradient
          colors={['rgba(74, 222, 128, 0.08)', 'rgba(139, 127, 232, 0.06)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.summaryHeader}>
          <Animated.View style={[styles.summaryDot, dotPulseStyle]} />
          <ThemedText style={styles.summaryLiveText}>LIVE SEARCH</ThemedText>
        </View>
        <ThemedText style={styles.summaryTitle}>Find Teammates</ThemedText>
        {activeInGameName ? (
          <View style={styles.summaryUserRow}>
            {activeInGameIcon ? (
              <Image source={{ uri: activeInGameIcon }} style={styles.summaryUserIcon} />
            ) : null}
            <ThemedText style={styles.summaryUsername}>{activeInGameName}</ThemedText>
          </View>
        ) : null}
        {activeCard && searchGamePick ? (
          <View style={styles.summaryDetails}>
            <Image
              source={getRankIcon(activeCard.currentRank, searchGamePick)}
              style={styles.summaryRankIcon}
              resizeMode="contain"
            />
            <ThemedText style={styles.summaryDetailText}>
              {activeCard.currentRank || 'Unranked'}
            </ThemedText>
            {activeCard.mainRole ? (
              <>
                <ThemedText style={styles.summaryDotSeparator}>•</ThemedText>
                <ThemedText style={styles.summaryDetailText}>{activeCard.mainRole}</ThemedText>
              </>
            ) : null}
            <ThemedText style={styles.summaryDotSeparator}>•</ThemedText>
            <ThemedText style={styles.summaryDetailText}>{activeCard.region || 'NA'}</ThemedText>
          </View>
        ) : (
          <ThemedText style={styles.summarySubtitle}>Select a game and mode to start</ThemedText>
        )}
      </Animated.View>

      <Animated.View style={[styles.content, contentStyle]}>
        {/* Mode Picker */}
        {hasCards && (
          <View style={styles.modeSection}>
            <ThemedText style={styles.sectionLabel}>CHOOSE A MODE</ThemedText>
            <View style={styles.modeCards}>
              <TouchableOpacity
                style={[styles.modeCard, searchModePick === 'lfg' && styles.modeCardActive]}
                onPress={() => onPickMode(searchModePick === 'lfg' ? null : 'lfg')}
                activeOpacity={0.7}
              >
                {searchModePick === 'lfg' && (
                  <View style={styles.modeCheckBadge}>
                    <IconSymbol size={13} name="checkmark" color="#fff" />
                  </View>
                )}
                <IconSymbol size={26} name="person.3.fill" color={searchModePick === 'lfg' ? '#8b7fe8' : '#555'} />
                <ThemedText style={[styles.modeCardTitle, searchModePick === 'lfg' && styles.modeCardTitleActive]}>
                  LFG
                </ThemedText>
                <ThemedText style={styles.modeCardDesc}>
                  Need one more for{'\n'}a 5 stack?
                </ThemedText>
                <ThemedText style={styles.modeCardWait}>Wider rank range</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeCard, searchModePick === 'duo' && styles.modeCardActiveDuo]}
                onPress={() => onPickMode(searchModePick === 'duo' ? null : 'duo')}
                activeOpacity={0.7}
              >
                {searchModePick === 'duo' && (
                  <View style={[styles.modeCheckBadge, { backgroundColor: '#5BA0D6' }]}>
                    <IconSymbol size={13} name="checkmark" color="#fff" />
                  </View>
                )}
                <IconSymbol size={26} name="person.2.fill" color={searchModePick === 'duo' ? '#5BA0D6' : '#555'} />
                <ThemedText style={[styles.modeCardTitle, searchModePick === 'duo' && styles.modeCardTitleActive]}>
                  Find Duo
                </ThemedText>
                <ThemedText style={styles.modeCardDesc}>
                  Find one teammate{'\n'}near your rank
                </ThemedText>
                <ThemedText style={styles.modeCardWait}>~20s avg. wait</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Game & Rank Bar */}
        {hasCards && activeCard && searchGamePick && (
          <View style={styles.settingsBar}>
            <TouchableOpacity style={styles.settingItem} onPress={handleGameChange} activeOpacity={0.7}>
              <Image
                source={searchGamePick === 'valorant'
                  ? require('@/assets/images/valorant-red.png')
                  : require('@/assets/images/lol-icon.png')}
                style={styles.settingItemIcon}
                resizeMode="contain"
              />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.settingItemTitle}>
                  {searchGamePick === 'valorant' ? 'Valorant' : 'League'}
                </ThemedText>
                {valorantCard && leagueCard && (
                  <View style={styles.settingChangeRow}>
                    <ThemedText style={styles.settingChangeText}>Change</ThemedText>
                    <IconSymbol size={10} name="chevron.right" color="#8b7fe8" />
                  </View>
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.settingDivider} />

            <View style={styles.settingItem}>
              <Image
                source={getRankIcon(activeCard.currentRank, searchGamePick)}
                style={styles.settingItemIcon}
                resizeMode="contain"
              />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.settingItemTitle}>
                  {activeCard.currentRank || 'Unranked'}
                </ThemedText>
                <ThemedText style={styles.settingItemSub}>Rank range</ThemedText>
              </View>
            </View>
          </View>
        )}

        {/* Bottom Bar */}
        <View style={styles.bottomBar}>
          {hasCards && (
            <View style={styles.waitTimeBox}>
              <ThemedText style={styles.waitTimeLabel}>Est. wait time</ThemedText>
              <ThemedText style={styles.waitTimeValue}>~18s</ThemedText>
              <View style={styles.waitSpeedRow}>
                <IconSymbol size={10} name="bolt.fill" color="#4CAF50" />
                <ThemedText style={styles.waitSpeedText}>Very fast</ThemedText>
              </View>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.searchBtn,
              hasCards && !canSearch && styles.searchBtnDisabled,
            ]}
            onPress={hasCards ? onSearch : onCreateCard}
            activeOpacity={0.8}
            disabled={hasCards && !canSearch}
          >
            <LinearGradient
              colors={['#5a4fcf', '#7B6FE8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.searchBtnGradient}
            >
              <View style={styles.searchBtnContent}>
                <View>
                  <ThemedText style={styles.searchBtnText}>
                    {hasCards ? 'Start Match Search' : 'Create a Rank Card'}
                  </ThemedText>
                  {hasCards && (
                    <ThemedText style={styles.searchBtnSub}>~18s estimated wait</ThemedText>
                  )}
                </View>
                <IconSymbol size={18} name="chevron.right" color="rgba(255,255,255,0.6)" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footerRow}>
          <IconSymbol size={12} name="lock.fill" color="#555" />
          <ThemedText style={styles.footerText}>
            Search settings can be changed anytime
          </ThemedText>
        </View>
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

  // Summary Card
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: 18,
    marginTop: 32,
    marginBottom: 36,
    gap: 8,
    overflow: 'hidden',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
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
  summaryTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  summaryUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryUserIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  summaryUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B7FE8',
  },
  summaryDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  summaryRankIcon: {
    width: 20,
    height: 20,
  },
  summaryDetailText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
  },
  summaryDotSeparator: {
    fontSize: 14,
    color: '#555',
  },
  summarySubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },

  content: {
    flex: 1,
    width: '100%',
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    gap: 4,
  },
  modeCardActive: {
    borderColor: 'rgba(139, 127, 232, 0.5)',
    backgroundColor: 'rgba(139, 127, 232, 0.06)',
  },
  modeCardActiveDuo: {
    borderColor: 'rgba(91, 160, 214, 0.5)',
    backgroundColor: 'rgba(91, 160, 214, 0.06)',
  },
  modeCheckBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#8b7fe8',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  modeCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#888',
    marginTop: 4,
  },
  modeCardTitleActive: {
    color: '#fff',
  },
  modeCardDesc: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
    marginBottom: 8,
  },
  modeTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  modeTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modeTagText: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  modeCardCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  greenDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  modeCardCount: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  modeCardWait: {
    fontSize: 11,
    color: '#555',
    marginTop: 2,
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
    color: '#8b7fe8',
    fontWeight: '500',
  },
  settingDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 12,
  },

  // Bottom Bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 16,
  },
  waitTimeBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitTimeLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  waitTimeValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#4CAF50',
  },
  waitSpeedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  waitSpeedText: {
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: '600',
  },
  searchBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  searchBtnDisabled: {
    opacity: 0.35,
  },
  searchBtnGradient: {
    flex: 1,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  searchBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  searchBtnSub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
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
