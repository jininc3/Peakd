import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Timestamp } from 'firebase/firestore';
import { useEffect, useState, useRef } from 'react';
import { Alert, Animated, Dimensions, FlatList, Image, StyleSheet, TouchableOpacity, View, TextInput } from 'react-native';
import { getComments, CommentData } from '@/services/commentService';
import { TaggedUser } from '@/app/components/tagUsersModal';
import { calculateTierBorderColor } from '@/utils/tierBorderUtils';
import { isRemoteAvatar, getDefaultAvatarSource } from '@/utils/resolveAvatar';
import { formatRankDisplay } from '@/utils/formatRankDisplay';
import SharePostModal from '@/app/components/sharePostModal';

const { width: screenWidth } = Dimensions.get('window');
const cardMargin = 0;
const cardWidth = screenWidth;
const mediaHorizontalPadding = 0;
const mediaWidth = cardWidth;

// Game data
const gameData: { [key: string]: { name: string; icon?: string; image?: any } } = {
  valorant: { name: 'Valorant', image: require('@/assets/images/valorant-text.png') },
  league: { name: 'League of Legends', image: require('@/assets/images/leagueoflegends.png') },
  apex: { name: 'Apex Legends', icon: '🎮' },
  fortnite: { name: 'Fortnite', icon: '🏆' },
  csgo: { name: 'CS:GO', icon: '🔫' },
  overwatch: { name: 'Overwatch', icon: '🦸' },
};

const getGameIcon = (gameId: string) => gameData[gameId]?.icon || '🎮';
const getGameName = (gameId: string) => gameData[gameId]?.name || gameId;
const getGameImage = (gameId: string) => gameData[gameId]?.image || null;

