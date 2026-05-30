import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import CachedImage from '@/components/ui/CachedImage';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from '@/hooks/useRouter';
import { formatRankDisplay } from '@/utils/formatRankDisplay';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
const getRankIcon = (rank: string, game: string) => {
  const isLeague = game === 'League of Legends' || game === 'League';
  const icons = isLeague ? LEAGUE_RANK_ICONS : VALORANT_RANK_ICONS;
  if (!rank || rank === 'Unranked') return icons.unranked;
  const tier = rank.split(' ')[0].toLowerCase();
  return icons[tier] || icons.unranked;
};

const MINIMUM_SKELETON_TIME = 400;

const getLeagueRankValue = (currentRank: string, lp: number): number => {
  const rankOrder: { [key: string]: number } = {
    'CHALLENGER': 10, 'GRANDMASTER': 9, 'MASTER': 8, 'DIAMOND': 7,
    'EMERALD': 6, 'PLATINUM': 5, 'GOLD': 4, 'SILVER': 3,
    'BRONZE': 2, 'IRON': 1, 'UNRANKED': 0,
  };
  const divisionOrder: { [key: string]: number } = { 'I': 4, 'II': 3, 'III': 2, 'IV': 1 };
  const parts = currentRank.toUpperCase().split(' ');
  return (rankOrder[parts[0]] || 0) * 1000 + (divisionOrder[parts[1]] || 0) * 100 + lp;
};

const getValorantRankValue = (currentRank: string, rr: number): number => {
  const rankOrder: { [key: string]: number } = {
    'RADIANT': 9, 'IMMORTAL': 8, 'ASCENDANT': 7, 'DIAMOND': 6,
    'PLATINUM': 5, 'GOLD': 4, 'SILVER': 3, 'BRONZE': 2,
    'IRON': 1, 'UNRANKED': 0,
  };
  const parts = currentRank.toUpperCase().split(' ');
  return (rankOrder[parts[0]] || 0) * 1000 + (parseInt(parts[1]) || 0) * 100 + rr;
};

// Module-level cache so data persists across navigation remounts
let cachedLeaderboards: any[] | null = null;
let prefetchedImages = new Set<string>();

