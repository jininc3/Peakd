import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Skeleton } from '@/components/ui/Skeleton';
import CachedImage from '@/components/ui/CachedImage';
import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Modal,
  Image,
} from 'react-native';
import { useRouter } from '@/hooks/useRouter';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToUserChats, Chat } from '@/services/chatService';
import { getFollowing, FollowingData } from '@/services/followService';
import { Timestamp } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { isRemoteAvatar, getDefaultAvatarSource } from '@/utils/resolveAvatar';

export default function ChatListScreen() {
  const router = useRouter();
  const { user: currentUser, isUserBlocked } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [filteredChats, setFilteredChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // New message modal state
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [following, setFollowing] = useState<FollowingData[]>([]);
  const [filteredFollowing, setFilteredFollowing] = useState<FollowingData[]>([]);
  const [newMessageSearch, setNewMessageSearch] = useState('');
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);

  // Subscribe to user's chats
  useEffect(() => {
    if (!currentUser?.id) return;

    const unsubscribe = subscribeToUserChats(currentUser.id, (userChats) => {
      const filtered = userChats.filter(chat => {
        const otherUserId = chat.participants.find((id: string) => id !== currentUser?.id);
        return !otherUserId || !isUserBlocked(otherUserId);
      });
      setChats(filtered);
      setFilteredChats(filtered);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser?.id]);

  // Filter chats based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredChats(chats);
    } else {
      const filtered = chats.filter((chat) => {
        const otherUser = getOtherUser(chat);
        if (!otherUser) return false;
        return otherUser.username.toLowerCase().includes(searchQuery.toLowerCase());
      });
      setFilteredChats(filtered);
    }
  }, [searchQuery, chats]);

  // Fetch following list when modal opens
  useEffect(() => {
    if (showNewMessageModal && currentUser?.id) {
      fetchFollowing();
    }
  }, [showNewMessageModal, currentUser?.id]);

  // Filter following based on search
  useEffect(() => {
    if (newMessageSearch.trim() === '') {
      setFilteredFollowing(following);
    } else {
      const filtered = following.filter((user) =>
        user.followingUsername.toLowerCase().includes(newMessageSearch.toLowerCase())
      );
      setFilteredFollowing(filtered);
    }
  }, [newMessageSearch, following]);

  const fetchFollowing = async () => {
    if (!currentUser?.id) return;
    setLoadingFollowing(true);
    try {
      const followingList = await getFollowing(currentUser.id);
      setFollowing(followingList);
      setFilteredFollowing(followingList);
    } catch (error) {
      console.error('Error fetching following:', error);
    } finally {
      setLoadingFollowing(false);
    }
  };

  const getOtherUser = (chat: Chat) => {
    const otherUserId = chat.participants.find((id) => id !== currentUser?.id);
    return otherUserId ? chat.participantDetails[otherUserId] : null;
  };

  const formatTime = (timestamp: Timestamp): string => {
    const date = timestamp.toDate();
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) return 'now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInHours < 24) return `${diffInHours}h`;
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleChatPress = (chat: Chat) => {
    const otherUser = getOtherUser(chat);
    if (!otherUser) return;

    const otherUserId = chat.participants.find((id) => id !== currentUser?.id);

    router.push({
      pathname: '/chatPages/chatScreen',
      params: {
        chatId: chat.id,
        otherUserId: otherUserId || '',
        otherUsername: otherUser.username,
        otherUserAvatar: otherUser.avatar || '',
      },
    });
  };

  const handleSelectUser = (user: FollowingData) => {
    if (!currentUser?.id) return;

    setShowNewMessageModal(false);
    setNewMessageSearch('');

    router.push({
      pathname: '/chatPages/chatScreen',
      params: {
        otherUserId: user.followingId,
        otherUsername: user.followingUsername,
        otherUserAvatar: user.followingAvatar || '',
      },
    });
  };

  const renderChat = ({ item }: { item: Chat }) => {
    const otherUser = getOtherUser(item);
    if (!otherUser) return null;

    const unreadCount = currentUser?.id ? item.unreadCount[currentUser.id] || 0 : 0;
    const isUnread = unreadCount > 0;

    // Format message preview
    let messagePreview = '';
    if (isUnread && unreadCount > 1) {
      messagePreview = `${unreadCount}+ new messages`;
    } else if (item.lastMessage) {
      if (item.lastMessageSenderId === currentUser?.id) {
        messagePreview = `You: ${item.lastMessage}`;
      } else {
        messagePreview = item.lastMessage;
      }
    } else {
      messagePreview = 'Start a conversation';
    }

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => handleChatPress(item)}
        activeOpacity={0.6}
      >
        {/* Avatar with optional story ring */}
        <View style={styles.avatarContainer}>
          {isUnread ? (
            <LinearGradient
              colors={['#F58529', '#DD2A7B', '#8134AF', '#515BD4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.storyRing}
            >
              <View style={styles.avatarInner}>
                {otherUser.avatar && otherUser.avatar.startsWith('http') ? (
                  <CachedImage uri={otherUser.avatar} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <ThemedText style={styles.avatarInitial}>
                      {otherUser.username?.[0]?.toUpperCase() || 'U'}
                    </ThemedText>
                  </View>
                )}
              </View>
            </LinearGradient>
          ) : (
            <View style={styles.avatarWrapper}>
              {otherUser.avatar && otherUser.avatar.startsWith('http') ? (
                <CachedImage uri={otherUser.avatar} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <ThemedText style={styles.avatarInitial}>
                    {otherUser.username?.[0]?.toUpperCase() || 'U'}
                  </ThemedText>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Chat Content */}
        <View style={styles.chatContent}>
          <ThemedText style={[styles.username, isUnread && styles.unreadUsername]}>
            {otherUser.username}
          </ThemedText>
          <ThemedText style={[styles.messagePreview, isUnread && styles.unreadMessage]} numberOfLines={1}>
            {messagePreview}
            {item.lastMessageTimestamp && (
              <ThemedText style={styles.timestamp}> · {formatTime(item.lastMessageTimestamp)}</ThemedText>
            )}
          </ThemedText>
        </View>

        {/* Right side - unread dot */}
        <View style={styles.rightSection}>
          {isUnread && <View style={styles.unreadDot} />}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSuggestedUser = ({ item }: { item: FollowingData }) => (
    <TouchableOpacity
      style={styles.suggestedUserItem}
      onPress={() => handleSelectUser(item)}
      activeOpacity={0.6}
      disabled={creatingChat}
    >
      <View style={styles.suggestedAvatarWrapper}>
        {isRemoteAvatar(item.followingAvatar) ? (
          <CachedImage uri={item.followingAvatar} style={styles.suggestedAvatar} />
        ) : getDefaultAvatarSource(item.followingAvatar) ? (
          <Image source={getDefaultAvatarSource(item.followingAvatar)!} style={styles.suggestedAvatar} />
        ) : (
          <View style={styles.suggestedAvatarPlaceholder}>
            <ThemedText style={styles.suggestedAvatarInitial}>
              {item.followingUsername?.[0]?.toUpperCase() || 'U'}
            </ThemedText>
          </View>
        )}
      </View>
      <View style={styles.suggestedUserInfo}>
        <ThemedText style={styles.suggestedUsername}>{item.followingUsername}</ThemedText>
      </View>
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Purple shimmer background */}
      <View style={styles.backgroundGlow} pointerEvents="none">
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
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol size={20} name="chevron.left" color="#fff" />
        </TouchableOpacity>
        <ThemedText style={styles.headerUsername}>{currentUser?.username || 'User'}</ThemedText>
        <TouchableOpacity style={styles.composeButton} onPress={() => setShowNewMessageModal(true)}>
          <IconSymbol size={24} name="square.and.pencil" color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <IconSymbol size={16} name="magnifyingglass" color="#555" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor="#8e8e8e"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Messages Header */}
      <View style={styles.messagesHeader}>
        <ThemedText style={styles.messagesTitle}>Messages</ThemedText>
      </View>

      {/* Chat List */}
      {loading ? (
        <View style={styles.chatList}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.chatItem}>
              <View style={styles.avatarContainer}>
                <Skeleton width={44} height={44} borderRadius={22} />
              </View>
              <View style={styles.chatContent}>
                <Skeleton width={100} height={14} borderRadius={4} />
                <Skeleton width={180} height={12} borderRadius={4} style={{ marginTop: 6 }} />
              </View>
            </View>
          ))}
        </View>
      ) : chats.length > 0 ? (
        <FlatList
          data={filteredChats}
          renderItem={renderChat}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.chatList}
          ListEmptyComponent={
            searchQuery.trim() !== '' ? (
              <View style={styles.emptySearchState}>
                <ThemedText style={styles.emptySearchText}>No results found</ThemedText>
              </View>
            ) : null
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <IconSymbol size={64} name="bubble.left.and.bubble.right" color="#2a2a2a" />
          <ThemedText style={styles.emptyTitle}>No messages yet</ThemedText>
          <ThemedText style={styles.emptySubtext}>
            Start a conversation by tapping the compose button
          </ThemedText>
        </View>
      )}

      {/* New Message Modal */}
      <Modal
        visible={showNewMessageModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNewMessageModal(false)}
      >
        <View style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalBackButton}
              onPress={() => {
                setShowNewMessageModal(false);
                setNewMessageSearch('');
              }}
            >
              <IconSymbol size={20} name="chevron.left" color="#fff" />
            </TouchableOpacity>
            <ThemedText style={styles.modalTitle}>New message</ThemedText>
            <View style={styles.modalHeaderSpacer} />
          </View>

          {/* Search Bar */}
          <View style={styles.modalSearchContainer}>
            <ThemedText style={styles.toLabel}>To:</ThemedText>
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search"
              placeholderTextColor="#8e8e8e"
              value={newMessageSearch}
              onChangeText={setNewMessageSearch}
              autoFocus
            />
          </View>

          {/* Suggested Users */}
          <View style={styles.suggestedSection}>
            <ThemedText style={styles.suggestedTitle}>Suggested</ThemedText>
          </View>

          {loadingFollowing ? (
            <View style={styles.suggestedList}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={styles.suggestedUserItem}>
                  <View style={styles.suggestedAvatarWrapper}>
                    <Skeleton width={44} height={44} borderRadius={22} />
                  </View>
                  <View style={styles.suggestedUserInfo}>
                    <Skeleton width={120} height={14} borderRadius={4} />
                  </View>
                </View>
              ))}
            </View>
          ) : filteredFollowing.length > 0 ? (
            <FlatList
              data={filteredFollowing}
              renderItem={renderSuggestedUser}
              keyExtractor={(item) => item.followingId}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.suggestedList}
            />
          ) : (
            <View style={styles.noSuggestionsContainer}>
              <ThemedText style={styles.noSuggestionsText}>
                {newMessageSearch.trim() !== ''
                  ? 'No users found'
                  : "You're not following anyone yet"}
              </ThemedText>
            </View>
          )}

          {creatingChat && (
            <View style={styles.creatingChatOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
        </View>
      </Modal>
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
    top: -200,
    left: -300,
    width: 800,
    height: 600,
    transform: [{ rotate: '20deg' }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerUsername: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  composeButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  messagesHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  messagesTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    padding: 0,
  },
  chatList: {
    paddingBottom: 20,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  avatarContainer: {
    marginRight: 12,
  },
  storyRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#0f0f0f',
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  chatContent: {
    flex: 1,
    justifyContent: 'center',
  },
  username: {
    fontSize: 14,
    fontWeight: '400',
    color: '#fff',
    marginBottom: 2,
  },
  unreadUsername: {
    fontWeight: '600',
  },
  messagePreview: {
    fontSize: 13,
    color: '#8e8e8e',
  },
  unreadMessage: {
    color: '#fff',
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 13,
    color: '#8e8e8e',
    fontWeight: '400',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3897f0',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8e8e8e',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptySearchState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptySearchText: {
    fontSize: 14,
    color: '#8e8e8e',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
  },
  modalBackButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modalHeaderSpacer: {
    width: 40,
  },
  modalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
  },
  toLabel: {
    fontSize: 16,
    color: '#fff',
    marginRight: 12,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    padding: 0,
  },
  suggestedSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  suggestedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  suggestedList: {
    paddingBottom: 20,
  },
  suggestedUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  suggestedAvatarWrapper: {
    marginRight: 12,
  },
  suggestedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  suggestedAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestedAvatarInitial: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  suggestedUserInfo: {
    flex: 1,
  },
  suggestedUsername: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  noSuggestionsContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
  },
  noSuggestionsText: {
    fontSize: 14,
    color: '#8e8e8e',
  },
  creatingChatOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