// Format post date - shows time if today, "X days ago" if within a week, otherwise date
const formatPostDate = (timestamp: any): string => {
  if (!timestamp) return '';

  const now = new Date();
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffInMs = now.getTime() - date.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);

  // Under 1 minute
  if (diffInSeconds < 60) {
    return 'now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);

  // Under 24 hours
  if (diffInHours < 24) {
    if (diffInHours < 1) {
      return diffInMinutes === 1 ? '1 min ago' : `${diffInMinutes} mins ago`;
    }
    return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`;
  }

  // Use calendar day difference for day-level display
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffInDays = Math.round((nowMidnight.getTime() - dateMidnight.getTime()) / (1000 * 60 * 60 * 24));

  // 1-6 days ago
  if (diffInDays < 7) {
    return diffInDays === 1 ? '1 day ago' : `${diffInDays} days ago`;
  }

  // More than a week ago - show date
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();
  const currentYear = now.getFullYear();

  if (year === currentYear) {
    return `${day} ${month}`;
  } else {
    const shortYear = year.toString().slice(-2);
    return `${day} ${month} ${shortYear}`;
  }
};

// Video Player Component for expo-video
const VideoPlayerComponent = ({
  postId,
  mediaUrl,
  isPlaying,
  onPlayerReady,
  onDoubleTap,
  onVideoReady,
}: {
  postId: string;
  mediaUrl: string;
  isPlaying: boolean;
  onPlayerReady: (postId: string, player: any) => void;
  onDoubleTap?: () => void;
  onVideoReady?: () => void;
}) => {
  const player = useVideoPlayer(mediaUrl, (player) => {
    player.loop = true;
    player.muted = false;
  });

  const [isMuted, setIsMuted] = useState(false);
  const [isLocallyPaused, setIsLocallyPaused] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [showPauseIcon, setShowPauseIcon] = useState(false);
  const [pauseIconType, setPauseIconType] = useState<'pause' | 'play'>('pause');
  const lastTap = useRef<number | null>(null);
  const pauseIconTimeout = useRef<NodeJS.Timeout | null>(null);
  const doubleTapDelay = 300; // ms

  useEffect(() => {
    onPlayerReady(postId, player);
  }, [player, postId, onPlayerReady]);

  // Notify parent when video is ready to play + capture duration
  useEffect(() => {
    if (player.status === 'readyToPlay') {
      onVideoReady?.();
      return;
    }
    const subscription = player.addListener('statusChange', (event: any) => {
      if (event.status === 'readyToPlay') {
        onVideoReady?.();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [player, onVideoReady]);

  useEffect(() => {
    if (isPlaying && !isLocallyPaused) {
      player.play();
    } else {
      player.pause();
    }

    // When video scrolls out of view (isPlaying becomes false)
    // Reset local pause state so it auto-plays correctly when scrolling back
    if (!isPlaying && isLocallyPaused) {
      setIsLocallyPaused(false);
      setShowPauseIcon(false);
      if (pauseIconTimeout.current) {
        clearTimeout(pauseIconTimeout.current);
      }
    }

    // Hide pause icon when video auto-plays from scrolling
    if (isPlaying && !isLocallyPaused) {
      setShowPauseIcon(false);
      if (pauseIconTimeout.current) {
        clearTimeout(pauseIconTimeout.current);
      }
    }
  }, [isPlaying, isLocallyPaused, player]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (pauseIconTimeout.current) {
        clearTimeout(pauseIconTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  const handleVideoPress = () => {
    const now = Date.now();

    if (lastTap.current && now - lastTap.current < doubleTapDelay) {
      // Double tap detected
      lastTap.current = null;

      // Show heart animation
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 1000);

      // Trigger like
      if (onDoubleTap) {
        onDoubleTap();
      }
    } else {
      // Single tap - toggle play/pause
      lastTap.current = now;
      setTimeout(() => {
        if (lastTap.current === now) {
          // It was actually a single tap
          const newPausedState = !isLocallyPaused;
          setIsLocallyPaused(newPausedState);

          // Clear any existing timeout
          if (pauseIconTimeout.current) {
            clearTimeout(pauseIconTimeout.current);
          }

          if (newPausedState) {
            // Video is now paused - show play button and keep it visible
            setPauseIconType('play');
            setShowPauseIcon(true);
          } else {
            // Video is now playing - hide the play button
            setShowPauseIcon(false);
          }

          lastTap.current = null;
        }
      }, doubleTapDelay);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <View style={styles.videoContainer}>
      <VideoView
        player={player}
        style={styles.media}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        nativeControls={false}
        contentFit="cover"
      />

      {/* Bottom gradient overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)']}
        style={styles.videoGradientOverlay}
        pointerEvents="none"
      />

      {/* Top gradient overlay (subtle) */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'transparent']}
        style={styles.videoGradientOverlayTop}
        pointerEvents="none"
      />

      {/* Tap overlay for play/pause and double-tap to like */}
      <TouchableOpacity
        style={styles.videoTapOverlay}
        activeOpacity={1}
        onPress={handleVideoPress}
      >
        {/* Heart animation for double-tap like */}
        {showHeart && (
          <View style={styles.heartAnimation}>
            <IconSymbol size={100} name="heart.fill" color="#fff" />
          </View>
        )}

        {/* Pause/Play icon - TikTok style */}
        {showPauseIcon && (
          <View style={styles.pausePlayIcon}>
            <View style={styles.pausePlayIconBackground}>
              <IconSymbol
                size={22}
                name={pauseIconType === 'pause' ? "pause.fill" : "play.fill"}
                color="rgba(255,255,255,0.9)"
              />
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Mute button - only show when video is paused */}
      {isLocallyPaused && (
        <TouchableOpacity
          style={styles.muteButton}
          onPress={toggleMute}
          activeOpacity={0.7}
        >
          <View style={styles.muteButtonBackground}>
            <IconSymbol
              size={20}
              name={isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill"}
              color="#fff"
            />
          </View>
        </TouchableOpacity>
      )}

    </View>
  );
};

interface Post {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  mediaUrl: string;
  mediaUrls?: string[];
  mediaType: 'image' | 'video';
  mediaTypes?: string[];
  thumbnailUrl?: string;
  caption?: string;
  taggedUsers?: TaggedUser[];
  taggedGame?: string;
  createdAt: Timestamp;
  likes: number;
  commentsCount?: number;
  leagueRank?: string;
  valorantRank?: string;
  showRankOnPosts?: boolean;
  categories?: string[];
}

// Like Burst Animation Component
const LikeBurstAnimation = () => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1.5,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        transform: [{ scale: scaleAnim }],
        opacity: opacityAnim,
      }}
    >
      <IconSymbol size={40} name="heart.fill" color="#ff3b30" />
    </Animated.View>
  );
};

interface PostContentProps {
  post: Post;
  userAvatar?: string;
  playingVideoId: string | null;
  postRefs?: React.MutableRefObject<{ [key: string]: View | null }>;
  onOpenComments: (post: Post) => void;
  onDirectMessage?: (post: Post) => void;
  onLikeToggle: (post: Post) => void;
  onUserPress?: (userId: string, username?: string, avatar?: string) => void;
  formatTimeAgo: (timestamp: any) => string;
  currentUserId?: string;
  isLiked: boolean;
  likeCount: number;
  isLiking: boolean;
  onPlayerReady: (postId: string, player: any) => void;
  showRecentComments?: boolean;
  onDelete?: (post: Post) => void;
  onEditCaption?: (post: Post, newCaption: string) => void;
  onArchive?: (post: Post) => void;
  onReport?: (post: Post) => void;
  onCategorize?: (post: Post) => void;
  onVideoReady?: () => void;
}

export default function PostContent({
  post,
  userAvatar,
  playingVideoId,
  postRefs,
  onOpenComments,
  onDirectMessage,
  onLikeToggle,
  onUserPress,
  formatTimeAgo,
  currentUserId,
  isLiked,
  likeCount,
  isLiking,
  onPlayerReady,
  showRecentComments = true,
  onDelete,
  onEditCaption,
  onArchive,
  onReport,
  onCategorize,
  onVideoReady
}: PostContentProps) {
  // Calculate tier border color
  const tierBorderColor = calculateTierBorderColor(post.leagueRank, post.valorantRank);

  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [mediaHeight, setMediaHeight] = useState(
    post.mediaType === 'video' ? mediaWidth * 0.5625 : mediaWidth
  );
  const mediaFlatListRef = useRef<FlatList>(null);
  const [recentComments, setRecentComments] = useState<CommentData[]>([]);

  // Double tap navigation guard
  const lastNavTime = useRef(0);

  // Like button animation
  const likeScale = useRef(new Animated.Value(1)).current;
  const likeGlow = useRef(new Animated.Value(0)).current;
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);

  // Caption editing state
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [editedCaption, setEditedCaption] = useState(post.caption || '');

  // Share modal state
  const [shareModalVisible, setShareModalVisible] = useState(false);

  const handleLikePress = () => {
    // Trigger scale animation on the button
    Animated.sequence([
      Animated.timing(likeScale, {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(likeScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Show heart burst animation + glow when liking (not unliking)
    if (!isLiked) {
      setShowLikeAnimation(true);
      setTimeout(() => setShowLikeAnimation(false), 600);

      // Glow pulse
      likeGlow.setValue(1);
      Animated.timing(likeGlow, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }

    onLikeToggle(post);
  };

  // Fetch recent comments for this post
  useEffect(() => {
    if (!showRecentComments) return;

    const fetchRecentComments = async () => {
      try {
        const allComments = await getComments(post.id);
        setRecentComments(allComments.slice(0, 1)); // Get 1 most recent
      } catch (error) {
        console.error('Error fetching recent comments:', error);
      }
    };

    fetchRecentComments();
  }, [post.id, showRecentComments]);

  const hasMultipleMedia = post.mediaUrls && post.mediaUrls.length > 1;

  // Caption edit handlers
  const handleStartEditCaption = () => {
    setEditedCaption(post.caption || '');
    setIsEditingCaption(true);
  };

  const handleCancelEditCaption = () => {
    setEditedCaption(post.caption || '');
    setIsEditingCaption(false);
  };

  const handleSaveEditCaption = () => {
    if (onEditCaption && editedCaption !== post.caption) {
      onEditCaption(post, editedCaption);
    }
    setIsEditingCaption(false);
  };

  // Handle post options menu
  const handlePostOptions = () => {
    const isOwner = post.userId === currentUserId;
    const options = [];

    if (isOwner) {
      if (onEditCaption) {
        options.push({
          text: 'Edit Caption',
          onPress: handleStartEditCaption
        });
      }
      if (onCategorize) {
        options.push({
          text: 'Categorize',
          onPress: () => onCategorize(post)
        });
      }
      if (onArchive) {
        options.push({
          text: 'Archive',
          onPress: () => onArchive(post)
        });
      }
      if (onDelete) {
        options.push({
          text: 'Delete Post',
          style: 'destructive' as const,
          onPress: () => onDelete(post)
        });
      }
    } else {
      if (onReport) {
        options.push({
          text: 'Report Post',
          style: 'destructive' as const,
          onPress: () => onReport(post)
        });
      }
    }

    options.push({
      text: 'Cancel',
      style: 'cancel' as const
    });

    Alert.alert('Post Options', '', options);
  };

  return (
    <View
      style={styles.postContainer}
      ref={(ref) => {
        if (postRefs?.current) {
          postRefs.current[post.id] = ref;
        }
      }}
      collapsable={false}
    >
      {/* User Header */}
      <View style={styles.postHeader}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => { if (Date.now() - lastNavTime.current < 500) return; lastNavTime.current = Date.now(); onUserPress?.(post.userId, post.username, post.avatar); }}
          activeOpacity={0.7}
          disabled={!onUserPress}
        >
          <View style={[
            styles.avatar,
            tierBorderColor && { borderColor: tierBorderColor, borderWidth: 2 }
          ]}>
            {isRemoteAvatar(post.avatar || userAvatar) ? (
              <Image source={{ uri: (post.avatar || userAvatar)! }} style={styles.avatarImage} />
            ) : getDefaultAvatarSource(post.avatar || userAvatar) ? (
              <Image source={getDefaultAvatarSource(post.avatar || userAvatar)!} style={styles.avatarImage} />
            ) : (
              <ThemedText style={styles.avatarInitial}>
                {post.username?.[0]?.toUpperCase() || 'U'}
              </ThemedText>
            )}
          </View>
          <View style={styles.userTextContainer}>
            <View style={styles.usernameRow}>
              <ThemedText style={styles.username}>{post.username}</ThemedText>
              {post.userId === currentUserId && (
                <View style={styles.youBadge}>
                  <ThemedText style={styles.youBadgeText}>You</ThemedText>
                </View>
              )}
              {post.showRankOnPosts && (() => {
                const rank = post.taggedGame === 'league' ? post.leagueRank
                  : post.taggedGame === 'valorant' ? post.valorantRank
                  : null;
                if (!rank) return null;

                // Get rank icon based on game and rank
                const getRankIcon = (rank: string, game: string) => {
                  const tier = rank.split(' ')[0].toLowerCase();
                  const division = rank.split(' ')[1];
                  if (game === 'valorant') {
                    const exactKey = division ? `${tier}${division}` : tier;
                    const valorantRanks: {[key: string]: any} = {
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
                    };
                    return valorantRanks[exactKey] || valorantRanks[tier];
                  } else {
                    const leagueRanks: {[key: string]: any} = {
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
                    };
                    return leagueRanks[tier];
                  }
                };

                const rankIcon = getRankIcon(rank, post.taggedGame || '');

                return (
                  <View style={styles.rankBadge}>
                    {rankIcon && <Image source={rankIcon} style={styles.rankBadgeIcon} resizeMode="contain" />}
                    <ThemedText style={styles.rankBadgeText}>
                      {formatRankDisplay(rank)}
                    </ThemedText>
                  </View>
                );
              })()}
            </View>
            <View style={styles.postMetaRow}>
              {post.taggedGame && (
                <>
                  <ThemedText style={styles.postGameTag}>{getGameName(post.taggedGame).toUpperCase()}</ThemedText>
                  <ThemedText style={styles.postMetaDot}>·</ThemedText>
                </>
              )}
              <ThemedText style={styles.postDate}>{formatPostDate(post.createdAt)}</ThemedText>
            </View>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={
              (post.userId === currentUserId && (onDelete || onEditCaption || onArchive)) || (post.userId !== currentUserId && onReport)
                ? handlePostOptions
                : undefined
            }
            activeOpacity={0.6}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <IconSymbol size={20} name="ellipsis" color="#888" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Caption */}
      {isEditingCaption ? (
        <View style={styles.captionEditContainer}>
          <TextInput
            style={styles.captionEditInput}
            value={editedCaption}
            onChangeText={setEditedCaption}
            multiline
            autoFocus
            placeholder="Write a caption..."
            placeholderTextColor="#888"
          />
          <View style={styles.captionEditButtons}>
            <TouchableOpacity
              style={styles.captionEditButtonCancel}
              onPress={handleCancelEditCaption}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.captionEditButtonCancelText}>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.captionEditButtonDone}
              onPress={handleSaveEditCaption}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.captionEditButtonDoneText}>Done</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        post.caption && (
          <View style={styles.captionContainer}>
            <ThemedText style={styles.captionText}>{post.caption}</ThemedText>
          </View>
        )
      )}

      {/* Media Content */}
      <View style={[styles.mediaContainer, { height: mediaHeight }]}>
        {hasMultipleMedia ? (
          <>
            <FlatList
              ref={mediaFlatListRef}
              data={post.mediaUrls}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, index) => `media-${index}`}
              onMomentumScrollEnd={(event) => {
                const offsetX = event.nativeEvent.contentOffset.x;
                const index = Math.round(offsetX / mediaWidth);
                setActiveMediaIndex(index);
              }}
              renderItem={({ item: url, index }) => {
                const mediaType = post.mediaTypes?.[index] || 'image';
                return (
                  <View style={[styles.mediaItem, { width: mediaWidth, height: mediaHeight }]}>
                    {mediaType === 'video' ? (
                      <VideoPlayerComponent
                        postId={`${post.id}-${index}`}
                        mediaUrl={url}
                        isPlaying={playingVideoId === post.id && activeMediaIndex === index}
                        onPlayerReady={onPlayerReady}
                        onDoubleTap={() => onLikeToggle(post)}
                        onVideoReady={index === 0 ? onVideoReady : undefined}
                      />
                    ) : (
                      <Image
                        source={{ uri: url }}
                        style={styles.media}
                        resizeMode="cover"
                      />
                    )}
                  </View>
                );
              }}
            />
            {/* Media Indicators */}
            <View style={styles.indicatorContainer}>
              {post.mediaUrls?.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.indicator,
                    index === activeMediaIndex && styles.indicatorActive
                  ]}
                />
              ))}
            </View>
          </>
        ) : (
          <View style={[styles.mediaItem, { width: mediaWidth, height: mediaHeight }]}>
            {post.mediaType === 'video' ? (
              <VideoPlayerComponent
                postId={post.id}
                mediaUrl={post.mediaUrl}
                isPlaying={playingVideoId === post.id}
                onPlayerReady={onPlayerReady}
                onDoubleTap={() => onLikeToggle(post)}
                onVideoReady={onVideoReady}
              />
            ) : (
              <Image
                source={{ uri: post.mediaUrl }}
                style={styles.media}
                resizeMode="cover"
              />
            )}
          </View>
        )}
      </View>

      {/* Engagement Row */}
      <View style={styles.engagementRow} pointerEvents="box-none">
        {/* Like */}
        <TouchableOpacity
          style={styles.engagementItem}
          onPress={handleLikePress}
          disabled={isLiking}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <View style={styles.engagementIconWrap}>
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <IconSymbol
                size={24}
                name={isLiked ? "heart.fill" : "heart"}
                color={isLiked ? "#ff3b30" : "#fff"}
              />
            </Animated.View>
            {/* Glow ring */}
            <Animated.View
              style={[
                styles.likeGlow,
                { opacity: likeGlow },
              ]}
              pointerEvents="none"
            />
            {/* Like burst animation */}
            {showLikeAnimation && (
              <View style={styles.likeBurstContainer}>
                <LikeBurstAnimation />
              </View>
            )}
          </View>
          <ThemedText style={[styles.engagementCount, styles.likeCount, isLiked && styles.likeCountActive]}>
            {likeCount > 0 ? likeCount.toLocaleString() : ''}
          </ThemedText>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity
          style={styles.engagementItem}
          onPress={() => onOpenComments(post)}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <IconSymbol size={24} name="bubble.left" color="#b0b0b0" />
          <ThemedText style={[styles.engagementCount, styles.commentCount]}>
            {(post.commentsCount ?? 0) > 0 ? post.commentsCount!.toLocaleString() : ''}
          </ThemedText>
        </TouchableOpacity>

        {/* Share / DM */}
        <TouchableOpacity
          style={styles.engagementItem}
          onPress={() => setShareModalVisible(true)}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <IconSymbol size={22} name="paperplane" color="#b0b0b0" />
        </TouchableOpacity>
      </View>

      {/* Tagged Users */}
      {post.taggedUsers && post.taggedUsers.length > 0 && (
        <View style={styles.taggedUsersContainer}>
          <ThemedText style={styles.taggedUsersLabel}>with </ThemedText>
          {post.taggedUsers.map((user, index) => (
            <TouchableOpacity
              key={user.userId}
              onPress={() => onUserPress && onUserPress(user.userId, user.username)}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.taggedUsername}>
                @{user.username}
                {index < post.taggedUsers!.length - 1 && ', '}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Recent Comments Preview */}
      {showRecentComments && recentComments.length > 0 && (
        <View style={styles.commentsPreviewContainer}>
          {recentComments.map((comment) => (
            <View key={comment.id} style={styles.commentPreview}>
              <ThemedText style={styles.commentUsername}>
                {comment.username}
              </ThemedText>
              <ThemedText style={styles.commentText} numberOfLines={1}>
                {comment.text}
              </ThemedText>
            </View>
          ))}
          {(post.commentsCount ?? 0) > 1 && (
            <TouchableOpacity onPress={() => onOpenComments(post)}>
              <ThemedText style={styles.viewAllCommentsText}>
                View all {post.commentsCount} comments
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Share Post Modal */}
      <SharePostModal
        visible={shareModalVisible}
        postId={post.id}
        postUsername={post.username}
        postAvatar={post.avatar}
        postMediaUrl={post.mediaUrl}
        postThumbnailUrl={post.thumbnailUrl}
        postCaption={post.caption}
        postMediaType={post.mediaType}
        onClose={() => setShareModalVisible(false)}
        onUserPress={onUserPress}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  postContainer: {
    width: cardWidth,
    marginHorizontal: cardMargin,
    backgroundColor: 'transparent',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2c2f33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  userTextContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  username: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  youBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  youBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  rankBadgeIcon: {
    width: 14,
    height: 14,
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
  },
  postMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -2,
  },
  postGameTag: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8B7FE8',
  },
  postMetaDot: {
    fontSize: 12,
    color: '#888',
    marginHorizontal: 6,
  },
  postDate: {
    fontSize: 12,
    color: '#888',
  },
  gameTag: {
    backgroundColor: '#B4A7F5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gameTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  gameTagImage: {
    height: 20,
    width: 80,
  },
  captionContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  captionText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  captionEditContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  captionEditInput: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    minHeight: 60,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#333',
  },
  captionEditButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 12,
  },
  captionEditButtonCancel: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  captionEditButtonCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  captionEditButtonDone: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#c42743',
  },
  captionEditButtonDoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  mediaContainer: {
    width: mediaWidth,
    backgroundColor: '#000',
    position: 'relative',
    borderRadius: 0,
    overflow: 'hidden',
  },
  mediaItem: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  videoContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  videoTapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  heartAnimation: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.9,
  },
  videoGradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 0,
  },
  videoGradientOverlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    zIndex: 0,
  },
  pausePlayIcon: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pausePlayIconBackground: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  muteButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 2,
  },
  muteButtonBackground: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indicatorContainer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  indicatorActive: {
    backgroundColor: '#fff',
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 20,
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  engagementIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeGlow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 59, 48, 0.25)',
  },
  likeBurstContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  engagementCount: {
    fontSize: 14,
    minWidth: 4,
  },
  likeCount: {
    fontWeight: '700',
    color: '#fff',
  },
  likeCountActive: {
    color: '#ff3b30',
  },
  commentCount: {
    fontWeight: '500',
    color: '#888',
  },
  menuButton: {
    padding: 4,
  },
  taggedUsersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 2,
    alignItems: 'center',
  },
  taggedUsersLabel: {
    fontSize: 13,
    color: '#b9bbbe',
  },
  taggedUsername: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  commentsPreviewContainer: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 16,
    gap: 4,
  },
  commentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentUsername: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  commentText: {
    fontSize: 12,
    color: '#dcddde',
    flex: 1,
  },
  commentTime: {
    fontSize: 10,
    color: '#b9bbbe',
  },
  viewAllCommentsText: {
    fontSize: 12,
    color: '#B4A7F5',
    marginTop: 0,
  },
});
