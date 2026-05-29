import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StyleSheet, View, ScrollView, Image, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { getRecentMatches } from '@/services/riotService';
import { formatRankDisplay } from '@/utils/formatRankDisplay';

const GAME_LOGOS: { [key: string]: any } = {
  'Valorant': require('@/assets/images/valorant-red.png'),
  'League of Legends': require('@/assets/images/lol-icon.png'),
  'League': require('@/assets/images/lol-icon.png'),
};

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

const VALORANT_AGENT_ICONS: { [key: string]: any } = {
  astra: require('@/assets/images/valoranticons/astra.png'),
  breach: require('@/assets/images/valoranticons/breach.png'),
  brimstone: require('@/assets/images/valoranticons/brimstone.png'),
  chamber: require('@/assets/images/valoranticons/chamber.png'),
  clove: require('@/assets/images/valoranticons/clove.png'),
  cypher: require('@/assets/images/valoranticons/cypher.png'),
  deadlock: require('@/assets/images/valoranticons/deadlock.png'),
  fade: require('@/assets/images/valoranticons/fade.png'),
  gekko: require('@/assets/images/valoranticons/gekko.png'),
  harbor: require('@/assets/images/valoranticons/harbor.png'),
  iso: require('@/assets/images/valoranticons/iso.png'),
  jett: require('@/assets/images/valoranticons/jett.png'),
  kayo: require('@/assets/images/valoranticons/kayo.png'),
  killjoy: require('@/assets/images/valoranticons/killjoy.png'),
  neon: require('@/assets/images/valoranticons/neon.png'),
  omen: require('@/assets/images/valoranticons/omen.png'),
  phoenix: require('@/assets/images/valoranticons/phoenix.png'),
  raze: require('@/assets/images/valoranticons/raze.png'),
  reyna: require('@/assets/images/valoranticons/reyna.png'),
  sage: require('@/assets/images/valoranticons/sage.png'),
  skye: require('@/assets/images/valoranticons/skye.png'),
  sova: require('@/assets/images/valoranticons/sova.png'),
  viper: require('@/assets/images/valoranticons/viper.png'),
  yoru: require('@/assets/images/valoranticons/yoru.png'),
};

const VALORANT_ROLE_ICONS: { [key: string]: any } = {
  controller: require('@/assets/images/valorantroles/Controller.png'),
  duelist: require('@/assets/images/valorantroles/Duelist.png'),
  initiator: require('@/assets/images/valorantroles/Initiator.png'),
  sentinel: require('@/assets/images/valorantroles/Sentinel.png'),
};

const LEAGUE_LANE_ICONS: { [key: string]: any } = {
  top: require('@/assets/images/leaguelanes/top.png'),
  jungle: require('@/assets/images/leaguelanes/jungle.png'),
  mid: require('@/assets/images/leaguelanes/mid.png'),
  middle: require('@/assets/images/leaguelanes/mid.png'),
  bottom: require('@/assets/images/leaguelanes/bottom.png'),
  bot: require('@/assets/images/leaguelanes/bottom.png'),
  adc: require('@/assets/images/leaguelanes/bottom.png'),
  support: require('@/assets/images/leaguelanes/support.png'),
};

interface MatchEntry {
  matchId?: string;
  agent?: string;
  champion?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  won: boolean;
  map?: string;
  gameStart?: number;
  score?: string;
  playedAt?: number;
}

interface DuoCardDetailModalProps {
  visible: boolean;
  onClose: () => void;
  expiresAt?: Date;
  card: {
    game: 'valorant' | 'league';
    username: string;
    avatar?: string;
    inGameIcon?: string;
    inGameName?: string;
    currentRank: string;
    peakRank: string;
    mainRole: string;
    mainAgent?: string;
    lookingFor?: string;
    winRate?: number;
    gamesPlayed?: number;
    rankUpUsername?: string;
    userId: string;
  } | null;
}

const getRankIcon = (rank: string, game: 'valorant' | 'league') => {
  if (!rank || rank === 'Unranked') {
    return game === 'league' ? LEAGUE_RANK_ICONS.unranked : VALORANT_RANK_ICONS.unranked;
  }
  const parts = rank.split(' ');
  const tier = parts[0].toLowerCase();
  const division = parts[1] || '';
  const fullKey = (tier + division).toLowerCase();
  if (game === 'league') return LEAGUE_RANK_ICONS[tier] || LEAGUE_RANK_ICONS.unranked;
  return VALORANT_RANK_ICONS[fullKey] || VALORANT_RANK_ICONS[tier] || VALORANT_RANK_ICONS.unranked;
};

const formatTimeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  const date = new Date(timestamp);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
};

const getAgentIcon = (agent: string) => {
  return VALORANT_AGENT_ICONS[agent.toLowerCase().replace('/', '').replace("'", '')] || null;
};

// In-memory match history cache (30 min TTL)
const MATCH_CACHE_TTL = 30 * 60 * 1000;
const matchHistoryCache: { [key: string]: { matches: MatchEntry[]; timestamp: number } } = {};

export default function DuoCardDetailModal({ visible, onClose, expiresAt, card }: DuoCardDetailModalProps) {
  const [recentMatches, setRecentMatches] = useState<MatchEntry[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!expiresAt || !visible) {
      setTimeLeft(0);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [expiresAt, visible]);

  useEffect(() => {
    const fetchMatchHistory = async () => {
      if (!visible || !card?.userId) {
        setRecentMatches([]);
        return;
      }

      const cacheKey = `${card.userId}_${card.game}`;
      const cached = matchHistoryCache[cacheKey];

      if (cached && Date.now() - cached.timestamp < MATCH_CACHE_TTL) {
        setRecentMatches(cached.matches);
        return;
      }

      if (cached) {
        setRecentMatches(cached.matches);
      }

      setLoadingMatches(!cached);
      try {
        const userDocRef = doc(db, 'users', card.userId);
        const userDoc = await getDoc(userDocRef);
        let matches: MatchEntry[] = [];

        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (card.game === 'valorant' && userData.valorantStats?.matchHistory?.length > 0) {
            matches = userData.valorantStats.matchHistory;
          } else if (card.game === 'league' && userData.riotStats?.matchHistory?.length > 0) {
            matches = userData.riotStats.matchHistory;
          }
        }

        if (matches.length === 0 && card.game === 'league') {
          const result = await getRecentMatches(card.userId, card.game);
          if (result.matches?.length > 0) {
            matches = result.matches.map((m: any) => ({
              agent: m.agent,
              champion: m.champion,
              kills: m.kills,
              deaths: m.deaths,
              assists: m.assists,
              won: m.won,
              map: m.map,
              score: m.score,
              playedAt: m.playedAt,
              gameStart: m.gameStart,
            }));
          }
        }

        matchHistoryCache[cacheKey] = { matches, timestamp: Date.now() };
        setRecentMatches(matches);
      } catch (error) {
        console.error('Error fetching match history:', error);
        if (!cached) setRecentMatches([]);
      } finally {
        setLoadingMatches(false);
      }
    };

    fetchMatchHistory();
  }, [visible, card?.userId, card?.game]);

  if (!card) return null;

  const isLeague = card.game === 'league';
  const gameName = isLeague ? 'League of Legends' : 'Valorant';
  const gameLogo = GAME_LOGOS[gameName];
  const currentRankIcon = getRankIcon(card.currentRank, card.game);
  const agentIcon = !isLeague && card.mainAgent
    ? VALORANT_AGENT_ICONS[card.mainAgent.toLowerCase()] || null
    : null;
  const championIconSrc = isLeague && card.mainAgent
    ? { uri: `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/${card.mainAgent.replace(/[\s'.]/g, '')}.png` }
    : null;
  const roleIcon = !isLeague && card.mainRole
    ? VALORANT_ROLE_ICONS[card.mainRole.toLowerCase()] || null
    : null;
  const laneIcon = isLeague && card.mainRole
    ? LEAGUE_LANE_ICONS[card.mainRole.toLowerCase()] || null
    : null;
  const positionIcon = roleIcon || laneIcon;
  const characterIcon = agentIcon || championIconSrc;

  const recentValidMatches = recentMatches.slice(0, 10);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>DUO PROFILE</ThemedText>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
            <IconSymbol size={22} name="xmark" color="#fff" />
          </TouchableOpacity>
        </View>

        {expiresAt && timeLeft > 0 && (
          <View style={styles.timerSection}>
            <View style={styles.timerBarBg}>
              <View style={[
                styles.timerBarFill,
                { width: `${(timeLeft / 30) * 100}%` },
                timeLeft <= 10 && styles.timerBarUrgent,
              ]} />
            </View>
            <ThemedText style={[styles.timerText, timeLeft <= 10 && styles.timerTextUrgent]}>
              {timeLeft}s
            </ThemedText>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Main Card — matches duoCard styling */}
          <View style={styles.card}>
            {/* Top section */}
            <View style={styles.topSection}>
              {/* Name row */}
              <View style={styles.nameRow}>
                <View style={styles.avatarWrap}>
                  {card.inGameIcon ? (
                    <Image source={{ uri: card.inGameIcon }} style={styles.avatarImg} />
                  ) : card.avatar ? (
                    <Image source={{ uri: card.avatar }} style={styles.avatarImg} />
                  ) : (
                    <ThemedText style={styles.avatarLetter}>
                      {(card.inGameName || card.username)[0].toUpperCase()}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.nameCol}>
                  <ThemedText style={styles.name} numberOfLines={1}>{card.inGameName || card.username}</ThemedText>
                  {card.rankUpUsername && (
                    <ThemedText style={styles.subName}>{card.rankUpUsername}</ThemedText>
                  )}
                </View>
                {gameLogo && (
                  <Image
                    source={gameLogo}
                    style={isLeague ? styles.gameIconCorner : styles.gameIconCornerSmall}
                    resizeMode="contain"
                  />
                )}
              </View>

              {/* Stats panel — rank + role/agent icons */}
              <View style={styles.statsPanel}>
                <View style={styles.statsTopRow}>
                  <View style={styles.rankBlock}>
                    <Image source={currentRankIcon} style={styles.rankImg} resizeMode="contain" />
                    <ThemedText style={styles.rankName} numberOfLines={1}>
                      {formatRankDisplay(card.currentRank || 'Unranked')}
                    </ThemedText>
                  </View>

                  {(positionIcon || characterIcon) && (
                    <View style={styles.iconBlock}>
                      {positionIcon && (
                        <View style={styles.iconChip}>
                          <Image source={positionIcon} style={styles.iconChipImg} resizeMode="contain" />
                        </View>
                      )}
                      {characterIcon && (
                        <View style={styles.iconChip}>
                          <Image
                            source={characterIcon}
                            style={isLeague ? styles.iconChipImgFill : styles.iconChipImg}
                            resizeMode={isLeague ? 'cover' : 'contain'}
                          />
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {(card.winRate !== undefined && card.winRate > 0 || card.gamesPlayed !== undefined && card.gamesPlayed > 0) && (
                  <View style={styles.statsBottomRow}>
                    {card.winRate !== undefined && card.winRate > 0 && (
                      <ThemedText style={styles.winRateInline}>
                        <ThemedText style={styles.winRateInlineValue}>{card.winRate}% </ThemedText>
                        <ThemedText style={styles.winRateInlineLabel}>WIN RATE</ThemedText>
                      </ThemedText>
                    )}
                    {card.gamesPlayed !== undefined && card.gamesPlayed > 0 && (
                      <ThemedText style={styles.winRateInline}>
                        <ThemedText style={styles.winRateInlineValue}>{card.gamesPlayed} </ThemedText>
                        <ThemedText style={styles.winRateInlineLabel}>GAMES</ThemedText>
                      </ThemedText>
                    )}
                  </View>
                )}
              </View>

              {/* Detail rows */}
              <View style={styles.detailRows}>
                {card.peakRank && card.peakRank !== 'Unranked' && (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailLabel}>Peak Rank</ThemedText>
                    <View style={styles.detailValueRow}>
                      <Image source={getRankIcon(card.peakRank, card.game)} style={styles.detailRankIcon} resizeMode="contain" />
                      <ThemedText style={styles.detailValue}>{card.peakRank}</ThemedText>
                    </View>
                  </View>
                )}
                {card.lookingFor && (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailLabel}>Looking For</ThemedText>
                    <ThemedText style={styles.detailValue}>{card.lookingFor}</ThemedText>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Match History Card */}
          <View style={styles.card}>
            <View style={styles.matchSection}>
              <ThemedText style={styles.matchSectionTitle}>MATCH HISTORY</ThemedText>
              {loadingMatches ? (
                <View style={styles.matchLoadingContainer}>
                  <ActivityIndicator color="#888" size="small" />
                </View>
              ) : recentValidMatches.length === 0 ? (
                <View style={styles.noMatchesContainer}>
                  <ThemedText style={styles.noMatchesText}>No recent matches</ThemedText>
                </View>
              ) : (
                <>
                  <View style={styles.matchTableHeader}>
                    <View style={styles.matchIndicatorSpacer} />
                    <ThemedText style={[styles.matchHeaderText, styles.matchColAgent]}>
                      {isLeague ? 'Champ' : 'Agent'}
                    </ThemedText>
                    <ThemedText style={[styles.matchHeaderText, styles.matchColKDA]}>KDA</ThemedText>
                    <ThemedText style={[styles.matchHeaderText, styles.matchColResult]}>Result</ThemedText>
                    <ThemedText style={[styles.matchHeaderText, styles.matchColScore]}>Score</ThemedText>
                    <ThemedText style={[styles.matchHeaderText, styles.matchColDate]}>Date</ThemedText>
                  </View>
                  {recentValidMatches.map((match, index) => {
                    const rawTs = match.gameStart || match.playedAt || 0;
                    const timestamp = rawTs < 10000000000 ? rawTs * 1000 : rawTs;
                    const agentName = match.agent || match.champion || '';
                    const matchAgentIcon = !isLeague ? getAgentIcon(agentName) : null;

                    return (
                      <View key={index} style={styles.matchItem}>
                        <View style={[styles.matchIndicator, match.won ? styles.matchWin : styles.matchLoss]} />
                        <View style={styles.matchColAgent}>
                          {matchAgentIcon ? (
                            <Image source={matchAgentIcon} style={styles.matchAgentIcon} resizeMode="contain" />
                          ) : (
                            <ThemedText style={styles.matchCellText} numberOfLines={1}>
                              {agentName || '-'}
                            </ThemedText>
                          )}
                        </View>
                        <ThemedText style={[styles.matchCellText, styles.matchColKDA]}>
                          {match.kills ?? 0}/{match.deaths ?? 0}/{match.assists ?? 0}
                        </ThemedText>
                        <ThemedText style={[
                          styles.matchCellText,
                          styles.matchColResult,
                          match.won ? styles.matchResultWin : styles.matchResultLoss
                        ]}>
                          {match.won ? 'Victory' : 'Defeat'}
                        </ThemedText>
                        <ThemedText style={[styles.matchCellText, styles.matchColScore]}>
                          {match.score || '-'}
                        </ThemedText>
                        <ThemedText style={[styles.matchCellText, styles.matchColDate, styles.matchDateText]}>
                          {timestamp ? formatTimeAgo(timestamp) : '-'}
                        </ThemedText>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  timerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  // Card — matches duoCard.tsx
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  topSection: {
    padding: 16,
    gap: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarLetter: {
    fontSize: 16,
    fontWeight: '700',
    color: '#888',
  },
  nameCol: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  subName: {
    fontSize: 12,
    color: '#666',
  },
  gameIconCorner: {
    width: 50,
    height: 50,
    opacity: 0.9,
  },
  gameIconCornerSmall: {
    width: 28,
    height: 28,
    opacity: 0.9,
  },
  // Stats panel — matches duoCard.tsx
  statsPanel: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 8,
  },
  statsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statsBottomRow: {
    flexDirection: 'row',
    gap: 14,
  },
  rankBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  rankImg: {
    width: 34,
    height: 34,
  },
  rankName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
    flexShrink: 1,
    textTransform: 'uppercase',
  },
  iconBlock: {
    flexDirection: 'row',
    gap: 6,
  },
  iconChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  iconChipImg: {
    width: 22,
    height: 22,
  },
  iconChipImgFill: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    transform: [{ scale: 1.18 }],
  },
  winRateInline: {
    fontSize: 13,
    color: '#888',
  },
  winRateInlineValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.2,
  },
  winRateInlineLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.6,
  },
  // Detail rows (peak rank, looking for)
  detailRows: {
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  detailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailRankIcon: {
    width: 20,
    height: 20,
  },
  // Match History section
  matchSection: {
    padding: 16,
    gap: 8,
  },
  matchSectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  matchLoadingContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  noMatchesContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  noMatchesText: {
    fontSize: 12,
    color: '#555',
  },
  matchTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    paddingLeft: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  matchHeaderText: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  matchIndicatorSpacer: {
    width: 16,
  },
  matchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  matchIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: 12,
  },
  matchWin: {
    backgroundColor: '#4CAF50',
  },
  matchLoss: {
    backgroundColor: '#DC3D4B',
  },
  matchColAgent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchAgentIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  matchColKDA: {
    flex: 1.2,
    textAlign: 'center',
  },
  matchColResult: {
    flex: 1.2,
    textAlign: 'center',
  },
  matchColScore: {
    flex: 1,
    textAlign: 'center',
  },
  matchColDate: {
    flex: 1.3,
    textAlign: 'right',
  },
  matchCellText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  matchResultWin: {
    color: '#4CAF50',
  },
  matchResultLoss: {
    color: '#DC3D4B',
  },
  matchDateText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
  },
});
