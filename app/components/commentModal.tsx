import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { addComment, deleteComment, getComments, CommentData } from '@/services/commentService';
import { useRouter } from '@/hooks/useRouter';
import { isRemoteAvatar, getDefaultAvatarSource } from '@/utils/resolveAvatar';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

interface CommentModalProps {
  visible: boolean;
  postId: string;
  postOwnerId: string;
  postThumbnail?: string;
  onClose: () => void;
  onCommentAdded?: () => void;
}

export default function CommentModal({
  visible,
  postId,
  postOwnerId,
  postThumbnail,
  onClose,
  onCommentAdded,
}: CommentModalProps) {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [navigatingAway, setNavigatingAway] = useState(false);

  const translateY = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const startY = useSharedValue(0);
  const panGestureRef = useRef(null);

  // Fetch comments when modal opens
  useEffect(() => {
    if (visible && postId) {
      translateY.value = 0;
      scrollOffset.value = 0;
      fetchComments();
      setIsInputFocused(false);
      setNavigatingAway(false);
    } else if (!visible) {
      setIsInputFocused(false);
    }
  }, [visible, postId]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Pan gesture to drag the modal sheet down when ScrollView is at top
  // Uses manualActivation so we can decide at the native level:
  //   - At top + swipe down → activate pan (drag modal)
  //   - Otherwise → fail pan (let ScrollView scroll)
  const panGesture = Gesture.Pan()
    .withRef(panGestureRef)
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

  const fetchComments = async () => {
    setLoading(true);
    try {
      const fetchedComments = await getComments(postId);
      setComments(fetchedComments);
    } catch (error) {
      console.error('Error fetching comments:', error);
      Alert.alert('Error', 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!currentUser?.id) {
      Alert.alert('Error', 'You must be logged in to comment');
      return;
    }

    const trimmedText = commentText.trim();
    if (!trimmedText) {
      Alert.alert('Error', 'Comment cannot be empty');
      return;
    }

    if (trimmedText.length > 500) {
      Alert.alert('Error', 'Comment is too long (max 500 characters)');
      return;
    }

    setSubmitting(true);

    try {
      await addComment(
        currentUser.id,
        currentUser.username || currentUser.email?.split('@')[0] || 'User',
        currentUser.avatar,
        postId,
        postOwnerId,
        trimmedText,
        postThumbnail
      );

      // Clear input and refresh comments
      setCommentText('');
      await fetchComments();

      // Notify parent component
      if (onCommentAdded) {
        onCommentAdded();
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      Alert.alert('Error', 'Failed to add comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteComment(commentId, postId);
              await fetchComments();

              // Notify parent component
              if (onCommentAdded) {
                onCommentAdded();
              }
            } catch (error) {
              console.error('Error deleting comment:', error);
              Alert.alert('Error', 'Failed to delete comment');
            }
          },
        },
      ]
    );
  };

  const formatTimeAgo = (timestamp: any): string => {
    const now = new Date();
    const commentDate = timestamp.toDate();
    const diffInSeconds = Math.floor((now.getTime() - commentDate.getTime()) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return commentDate.toLocaleDateString();
  };

  return (
    <Modal
      visible={visible}
      animationType={navigatingAway ? 'none' : 'slide'}
      transparent={true}
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.modalOverlay}>
        <Animated.View
          style={[
            styles.modalContent,
            {
              height: isInputFocused ? '95%' : '70%',
            },
            animatedStyle,
          ]}
        >
          {/* Ambient background glow (matches homepage) */}
          <View style={styles.backgroundGlow} pointerEvents="none">
            <View style={styles.shimmerBand} pointerEvents="none">
              <LinearGradient
                colors={[
                  'transparent',
                  'rgba(255, 255, 255, 0.03)',
                  'rgba(255, 255, 255, 0.065)',
                  'rgba(255, 255, 255, 0.03)',
                  'transparent',
                ]}
                locations={[0, 0.37, 0.5, 0.63, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
            <View style={styles.shimmerBandSecondary} pointerEvents="none">
              <LinearGradient
                colors={[
                  'transparent',
                  'rgba(255, 255, 255, 0.035)',
                  'transparent',
                ]}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </View>

          <KeyboardAvoidingView
            style={styles.container}
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 40}
          >
            <GestureDetector gesture={panGesture}>
              <Animated.View style={{ flex: 1 }}>
                <View style={styles.dragHandle} />

                {/* Header */}
                <View style={styles.header}>
                  <ThemedText style={styles.headerTitle}>Comments</ThemedText>
                </View>

                {/* Comments List */}
                <ScrollView
                  style={styles.commentsList}
                  contentContainerStyle={styles.commentsListContent}
                  keyboardShouldPersistTaps="handled"
                  bounces={false}
                  overScrollMode="never"
                  waitFor={panGestureRef}
                  onScroll={(e) => {
                    scrollOffset.value = e.nativeEvent.contentOffset.y;
                  }}
                  scrollEventThrottle={16}
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#fff" />
                      <ThemedText style={styles.loadingText}>Loading comments...</ThemedText>
                    </View>
                  ) : comments.length > 0 ? (
                    comments.map((comment) => (
                      <View key={comment.id} style={styles.commentItem}>
                        <TouchableOpacity
                          style={styles.commentAvatar}
                          disabled={currentUser?.id === comment.userId}
                          onPress={() => {
                            setNavigatingAway(true);
                            setTimeout(() => {
                              onClose();
                              router.push({ pathname: '/profilePages/profileView', params: { userId: comment.userId, username: comment.username, avatar: comment.userAvatar || '' } });
                            }, 0);
                          }}
                        >
                          {isRemoteAvatar(comment.userAvatar) ? (
                            <Image source={{ uri: comment.userAvatar }} style={styles.avatarImage} />
                          ) : getDefaultAvatarSource(comment.userAvatar) ? (
                            <Image source={getDefaultAvatarSource(comment.userAvatar)!} style={styles.avatarImage} />
                          ) : (
                            <ThemedText style={styles.avatarInitial}>
                              {comment.username[0].toUpperCase()}
                            </ThemedText>
                          )}
                        </TouchableOpacity>

                        <View style={styles.commentContent}>
                          <View style={styles.commentHeader}>
                            <View style={styles.commentHeaderLeft}>
                              <TouchableOpacity
                                disabled={currentUser?.id === comment.userId}
                                onPress={() => {
                                  setNavigatingAway(true);
                                  setTimeout(() => {
                                    onClose();
                                    router.push({ pathname: '/profilePages/profileView', params: { userId: comment.userId, username: comment.username, avatar: comment.userAvatar || '' } });
                                  }, 0);
                                }}
                              >
                                <ThemedText style={styles.commentUsername}>{comment.username}</ThemedText>
                              </TouchableOpacity>
                              <ThemedText style={styles.commentTime}>{formatTimeAgo(comment.createdAt)}</ThemedText>
                            </View>
                            {/* Delete button (only for own comments) */}
                            {currentUser?.id === comment.userId && (
                              <TouchableOpacity
                                style={styles.deleteCommentButton}
                                onPress={() => handleDeleteComment(comment.id)}
                              >
                                <ThemedText style={styles.deleteCommentText}>Delete</ThemedText>
                              </TouchableOpacity>
                            )}
                          </View>
                          <ThemedText style={styles.commentText}>{comment.text}</ThemedText>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyState}>
                      <IconSymbol size={64} name="bubble.left" color="#fff" />
                      <ThemedText style={styles.emptyText}>No comments yet</ThemedText>
                      <ThemedText style={styles.emptySubtext}>Be the first to comment!</ThemedText>
                    </View>
                  )}
                </ScrollView>
              </Animated.View>
            </GestureDetector>

            {/* Comment Input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputAvatar}>
                {isRemoteAvatar(currentUser?.avatar) ? (
                  <Image source={{ uri: currentUser.avatar }} style={styles.inputAvatarImage} />
                ) : getDefaultAvatarSource(currentUser?.avatar) ? (
                  <Image source={getDefaultAvatarSource(currentUser.avatar)!} style={styles.inputAvatarImage} />
                ) : (
                  <ThemedText style={styles.inputAvatarInitial}>
                    {currentUser?.username?.[0]?.toUpperCase() || 'U'}
                  </ThemedText>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Add a comment..."
                placeholderTextColor="#72767d"
                value={commentText}
                onChangeText={setCommentText}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                multiline
                maxLength={500}
                editable={!submitting}
              />
              <TouchableOpacity
                style={[styles.sendButton, (!commentText.trim() || submitting) && styles.sendButtonDisabled]}
                onPress={handleAddComment}
                disabled={!commentText.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#8B7FE8" />
                ) : (
                  <IconSymbol size={24} name="arrow.up" color={commentText.trim() ? "#8B7FE8" : "#888"} />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#0a0a0a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    height: '70%',
    overflow: 'hidden',
  },
  backgroundGlow: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  shimmerBand: {
    position: 'absolute',
    top: '-35%',
    left: '-60%',
    width: '220%',
    height: '170%',
    transform: [{ rotate: '20deg' }],
  },
  shimmerBandSecondary: {
    position: 'absolute',
    top: '-20%',
    left: '-10%',
    width: '190%',
    height: '150%',
    transform: [{ rotate: '-15deg' }],
  },
  container: {
    flex: 1,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F0D6A2',
    letterSpacing: 0.3,
  },
  headerSpacer: {
    width: 32,
  },
  commentsList: {
    flex: 1,
  },
  commentsListContent: {
    padding: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#888',
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  commentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentUsername: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  commentTime: {
    fontSize: 11,
    color: '#888',
  },
  commentText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  deleteCommentButton: {
    padding: 4,
  },
  deleteCommentText: {
    fontSize: 13,
    color: '#ff3b30',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'transparent',
    gap: 12,
  },
  inputAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  inputAvatarInitial: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    minHeight: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#8B7FE8',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
});
