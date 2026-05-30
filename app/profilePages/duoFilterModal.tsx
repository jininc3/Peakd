import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useState, useEffect } from 'react';
import { Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export interface DuoFilterOptions {
  game: 'valorant' | 'league' | null;
  role: string | null;
  minRank: string | null;
  maxRank: string | null;
  language: string | null;
}

interface DuoFilterModalProps {
  visible: boolean;
  onClose: () => void;
  filters: DuoFilterOptions;
  onApplyFilters: (filters: DuoFilterOptions) => void;
}

const VALORANT_RANK_TIERS = [
  'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'
];

const LEAGUE_RANK_TIERS = [
  'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger'
];

const VALORANT_ROLES = ['Duelist', 'Initiator', 'Controller', 'Sentinel'];
const LEAGUE_ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

const LANGUAGES = ['English', 'Korean', 'Japanese', 'Chinese', 'Spanish', 'Portuguese', 'German', 'French'];

const LEAGUE_LANE_ICONS: { [key: string]: any } = {
  'Top': require('@/assets/images/leaguelanes/top.png'),
  'Jungle': require('@/assets/images/leaguelanes/jungle.png'),
  'Mid': require('@/assets/images/leaguelanes/mid.png'),
  'ADC': require('@/assets/images/leaguelanes/bottom.png'),
  'Support': require('@/assets/images/leaguelanes/support.png'),
};

const VALORANT_ROLE_ICONS: { [key: string]: any } = {
  'Duelist': require('@/assets/images/valorantroles/Duelist.png'),
  'Initiator': require('@/assets/images/valorantroles/Initiator.png'),
  'Controller': require('@/assets/images/valorantroles/Controller.png'),
  'Sentinel': require('@/assets/images/valorantroles/Sentinel.png'),
};

export default function DuoFilterModal({
  visible,
  onClose,
  filters,
  onApplyFilters,
}: DuoFilterModalProps) {
  const [localFilters, setLocalFilters] = useState<DuoFilterOptions>({ ...filters });

  useEffect(() => {
    if (visible) {
      setLocalFilters({ ...filters });
    }
  }, [visible, filters]);

  const handleApply = () => {
    onApplyFilters(localFilters);
    onClose();
  };

  const handleReset = () => {
    setLocalFilters({ game: null, role: null, minRank: null, maxRank: null, language: null });
  };

  const getRankTiers = () => {
    if (localFilters.game === 'valorant') return VALORANT_RANK_TIERS;
    if (localFilters.game === 'league') return LEAGUE_RANK_TIERS;
    return [];
  };

  const hasActiveFilters = () => {
    return localFilters.game !== null ||
           localFilters.role !== null ||
           localFilters.minRank !== null ||
           localFilters.maxRank !== null ||
           localFilters.language !== null;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>Filters</ThemedText>
            <View style={styles.headerRight}>
              {hasActiveFilters() && (
                <TouchableOpacity onPress={handleReset}>
                  <ThemedText style={styles.resetText}>Reset</ThemedText>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose}>
                <IconSymbol size={22} name="xmark" color="#555" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces
            nestedScrollEnabled
          >
            {/* Game */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Game</ThemedText>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, localFilters.game === null && styles.chipSelected]}
                  onPress={() => setLocalFilters({ ...localFilters, game: null, role: null, minRank: null, maxRank: null })}
                >
                  <ThemedText style={[styles.chipText, localFilters.game === null && styles.chipTextSelected]}>All</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, localFilters.game === 'valorant' && styles.chipSelected]}
                  onPress={() => setLocalFilters({ ...localFilters, game: 'valorant', role: null, minRank: null, maxRank: null })}
                >
                  <Image source={require('@/assets/images/valorant-red.png')} style={styles.chipIcon} resizeMode="contain" />
                  <ThemedText style={[styles.chipText, localFilters.game === 'valorant' && styles.chipTextSelected]}>Valorant</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, localFilters.game === 'league' && styles.chipSelected]}
                  onPress={() => setLocalFilters({ ...localFilters, game: 'league', role: null, minRank: null, maxRank: null })}
                >
                  <Image source={require('@/assets/images/lol.png')} style={styles.chipIcon} resizeMode="contain" />
                  <ThemedText style={[styles.chipText, localFilters.game === 'league' && styles.chipTextSelected]}>League</ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            {/* Position */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Position</ThemedText>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, localFilters.role === null && styles.chipSelected]}
                  onPress={() => setLocalFilters({ ...localFilters, role: null })}
                >
                  <ThemedText style={[styles.chipText, localFilters.role === null && styles.chipTextSelected]}>Any</ThemedText>
                </TouchableOpacity>
              </View>

              {(localFilters.game === null || localFilters.game === 'valorant') && (
                <>
                  <ThemedText style={styles.subTitle}>Valorant</ThemedText>
                  <View style={styles.chipRow}>
                    {VALORANT_ROLES.map((role) => (
                      <TouchableOpacity
                        key={role}
                        style={[styles.chip, localFilters.role === role && styles.chipSelected]}
                        onPress={() => setLocalFilters({ ...localFilters, role })}
                      >
                        <Image source={VALORANT_ROLE_ICONS[role]} style={styles.roleIcon} resizeMode="contain" />
                        <ThemedText style={[styles.chipText, localFilters.role === role && styles.chipTextSelected]}>{role}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {(localFilters.game === null || localFilters.game === 'league') && (
                <>
                  <ThemedText style={styles.subTitle}>League of Legends</ThemedText>
                  <View style={styles.chipRow}>
                    {LEAGUE_ROLES.map((role) => (
                      <TouchableOpacity
                        key={role}
                        style={[styles.chip, localFilters.role === role && styles.chipSelected]}
                        onPress={() => setLocalFilters({ ...localFilters, role })}
                      >
                        <Image source={LEAGUE_LANE_ICONS[role]} style={styles.roleIcon} resizeMode="contain" />
                        <ThemedText style={[styles.chipText, localFilters.role === role && styles.chipTextSelected]}>{role}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* Rank */}
            {localFilters.game && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Rank Range</ThemedText>
                <View style={styles.rankContainer}>
                  <View style={styles.rankColumn}>
                    <ThemedText style={styles.rankLabel}>Min</ThemedText>
                    <View style={styles.rankChips}>
                      <TouchableOpacity
                        style={[styles.rankChip, localFilters.minRank === null && styles.rankChipSelected]}
                        onPress={() => setLocalFilters({ ...localFilters, minRank: null })}
                      >
                        <ThemedText style={[styles.rankChipText, localFilters.minRank === null && styles.rankChipTextSelected]}>Any</ThemedText>
                      </TouchableOpacity>
                      {getRankTiers().map((rank) => (
                        <TouchableOpacity
                          key={rank}
                          style={[styles.rankChip, localFilters.minRank === rank && styles.rankChipSelected]}
                          onPress={() => setLocalFilters({ ...localFilters, minRank: rank })}
                        >
                          <ThemedText style={[styles.rankChipText, localFilters.minRank === rank && styles.rankChipTextSelected]}>{rank}</ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.rankDivider} />
                  <View style={styles.rankColumn}>
                    <ThemedText style={styles.rankLabel}>Max</ThemedText>
                    <View style={styles.rankChips}>
                      <TouchableOpacity
                        style={[styles.rankChip, localFilters.maxRank === null && styles.rankChipSelected]}
                        onPress={() => setLocalFilters({ ...localFilters, maxRank: null })}
                      >
                        <ThemedText style={[styles.rankChipText, localFilters.maxRank === null && styles.rankChipTextSelected]}>Any</ThemedText>
                      </TouchableOpacity>
                      {getRankTiers().map((rank) => (
                        <TouchableOpacity
                          key={rank}
                          style={[styles.rankChip, localFilters.maxRank === rank && styles.rankChipSelected]}
                          onPress={() => setLocalFilters({ ...localFilters, maxRank: rank })}
                        >
                          <ThemedText style={[styles.rankChipText, localFilters.maxRank === rank && styles.rankChipTextSelected]}>{rank}</ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Language */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Language</ThemedText>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, localFilters.language === null && styles.chipSelected]}
                  onPress={() => setLocalFilters({ ...localFilters, language: null })}
                >
                  <ThemedText style={[styles.chipText, localFilters.language === null && styles.chipTextSelected]}>Any</ThemedText>
                </TouchableOpacity>
                {LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang}
                    style={[styles.chip, localFilters.language === lang && styles.chipSelected]}
                    onPress={() => setLocalFilters({ ...localFilters, language: lang })}
                  >
                    <ThemedText style={[styles.chipText, localFilters.language === lang && styles.chipTextSelected]}>{lang}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Apply */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.applyBtn} onPress={handleApply} activeOpacity={0.8}>
              <ThemedText style={styles.applyBtnText}>Apply Filters</ThemedText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f0f0f',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    minHeight: 400,
    borderTopWidth: 1,
    borderColor: 'rgba(139, 127, 232, 0.15)',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  resetText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0D6A2',
  },
  scrollView: {
    flexGrow: 1,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  section: {
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  subTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginTop: 12,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chipSelected: {
    backgroundColor: 'rgba(139, 127, 232, 0.12)',
    borderColor: 'rgba(139, 127, 232, 0.4)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999',
  },
  chipTextSelected: {
    color: '#F0D6A2',
  },
  chipIcon: {
    width: 16,
    height: 16,
  },
  roleIcon: {
    width: 18,
    height: 18,
  },
  rankContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  rankColumn: {
    flex: 1,
  },
  rankLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  rankChips: {
    gap: 6,
  },
  rankChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  rankChipSelected: {
    backgroundColor: 'rgba(139, 127, 232, 0.12)',
    borderColor: 'rgba(139, 127, 232, 0.4)',
  },
  rankChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999',
    textAlign: 'center',
  },
  rankChipTextSelected: {
    color: '#F0D6A2',
  },
  rankDivider: {
    width: 0.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: 32,
  },
  applyBtn: {
    backgroundColor: '#8B7FE8',
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
