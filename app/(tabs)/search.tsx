import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useState, useEffect, useRef } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from '@/hooks/useRouter';
import { collection, query, where, getDocs, orderBy, limit, doc, setDoc, deleteDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { calculateTierBorderColor } from '@/utils/tierBorderUtils';
import { isRemoteAvatar, getDefaultAvatarSource } from '@/utils/resolveAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolate } from 'react-native-reanimated';

interface SearchUser {
  id: string;
  username: string;
  avatar?: string;
  bio?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  leagueRank?: string;
  valorantRank?: string;
}

const MAX_HISTORY_ITEMS = 7;

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const width = screenWidth;

const GRID_SIZE = 40;

// Skeleton item component with shimmer effect
const SkeletonItem = ({ index }: { index: number }) => {
  const shimmerValue = useSharedValue(0);

  useEffect(() => {
    shimmerValue.value = withRepeat(
      withTiming(1, { duration: 1200 }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      shimmerValue.value,
      [0, 1],
      [-200, 200]
    );
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.left}>
        <View style={skeletonStyles.avatar}>
          <Animated.View style={[skeletonStyles.shimmerOverlay, shimmerStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={skeletonStyles.gradient}
            />
          </Animated.View>
        </View>
        <View style={skeletonStyles.textContainer}>
          <View style={skeletonStyles.username}>
            <Animated.View style={[skeletonStyles.shimmerOverlay, shimmerStyle]}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={skeletonStyles.gradient}
              />
            </Animated.View>
          </View>
        </View>
      </View>
      <View style={skeletonStyles.deleteButton}>
        <Animated.View style={[skeletonStyles.shimmerOverlay, shimmerStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={skeletonStyles.gradient}
          />
        </Animated.View>
      </View>
    </View>
  );
};

const skeletonStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 0,
    marginBottom: 2,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  textContainer: {
    flex: 1,
  },
  username: {
    width: '60%',
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  deleteButton: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    marginRight: 8,
  },
  shimmerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gradient: {
    flex: 1,
    width: 200,
  },
});

const SkeletonLoader = () => {
  return (
    <View>
      <View style={styles.historyHeader}>
        <View style={{ width: 50, height: 12, borderRadius: 6, backgroundColor: '#1a1a1a' }} />
        <View style={{ width: 50, height: 12, borderRadius: 6, backgroundColor: '#1a1a1a' }} />
      </View>
      {[0, 1, 2].map((index) => (
        <SkeletonItem key={index} index={index} />
      ))}
    </View>
  );
};

// Search result skeleton item (no delete button)
const SearchResultSkeletonItem = ({ index }: { index: number }) => {
  const shimmerValue = useSharedValue(0);

  useEffect(() => {
    shimmerValue.value = withRepeat(
      withTiming(1, { duration: 1200 }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      shimmerValue.value,
      [0, 1],
      [-200, 200]
    );
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.left}>
        <View style={skeletonStyles.avatar}>
          <Animated.View style={[skeletonStyles.shimmerOverlay, shimmerStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={skeletonStyles.gradient}
            />
          </Animated.View>
        </View>
        <View style={skeletonStyles.textContainer}>
          <View style={[skeletonStyles.username, { width: index % 2 === 0 ? '55%' : '65%' }]}>
            <Animated.View style={[skeletonStyles.shimmerOverlay, shimmerStyle]}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={skeletonStyles.gradient}
              />
            </Animated.View>
          </View>
        </View>
      </View>
    </View>
  );
};

// Search results skeleton loader
const SearchResultsSkeletonLoader = () => {
  return (
    <View>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <SearchResultSkeletonItem key={index} index={index} />
      ))}
    </View>
  );
};

// Avatar component using expo-image with disk caching
const CachedAvatar = ({ uri, style }: { uri: string; style: any }) => {
  return (
    <Image
      source={uri}
      style={style}
      cachePolicy="disk"
      transition={200}
      recyclingKey={uri}
    />
  );
};

export default function SearchScreen() {
  const router = useRouter();
  const { user: currentUser, preloadedSearchHistory, clearPreloadedSearchHistory, isUserBlocked } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchUser[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [hasConsumedPreload, setHasConsumedPreload] = useState(false);


  // Enrich history entries with fresh rank data from user profiles
  const enrichWithRankData = async (history: SearchUser[]): Promise<SearchUser[]> => {
    try {
      const enriched = await Promise.all(
        history.map(async (user) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', user.id));
            if (userDoc.exists()) {
              const data = userDoc.data();
              let leagueRank: string | undefined;
              let valorantRank: string | undefined;

              if (data.riotStats?.rankedSolo) {
                leagueRank = `${data.riotStats.rankedSolo.tier} ${data.riotStats.rankedSolo.rank}`;
              }
              if (data.valorantStats?.currentRank) {
                valorantRank = data.valorantStats.currentRank;
              }

              return {
                ...user,
                username: data.username || user.username,
                avatar: data.avatar || user.avatar,
                leagueRank,
                valorantRank,
              };
            }
          } catch {}
          return user;
        })
      );
      return enriched;
    } catch {
      return history;
    }
  };

  // Load search history from Firestore
  const loadSearchHistory = async () => {
    if (!currentUser?.id) {
      setLoadingHistory(false);
      return;
    }

    setLoadingHistory(true);
    try {
      const historyRef = collection(db, 'users', currentUser.id, 'searchHistory');
      const q = query(historyRef, orderBy('searchedAt', 'desc'), limit(MAX_HISTORY_ITEMS));
      const querySnapshot = await getDocs(q);

      const history: SearchUser[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        history.push({
          id: doc.id,
          username: data.username,
          avatar: data.avatar,
          bio: data.bio,
          followersCount: data.followersCount,
          followingCount: data.followingCount,
          postsCount: data.postsCount,
          leagueRank: data.leagueRank,
          valorantRank: data.valorantRank,
        });
      });

      // Enrich with fresh rank data from user profiles
      const enrichedHistory = await enrichWithRankData(history);
      setSearchHistory(enrichedHistory);
    } catch (error) {
      console.error('Error loading search history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Save search to Firestore
  const saveToHistory = async (user: SearchUser) => {
    if (!currentUser?.id) return;

    try {
      // Save to Firestore with user ID as document ID
      const searchDocRef = doc(db, 'users', currentUser.id, 'searchHistory', user.id);
      await setDoc(searchDocRef, {
        username: user.username,
        avatar: user.avatar || null,
        bio: user.bio || null,
        followersCount: user.followersCount || 0,
        followingCount: user.followingCount || 0,
        postsCount: user.postsCount || 0,
        leagueRank: user.leagueRank || null,
        valorantRank: user.valorantRank || null,
        searchedAt: Timestamp.now(),
      });

      // Update local state instead of refetching
      // Remove user if already in history (to re-add at top)
      const filteredHistory = searchHistory.filter(item => item.id !== user.id);

      // Add to beginning (most recent)
      const newHistory = [user, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);
      setSearchHistory(newHistory);
    } catch (error) {
      console.error('Error saving search history:', error);
    }
  };

  // Clear all search history
  const clearHistory = async () => {
    if (!currentUser?.id) return;

    try {
      const historyRef = collection(db, 'users', currentUser.id, 'searchHistory');
      const querySnapshot = await getDocs(historyRef);

      // Delete all documents in the searchHistory subcollection
      const deletePromises = querySnapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      setSearchHistory([]);
    } catch (error) {
      console.error('Error clearing search history:', error);
    }
  };

  // Remove single item from history
  const removeFromHistory = async (userId: string, event: any) => {
    event.stopPropagation(); // Prevent navigation when clicking delete

    if (!currentUser?.id) return;

    try {
      const searchDocRef = doc(db, 'users', currentUser.id, 'searchHistory', userId);
      await deleteDoc(searchDocRef);

      // Update local state
      const newHistory = searchHistory.filter(item => item.id !== userId);
      setSearchHistory(newHistory);
    } catch (error) {
      console.error('Error removing from history:', error);
    }
  };

  const lastNavTime = useRef(0);
  const searchInputRef = useRef<TextInput>(null);

  // Reset search state when user changes (e.g. sign out → sign in with different account)
  const prevUserIdRef = useRef<string | undefined>(currentUser?.id);
  useEffect(() => {
    if (currentUser?.id && currentUser.id !== prevUserIdRef.current) {
      setSearchQuery('');
      setSearchResults([]);
      setSearchHistory([]);
      setHasConsumedPreload(false);
      setLoadingHistory(true);
    }
    prevUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);

  // Consume preloaded search history from AuthContext (loaded during loading screen)
  useEffect(() => {
    if (preloadedSearchHistory && !hasConsumedPreload) {
      console.log('✅ Using preloaded search history from loading screen:', preloadedSearchHistory.length);
      setSearchHistory(preloadedSearchHistory);
      setLoadingHistory(false);
      setHasConsumedPreload(true);
      clearPreloadedSearchHistory();

      // Enrich with fresh rank data in background
      enrichWithRankData(preloadedSearchHistory).then((enriched) => {
        setSearchHistory(enriched);
      });
    }
  }, [preloadedSearchHistory, hasConsumedPreload, clearPreloadedSearchHistory]);

  // Load search history once on mount (only if no preloaded data)
  useEffect(() => {
    if (currentUser?.id && !hasConsumedPreload && !preloadedSearchHistory) {
      loadSearchHistory();
    }
  }, [currentUser?.id, hasConsumedPreload, preloadedSearchHistory]);

  // Note: Removed automatic refetch on focus for instant loading
  // Search history now updates via:
  // 1. Local state updates when adding/removing items (already implemented)
  // 2. Initial mount fetch only

  const handleSearch = async (text: string) => {
    setSearchQuery(text);

    if (text.trim() === '') {
      setSearchResults([]);
      return;
    }

    setSearching(true);

    try {
      // Search for users whose username starts with the search query (lowercase)
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('usernameLower', '>=', text.toLowerCase()),
        where('usernameLower', '<=', text.toLowerCase() + '\uf8ff'),
        limit(20)
      );

      const querySnapshot = await getDocs(q);
      const users: SearchUser[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Don't show current user in search results
        if (doc.id !== currentUser?.id) {
          // Get rank data for tier border
          let leagueRank = undefined;
          let valorantRank = undefined;

          if (data.riotStats?.rankedSolo) {
            leagueRank = `${data.riotStats.rankedSolo.tier} ${data.riotStats.rankedSolo.rank}`;
          }
          if (data.valorantStats?.currentRank) {
            valorantRank = data.valorantStats.currentRank;
          }

          users.push({
            id: doc.id,
            username: data.username,
            avatar: data.avatar,
            bio: data.bio,
            followersCount: data.followersCount || 0,
            followingCount: data.followingCount || 0,
            leagueRank,
            valorantRank,
            postsCount: data.postsCount || 0,
          });
        }
      });

      setSearchResults(users.filter(u => !isUserBlocked(u.id)));
      setSearching(false);
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
      setSearching(false);
    }
  };


  const handleUserClick = (user: SearchUser) => {
    if (Date.now() - lastNavTime.current < 500) return;
    lastNavTime.current = Date.now();
    // Navigate to profile immediately
    if (user.id === currentUser?.id) {
      router.push('/(tabs)/profile');
    } else {
      router.push({
        pathname: '/profilePages/profileView',
        params: { userId: user.id, username: user.username || '', avatar: user.avatar || '' },
      });
    }

    // Save to history in background (don't await)
    saveToHistory(user);
  };

  return (
    <ThemedView style={styles.container}>
      {/* Grid background */}
      <View style={styles.gridOverlay} pointerEvents="none">
        {Array.from({ length: Math.ceil(width / GRID_SIZE) + 1 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.gridLineV, { left: i * GRID_SIZE }]} />
        ))}
        {Array.from({ length: Math.ceil(screenHeight / GRID_SIZE) + 1 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.gridLineH, { top: i * GRID_SIZE }]} />
        ))}
        <LinearGradient
          colors={['transparent', 'transparent', '#0f0f0f']}
          locations={[0, 0.35, 0.7]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {/* Background shimmer */}
      <View style={styles.backgroundPattern} pointerEvents="none">
        {/* Fixed shimmer band — diagonal gleam */}
        <View style={styles.shimmerBand} pointerEvents="none">
          <LinearGradient
            colors={[
              'transparent',
              'rgba(212, 184, 120, 0.03)',
              'rgba(212, 184, 120, 0.06)',
              'rgba(212, 184, 120, 0.03)',
              'transparent',
            ]}
            locations={[0, 0.37, 0.5, 0.63, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        {/* Secondary fainter shimmer */}
        <View style={styles.shimmerBandSecondary} pointerEvents="none">
          <LinearGradient
            colors={[
              'transparent',
              'rgba(212, 184, 120, 0.035)',
              'transparent',
            ]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>

      <View style={styles.header} />
      <Pressable style={styles.searchContainer} onPress={() => searchInputRef.current?.focus()}>
        <IconSymbol size={18} name="magnifyingglass" color="#666" />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Search users..."
          placeholderTextColor="#555"
          value={searchQuery}
          onChangeText={(text) => handleSearch(text.toLowerCase())}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => {
            handleSearch('');
          }}>
            <IconSymbol size={18} name="xmark.circle.fill" color="#555" />
          </TouchableOpacity>
        )}
      </Pressable>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* History skeleton - only when initially loading */}
        {searchQuery.trim() === '' && loadingHistory && (
          <SkeletonLoader />
        )}

        {/* Recent searches */}
        <View style={{ display: searchQuery.trim() === '' && searchHistory.length > 0 && !loadingHistory ? 'flex' : 'none' }}>
          <View style={styles.historyHeader}>
            <ThemedText style={styles.historyTitle}>Recent</ThemedText>
            <TouchableOpacity onPress={clearHistory}>
              <ThemedText style={styles.clearButton}>Clear All</ThemedText>
            </TouchableOpacity>
          </View>
          {searchHistory.map((user) => {
            const tierBorderColor = calculateTierBorderColor(user.leagueRank, user.valorantRank);
            return (
            <TouchableOpacity
              key={user.id}
              style={styles.historyCard}
              onPress={() => handleUserClick(user)}
              activeOpacity={0.7}
            >
              <View style={styles.historyLeft}>
                <View style={[
                  styles.historyAvatar,
                  tierBorderColor ? { borderWidth: 2, borderColor: tierBorderColor } : {}
                ]}>
                  {isRemoteAvatar(user.avatar) ? (
                    <CachedAvatar uri={user.avatar!} style={styles.historyAvatarImage} />
                  ) : getDefaultAvatarSource(user.avatar) ? (
                    <Image source={getDefaultAvatarSource(user.avatar)!} style={styles.historyAvatarImage} />
                  ) : (
                    <ThemedText style={styles.historyAvatarInitial}>
                      {user.username[0].toUpperCase()}
                    </ThemedText>
                  )}
                </View>
                <ThemedText style={styles.historyUsername}>{user.username}</ThemedText>
              </View>
              <TouchableOpacity
                onPress={(e) => removeFromHistory(user.id, e)}
                style={styles.deleteButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconSymbol size={14} name="xmark" color="#444" />
              </TouchableOpacity>
            </TouchableOpacity>
            );
          })}
        </View>

        {/* Empty history state */}
        {searchQuery.trim() === '' && searchHistory.length === 0 && !loadingHistory && (
          <View style={styles.emptyState}>
            <IconSymbol size={48} name="magnifyingglass" color="#333" />
            <ThemedText style={styles.emptyText}>No recent searches</ThemedText>
            <ThemedText style={styles.emptySubtext}>Search history will appear here</ThemedText>
          </View>
        )}

        {/* Search results skeleton - visible while searching */}
        {searchQuery.trim() !== '' && searching && (
          <SearchResultsSkeletonLoader />
        )}

        {/* Search results */}
        <View style={{ display: searchQuery.trim() !== '' && searchResults.length > 0 && !searching ? 'flex' : 'none' }}>
          {searchResults.map((user) => {
            const tierBorderColor = calculateTierBorderColor(user.leagueRank, user.valorantRank);
            return (
            <TouchableOpacity
              key={user.id}
              style={styles.historyCard}
              onPress={() => handleUserClick(user)}
              activeOpacity={0.7}
            >
              <View style={styles.historyLeft}>
                <View style={[
                  styles.historyAvatar,
                  tierBorderColor ? { borderWidth: 2, borderColor: tierBorderColor } : {}
                ]}>
                  {isRemoteAvatar(user.avatar) ? (
                    <CachedAvatar uri={user.avatar!} style={styles.historyAvatarImage} />
                  ) : getDefaultAvatarSource(user.avatar) ? (
                    <Image source={getDefaultAvatarSource(user.avatar)!} style={styles.historyAvatarImage} />
                  ) : (
                    <ThemedText style={styles.historyAvatarInitial}>
                      {user.username[0].toUpperCase()}
                    </ThemedText>
                  )}
                </View>
                <ThemedText style={styles.historyUsername}>{user.username}</ThemedText>
              </View>
            </TouchableOpacity>
            );
          })}
        </View>

        {/* No results state */}
        {searchQuery.trim() !== '' && !searching && searchResults.length === 0 && (
          <View style={styles.emptyState}>
            <IconSymbol size={48} name="person.slash" color="#333" />
            <ThemedText style={styles.emptyText}>No users found</ThemedText>
            <ThemedText style={styles.emptySubtext}>Try a different search term</ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  backgroundPattern: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  shimmerBand: {
    position: 'absolute',
    top: -screenHeight * 0.35,
    left: -screenWidth * 0.6,
    width: screenWidth * 2.2,
    height: screenHeight * 1.7,
    transform: [{ rotate: '20deg' }],
  },
  shimmerBandSecondary: {
    position: 'absolute',
    top: -screenHeight * 0.2,
    left: -screenWidth * 0.1,
    width: screenWidth * 1.9,
    height: screenHeight * 1.5,
    transform: [{ rotate: '-15deg' }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 61,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#888',
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 184, 120, 0.06)',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212, 184, 120, 0.15)',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    padding: 0,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#555',
    marginTop: 6,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  historyTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  clearButton: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 0,
    marginBottom: 2,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  historyAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 17,
  },
  historyAvatarInitial: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  historyUsername: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    flex: 1,
  },
  deleteButton: {
    padding: 8,
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
});
