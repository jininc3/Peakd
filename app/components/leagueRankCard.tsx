import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import WinLossPieChart from './WinLossPieChart';
import LPLineChart from './LPLineChart';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, Modal, NativeScrollEvent, NativeSyntheticEvent, PanResponder, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { getProfileIconUrl, getChampionName, getChampionIconUrl, getLeagueStats } from '@/services/riotService';
import { getRankHistory, RankHistoryEntry } from '@/services/rankHistoryService';
import { auth } from '@/config/firebase';
import { calculateTierBorderColor, calculateTier } from '@/utils/tierBorderUtils';
import { formatRankDisplay } from '@/utils/formatRankDisplay';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MatchHistoryEntry {
  matchId: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  won: boolean;
  gameMode: string;
  gameStart: number;
  lpChange?: number;
}

interface Game {
  id: number;
  name: string;
  rank: string;
  trophies: number;
  icon: string;
  wins: number;
  losses: number;
  winRate: number;
  recentMatches: string[];
  profileIconId?: number;
  matchHistory?: MatchHistoryEntry[];
  gamesPlayed?: number;
  peakRank?: { tier: string; season: string };
  topChampions?: { championId: number; championLevel: number; championPoints: number }[];
  summonerLevel?: number;
}

interface LeagueRankCardProps {
  game: Game;
  username: string;
  viewOnly?: boolean;
  userId?: string;
  isFocused?: boolean;
  isBackOfStack?: boolean;
  onRefresh?: () => void;
  initialFlipped?: boolean;
  flipOnly?: boolean;
  onFlip?: () => void;
  autoReveal?: boolean; // If true, auto-animate flip to back on mount
}

// League of Legends rank icon mapping
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

