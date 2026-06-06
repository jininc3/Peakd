import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { getUserChats, Chat, createOrGetChat, sendMessage, SharedPostData } from '@/services/chatService';
import { getFollowing, FollowingData } from '@/services/followService';
import { useRouter } from '@/hooks/useRouter';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface ShareUser {
  id: string;
  username: string;
  avatar?: string;
}

interface SharePostModalProps {
  visible: boolean;
  postId: string;
  postUsername: string;
  postAvatar?: string;
  postMediaUrl?: string;
  postThumbnailUrl?: string;
  postCaption?: string;
  postMediaType?: 'image' | 'video';
  onClose: () => void;
  onUserPress?: (userId: string, username?: string, avatar?: string) => void;
}

export default function SharePostModal({
  visible,
  postId,
  postUsername,
  postAvatar,
  postMediaUrl,
  postThumbnailUrl,
  postCaption,
  postMediaType = 'image',
  onClose,
  onUserPress,
}: SharePostModalProps) {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [recentUsers, setRecentUsers] = useState<ShareUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<ShareUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const translateY = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const startY = useSharedValue(0);

  useEffect(() => {
    if (visible && currentUser?.id) {
      translateY.value = 0;
      scrollOffset.value = 0;
      setSearchQuery('');
      setSelectedUsers(new Set());
      setMessageText('');
      setSending(false);
      setSent(false);
      setLinkCopied(false);
      fetchUsers();
    }
  }, [visible, currentUser?.id]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      setFilteredUsers(
        recentUsers.filter((u) => u.username.toLowerCase().includes(query))
      );
    } else {
      setFilteredUsers(recentUsers);
    }
  }, [searchQuery, recentUsers]);

  const fetchUsers = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const [chats, following] = await Promise.all([
        getUserChats(currentUser.id),
        getFollowing(currentUser.id),
      ]);

      const userMap = new Map<string, ShareUser>();

      for (const chat of chats) {
        for (const [uid, details] of Object.entries(chat.participantDetails)) {
          if (uid !== currentUser.id) {
            userMap.set(uid, {
              id: uid,
              username: details.username,
              avatar: details.avatar,
            });
          }
        }
      }

      for (const f of following) {
        if (!userMap.has(f.followingId)) {
          userMap.set(f.followingId, {
            id: f.followingId,
            username: f.followingUsername,
            avatar: f.followingAvatar,
          });
        }
      }

      setRecentUsers(Array.from(userMap.values()));
    } catch (error) {
      console.error('Error fetching users for share:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const toggleUserSelection = (user: ShareUser) => {
    if (sent) return;
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(user.id)) {
        next.delete(user.id);
      } else {
        next.add(user.id);
      }
      return next;
    });
  };

  const handleSend = async () => {
    if (!currentUser?.id || selectedUsers.size === 0 || sending) return;

    setSending(true);
    try {
      const text = messageText.trim() || `Shared a post by @${postUsername}`;

      const sharedPostData: SharedPostData = {
        postId,
        postUsername,
        postAvatar,
        postMediaUrl: postMediaUrl || '',
        postThumbnailUrl: postThumbnailUrl,
        postCaption: postCaption,
        postMediaType,
      };

      const selectedUserList = recentUsers.filter((u) => selectedUsers.has(u.id));

      await Promise.all(
        selectedUserList.map(async (user) => {
          const chatId = await createOrGetChat(
            currentUser.id,
            currentUser.username,
            currentUser.avatar,
            user.id,
            user.username,
            user.avatar
          );
          await sendMessage(chatId, currentUser.id, text, 'shared_post', sharedPostData);
        })
      );

      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send post');
      setSending(false);
    }
  };

  const handleCopyLink = async () => {
    const shareLink = `https://peakd.app/post/${postId}`;
    await Clipboard.setStringAsync(shareLink);
    setLinkCopied(true);
  };

  const handleShareTo = async () => {
    const shareLink = `https://peakd.app/post/${postId}`;
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { url: shareLink }
          : { message: shareLink }
      );
    } catch (error) {
      // User cancelled
    }
  };

  // Pan gesture for dragging modal down
  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => {
      'worklet';
      startY.value = e.allTouches[0].absoluteY;
    })
    .onTouchesMove((e, stateManager) => {
      'worklet';
      const dy = e.allTouches[0].absoluteY - startY.value;
      if (scrollOffset.value <= 1 && dy > 8) {
        stateManager.activate();
      } else if (dy < -8 || scrollOffset.value > 1) {
        stateManager.fail();
      }
    })
    .onUpdate((e) => {
      'worklet';
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 100 || e.velocityY > 500) {
        translateY.value = withTiming(600, { duration: 200 }, () => {
          runOnJS(handleClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const numColumns = 3;
  const hasSelection = selectedUsers.size > 0;

  const renderUserItem = (item: ShareUser) => {
    const isSelected = selectedUsers.has(item.id);

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.userItem}
        onPress={() => toggleUserSelection(item)}
        activeOpacity={0.7}
        disabled={sent}
      >
        <View style={styles.userAvatarWrapper}>
          <View style={[styles.userAvatar, isSelected && styles.userAvatarSelected]}>
            {item.avatar && item.avatar.startsWith('http') ? (
              <Image source={{ uri: item.avatar }} style={styles.userAvatarImage} />
            ) : (
              <ThemedText style={styles.userAvatarInitial}>
                {item.username?.[0]?.toUpperCase() || 'U'}
              </ThemedText>
            )}
          </View>
          {isSelected && (
            <View style={styles.selectedBadge}>
              <IconSymbol size={12} name="checkmark" color="#fff" />
            </View>
          )}
        </View>
        <ThemedText style={[styles.userItemUsername, isSelected && styles.userItemUsernameSelected]} numberOfLines={1}>
          {item.username}
        </ThemedText>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={handleClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.modalContainer, animatedStyle]}>
              {/* Drag Handle */}
              <View style={styles.dragHandleContainer}>
                <View style={styles.dragHandle} />
              </View>

              {/* Search Bar */}
              <View style={styles.searchContainer}>
                <View style={styles.searchInputWrapper}>
                  <IconSymbol size={18} name="magnifyingglass" color="#888" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search"
                    placeholderTextColor="#888"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <IconSymbol size={16} name="xmark.circle.fill" color="#555" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* User Grid */}
              <ScrollView
                style={styles.userGridContainer}
                showsVerticalScrollIndicator={false}
                onScroll={(e) => {
                  scrollOffset.value = e.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
              >
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#D4B878" />
                  </View>
                ) : filteredUsers.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <ThemedText style={styles.emptyText}>
                      {searchQuery ? 'No users found' : 'No recent conversations'}
                    </ThemedText>
                  </View>
                ) : (
                  <View style={styles.userGridContent}>
                    {(() => {
                      const rows = [];
                      for (let i = 0; i < filteredUsers.length; i += numColumns) {
                        const rowItems = filteredUsers.slice(i, i + numColumns);
                        rows.push(
                          <View key={i} style={styles.userGridRow}>
                            {rowItems.map((item) => renderUserItem(item))}
                            {rowItems.length < numColumns &&
                              Array.from({ length: numColumns - rowItems.length }).map((_, j) => (
                                <View key={`empty-${j}`} style={styles.userItem} />
                              ))
                            }
                          </View>
                        );
                      }
                      return rows;
                    })()}
                  </View>
                )}
              </ScrollView>

              {/* Bottom: toggles between action row and message+send */}
              {hasSelection ? (
                <View style={styles.messageSection}>
                  <View style={styles.messageInputRow}>
                    <TextInput
                      style={styles.messageInput}
                      placeholder="Write a message..."
                      placeholderTextColor="#888"
                      value={messageText}
                      onChangeText={setMessageText}
                      editable={!sending && !sent}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.sendButton, sent && styles.sendButtonSent]}
                    onPress={handleSend}
                    activeOpacity={0.7}
                    disabled={sending || sent}
                  >
                    {sending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <ThemedText style={styles.sendButtonText}>
                        {sent ? 'Sent' : 'Send'}
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.actionItem} onPress={handleCopyLink} activeOpacity={0.7}>
                    <View style={[styles.actionIconContainer, linkCopied && styles.actionIconContainerActive]}>
                      <IconSymbol size={24} name={linkCopied ? "checkmark" : "link"} color="#fff" />
                    </View>
                    <ThemedText style={styles.actionLabel}>{linkCopied ? 'Copied' : 'Copy link'}</ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionItem} onPress={handleShareTo} activeOpacity={0.7}>
                    <View style={styles.actionIconContainer}>
                      <IconSymbol size={24} name="square.and.arrow.up" color="#fff" />
                    </View>
                    <ThemedText style={styles.actionLabel}>Share to...</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  keyboardAvoid: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalContainer: {
    height: screenHeight * 0.5,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#555',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    padding: 0,
  },
  userGridContainer: {
    flex: 1,
  },
  userGridContent: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  userGridRow: {
    flexDirection: 'row',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
  userItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    maxWidth: screenWidth / 3,
  },
  userAvatarWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  userAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2c2f33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarSelected: {
    borderWidth: 2,
    borderColor: '#D4B878',
  },
  userAvatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  userAvatarInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  selectedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#D4B878',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1a1a1a',
  },
  userItemUsername: {
    fontSize: 12,
    color: '#ccc',
    textAlign: 'center',
    maxWidth: 90,
  },
  userItemUsernameSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  messageSection: {
    paddingHorizontal: 16,
    paddingBottom: 34,
  },
  messageInputRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 20,
  },
  messageInput: {
    color: '#fff',
    fontSize: 15,
  },
  sendButton: {
    backgroundColor: '#D4B878',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendButtonSent: {
    backgroundColor: '#4CAF50',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingBottom: 34,
    gap: 24,
    justifyContent: 'center',
  },
  actionItem: {
    alignItems: 'center',
    gap: 6,
    minWidth: 70,
  },
  actionIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconContainerActive: {
    backgroundColor: '#D4B878',
  },
  actionLabel: {
    fontSize: 11,
    color: '#ccc',
  },
});