export default function LobbiesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [leaderboards, setLeaderboards] = useState<any[]>(cachedLeaderboards || []);
  const [loading, setLoading] = useState(!cachedLeaderboards);
  const [activeTab, setActiveTab] = useState<'all' | 'active'>('all');
  const skeletonStartTime = useRef<number>(Date.now());
  const isFirstLoad = useRef(!cachedLeaderboards);

  // Fetch leaderboards from Firestore
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const partiesRef = collection(db, 'parties');
    const partiesQuery = query(partiesRef, where('members', 'array-contains', user.id));

    const unsubscribe = onSnapshot(partiesQuery, (snapshot) => {
      setLeaderboards((prev) => {
        const updated = snapshot.docs
          .map((docSnapshot) => {
            const data = docSnapshot.data();
            const docId = docSnapshot.id;
            if (data.type === 'party') return null;

            const existing = prev.find(p => p.id === docId);

            return {
              id: docId,
              name: data.partyName,
              game: data.game,
              members: data.members?.length || 0,
              maxMembers: data.maxMembers || 10,
              memberIds: data.members || [],
              memberDetails: data.memberDetails || [],
              description: `Created on ${data.startDate}`,
              icon: data.game === 'Valorant' ? '🎯' : data.game === 'League of Legends' ? '💎' : '🎮',
              userRank: existing?.userRank ?? null,
              isJoined: true,
              players: existing?.players || [],
              startDate: data.startDate,
              endDate: data.endDate,
              type: data.type || 'leaderboard',
              coverPhoto: data.coverPhoto || null,
              partyIcon: data.partyIcon || null,
              partyId: data.partyId || docId,
              challengeStatus: data.challengeStatus || 'active',
              challengeParticipants: data.challengeParticipants || [],
            };
          })
          .filter(Boolean);

        cachedLeaderboards = updated;

        // Prefetch new images in background (don't block state update)
        requestAnimationFrame(() => {
          updated.forEach((lb: any) => {
            if (lb.partyIcon && !prefetchedImages.has(lb.partyIcon)) {
              prefetchedImages.add(lb.partyIcon);
              Image.prefetch(lb.partyIcon).catch(() => {});
            }
            const members = lb.memberDetails?.length ? lb.memberDetails : lb.players || [];
            members.slice(0, 3).forEach((m: any) => {
              const photo = m?.avatar || m?.photoUrl;
              if (photo && !prefetchedImages.has(photo)) {
                prefetchedImages.add(photo);
                Image.prefetch(photo).catch(() => {});
              }
            });
          });
        });

        return updated;
      });

      // Only show skeleton delay on first-ever load; skip on subsequent navigations
      if (isFirstLoad.current) {
        const elapsedTime = Date.now() - skeletonStartTime.current;
        const remainingTime = Math.max(0, MINIMUM_SKELETON_TIME - elapsedTime);
        setTimeout(() => {
          setLoading(false);
          isFirstLoad.current = false;
        }, remainingTime);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [user?.id]);

  // Enrich leaderboards with sorted player rank data for podium
  useEffect(() => {
    if (loading || leaderboards.length === 0) return;

    const enrichWithRanks = async () => {
      const enriched = await Promise.all(
        leaderboards.map(async (lb: any) => {
          // Skip if already enriched
          if (lb.players && lb.players.length > 0 && lb.players[0].currentRank) return lb;

          const memberDetails = lb.memberDetails || [];
          if (memberDetails.length === 0) return lb;

          const isLeague = lb.game === 'League of Legends' || lb.game === 'League';
          const gameStatsPath = isLeague ? 'league' : 'valorant';

          try {
            const playerPromises = memberDetails.map(async (member: any) => {
              try {
                const statsDoc = await getDoc(doc(db, 'users', member.userId, 'gameStats', gameStatsPath));
                let stats = statsDoc.data();

                if (!stats?.currentRank) {
                  const userDoc = await getDoc(doc(db, 'users', member.userId));
                  const userData = userDoc.data();
                  if (isLeague && userData?.riotStats?.rankedSolo) {
                    stats = { currentRank: `${userData.riotStats.rankedSolo.tier} ${userData.riotStats.rankedSolo.rank}`, lp: userData.riotStats.rankedSolo.leaguePoints || 0 };
                  } else if (!isLeague && userData?.valorantStats) {
                    stats = { currentRank: userData.valorantStats.currentRank || 'Unranked', rr: userData.valorantStats.rankRating || 0 };
                  }
                }

                return {
                  userId: member.userId,
                  username: member.username,
                  avatar: member.avatar,
                  currentRank: stats?.currentRank || 'Unranked',
                  lp: stats?.lp || 0,
                  rr: stats?.rr || 0,
                };
              } catch {
                return { userId: member.userId, username: member.username, avatar: member.avatar, currentRank: 'Unranked', lp: 0, rr: 0 };
              }
            });

            const players = await Promise.all(playerPromises);
            players.sort((a, b) => {
              if (isLeague) return getLeagueRankValue(b.currentRank, b.lp) - getLeagueRankValue(a.currentRank, a.lp);
              return getValorantRankValue(b.currentRank, b.rr) - getValorantRankValue(a.currentRank, a.rr);
            });
            players.forEach((p: any, i: number) => { p.rank = i + 1; });

            return { ...lb, players };
          } catch {
            return lb;
          }
        })
      );

      setLeaderboards(enriched);
      cachedLeaderboards = enriched;
    };

    enrichWithRanks();
  }, [loading, leaderboards.length]);

  const handleLeaderboardPress = useCallback((leaderboard: any) => {
    if (leaderboard.challengeStatus === 'completed') {
      router.push({
        pathname: '/partyPages/leaderboardResults',
        params: {
          name: leaderboard.name,
          icon: leaderboard.icon,
          game: leaderboard.game,
          members: leaderboard.members.toString(),
          id: leaderboard.id,
          startDate: leaderboard.startDate,
          endDate: leaderboard.endDate,
        },
      });
    } else {
      router.push({
        pathname: '/partyPages/leaderboardDetail',
        params: {
          name: leaderboard.name,
          icon: leaderboard.icon,
          game: leaderboard.game,
          members: leaderboard.members.toString(),
          players: JSON.stringify(leaderboard.players),
          id: leaderboard.id,
          startDate: leaderboard.startDate,
          endDate: leaderboard.endDate,
        },
      });
    }
  }, [router]);

  const filteredLeaderboards = useMemo(() => {
    if (activeTab === 'active') return leaderboards.filter(lb => lb.challengeStatus !== 'completed');
    return leaderboards; // 'all' shows everything
  }, [leaderboards, activeTab]);

  const activeCount = useMemo(() => leaderboards.filter(lb => lb.challengeStatus !== 'completed').length, [leaderboards]);

  return (
    <ThemedView style={styles.container}>
      {/* Purple shimmer background */}
      <View style={styles.backgroundGlow} pointerEvents="none">
        <View style={styles.shimmerBand} pointerEvents="none">
          <LinearGradient
            colors={[
              'transparent',
              'rgba(139, 127, 232, 0.03)',
              'rgba(139, 127, 232, 0.06)',
              'rgba(139, 127, 232, 0.03)',
              'transparent',
            ]}
            locations={[0, 0.37, 0.5, 0.63, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol size={20} name="chevron.left" color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.headerTitle}>Lobbies</ThemedText>
          <ThemedText style={styles.headerSubtitle}>Active competitions with friends</ThemedText>
        </View>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/partyPages/createLeaderboardName')}
          activeOpacity={0.7}
        >
          <IconSymbol size={14} name="plus" color="#8B7FE8" />
          <ThemedText style={styles.createButtonText}>Create</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tab, activeTab === 'all' && styles.tabActive]} onPress={() => setActiveTab('all')}>
          <ThemedText style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>All</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'active' && styles.tabActive]} onPress={() => setActiveTab('active')}>
          <ThemedText style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>Active</ThemedText>
          {activeCount > 0 && (
            <View style={styles.tabBadge}>
              <ThemedText style={styles.tabBadgeText}>{activeCount}</ThemedText>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#8B7FE8" style={{ paddingVertical: 40 }} />
        ) : filteredLeaderboards.length > 0 ? (
          <View style={styles.lobbyList}>
            {filteredLeaderboards.map((lobby) => {
              const isLeague = lobby.game === 'League of Legends' || lobby.game === 'League';
              const members = lobby.memberDetails || [];
              const displayMembers = members.slice(0, 3);
              const extraCount = Math.max(0, members.length - 3);

              const players = lobby.players || [];
              let avgRankLabel = 'Unranked';
              let avgRankRaw = 'Unranked';
              if (players.length > 0) {
                const rankedPlayers = players.filter((p: any) => p.currentRank && p.currentRank !== 'Unranked');
                if (rankedPlayers.length > 0) {
                  const midIdx = Math.floor(rankedPlayers.length / 2);
                  avgRankRaw = rankedPlayers[midIdx].currentRank;
                  avgRankLabel = formatRankDisplay(avgRankRaw);
                }
              }
              const avgRankIcon = getRankIcon(avgRankRaw, lobby.game);

              return (
                <TouchableOpacity
                  key={lobby.id}
                  style={styles.lobbyCard}
                  onPress={() => handleLeaderboardPress(lobby)}
                  activeOpacity={0.8}
                >
                  {/* Lobby icon */}
                  {lobby.partyIcon ? (
                    <CachedImage uri={lobby.partyIcon} style={styles.lobbyIcon} />
                  ) : (
                    <View style={styles.lobbyIconPlaceholder}>
                      <ThemedText style={styles.lobbyIconInitial}>{(lobby.name || '?').charAt(0)}</ThemedText>
                    </View>
                  )}

                  {/* Avatars stacked */}
                  <View style={styles.lobbyAvatars}>
                    {displayMembers.map((member: any, idx: number) => (
                      <View key={member.userId || idx} style={[styles.lobbyAvatarWrapper, { marginLeft: idx > 0 ? -10 : 0, zIndex: displayMembers.length - idx }]}>
                        {member.avatar ? (
                          <CachedImage uri={member.avatar} style={styles.lobbyAvatarImage} />
                        ) : (
                          <View style={styles.lobbyAvatarFallback}>
                            <ThemedText style={styles.lobbyAvatarFallbackText}>
                              {(member.username || '?').charAt(0).toUpperCase()}
                            </ThemedText>
                          </View>
                        )}
                      </View>
                    ))}
                    {extraCount > 0 && (
                      <View style={[styles.lobbyAvatarWrapper, styles.lobbyAvatarExtra, { marginLeft: -10 }]}>
                        <ThemedText style={styles.lobbyAvatarExtraText}>+{extraCount}</ThemedText>
                      </View>
                    )}
                  </View>

                  {/* Middle: name + badge + rank */}
                  <View style={styles.lobbyInfo}>
                    <ThemedText style={styles.lobbyCardName} numberOfLines={1}>{lobby.name}</ThemedText>
                    <View style={styles.lobbyTypeBadge}>
                      <ThemedText style={styles.lobbyTypeBadgeText}>
                        {lobby.type === 'party' ? 'PARTY' : isLeague ? 'RANKED SOLO' : 'RANKED'}
                      </ThemedText>
                    </View>
                    <View style={styles.lobbyMeta}>
                      <Image source={avgRankIcon} style={styles.lobbyRankIcon} resizeMode="contain" />
                      <ThemedText style={styles.lobbyRankText}>{avgRankLabel}+</ThemedText>
                      <View style={styles.lobbyMetaDot} />
                      <ThemedText style={styles.lobbyMemberCount}>{lobby.members}/{lobby.maxMembers}</ThemedText>
                    </View>
                  </View>

                  {/* Right: chevron */}
                  <IconSymbol size={16} name="chevron.right" color="#444" />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyStateText}>No lobbies yet</ThemedText>
            <ThemedText style={styles.emptyStateSubtext}>
              Create a lobby to compete with friends
            </ThemedText>
          </View>
        )}


        <View style={{ height: 40 }} />
      </ScrollView>

    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  backgroundGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  shimmerBand: {
    position: 'absolute',
    top: 0,
    left: '-30%',
    width: '60%',
    height: '100%',
    transform: [{ rotate: '-20deg' }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    marginTop: 2,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#8B7FE8',
  },
  createButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8B7FE8',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#8B7FE8',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  tabTextActive: {
    color: '#8B7FE8',
  },
  tabBadge: {
    backgroundColor: '#8B7FE8',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  lobbyList: {
    gap: 8,
  },
  lobbyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    gap: 12,
  },
  lobbyIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  lobbyIconPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 127, 232, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lobbyIconInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8B7FE8',
  },
  lobbyAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lobbyAvatarWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#1a1a1a',
    overflow: 'hidden',
  },
  lobbyAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  lobbyAvatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(139, 127, 232, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lobbyAvatarFallbackText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8B7FE8',
  },
  lobbyAvatarExtra: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lobbyAvatarExtraText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
  },
  lobbyInfo: {
    flex: 1,
    gap: 5,
  },
  lobbyCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  lobbyTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#B4A7F5',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lobbyTypeBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#B4A7F5',
    letterSpacing: 0.5,
  },
  lobbyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  lobbyRankIcon: {
    width: 16,
    height: 16,
  },
  lobbyRankText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
  },
  lobbyMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#444',
  },
  lobbyMemberCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#444',
    textAlign: 'center',
  },
});