export default function LeagueRankCard({ game, username, viewOnly = false, userId, isFocused = false, isBackOfStack = false, onRefresh, initialFlipped = false, flipOnly = false, onFlip, autoReveal = false }: LeagueRankCardProps) {
  const [isFlipped, setIsFlipped] = useState(initialFlipped);
  const [showBack, setShowBack] = useState(initialFlipped);
  const [modalVisible, setModalVisible] = useState(false);
  const [updatingStats, setUpdatingStats] = useState(false);
  const [cardPosition, setCardPosition] = useState({ x: 20, y: SCREEN_HEIGHT - 350, width: 0 });
  const [showMatchHistory, setShowMatchHistory] = useState(false);
  const [matchHistoryExpanded, setMatchHistoryExpanded] = useState(false);
  const [statsScrollEnabled, setStatsScrollEnabled] = useState(true);
  const [statsPage, setStatsPage] = useState(0);
  const [rankHistory, setRankHistory] = useState<RankHistoryEntry[]>([]);
  const [stackShowBack, setStackShowBack] = useState(initialFlipped);
  const stackShowBackRef = useRef(initialFlipped);
  const stackFlipAnim = useRef(new Animated.Value(initialFlipped ? 1 : 0)).current;

  const cardRef = useRef<View>(null);
  const statsScrollRef = useRef<ScrollView>(null);
  const flipAnimation = useRef(new Animated.Value(initialFlipped ? 1 : 0)).current;
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const startY = useRef(new Animated.Value(SCREEN_HEIGHT - 350)).current;
  const matchHistoryAnimation = useRef(new Animated.Value(0)).current;
  const matchHistoryExpandAnimation = useRef(new Animated.Value(0)).current;
  const shimmerAnimation = useRef(new Animated.Value(0)).current;
  const stackCardOpacity = useRef(new Animated.Value(1)).current;
  const modalCardOpacity = useRef(new Animated.Value(1)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  // Derive accent color from tier (matches profile icon border)
  const tierColor = useMemo(() => calculateTierBorderColor(game.rank) || '#1e64c8', [game.rank]);
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  };
  const rgb = useMemo(() => hexToRgb(tierColor), [tierColor]);

  const tierLevel = useMemo(() => {
    const tier = calculateTier(game.rank);
    if (!tier) return 1;
    const levels = { F: 1, D: 2, C: 3, B: 4, A: 5, S: 6 };
    return levels[tier];
  }, [game.rank]);

  // Prefetch profile icon so it loads instantly when card is flipped
  useEffect(() => {
    if (game.profileIconId) {
      Image.prefetch(getProfileIconUrl(game.profileIconId));
    }
  }, [game.profileIconId]);

  // Shimmer animation loop
  useEffect(() => {
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnimation, {
          toValue: 1,
          duration: 3500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnimation, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerLoop.start();
    return () => shimmerLoop.stop();
  }, []);

  // Shimmer translate animation
  const shimmerTranslate = shimmerAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_WIDTH * 1.5, SCREEN_WIDTH * 1.5],
  });

  // Stack card flip listener - swap content at midpoint
  useEffect(() => {
    const id = stackFlipAnim.addListener(({ value }) => {
      if (value >= 0.5 && !stackShowBackRef.current) {
        stackShowBackRef.current = true;
        setStackShowBack(true);
      } else if (value < 0.5 && stackShowBackRef.current) {
        stackShowBackRef.current = false;
        setStackShowBack(false);
      }
    });
    return () => stackFlipAnim.removeListener(id);
  }, []);

  // Track showBack in a ref so the listener always reads the latest value
  const showBackRef = useRef(showBack);
  showBackRef.current = showBack;

  // Sync flip state when initialFlipped prop changes
  useEffect(() => {
    setIsFlipped(initialFlipped);
    setShowBack(initialFlipped);
    showBackRef.current = initialFlipped;
    flipAnimation.setValue(initialFlipped ? 1 : 0);
    setStackShowBack(initialFlipped);
    stackShowBackRef.current = initialFlipped;
    stackFlipAnim.setValue(initialFlipped ? 1 : 0);
  }, [initialFlipped]);

  // Auto-reveal: animate flip to back on mount
  useEffect(() => {
    if (autoReveal && !initialFlipped) {
      const timeout = setTimeout(() => {
        Animated.timing(stackFlipAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [autoReveal]);

  // Listen to animation value to swap content at midpoint (registered once)
  useEffect(() => {
    const listenerId = flipAnimation.addListener(({ value }) => {
      if (value >= 0.5 && !showBackRef.current) {
        setShowBack(true);
      } else if (value < 0.5 && showBackRef.current) {
        setShowBack(false);
      }
    });
    return () => flipAnimation.removeListener(listenerId);
  }, []);

  const handlePress = () => {
    // Measure card position before opening modal
    cardRef.current?.measureInWindow((x, y, width, height) => {
      setCardPosition({ x, y, width });
      startY.setValue(y);

      // Open modal and reset all state from previous dismiss
      setModalVisible(true);
      setShowBack(false);
      setIsFlipped(false);
      modalCardOpacity.setValue(1);
      dragY.setValue(0);
      flipAnimation.setValue(0);
      slideAnimation.setValue(0);
      matchHistoryAnimation.setValue(0);
      matchHistoryExpandAnimation.setValue(0);
      setShowMatchHistory(true);
      setMatchHistoryExpanded(false);
      setStatsPage(0);
      statsScrollRef.current?.scrollTo({ x: 0, animated: false });

      // Fetch rank history for graph
      const targetUserId = userId || auth.currentUser?.uid;
      if (targetUserId) {
        getRankHistory(targetUserId, 'league').then(setRankHistory).catch(() => {});
      }

      // Animation: wait for modal to render, hide stack card, then slide up
      Animated.sequence([
        // Wait for modal to render first
        Animated.delay(50),
        // Hide stack card (modal card is now covering it)
        Animated.timing(stackCardOpacity, {
          toValue: 0,
          duration: 1,
          useNativeDriver: false,
        }),
        // Brief pause for anticipation
        Animated.delay(100),
        // Blur/overlay fades in, card slides up, cards container expands, and flip all together
        Animated.parallel([
          Animated.timing(overlayOpacity, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(slideAnimation, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.back(1.1)),
            useNativeDriver: false,
          }),
          Animated.timing(matchHistoryAnimation, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.back(1.05)),
            useNativeDriver: false,
          }),
          // Flip during slide-up — split into two halves to swap content at midpoint
          Animated.sequence([
            Animated.delay(150),
            Animated.timing(flipAnimation, {
              toValue: 0.5,
              duration: 300,
              easing: Easing.in(Easing.ease),
              useNativeDriver: false,
            }),
          ]),
        ]),
      ]).start(() => {
        // At midpoint (scaleY=0), swap to back content then complete the flip
        setShowBack(true);
        Animated.timing(flipAnimation, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }).start();
      });

      setIsFlipped(true);
    });
  };

  const handleMatchHistoryToggle = () => {
    const toValue = matchHistoryExpanded ? 0 : 1;
    setMatchHistoryExpanded(!matchHistoryExpanded);
    Animated.timing(matchHistoryExpandAnimation, {
      toValue,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  // Just flip the card without closing the modal
  const handleCardFlip = () => {
    const toValue = isFlipped ? 0 : 1;
    Animated.timing(flipAnimation, {
      toValue,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const isOwnCard = !userId;

  const handleUpdateStats = async () => {
    if (updatingStats || !isOwnCard) return;
    setUpdatingStats(true);
    try {
      await getLeagueStats(true);
      onRefresh?.();
    } catch (error) {
      console.log('Failed to refresh League stats:', error);
    } finally {
      setUpdatingStats(false);
    }
  };

  const handleCloseModal = () => {
    // If match history is open, close it first
    if (showMatchHistory) {
      Animated.parallel([
        Animated.timing(matchHistoryAnimation, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(matchHistoryExpandAnimation, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start(() => {
        setShowMatchHistory(false);
        setMatchHistoryExpanded(false);
      });
      return;
    }

    // Reverse: flip first, then smooth slide down + crossfade
    Animated.sequence([
      // Flip back to front first
      Animated.timing(flipAnimation, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      // Slide down, fade out overlay, crossfade modal card with stack card
      Animated.parallel([
        Animated.timing(slideAnimation, {
          toValue: 0,
          duration: 400,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 350,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        // Fade out modal card
        Animated.timing(modalCardOpacity, {
          toValue: 0,
          duration: 400,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        // Fade in stack card
        Animated.timing(stackCardOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ]),
    ]).start(() => {
      // Both cards have crossfaded - safe to close modal
      slideAnimation.setValue(0);
      flipAnimation.setValue(0);
      setModalVisible(false);
      setIsFlipped(false);
    });
  };

  // Handle clicking on the rank card back - closes everything and flips card
  const handleCardBackPress = () => {
    // Run flip + slide down + collapse all simultaneously
    Animated.parallel([
      // Flip back to front
      Animated.timing(flipAnimation, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      // Collapse match history and statistics
      Animated.timing(matchHistoryAnimation, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(matchHistoryExpandAnimation, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      // Slide down
      Animated.timing(slideAnimation, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      // Fade out overlay
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Crossfade modal card with stack card — earlier for back cards so they slot behind the front card
      Animated.sequence([
        Animated.delay(isBackOfStack ? 50 : 200),
        Animated.timing(modalCardOpacity, {
          toValue: 0,
          duration: isBackOfStack ? 150 : 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
      Animated.sequence([
        Animated.delay(isBackOfStack ? 50 : 200),
        Animated.timing(stackCardOpacity, {
          toValue: 1,
          duration: isBackOfStack ? 150 : 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
      // Reset drag offset
      Animated.timing(dragY, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => {
      setModalVisible(false);
      setIsFlipped(false);
      setShowMatchHistory(false);
      setMatchHistoryExpanded(false);
    });
  };

  // Ref to always have access to latest handleCardBackPress
  const handleCardBackPressRef = useRef(handleCardBackPress);
  handleCardBackPressRef.current = handleCardBackPress;

  const dragYRef = useRef(dragY);
  const flipAnimationRef = useRef(flipAnimation);
  const overlayOpacityRef = useRef(overlayOpacity);
  const slideAnimationRef = useRef(slideAnimation);
  const modalCardOpacityRef = useRef(modalCardOpacity);
  const stackCardOpacityRef = useRef(stackCardOpacity);
  const matchHistoryAnimationRef = useRef(matchHistoryAnimation);
  const matchHistoryExpandAnimationRef = useRef(matchHistoryExpandAnimation);

  // Shared slide-off dismiss logic for pan responders
  const dismissCardOffScreen = () => {
    // Show the stack card immediately so it's visible behind
    stackCardOpacityRef.current.setValue(1);

    Animated.parallel([
      Animated.timing(dragYRef.current, {
        toValue: SCREEN_HEIGHT,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(overlayOpacityRef.current, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Just close the modal — animated values are reset in handlePress on next open
      setModalVisible(false);
      setIsFlipped(false);
      setShowBack(false);
      setShowMatchHistory(false);
      setMatchHistoryExpanded(false);
    });
  };
  const dismissCardRef = useRef(dismissCardOffScreen);
  dismissCardRef.current = dismissCardOffScreen;

  // Track stats ScrollView offset for drag-to-dismiss
  const statsScrollOffset = useRef(0);
  const statsDragStartY = useRef(0);
  const isStatsDragging = useRef(false);

  const handleStatsTouchStart = (e: any) => {
    statsDragStartY.current = e.nativeEvent.pageY;
  };

  const handleStatsTouchMove = (e: any) => {
    const dy = e.nativeEvent.pageY - statsDragStartY.current;
    if (statsScrollOffset.current <= 0 && dy > 10 && !isStatsDragging.current) {
      isStatsDragging.current = true;
      setStatsScrollEnabled(false);
      stackCardOpacityRef.current.setValue(1);
    }
    if (isStatsDragging.current && dy > 0) {
      dragYRef.current.setValue(dy);
      const progress = Math.min(1, dy / (SCREEN_HEIGHT / 4));
      overlayOpacityRef.current.setValue(1 - progress);
    }
  };

  const handleStatsTouchEnd = (e: any) => {
    if (!isStatsDragging.current) return;
    const dy = e.nativeEvent.pageY - statsDragStartY.current;
    isStatsDragging.current = false;
    setStatsScrollEnabled(true);
    if (dy > SCREEN_HEIGHT / 6) {
      dismissCardRef.current();
    } else {
      Animated.spring(dragYRef.current, {
        toValue: 0,
        useNativeDriver: false,
        tension: 200,
        friction: 20,
      }).start();
      Animated.timing(overlayOpacityRef.current, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      stackCardOpacityRef.current.setValue(0);
    }
  };

  // Pan responder for swipe down on rank card back to close modal
  const rankCardSwipePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 30 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 2;
      },
      onPanResponderGrant: () => {
        stackCardOpacityRef.current.setValue(1);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          dragYRef.current.setValue(gestureState.dy);
          const progress = Math.min(1, gestureState.dy / (SCREEN_HEIGHT / 4));
          overlayOpacityRef.current.setValue(1 - progress);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SCREEN_HEIGHT / 6) {
          dismissCardRef.current();
        } else {
          Animated.spring(dragYRef.current, {
            toValue: 0,
            useNativeDriver: false,
            tension: 200,
            friction: 20,
          }).start();
          Animated.timing(overlayOpacityRef.current, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }).start();
          stackCardOpacityRef.current.setValue(0);
        }
      },
    })
  ).current;

  // Refs for match history expand/collapse state
  const matchHistoryExpandedRef = useRef(matchHistoryExpanded);
  matchHistoryExpandedRef.current = matchHistoryExpanded;

  // Pan responder for swipe up on collapsed match history to expand
  const matchHistorySwipeUpPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return !matchHistoryExpandedRef.current && gestureState.dy < -10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -30) {
          setMatchHistoryExpanded(true);
          Animated.timing(matchHistoryExpandAnimation, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  // Pan responder for swipe down on match history header to collapse
  const matchHistorySwipeDownPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return matchHistoryExpandedRef.current && gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 30) {
          setMatchHistoryExpanded(false);
          Animated.timing(matchHistoryExpandAnimation, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const getRankIcon = (rank: string) => {
    if (!rank || rank === 'Unranked') {
      return LEAGUE_RANK_ICONS.unranked;
    }
    const tier = rank.split(' ')[0].toLowerCase();
    return LEAGUE_RANK_ICONS[tier] || LEAGUE_RANK_ICONS.unranked;
  };

  // Scale-based flip animation
  const scaleY = flipAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 1],
  });

  // Slide animation
  const inverseSlide = slideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const translateY = Animated.add(
    Animated.multiply(startY, inverseSlide),
    Animated.multiply(slideAnimation, 80)
  );

  // Stack card flip animation
  const stackScaleY = stackFlipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 1],
  });

  const handleStackTap = () => {
    if (flipOnly) {
      // Toggle flip only (profile page)
      const toValue = stackShowBackRef.current ? 0 : 1;
      Animated.timing(stackFlipAnim, {
        toValue,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      // Notify parent when flipping to back (reveal)
      if (toValue === 1 && onFlip) {
        onFlip();
      }
    } else {
      // Open modal directly (rankCards page)
      handlePress();
    }
  };

  const animatedStyle = {
    transform: [{ scaleY }],
  };

  const modalCardStyle = {
    transform: [{ translateY: Animated.add(translateY, dragY) }, { scaleY }],
  };

  // Statistics card animations
  const statisticsTop = matchHistoryAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 310],
  });

  const cardsContentOpacity = matchHistoryAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.5, 1],
  });

  const statisticsContentOpacity = matchHistoryAnimation.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0, 0, 1],
  });

  // Match history height animation - expands to just below statistics header
  const MATCH_HISTORY_HEADER_HEIGHT = 76;
  const RANK_CARD_BOTTOM = 316; // Rank card is at y=80, height=220, plus 16px gap
  const STATS_CARD_HEADER_HEIGHT = 60;
  const matchHistoryExpandedHeight = SCREEN_HEIGHT - RANK_CARD_BOTTOM - STATS_CARD_HEADER_HEIGHT - 8;
  const matchHistoryHeight = matchHistoryExpandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [MATCH_HISTORY_HEADER_HEIGHT, matchHistoryExpandedHeight],
  });

  // Match history chevron rotation
  const matchHistoryChevronRotation = matchHistoryExpandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // Render card content (shared between static card and modal card)
  const renderCardContent = (displayBack: boolean, isModal = false) => (
    <LinearGradient
      colors={['#1a1a1a', '#1e1e1e', '#222222']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.cardBackground}
    >
      {/* Animated metal sweep */}
      <Animated.View
        style={[styles.shimmerContainer, { transform: [{ translateX: shimmerTranslate }, { rotate: '20deg' }] }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.20)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shimmerGradient}
        />
      </Animated.View>

      <View style={[styles.innerBorder, { borderColor: `rgba(${rgb}, ${tierLevel === 1 ? 0.08 : tierLevel === 2 ? 0.12 : tierLevel <= 4 ? 0.18 : 0.22})` }]} />

      {displayBack ? (
        <View style={styles.cardBackContent}>
          {/* Header: Logo + LEAGUE | username */}
          <View style={styles.backHeader}>
            <View style={styles.backHeaderLeft}>
              <View style={styles.backLogoBox}>
                <Image source={require('@/assets/images/lol.png')} style={styles.backLogoIcon} resizeMode="contain" />
              </View>
              <ThemedText style={styles.backGameTitle}>LEAGUE</ThemedText>
            </View>
            <ThemedText style={styles.backHeaderUsername}>{username}</ThemedText>
          </View>

          {/* Current Rank - centered */}
          <View style={styles.backCurrentRank}>
            <Image source={getRankIcon(game.rank)} style={styles.backCurrentRankIcon} resizeMode="contain" />
            <View>
              <ThemedText style={[styles.backCurrentRankLabel, { color: tierColor }]}>SOLO / DUO</ThemedText>
              <ThemedText style={styles.backCurrentRankValue}>{formatRankDisplay(game.rank || 'Unranked')}</ThemedText>
            </View>
          </View>

          {/* Peak Rank + Win Rate row */}
          <View style={styles.backBottomRow}>
            <View style={styles.backStatItem}>
              <Image source={getRankIcon(game.peakRank?.tier || 'Unranked')} style={styles.backPeakIcon} resizeMode="contain" />
              <View>
                <ThemedText style={styles.backStatValue}>{formatRankDisplay(game.peakRank?.tier || 'N/A')}</ThemedText>
                <ThemedText style={[styles.backStatLabel, { color: tierColor }]}>PEAK RANK</ThemedText>
              </View>
            </View>

            <View style={styles.backStatDivider} />

            <View style={styles.backStatItem}>
              <View>
                <ThemedText style={styles.backStatValue}>{game.winRate}%</ThemedText>
                <ThemedText style={[styles.backStatLabel, { color: tierColor }]}>WIN RATE</ThemedText>
              </View>
            </View>
          </View>

          {/* View More - only on stack card */}
          {!isModal && (
            <TouchableOpacity style={styles.viewMoreButton} onPress={handlePress} activeOpacity={0.7}>
              <ThemedText style={styles.viewMoreText}>view stats  →</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.cardFront}>
          {/* Glass overlay for C+ */}
          {tierLevel >= 3 && (
            <LinearGradient
              colors={[`rgba(${rgb},0.06)`, 'rgba(0,0,0,0.1)', `rgba(${rgb},0.03)`, 'rgba(0,0,0,0.1)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.glassOverlay}
            />
          )}

          {/* Crosshatch pattern for B+ */}
          {tierLevel >= 4 && (
            <View style={styles.crosshatchPattern}>
              <View style={[styles.crossLine, { top: -20, left: 30, backgroundColor: `rgba(${rgb}, 0.06)` }]} />
              <View style={[styles.crossLine, { top: -20, left: 80, backgroundColor: `rgba(${rgb}, 0.04)` }]} />
              <View style={[styles.crossLine, { top: -20, right: 80, backgroundColor: `rgba(${rgb}, 0.04)` }]} />
              <View style={[styles.crossLine, { top: -20, right: 30, backgroundColor: `rgba(${rgb}, 0.06)` }]} />
              {tierLevel >= 5 && (
                <>
                  <View style={[styles.crossLineReverse, { top: -20, left: 30, backgroundColor: `rgba(${rgb}, 0.06)` }]} />
                  <View style={[styles.crossLineReverse, { top: -20, left: 80, backgroundColor: `rgba(${rgb}, 0.04)` }]} />
                  <View style={[styles.crossLineReverse, { top: -20, right: 80, backgroundColor: `rgba(${rgb}, 0.04)` }]} />
                  <View style={[styles.crossLineReverse, { top: -20, right: 30, backgroundColor: `rgba(${rgb}, 0.06)` }]} />
                </>
              )}
            </View>
          )}

          {/* Horizontal accent lines for B+ */}
          {tierLevel >= 4 && (
            <>
              <View style={{ position: 'absolute', left: 24, right: 24, top: '30%', height: 1, backgroundColor: `rgba(${rgb}, 0.05)` }} />
              <View style={{ position: 'absolute', left: 24, right: 24, top: '70%', height: 1, backgroundColor: `rgba(${rgb}, 0.05)` }} />
            </>
          )}

          {/* Logo watermark */}
          <Image source={require('@/assets/images/lol.png')} style={styles.backgroundLogo} resizeMode="contain" />

          {/* Corner accents: D=TL+BR, C+=all four */}
          {tierLevel >= 2 && (
            <>
              <View style={[styles.cornerAccentTL, { borderColor: `rgba(${rgb}, ${tierLevel <= 2 ? 0.25 : tierLevel <= 4 ? 0.35 : 0.4})` }]} />
              {tierLevel >= 3 && (
                <View style={[styles.cornerAccentTR, { borderColor: `rgba(${rgb}, ${tierLevel <= 4 ? 0.35 : 0.4})` }]} />
              )}
              {tierLevel >= 3 && (
                <View style={[styles.cornerAccentBL, { borderColor: `rgba(${rgb}, ${tierLevel <= 4 ? 0.35 : 0.4})` }]} />
              )}
              <View style={[styles.cornerAccentBR, { borderColor: `rgba(${rgb}, ${tierLevel <= 2 ? 0.25 : tierLevel <= 4 ? 0.35 : 0.4})` }]} />
            </>
          )}

          {/* B Tier: center dot */}
          {tierLevel === 4 && (
            <View style={{ position: 'absolute', top: '50%', left: '50%', marginTop: -3.5, marginLeft: -3.5, width: 7, height: 7, borderRadius: 3.5, backgroundColor: `rgba(${rgb}, 0.25)`, zIndex: 3 }} />
          )}

          {/* A+ Tier: center diamond */}
          {tierLevel >= 5 && (
            <View style={{ position: 'absolute', top: '50%', left: '50%', marginTop: -15, marginLeft: -15, width: 30, height: 30, borderWidth: 1.5, borderColor: `rgba(${rgb}, 0.3)`, transform: [{ rotate: '45deg' }], zIndex: 3 }} />
          )}

          {/* B+ Corner tick dots */}
          {tierLevel >= 4 && (
            <>
              <View style={{ position: 'absolute', top: 19, left: 38, width: 3, height: 3, borderRadius: 1.5, backgroundColor: `rgba(${rgb}, 0.3)`, zIndex: 4 }} />
              <View style={{ position: 'absolute', top: 19, right: 38, width: 3, height: 3, borderRadius: 1.5, backgroundColor: `rgba(${rgb}, 0.3)`, zIndex: 4 }} />
              <View style={{ position: 'absolute', bottom: 19, left: 38, width: 3, height: 3, borderRadius: 1.5, backgroundColor: `rgba(${rgb}, 0.3)`, zIndex: 4 }} />
              <View style={{ position: 'absolute', bottom: 19, right: 38, width: 3, height: 3, borderRadius: 1.5, backgroundColor: `rgba(${rgb}, 0.3)`, zIndex: 4 }} />
            </>
          )}
        </View>
      )}
    </LinearGradient>
  );

  return (
    <>
      <Animated.View style={{ opacity: stackCardOpacity }}>
        <Animated.View style={{ transform: [{ scaleY: stackScaleY }] }}>
          <TouchableOpacity
            ref={cardRef as any}
            style={styles.cardOuter}
            onPress={handleStackTap}
            activeOpacity={isFocused ? 0.9 : 1}
            disabled={!isFocused && viewOnly}
          >
            <LinearGradient
              colors={[
                `rgba(${rgb}, 0.9)`,
                `rgba(${rgb}, 0.3)`,
                `rgba(${rgb}, 0.6)`,
                `rgba(${rgb}, 0.2)`,
                `rgba(${rgb}, 0.8)`,
              ]}
              locations={[0, 0.25, 0.5, 0.75, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.rankCard}
            >
              <View style={styles.rankCardInner}>
                {renderCardContent(stackShowBack)}
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={handleCloseModal}>
        {/* Blurred overlay */}
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.overlayBackground, { opacity: overlayOpacity }]}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.blurTint} />
          </Animated.View>
        </View>

        {/* Animated card in modal */}
        <Animated.View
          style={[styles.modalCard, { left: cardPosition.x, width: cardPosition.width || undefined, opacity: modalCardOpacity }, modalCardStyle]}
          {...rankCardSwipePanResponder.panHandlers}
        >
          <View style={styles.shadow3} />
          <View style={styles.shadow2} />
          <View style={styles.shadow1} />
          <TouchableOpacity onPress={handleCardFlip} activeOpacity={0.95}>
            <LinearGradient
              colors={[
                `rgba(${rgb}, 0.9)`,
                `rgba(${rgb}, 0.3)`,
                `rgba(${rgb}, 0.6)`,
                `rgba(${rgb}, 0.2)`,
                `rgba(${rgb}, 0.8)`,
              ]}
              locations={[0, 0.25, 0.5, 0.75, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.rankCard}
            >
              <View style={styles.rankCardInner}>
                {renderCardContent(showBack, true)}
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Statistics Card */}
        <Animated.View
          style={[styles.statisticsCard, { borderTopColor: `rgba(${rgb}, 0.4)`, top: Animated.add(statisticsTop, dragY), bottom: 0, opacity: cardsContentOpacity }]}
        >
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            scrollEventThrottle={16}
            onScroll={(e) => { statsScrollOffset.current = e.nativeEvent.contentOffset.y; }}
            scrollEnabled={statsScrollEnabled}
            bounces={false}
            onTouchStart={handleStatsTouchStart}
            onTouchMove={handleStatsTouchMove}
            onTouchEnd={handleStatsTouchEnd}
          >
            <View style={styles.statisticsHeader}>
              <View style={styles.statisticsHeaderLeft}>
                <ThemedText style={styles.statisticsTitle}>STATS</ThemedText>
              </View>
              {isOwnCard && (
                <TouchableOpacity
                  onPress={handleUpdateStats}
                  disabled={updatingStats}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: updatingStats ? 0.5 : 1 }}
                  activeOpacity={0.6}
                >
                  <IconSymbol size={12} name="arrow.clockwise" color="#888" />
                  <ThemedText style={{ fontSize: 12, fontWeight: '600', color: '#888' }}>
                    {updatingStats ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>

            <Animated.View style={{ opacity: statisticsContentOpacity }}>
              {/* Win Rate */}
              <View style={styles.rankSectionRow}>
                <View style={styles.rankSectionInfo}>
                  <ThemedText style={styles.rankSectionLabel}>Win Rate</ThemedText>
                  <View style={styles.winRateRow}>
                    <ThemedText style={styles.rankSectionValue}>{game.winRate}%</ThemedText>
                    <ThemedText style={styles.winCount}>{game.wins}W</ThemedText>
                    <ThemedText style={styles.lossCount}>{game.losses}L</ThemedText>
                  </View>
                </View>
                <WinLossPieChart
                  wins={game.wins}
                  losses={game.losses}
                  winRate={game.winRate}
                  size={44}
                  strokeWidth={5}
                  winColor="#4ade80"
                  lossColor="#ef4444"
                  hideText={true}
                />
              </View>

              <View style={styles.rankSectionDivider} />

              {/* Most Played Champions */}
              <View style={styles.mostPlayedSection}>
                <ThemedText style={styles.rankSectionLabel}>Most Played</ThemedText>
                {game.topChampions && game.topChampions.length > 0 ? (
                  <>
                    <View style={styles.mostPlayedRow}>
                      {game.topChampions.map((champ) => {
                        const totalPoints = game.topChampions!.reduce((sum, c) => sum + c.championPoints, 0);
                        const percentage = totalPoints > 0 ? Math.round((champ.championPoints / totalPoints) * 100) : 0;
                        return (
                          <View key={champ.championId} style={styles.mostPlayedItem}>
                            <View style={styles.mostPlayedImageWrapper}>
                              <Image
                                source={{ uri: getChampionIconUrl(champ.championId) }}
                                style={styles.mostPlayedImage}
                                resizeMode="cover"
                              />
                            </View>
                            <ThemedText style={styles.mostPlayedPercentage}>
                              {percentage}<ThemedText style={styles.mostPlayedPercentSign}>%</ThemedText>
                            </ThemedText>
                          </View>
                        );
                      })}
                    </View>
                    {/* Match history subtitle */}
                    <ThemedText style={styles.matchHistorySubtitle}>
                      {game.matchHistory && game.matchHistory.length > 0
                        ? `Last ${game.matchHistory.length} games · ${game.matchHistory.filter(m => m.won).length}W ${game.matchHistory.filter(m => !m.won).length}L`
                        : 'No recent matches'}
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', paddingVertical: 16 }}>
                    No champion data available
                  </ThemedText>
                )}
              </View>
            </Animated.View>
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  cardOuter: { position: 'relative', height: 220 },
  shadow3: { position: 'absolute', top: 10, left: -10, right: 14, bottom: -10, backgroundColor: '#000', borderRadius: 18, opacity: 0.2 },
  shadow2: { position: 'absolute', top: 6, left: -6, right: 10, bottom: -6, backgroundColor: '#000', borderRadius: 17, opacity: 0.25 },
  shadow1: { position: 'absolute', top: 3, left: -3, right: 5, bottom: -3, backgroundColor: '#000', borderRadius: 16, opacity: 0.3 },
  rankCard: { borderRadius: 16, height: 220, padding: 1.5, overflow: 'hidden' },
  rankCardInner: { flex: 1, borderRadius: 14.5, overflow: 'hidden' },
  cardBackground: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  staticShimmer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 },
  staticShimmerRight: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 6 },
  shimmerContainer: { position: 'absolute', top: -100, left: -100, right: -100, bottom: -100, zIndex: 10 },
  shimmerGradient: { width: 200, height: '200%' },
  innerBorder: { position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(30, 100, 200, 0.18)' },
  cardFront: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  glassOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 },
  cornerAccentTL: { position: 'absolute', top: 16, left: 16, width: 20, height: 20, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: 'rgba(30, 100, 200, 0.4)', borderTopLeftRadius: 3, zIndex: 2 },
  cornerAccentTR: { position: 'absolute', top: 16, right: 16, width: 20, height: 20, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: 'rgba(30, 100, 200, 0.4)', borderTopRightRadius: 3, zIndex: 2 },
  cornerAccentBL: { position: 'absolute', bottom: 16, left: 16, width: 20, height: 20, borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderColor: 'rgba(30, 100, 200, 0.4)', borderBottomLeftRadius: 3, zIndex: 2 },
  cornerAccentBR: { position: 'absolute', bottom: 16, right: 16, width: 20, height: 20, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderColor: 'rgba(30, 100, 200, 0.4)', borderBottomRightRadius: 3, zIndex: 2 },
  backgroundLogo: { position: 'absolute', width: 200, height: 200, top: '50%', left: '50%', marginTop: -100, marginLeft: -100, opacity: 0.05 },
  crosshatchPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, overflow: 'hidden' },
  crossLine: { position: 'absolute', width: 1, height: 300, backgroundColor: 'rgba(30, 100, 200, 0.06)', transform: [{ rotate: '45deg' }] },
  crossLineGold: { position: 'absolute', width: 1, height: 300, backgroundColor: 'rgba(201, 168, 76, 0.04)', transform: [{ rotate: '45deg' }] },
  crossLineReverse: { position: 'absolute', width: 1, height: 300, backgroundColor: 'rgba(30, 100, 200, 0.06)', transform: [{ rotate: '-45deg' }] },
  crossLineReverseGold: { position: 'absolute', width: 1, height: 300, backgroundColor: 'rgba(201, 168, 76, 0.04)', transform: [{ rotate: '-45deg' }] },
  cardBackContent: { flex: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, overflow: 'hidden' },
  backWatermark: {
    position: 'absolute',
    width: 150,
    height: 150,
    left: '50%',
    top: '50%',
    marginLeft: -75,
    marginTop: -75,
    opacity: 0.07,
  },
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  backHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backLogoBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLogoIcon: {
    width: 17,
    height: 17,
  },
  backGameTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  backHeaderUsername: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  backCurrentRank: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 10,
  },
  backCurrentRankIcon: {
    width: 68,
    height: 68,
  },
  backCurrentRankLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 2,
  },
  backCurrentRankValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
  },
  backBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 2,
  },
  backStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  backStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backPeakIcon: {
    width: 26,
    height: 26,
  },
  backStatValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  backStatLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: -1,
  },
  viewMoreButton: {
    alignSelf: 'flex-end',
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  viewMoreText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B39DDB',
    letterSpacing: 0.3,
  },
  modalOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  overlayBackground: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  blurTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  modalCard: { position: 'absolute', top: 0, height: 220, zIndex: 2 },
  // Statistics Card
  statisticsCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    borderTopColor: 'rgba(30, 100, 200, 0.4)',
    overflow: 'hidden',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 20,
  },
  statisticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  statisticsHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  statisticsTitle: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  rankSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  rankSectionInfo: {
    flex: 1,
  },
  rankSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 4,
  },
  rankSectionValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  rankSectionIcon: {
    width: 52,
    height: 52,
  },
  winRateRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  winCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4ade80',
  },
  lossCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ef4444',
  },
  rankSectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 20,
  },
  mostPlayedSection: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
  },
  mostPlayedRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 16,
  },
  mostPlayedItem: {
    alignItems: 'center',
    flex: 1,
  },
  mostPlayedImageWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    marginBottom: 10,
  },
  mostPlayedImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.15 }],
  },
  mostPlayedPercentage: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  mostPlayedPercentSign: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
  },
  matchHistorySubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: 16,
  },
});
