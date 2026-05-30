import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { FollowerData, followUser, getFollowers, isFollowing, unfollowUser } from '@/services/followService';
import { useRouter } from '@/hooks/useRouter';
import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { isRemoteAvatar, getDefaultAvatarSource } from '@/utils/resolveAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import CachedImage from '@/components/ui/CachedImage';
import { FollowListSkeleton } from '@/components/ui/Skeleton';

interface Follower {
  id: string;
  username: string;
  avatar?: string;
  isFollowing: boolean;
}

export default function FollowersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchFollowers();
  }, [user?.id]);

  const fetchFollowers = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const followersData = await getFollowers(user.id);
      console.log('Fetched followers data:', followersData);
      console.log('Number of followers:', followersData.length);

      // Check if current user is following each follower
      const followersWithStatus = await Promise.all(
        followersData.map(async (follower: FollowerData) => {
          const following = await isFollowing(user.id, follower.followerId);
          return {
            id: follower.followerId,
            username: follower.followerUsername,
            avatar: follower.followerAvatar,
            isFollowing: following,
          };
        })
      );

      setFollowers(followersWithStatus);
    } catch (error) {
      console.error('Error fetching followers:', error);
      Alert.alert('Error', 'Failed to load followers');
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async (followerId: string, currentlyFollowing: boolean) => {
    if (!user?.id) return;

    try {
      const follower = followers.find(f => f.id === followerId);
      if (!follower) return;

      if (currentlyFollowing) {
        await unfollowUser(user.id, followerId);
      } else {
        await followUser(
          user.id,
          user.username || user.email?.split('@')[0] || 'User',
          user.avatar,
          followerId,
          follower.username,
          follower.avatar
        );
      }

      // Update local state
      setFollowers(prev =>
        prev.map(f =>
          f.id === followerId ? { ...f, isFollowing: !currentlyFollowing } : f
        )
      );
    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
    }
  };

  // Filter followers based on search query
  const filteredFollowers = followers.filter(follower =>
    follower.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ThemedView style={styles.container}>
      {/* Top background gradient */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.02)', 'transparent']}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topGradient}
        pointerEvents="none"
      />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <IconSymbol size={20} name="chevron.left" color="#fff" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Followers</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <IconSymbol size={18} name="magnifyingglass" color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search followers..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <IconSymbol size={18} name="xmark.circle.fill" color="#999" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <FollowListSkeleton count={6} />
        ) : filteredFollowers.length > 0 ? (
          <View style={styles.listContainer}>
            {filteredFollowers.map((follower) => (
              <View key={follower.id} style={styles.followerItem}>
                <TouchableOpacity
                  style={styles.followerLeft}
                  onPress={() => router.push({ pathname: '/profilePages/profileView', params: { userId: follower.id, username: follower.username || '', avatar: follower.avatar || '', preloadedFollowing: follower.isFollowing ? 'true' : '' } })}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatar}>
                    {isRemoteAvatar(follower.avatar) ? (
                      <CachedImage uri={follower.avatar} style={styles.avatarImage} />
                    ) : getDefaultAvatarSource(follower.avatar) ? (
                      <Image source={getDefaultAvatarSource(follower.avatar)!} style={styles.avatarImage} />
                    ) : (
                      <ThemedText style={styles.avatarInitial}>
                        {follower.username[0].toUpperCase()}
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText style={styles.username}>{follower.username}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.followButton,
                    follower.isFollowing && styles.followingButton
                  ]}
                  onPress={() => handleFollowToggle(follower.id, follower.isFollowing)}
                >
                  <ThemedText
                    style={[
                      styles.followButtonText,
                      follower.isFollowing && styles.followingButtonText
                    ]}
                  >
                    {follower.isFollowing ? 'Following' : 'Follow'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <IconSymbol size={64} name={searchQuery ? "magnifyingglass" : "person.2"} color="#72767d" />
            <ThemedText style={styles.emptyStateText}>
              {searchQuery ? 'No results found' : 'No followers yet'}
            </ThemedText>
            <ThemedText style={styles.emptyStateSubtext}>
              {searchQuery
                ? `No followers found matching "${searchQuery}"`
                : 'When people follow you, they\'ll appear here'}
            </ThemedText>
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
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 70,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  backButton: {
    padding: 4,
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    paddingVertical: 0,
  },
  listContainer: {
    paddingVertical: 8,
  },
  followerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: '#1a1a1a',
  },
  followerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  username: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  followButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderRadius: 6,
    width: 85,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  followingButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  followButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  followingButtonText: {
    color: '#b9bbbe',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#b9bbbe',
    textAlign: 'center',
  },
});