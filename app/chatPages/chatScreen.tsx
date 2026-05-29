import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import CachedImage from '@/components/ui/CachedImage';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  InteractionManager,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import {
  sendMessage,
  markMessagesAsRead,
  getChat,
  getInitialMessages,
  getOlderMessages,
  subscribeToNewMessages,
  subscribeToReadStatus,
  createOrGetChat,
  ChatMessage,
  Chat,
  SharedPostData,
} from '@/services/chatService';
import { Timestamp, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user: currentUser } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const hasMarkedInitialRead = useRef(false);

  // Pagination state
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [lastTimestamp, setLastTimestamp] = useState<Timestamp | null>(null);

  const [otherUserHasRead, setOtherUserHasRead] = useState(false);

  const chatIdParam = params.chatId as string | undefined;
  const otherUserId = params.otherUserId as string;
  const otherUsername = params.otherUsername as string;
  const focusInput = params.focusInput === 'true';
  const autoMessage = params.autoMessage as string | undefined;
  const inputRef = useRef<TextInput>(null);
  const autoMessageSent = useRef(false);

  // Resolve chatId: use param if provided, otherwise create/get chat on mount
  const [chatId, setChatId] = useState<string | null>(chatIdParam || null);
  const [resolvingChat, setResolvingChat] = useState(!chatIdParam);

  useEffect(() => {
    if (chatIdParam || chatId) return; // Already have a chatId
    if (!otherUserId || !currentUser?.id) return;

    const resolveChat = async () => {
      try {
        const resolved = await createOrGetChat(
          currentUser.id,
          currentUser.username || currentUser.email?.split('@')[0] || 'User',
          currentUser.avatar,
          otherUserId,
          otherUsername,
          params.otherUserAvatar as string | undefined
        );
        setChatId(resolved);
      } catch (error) {
        console.error('Error resolving chat:', error);
        Alert.alert('Error', 'Failed to start chat');
        router.back();
      } finally {
        setResolvingChat(false);
      }
    };

    // Defer Firestore work until after slide animation completes
    const task = InteractionManager.runAfterInteractions(() => {
      resolveChat();
    });
    return () => task.cancel();
  }, [chatIdParam, otherUserId, currentUser?.id]);

  // Get avatar from chat data (more reliable than URL params)
  const otherUserAvatar = chat?.participantDetails?.[otherUserId]?.avatar || params.otherUserAvatar as string | undefined;

  // Auto-focus input when navigating from message button
  useEffect(() => {
    if (focusInput && !loading) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [focusInput, loading]);

  // Auto-send message (e.g., in-game username from duo match)
  useEffect(() => {
    if (!autoMessage || !chatId || !currentUser?.id || autoMessageSent.current) return;
    autoMessageSent.current = true;
    sendMessage(chatId, currentUser.id, autoMessage).catch(console.error);
  }, [autoMessage, chatId, currentUser?.id]);

  // Load chat details
  useEffect(() => {
    const loadChat = async () => {
      if (!chatId) return;

      try {
        const chatData = await getChat(chatId);
        setChat(chatData);
      } catch (error) {
        console.error('Error loading chat:', error);
      }
    };

    loadChat();
  }, [chatId]);

  // Load initial messages and subscribe to new ones
  useEffect(() => {
    if (!chatId || !currentUser?.id) return;

    let unsubscribe: (() => void) | null = null;

    // Reset state when chatId changes
    hasMarkedInitialRead.current = false;
    setMessages([]);
    setHasMore(true);
    setLastDoc(null);
    setLastTimestamp(null);
    setLoading(true);

    const loadInitialMessages = async () => {
      try {
        // Fetch initial batch of messages
        const result = await getInitialMessages(chatId, 20);

        // Store messages in reverse order (newest first) for FlatList performance
        setMessages([...result.messages].reverse());
        setHasMore(result.hasMore);
        setLastDoc(result.lastDoc);

        // Always mark messages as read when opening a chat
        // This ensures unread count is cleared even if unread messages
        // are beyond the initial batch loaded
        await markMessagesAsRead(chatId, currentUser.id);
        hasMarkedInitialRead.current = true;

        // Get the latest message timestamp for real-time subscription
        if (result.messages.length > 0) {
          const latestTimestamp = result.messages[result.messages.length - 1].timestamp;
          setLastTimestamp(latestTimestamp);

          // Subscribe to new messages after the latest loaded message
          unsubscribe = subscribeToNewMessages(chatId, latestTimestamp, (newMessages) => {
            if (newMessages.length > 0) {
              // Prepend new messages (reversed) since we store newest first
              // Remove optimistic duplicates and filter real duplicates
              setMessages(prev => {
                const existingRealIds = new Set(prev.filter(m => !m.id.startsWith('optimistic_')).map(m => m.id));
                const uniqueNewMessages = newMessages.filter(m => !existingRealIds.has(m.id));
                if (uniqueNewMessages.length === 0) return prev;

                // Remove optimistic messages that match incoming real messages
                const optimisticTexts = new Set(uniqueNewMessages.map(m => `${m.senderId}:${m.text}`));
                const withoutOptimistic = prev.filter(m =>
                  !m.id.startsWith('optimistic_') || !optimisticTexts.has(`${m.senderId}:${m.text}`)
                );

                return [...uniqueNewMessages.reverse(), ...withoutOptimistic];
              });
              setLastTimestamp(newMessages[newMessages.length - 1].timestamp);

              // Mark new messages as read immediately
              markMessagesAsRead(chatId, currentUser.id);

              // Scroll to bottom when new messages arrive (offset 0 in inverted list)
              setTimeout(() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
              }, 100);
            }
          });
        }

      } catch (error) {
        console.error('Error loading initial messages:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialMessages();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [chatId, currentUser?.id]);

  // Subscribe to read status — watch if other user has read messages
  useEffect(() => {
    if (!chatId || !otherUserId) return;

    const unsubscribe = subscribeToReadStatus(chatId, otherUserId, (hasRead) => {
      setOtherUserHasRead(hasRead);
    });

    return () => unsubscribe();
  }, [chatId, otherUserId]);

  // Load older messages when scrolling up
  const loadOlderMessages = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDoc || !chatId) return;

    setLoadingMore(true);
    try {
      const result = await getOlderMessages(chatId, lastDoc, 20);

      // Append older messages to the end (since we store newest first)
      // Filter out duplicates to prevent key conflicts
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const uniqueOlderMessages = result.messages.filter(m => !existingIds.has(m.id));
        return [...prev, ...uniqueOlderMessages.reverse()];
      });
      setHasMore(result.hasMore);
      setLastDoc(result.lastDoc);
    } catch (error) {
      console.error('Error loading older messages:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, lastDoc, chatId]);

  const handleSend = useCallback(async () => {
    if (!messageText.trim() || !chatId || !currentUser?.id) return;

    const text = messageText.trim();
    const optimisticId = `optimistic_${Date.now()}`;

    // Optimistic update — show message instantly
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      senderId: currentUser.id,
      text,
      timestamp: Timestamp.now(),
      type: 'text',
      read: false,
    };
    setMessages(prev => [optimisticMessage, ...prev]);
    setMessageText('');

    try {
      await sendMessage(chatId, currentUser.id, text);
      // Real-time listener will add the real message;
      // remove the optimistic one when that happens (handled in listener)
    } catch (error: any) {
      console.error('Error sending message:', error);
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(msg => msg.id !== optimisticId));
      if (error.message?.includes('too quickly')) {
        Alert.alert('Slow Down', error.message);
      } else {
        Alert.alert('Error', 'Failed to send message. Please try again.');
      }
    }
  }, [messageText, chatId, currentUser?.id]);

  const formatTime = useCallback((timestamp: Timestamp): string => {
    const date = timestamp.toDate();
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 24) {
      // Today - show time
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } else if (diffInHours < 48) {
      // Yesterday
      return 'Yesterday';
    } else if (diffInHours < 168) {
      // This week - show day
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      // Older - show date
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
  }, []);

  // Find the last message sent by current user (to show "Read" on it)
  const lastSentMessageId = useMemo(() => {
    for (const msg of messages) {
      if (msg.senderId === currentUser?.id && !msg.id.startsWith('optimistic_')) {
        return msg.id;
      }
    }
    return null;
  }, [messages, currentUser?.id]);

  const renderMessage = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const isCurrentUser = item.senderId === currentUser?.id;

    // Find the chronologically previous (older) message
    // Since we store newest first, the next item in array is the older message
    const previousMessage = index < messages.length - 1 ? messages[index + 1] : null;

    const showTimestamp =
      !previousMessage ||
      previousMessage.senderId !== item.senderId ||
      item.timestamp.toMillis() - previousMessage.timestamp.toMillis() > 300000; // 5 minutes

    // Show "Read" on the last sent message if the other user has read it
    const showReadReceipt = isCurrentUser && otherUserHasRead && item.id === lastSentMessageId;

    // Shared post card
    if (item.type === 'shared_post' && item.sharedPost) {
      const sp = item.sharedPost;
      const thumbnailUri = sp.postThumbnailUrl || sp.postMediaUrl;

      return (
        <View style={styles.messageContainer}>
          {showTimestamp && (
            <ThemedText style={styles.timestamp}>{formatTime(item.timestamp)}</ThemedText>
          )}
          <TouchableOpacity
            style={[
              styles.sharedPostCard,
              isCurrentUser ? styles.sharedPostCardSent : styles.sharedPostCardReceived,
            ]}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/postViewer', params: { postId: sp.postId } })}
          >
            {/* Post author header */}
            <View style={styles.sharedPostHeader}>
              <View style={styles.sharedPostAvatar}>
                {sp.postAvatar && sp.postAvatar.startsWith('http') ? (
                  <Image source={{ uri: sp.postAvatar }} style={styles.sharedPostAvatarImage} />
                ) : (
                  <ThemedText style={styles.sharedPostAvatarInitial}>
                    {sp.postUsername?.[0]?.toUpperCase() || 'U'}
                  </ThemedText>
                )}
              </View>
              <ThemedText style={styles.sharedPostUsername} numberOfLines={1}>
                {sp.postUsername}
              </ThemedText>
            </View>

            {/* Caption preview */}
            {sp.postCaption ? (
              <ThemedText style={styles.sharedPostCaption} numberOfLines={2}>
                {sp.postCaption}
              </ThemedText>
            ) : null}

            {/* Thumbnail */}
            {thumbnailUri ? (
              <View style={styles.sharedPostThumbnailContainer}>
                <Image source={{ uri: thumbnailUri }} style={styles.sharedPostThumbnail} resizeMode="cover" />
                {sp.postMediaType === 'video' && (
                  <View style={styles.sharedPostPlayIcon}>
                    <IconSymbol size={32} name="play.fill" color="#fff" />
                  </View>
                )}
              </View>
            ) : null}

            {/* User message */}
            {item.text && item.text !== `Shared a post by @${sp.postUsername}` ? (
              <ThemedText style={styles.sharedPostMessage}>{item.text}</ThemedText>
            ) : null}
          </TouchableOpacity>
          {showReadReceipt && (
            <ThemedText style={styles.readReceipt}>Read</ThemedText>
          )}
        </View>
      );
    }

    // Game username card
    if (item.type === 'game_username' && item.gameUsername) {
      const gu = item.gameUsername;
      const gameIcon = gu.game === 'valorant'
        ? require('@/assets/images/valorant-red.png')
        : require('@/assets/images/lol-icon.png');
      const gameLabel = gu.game === 'valorant' ? 'Valorant' : 'League of Legends';

      return (
        <View style={styles.messageContainer}>
          {showTimestamp && (
            <ThemedText style={styles.timestamp}>{formatTime(item.timestamp)}</ThemedText>
          )}
          <TouchableOpacity
            style={[
              styles.gameUsernameCard,
              isCurrentUser ? styles.gameUsernameCardSent : styles.gameUsernameCardReceived,
            ]}
            activeOpacity={0.7}
            onPress={async () => {
              await Clipboard.setStringAsync(gu.inGameName);
              Alert.alert('Copied!', `${gu.inGameName} copied to clipboard`);
            }}
          >
            <View style={styles.gameUsernameHeader}>
              <Image source={gameIcon} style={styles.gameUsernameIcon} resizeMode="contain" />
              <ThemedText style={styles.gameUsernameLabel}>{gameLabel} Username</ThemedText>
            </View>
            <ThemedText style={styles.gameUsernameText}>{gu.inGameName}</ThemedText>
            <View style={styles.gameUsernameCopyRow}>
              <IconSymbol size={12} name="doc.on.doc" color="#8B7FE8" />
              <ThemedText style={styles.gameUsernameCopyText}>Tap to copy</ThemedText>
            </View>
          </TouchableOpacity>
          {showReadReceipt && (
            <ThemedText style={styles.readReceipt}>Read</ThemedText>
          )}
        </View>
      );
    }

    return (
      <View style={styles.messageContainer}>
        {showTimestamp && (
          <ThemedText style={styles.timestamp}>{formatTime(item.timestamp)}</ThemedText>
        )}
        <View
          style={[
            styles.messageBubble,
            isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble,
          ]}
        >
          <ThemedText
            selectable={true}
            style={[
              styles.messageText,
              isCurrentUser ? styles.currentUserText : styles.otherUserText,
            ]}
          >
            {item.text}
          </ThemedText>
        </View>
        {showReadReceipt && (
          <ThemedText style={styles.readReceipt}>Read</ThemedText>
        )}
      </View>
    );
  }, [currentUser?.id, messages, formatTime, lastSentMessageId, otherUserHasRead, router]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={-15}
    >
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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol size={20} name="chevron.left" color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerUser}
          onPress={() => router.push({ pathname: '/profilePages/profileView', params: { userId: otherUserId, username: otherUsername || '', avatar: otherUserAvatar || '' } })}
        >
          <View style={styles.headerAvatar}>
            {otherUserAvatar && otherUserAvatar.startsWith('http') ? (
              <CachedImage uri={otherUserAvatar} style={styles.avatarImage} />
            ) : (
              <ThemedText style={styles.avatarInitial}>
                {otherUsername?.[0]?.toUpperCase() || 'U'}
              </ThemedText>
            )}
          </View>
          <ThemedText style={styles.headerUsername}>{otherUsername}</ThemedText>
        </TouchableOpacity>

        <View style={styles.headerSpacer} />
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onEndReached={loadOlderMessages}
          onEndReachedThreshold={0.5}
          inverted={true}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={10}
          initialNumToRender={20}
          ListHeaderComponent={
            loadingMore ? (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color="#fff" />
                <ThemedText style={styles.loadingMoreText}>Loading older messages...</ThemedText>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <IconSymbol size={64} name="bubble.left.and.bubble.right" color="#2a2a2a" />
              <ThemedText style={styles.emptyText}>No messages yet</ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Start the conversation with {otherUsername}
              </ThemedText>
            </View>
          }
        />
      )}

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          value={messageText}
          onChangeText={setMessageText}
          multiline
          maxLength={500}
          autoCorrect={true}
          spellCheck={true}
          autoCapitalize="sentences"
        />
        <TouchableOpacity
          style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!messageText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <IconSymbol
              size={20}
              name="arrow.up"
              color={messageText.trim() ? '#fff' : '#888'}
            />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
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
  headerUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerSpacer: {
    width: 44,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: 12,
  },
  timestamp: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    marginBottom: 8,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  currentUserBubble: {
    backgroundColor: '#8B6914',
    alignSelf: 'flex-end',
  },
  otherUserBubble: {
    backgroundColor: '#1a1a1a',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  currentUserText: {
    color: '#fff',
  },
  otherUserText: {
    color: '#fff',
  },
  readReceipt: {
    fontSize: 11,
    color: '#888',
    alignSelf: 'flex-end',
    marginTop: 2,
    marginRight: 4,
  },
  // Game Username Card
  gameUsernameCard: {
    maxWidth: '75%',
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: 1,
  },
  gameUsernameCardSent: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(139, 127, 232, 0.1)',
    borderColor: 'rgba(139, 127, 232, 0.25)',
  },
  gameUsernameCardReceived: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(139, 127, 232, 0.1)',
    borderColor: 'rgba(139, 127, 232, 0.25)',
  },
  gameUsernameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gameUsernameIcon: {
    width: 18,
    height: 18,
  },
  gameUsernameLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  gameUsernameText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  gameUsernameCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  gameUsernameCopyText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#8B7FE8',
  },
  sharedPostCard: {
    maxWidth: '75%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  sharedPostCardSent: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a1a1a',
  },
  sharedPostCardReceived: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a1a',
  },
  sharedPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  sharedPostAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2c2f33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedPostAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  sharedPostAvatarInitial: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  sharedPostUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  sharedPostCaption: {
    fontSize: 13,
    color: '#ccc',
    paddingHorizontal: 10,
    paddingBottom: 8,
    lineHeight: 18,
  },
  sharedPostThumbnailContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  sharedPostThumbnail: {
    width: '100%',
    height: '100%',
  },
  sharedPostPlayIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sharedPostMessage: {
    fontSize: 14,
    color: '#fff',
    padding: 10,
    lineHeight: 19,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 30,
    backgroundColor: '#0f0f0f',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#fff',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    borderColor: '#555',
  },
  loadingMoreContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 13,
    color: '#8e8e8e',
  },
});
