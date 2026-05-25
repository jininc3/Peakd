import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import WinLossPieChart from './WinLossPieChart';
import LPLineChart from './LPLineChart';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, Modal, NativeScrollEvent, NativeSyntheticEvent, PanResponder, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { getValorantStats } from '@/services/valorantService';
import { getRankHistory, RankHistoryEntry } from '@/services/rankHistoryService';
import { auth } from '@/config/firebase';
import { calculateTierBorderColor, calculateTier } from '@/utils/tierBorderUtils';
import { formatRankDisplay } from '@/utils/formatRankDisplay';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MatchHistoryEntry {
  matchId: string;
  agent: string;
  kills: number;
  deaths: number;
  assists: number;
  won: boolean;
  map: string;
  gameStart: number; // Unix timestamp
  score: string; // e.g., "13-7"
  placement?: number; // Player's rank out of 10 by combat score
  currentRank?: string; // Player's rank at the time of this match
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
  matchHistory?: MatchHistoryEntry[];
  profileIconId?: number;
  valorantCard?: string; // Valorant player card URL
  peakRank?: { tier: string; season: string };
  gamesPlayed?: number;
  mmr?: number;
  accountLevel?: number;
  mostPlayedAgent?: string; // Most played agent from recent matches
}

interface ValorantRankCardProps {
  game: Game;
  username: string;
  viewOnly?: boolean; // If true, card is not clickable (for viewing other users)
  userId?: string; // ID of the user whose stats to view (for viewing other users)
  isFocused?: boolean; // If true, card is in focused/unstacked mode and can be flipped
  isBackOfStack?: boolean; // If true, card is behind another card in the stack
  onRefresh?: () => void; // Callback when stats are refreshed
  initialFlipped?: boolean; // If true, show the back of the card initially
  flipOnly?: boolean; // If true, tapping only flips the card (no modal)
}

// Valorant rank glow colors (matches rank icon dominant color)
const VALORANT_RANK_GLOW: { [key: string]: string } = {
  iron: '#8B7355',
  bronze: '#A07040',
  silver: '#9AA0A8',
  gold: '#D4A843',
  platinum: '#30CCBB',
  diamond: '#B77FE0',
  ascendant: '#3DAA5C',
  immortal: '#D44060',
  radiant: '#F5E070',
  unranked: '#555555',
};

const getRankGlowColor = (rank: string): string => {
  if (!rank || rank === 'Unranked' || rank === 'N/A') return VALORANT_RANK_GLOW.unranked;
  const base = rank.split(' ')[0].toLowerCase();
  return VALORANT_RANK_GLOW[base] || VALORANT_RANK_GLOW.unranked;
};

// Valorant rank icon mapping - Includes subdivision ranks
const VALORANT_RANK_ICONS: { [key: string]: any } = {
  // Base ranks (fallback)
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

  // Subdivision ranks
  iron1: require('@/assets/images/valorantranks/iron1.png'),
  iron2: require('@/assets/images/valorantranks/iron2.png'),
  iron3: require('@/assets/images/valorantranks/iron3.png'),
  bronze1: require('@/assets/images/valorantranks/bronze1.png'),
  bronze2: require('@/assets/images/valorantranks/bronze2.png'),
  bronze3: require('@/assets/images/valorantranks/bronze3.png'),
  silver1: require('@/assets/images/valorantranks/silver1.png'),
  silver2: require('@/assets/images/valorantranks/silver2.png'),
  silver3: require('@/assets/images/valorantranks/silver3.png'),
  gold1: require('@/assets/images/valorantranks/gold1.png'),
  gold2: require('@/assets/images/valorantranks/gold2.png'),
  gold3: require('@/assets/images/valorantranks/gold3.png'),
  platinum1: require('@/assets/images/valorantranks/platinum1.png'),
  platinum2: require('@/assets/images/valorantranks/platinum2.png'),
  platinum3: require('@/assets/images/valorantranks/platinum3.png'),
  diamond1: require('@/assets/images/valorantranks/diamond1.png'),
  diamond2: require('@/assets/images/valorantranks/diamond2.png'),
  diamond3: require('@/assets/images/valorantranks/diamond3.png'),
  ascendant1: require('@/assets/images/valorantranks/ascendant1.png'),
  ascendant2: require('@/assets/images/valorantranks/ascendant2.png'),
  ascendant3: require('@/assets/images/valorantranks/ascendant3.png'),
  immortal1: require('@/assets/images/valorantranks/immortal1.png'),
  immortal2: require('@/assets/images/valorantranks/immortal2.png'),
  immortal3: require('@/assets/images/valorantranks/immortal3.png'),
};

// Valorant agent small icons (for match history)
const VALORANT_AGENT_SMALL_ICONS: { [key: string]: any } = {
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
  miks: require('@/assets/images/valoranticons/miks.png'),
  neon: require('@/assets/images/valoranticons/neon.png'),
  omen: require('@/assets/images/valoranticons/omen.png'),
  phoenix: require('@/assets/images/valoranticons/phoenix.png'),
  raze: require('@/assets/images/valoranticons/raze.png'),
  reyna: require('@/assets/images/valoranticons/reyna.png'),
  sage: require('@/assets/images/valoranticons/sage.png'),
  skye: require('@/assets/images/valoranticons/skye.png'),
  sova: require('@/assets/images/valoranticons/sova.png'),
  tejo: require('@/assets/images/valoranticons/tejo.png'),
  veto: require('@/assets/images/valoranticons/veto.png'),
  viper: require('@/assets/images/valoranticons/viper.png'),
  vyse: require('@/assets/images/valoranticons/vyse.png'),
  waylay: require('@/assets/images/valoranticons/waylay.png'),
  yoru: require('@/assets/images/valoranticons/yoru.png'),
};

// Valorant map image mapping
const VALORANT_MAP_IMAGES: { [key: string]: any } = {
  abyss: require('@/assets/images/valorantmaps/Abyss.png'),
  ascent: require('@/assets/images/valorantmaps/Ascent.png'),
  bind: require('@/assets/images/valorantmaps/Bind.png'),
  breeze: require('@/assets/images/valorantmaps/Breeze.png'),
  corrode: require('@/assets/images/valorantmaps/Corrode.png'),
  fracture: require('@/assets/images/valorantmaps/Fracture.png'),
  haven: require('@/assets/images/valorantmaps/Haven.png'),
  icebox: require('@/assets/images/valorantmaps/Icebox.png'),
  lotus: require('@/assets/images/valorantmaps/Lotus.png'),
  pearl: require('@/assets/images/valorantmaps/Pearl.png'),
  split: require('@/assets/images/valorantmaps/Split.png'),
  sunset: require('@/assets/images/valorantmaps/Sunset.png'),
};

// Valorant agent image mapping (large, for statistics card)
const VALORANT_AGENT_ICONS: { [key: string]: any } = {
  astra: require('@/assets/images/valorantagents/astra.png'),
  breach: require('@/assets/images/valorantagents/breach.png'),
  brimstone: require('@/assets/images/valorantagents/brimstone.png'),
  chamber: require('@/assets/images/valorantagents/chamber.png'),
  clove: require('@/assets/images/valorantagents/clove.png'),
  cypher: require('@/assets/images/valorantagents/cypher.png'),
  deadlock: require('@/assets/images/valorantagents/deadlock.png'),
  fade: require('@/assets/images/valorantagents/fade.png'),
  gekko: require('@/assets/images/valorantagents/gekko.png'),
  harbor: require('@/assets/images/valorantagents/harbor.png'),
  iso: require('@/assets/images/valorantagents/iso.png'),
  jett: require('@/assets/images/valorantagents/jett.png'),
  kayo: require('@/assets/images/valorantagents/kayo.png'),
  killjoy: require('@/assets/images/valorantagents/killjoy.png'),
  miks: require('@/assets/images/valorantagents/miks.png'),
  neon: require('@/assets/images/valorantagents/neon.png'),
  omen: require('@/assets/images/valorantagents/omen.png'),
  phoenix: require('@/assets/images/valorantagents/phoenix.png'),
  raze: require('@/assets/images/valorantagents/raze.png'),
  reyna: require('@/assets/images/valorantagents/reyna.png'),
  sage: require('@/assets/images/valorantagents/sage.png'),
  skye: require('@/assets/images/valorantagents/skye.png'),
  sova: require('@/assets/images/valorantagents/sova.png'),
  tejo: require('@/assets/images/valorantagents/tejo.png'),
  veto: require('@/assets/images/valorantagents/veto.png'),
  viper: require('@/assets/images/valorantagents/viper.png'),
  vyse: require('@/assets/images/valorantagents/vyse.png'),
  waylay: require('@/assets/images/valorantagents/waylay.png'),
  yoru: require('@/assets/images/valorantagents/yoru.png'),
};

export default function ValorantRankCard({ game, username, viewOnly = false, userId, isFocused = false, isBackOfStack = false, onRefresh, initialFlipped = false, flipOnly = false }: ValorantRankCardProps) {
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

  const statsScrollRef = useRef<ScrollView>(null);

  // Calculate most played agent from match history if not provided
  const mostPlayedAgent = game.mostPlayedAgent || (() => {
    if (!game.matchHistory || game.matchHistory.length === 0) return null;
    const agentCounts: { [agent: string]: number } = {};
    game.matchHistory.forEach((match) => {
      if (match.agent) {
        agentCounts[match.agent] = (agentCounts[match.agent] || 0) + 1;
      }
    });
    let topAgent: string | null = null;
    let maxCount = 0;
    for (const [agent, count] of Object.entries(agentCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topAgent = agent;
      }
    }
    return topAgent;
  })();

  const cardRef = useRef<View>(null);
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
  const tierColor = useMemo(() => calculateTierBorderColor(undefined, game.rank) || '#ef5466', [game.rank]);
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  };
  const rgb = useMemo(() => hexToRgb(tierColor), [tierColor]);

  const tierLevel = useMemo(() => {
    const tier = calculateTier(undefined, game.rank);
    if (!tier) return 1;
    const levels: Record<string, number> = { F: 1, D: 2, C: 3, B: 4, A: 5, S: 6 };
    return levels[tier];
  }, [game.rank]);

  // Prefetch valorant player card so it loads instantly when card is flipped
  useEffect(() => {
    if (game.valorantCard) {
      Image.prefetch(game.valorantCard);
    }
  }, [game.valorantCard]);

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
      startY.setValue(y); // Set immediately for animation

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
        getRankHistory(targetUserId, 'valorant').then(setRankHistory).catch(() => {});
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
            easing: Easing.out(Easing.back(1.1)), // Slight overshoot for smooth feel
            useNativeDriver: false,
          }),
          Animated.timing(matchHistoryAnimation, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.back(1.05)), // Match the card slide timing
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
      await getValorantStats(true);
      onRefresh?.();
    } catch (error) {
      console.log('Failed to refresh Valorant stats:', error);
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
      // Flip back to front
      Animated.spring(flipAnimation, {
        toValue: 0,
        friction: 7,
        tension: 20,
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
      setModalVisible(false);
      setIsFlipped(false);
      matchHistoryAnimation.setValue(0);
      setShowMatchHistory(false);
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
        // Only respond to vertical swipes (up) when collapsed
        return !matchHistoryExpandedRef.current && gestureState.dy < -10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        // If swiped up more than 30px, expand
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
        // Only respond to vertical swipes (down) when expanded
        return matchHistoryExpandedRef.current && gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        // If swiped down more than 30px, collapse
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

  const handleMatchHistoryPress = () => {
    if (showMatchHistory) {
      // Collapse match history
      Animated.timing(matchHistoryAnimation, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        setShowMatchHistory(false);
      });
    } else {
      // Expand match history
      setShowMatchHistory(true);
      Animated.timing(matchHistoryAnimation, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.back(1.05)),
        useNativeDriver: false,
      }).start();
    }
  };

  const getRankIcon = (rank: string) => {
    if (!rank || rank === 'Unranked') {
      return VALORANT_RANK_ICONS.unranked;
    }

    const parts = rank.split(' ');
    const tier = parts[0].toLowerCase();
    const subdivision = parts[1];

    if (subdivision) {
      const subdivisionKey = tier + subdivision;
      if (VALORANT_RANK_ICONS[subdivisionKey]) {
        return VALORANT_RANK_ICONS[subdivisionKey];
      }
    }

    return VALORANT_RANK_ICONS[tier] || VALORANT_RANK_ICONS.unranked;
  };

  const getAgentIcon = (agent: string) => {
    if (!agent) return null;
    const agentKey = agent.toLowerCase().replace(/[^a-z]/g, '');
    return VALORANT_AGENT_ICONS[agentKey] || null;
  };

  const getAgentSmallIcon = (agent: string) => {
    if (!agent) return null;
    const agentKey = agent.toLowerCase().replace(/[^a-z]/g, '');
    return VALORANT_AGENT_SMALL_ICONS[agentKey] || null;
  };

  // Scale-based flip animation (more reliable than 3D rotation)
  const scaleY = flipAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 1],
  });

  // Slide animation - moves card from its exact position to top
  // translateY = startY * (1 - slide) + 80 * slide
  const inverseSlide = slideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const translateY = Animated.add(
    Animated.multiply(startY, inverseSlide),
    Animated.multiply(slideAnimation, 80)
  );

  // Statistics card slides up from bottom to just below rank card
  const STATS_CARD_HEADER_HEIGHT = 58;
  const STATS_CARD_FULL_HEIGHT = 220;
  const MATCH_HISTORY_HEADER_HEIGHT = 76;
  const RANK_CARD_BOTTOM = 316; // Rank card is at y=80, height=220, plus 16px gap

  // Statistics card top position - slides up to just below rank card
  const statisticsTop = matchHistoryAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, RANK_CARD_BOTTOM], // Start off-screen, end just below rank card
  });

  // Statistics card height - shrinks when match history expands
  const statisticsHeight = matchHistoryExpandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [STATS_CARD_FULL_HEIGHT, STATS_CARD_HEADER_HEIGHT], // Full height to just header
  });

  // Statistics content opacity - fades out when match history expands
  const statisticsContentOpacity = matchHistoryExpandAnimation.interpolate({
    inputRange: [0, 0.3],
    outputRange: [1, 0],
  });

  // Match history height - expands when clicked, stops below Statistics header divider
  const matchHistoryExpandedHeight = SCREEN_HEIGHT - RANK_CARD_BOTTOM - STATS_CARD_HEADER_HEIGHT - 8; // 8px below the divider
  const matchHistoryHeight = matchHistoryExpandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [MATCH_HISTORY_HEADER_HEIGHT, matchHistoryExpandedHeight], // From header only to below stats header divider
  });

  // Match history chevron rotation
  const matchHistoryChevronRotation = matchHistoryExpandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // Statistics/cards visibility (fade in when modal opens)
  const cardsContentOpacity = matchHistoryAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

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
        style={[
          styles.shimmerContainer,
          { transform: [{ translateX: shimmerTranslate }, { rotate: '20deg' }] },
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[
            'transparent',
            'rgba(255,255,255,0.03)',
            'rgba(255,255,255,0.10)',
            'rgba(255,255,255,0.20)',
            'rgba(255,255,255,0.10)',
            'rgba(255,255,255,0.03)',
            'transparent',
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shimmerGradient}
        />
      </Animated.View>

      {/* Inside border */}
      <View style={[styles.innerBorder, { borderColor: `rgba(${rgb}, ${tierLevel === 1 ? 0.08 : tierLevel === 2 ? 0.12 : tierLevel <= 4 ? 0.18 : 0.22})` }]} />

      {displayBack ? (
        /* Back content */
        <View style={styles.cardBackContent}>
          {/* Header: Logo + VALORANT | username */}
          <View style={styles.backHeader}>
            <View style={styles.backHeaderLeft}>
              <View style={styles.backLogoBox}>
                <Image source={require('@/assets/images/valorant-red.png')} style={styles.backLogoIcon} resizeMode="contain" />
              </View>
              <ThemedText style={styles.backGameTitle}>VALORANT</ThemedText>
            </View>
            <ThemedText style={styles.backHeaderUsername}>{username}</ThemedText>
          </View>

          {/* Current Rank - centered */}
          <View style={styles.backCurrentRank}>
            <Image source={getRankIcon(game.rank)} style={styles.backCurrentRankIcon} resizeMode="contain" />
            <View>
              <ThemedText style={[styles.backCurrentRankLabel, { color: tierColor }]}>CURRENT RANK</ThemedText>
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
        /* Front content */
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

          {/* Background triangle pattern for B+ */}
          {tierLevel >= 4 && (
            <View style={styles.trianglePattern}>
              <View style={[styles.triangle, { top: 25, left: 30, borderBottomColor: `rgba(${rgb}, 0.06)` }]} />
              <View style={[styles.triangle, { top: 25, left: 70, borderBottomColor: `rgba(${rgb}, 0.06)` }]} />
              <View style={[styles.triangle, { top: 25, right: 70, borderBottomColor: `rgba(${rgb}, 0.06)` }]} />
              <View style={[styles.triangle, { top: 25, right: 30, borderBottomColor: `rgba(${rgb}, 0.06)` }]} />
              <View style={[styles.triangleInverted, { top: 55, left: 50, borderTopColor: `rgba(${rgb}, 0.04)` }]} />
              <View style={[styles.triangleInverted, { top: 55, right: 50, borderTopColor: `rgba(${rgb}, 0.04)` }]} />
              <View style={[styles.triangle, { bottom: 55, left: 30, borderBottomColor: `rgba(${rgb}, 0.06)` }]} />
              <View style={[styles.triangle, { bottom: 55, left: 70, borderBottomColor: `rgba(${rgb}, 0.06)` }]} />
              <View style={[styles.triangle, { bottom: 55, right: 70, borderBottomColor: `rgba(${rgb}, 0.06)` }]} />
              <View style={[styles.triangle, { bottom: 55, right: 30, borderBottomColor: `rgba(${rgb}, 0.06)` }]} />
              <View style={[styles.triangleInverted, { bottom: 25, left: 50, borderTopColor: `rgba(${rgb}, 0.04)` }]} />
              <View style={[styles.triangleInverted, { bottom: 25, right: 50, borderTopColor: `rgba(${rgb}, 0.04)` }]} />
            </View>
          )}

          {/* Horizontal accent lines for B+ */}
          {tierLevel >= 4 && (
            <>
              <View style={{ position: 'absolute', left: 24, right: 24, top: '30%', height: 1, backgroundColor: `rgba(${rgb}, 0.05)` }} />
              <View style={{ position: 'absolute', left: 24, right: 24, top: '70%', height: 1, backgroundColor: `rgba(${rgb}, 0.05)` }} />
            </>
          )}

          {/* Valorant logo watermark */}
          <Image
            source={require('@/assets/images/valorant-red.png')}
            style={styles.backgroundLogo}
            resizeMode="contain"
          />

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
            <View style={styles.diamondContainer}>
              <View style={[styles.diamond, { borderColor: `rgba(${rgb}, 0.3)` }]}>
                <View style={[styles.diamondDot, { backgroundColor: `rgba(${rgb}, 0.4)` }]} />
              </View>
            </View>
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

      {/* Modal for expanded card view */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={handleCloseModal}
      >
        {/* Blurred overlay - not tappable, only swipe down on cards closes modal */}
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[styles.overlayBackground, { opacity: overlayOpacity }]}
          >
            <BlurView
              intensity={40}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            {/* Dark tint over blur */}
            <View style={styles.blurTint} />
          </Animated.View>
        </View>

        {/* Animated card in modal - positioned exactly over original */}
        <Animated.View
          style={[
            styles.modalCard,
            { left: cardPosition.x, width: cardPosition.width || undefined, opacity: modalCardOpacity },
            modalCardStyle
          ]}
          {...rankCardSwipePanResponder.panHandlers}
        >
          {/* 3D Shadow layers */}
          <View style={styles.shadow3} />
          <View style={styles.shadow2} />
          <View style={styles.shadow1} />

          <TouchableOpacity
            onPress={handleCardFlip}
            activeOpacity={0.95}
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
                {renderCardContent(showBack, true)}
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Statistics Card */}
        <Animated.View
          style={[
            styles.statisticsCard,
            {
              borderTopColor: `rgba(${rgb}, 0.4)`,
              top: Animated.add(statisticsTop, dragY),
              bottom: 0,
              opacity: cardsContentOpacity,
            }
          ]}
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

              {/* Most Played Agents */}
              <View style={styles.mostPlayedSection}>
                <ThemedText style={styles.rankSectionLabel}>Most Played</ThemedText>
                {game.matchHistory && game.matchHistory.length > 0 ? (
                  <>
                    <View style={styles.mostPlayedRow}>
                      {(() => {
                        const agentCounts: { [agent: string]: number } = {};
                        game.matchHistory!.forEach((m) => {
                          if (m.agent) agentCounts[m.agent] = (agentCounts[m.agent] || 0) + 1;
                        });
                        const sorted = Object.entries(agentCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
                        const totalGames = game.matchHistory!.length;
                        return sorted.map(([agent, count]) => {
                          const percentage = Math.round((count / totalGames) * 100);
                          const icon = getAgentSmallIcon(agent);
                          return (
                            <View key={agent} style={styles.mostPlayedItem}>
                              <View style={styles.mostPlayedImageWrapper}>
                                {icon ? (
                                  <Image source={icon} style={styles.mostPlayedImage} resizeMode="cover" />
                                ) : (
                                  <ThemedText style={{ fontSize: 11, color: '#888', textAlign: 'center' }}>{agent}</ThemedText>
                                )}
                              </View>
                              <ThemedText style={styles.mostPlayedPercentage}>
                                {percentage}<ThemedText style={styles.mostPlayedPercentSign}>%</ThemedText>
                              </ThemedText>
                            </View>
                          );
                        });
                      })()}
                    </View>
                  </>
                ) : (
                  <ThemedText style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', paddingVertical: 16 }}>
                    No agent data available
                  </ThemedText>
                )}
              </View>

              {/* Match History */}
              {game.matchHistory && game.matchHistory.length > 0 && (
                <>
                  <View style={styles.rankSectionDivider} />
                  <View style={styles.matchHistorySection}>
                    <ThemedText style={styles.rankSectionLabel}>
                      Last {game.matchHistory.length} Games
                    </ThemedText>
                    <View style={styles.matchCardList}>
                      {game.matchHistory.map((match, index) => {
                        const agentIcon = getAgentSmallIcon(match.agent);
                        const rankIcon = match.currentRank ? getRankIcon(match.currentRank) : null;
                        const timestamp = match.gameStart < 10000000000 ? match.gameStart * 1000 : match.gameStart;
                        const now = Date.now();
                        const diffMs = now - timestamp;
                        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                        let dateText: string;
                        if (diffHours < 1) dateText = 'Just now';
                        else if (diffHours < 24) dateText = 'Today';
                        else if (diffDays === 1) dateText = 'Yesterday';
                        else if (diffDays < 7) dateText = `${diffDays}d ago`;
                        else {
                          const d = new Date(timestamp);
                          dateText = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                        }

                        return (
                          <View key={match.matchId || index} style={[styles.matchCard, { borderLeftColor: match.won ? '#4ade80' : '#ef4444' }]}>
                            {/* Faded map background with gradient reveal on right */}
                            {VALORANT_MAP_IMAGES[match.map?.toLowerCase()] && (
                              <>
                                <Image
                                  source={VALORANT_MAP_IMAGES[match.map.toLowerCase()]}
                                  style={styles.matchCardMapBg}
                                  resizeMode="cover"
                                />
                                {/* Left fade */}
                                <LinearGradient
                                  colors={['#222', 'rgba(34,34,34,0)']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 0.5, y: 0 }}
                                  style={styles.matchCardMapGradient}
                                  pointerEvents="none"
                                />
                                {/* Right fade */}
                                <LinearGradient
                                  colors={['rgba(34,34,34,0)', '#222']}
                                  start={{ x: 0.7, y: 0 }}
                                  end={{ x: 1, y: 0 }}
                                  style={styles.matchCardMapGradient}
                                  pointerEvents="none"
                                />
                                {/* Bottom fade */}
                                <LinearGradient
                                  colors={['rgba(34,34,34,0)', 'rgba(34,34,34,0.3)', 'rgba(34,34,34,0.8)', '#222']}
                                  locations={[0.3, 0.5, 0.75, 1]}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 0, y: 1 }}
                                  style={styles.matchCardMapGradient}
                                  pointerEvents="none"
                                />
                              </>
                            )}
                            <View style={styles.matchCardContent}>
                              {/* Header: date + result badge */}
                              <View style={styles.matchCardHeader}>
                                <ThemedText style={styles.matchCardDate}>{dateText}</ThemedText>
                                <View style={[styles.matchResultBadge, match.won ? styles.matchResultBadgeWin : styles.matchResultBadgeLoss]}>
                                  <ThemedText style={[styles.matchResultBadgeText, match.won ? { color: '#4ade80' } : { color: '#ef4444' }]}>
                                    {match.won ? 'Victory' : 'Defeat'}
                                  </ThemedText>
                                </View>
                              </View>

                              {/* Agent row: icon + name/map + rank */}
                              <View style={styles.matchCardAgentRow}>
                                <View style={styles.matchCardAgentIcon}>
                                  {agentIcon ? (
                                    <Image source={agentIcon} style={styles.matchCardAgentImg} resizeMode="cover" />
                                  ) : (
                                    <ThemedText style={{ fontSize: 14, color: '#888', fontWeight: '700' }}>{match.agent?.charAt(0)}</ThemedText>
                                  )}
                                </View>
                                <View style={{ flex: 1 }}>
                                  <ThemedText style={styles.matchCardAgentName}>{match.agent}</ThemedText>
                                  <ThemedText style={styles.matchCardMapName}>{match.map}</ThemedText>
                                </View>
                                {rankIcon && (
                                  <Image source={rankIcon} style={styles.matchCardRankIcon} resizeMode="contain" />
                                )}
                              </View>

                              {/* Stats row: KDA + Score + Placement */}
                              <View style={styles.matchCardStatsRow}>
                                <View style={styles.matchCardStat}>
                                  <ThemedText style={styles.matchCardStatValue}>{match.kills}/{match.deaths}/{match.assists}</ThemedText>
                                  <ThemedText style={styles.matchCardStatLabel}>KDA</ThemedText>
                                </View>
                                <View style={styles.matchCardStat}>
                                  <ThemedText style={styles.matchCardStatValue}>{match.score || '-'}</ThemedText>
                                  <ThemedText style={styles.matchCardStatLabel}>Score</ThemedText>
                                </View>
                                {match.placement && (
                                  <View style={styles.matchCardStat}>
                                    <ThemedText style={[styles.matchCardStatValue, match.placement === 1 && { color: '#FFD700' }]}>
                                      {match.placement === 1 ? 'MVP' : `#${match.placement}`}
                                    </ThemedText>
                                    <ThemedText style={styles.matchCardStatLabel}>Rank</ThemedText>
                                  </View>
                                )}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </>
              )}
            </Animated.View>
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    position: 'relative',
    height: 220,
  },
  // 3D Shadow layers
  shadow3: {
    position: 'absolute',
    top: 10,
    left: -10,
    right: 14,
    bottom: -10,
    backgroundColor: '#000',
    borderRadius: 18,
    opacity: 0.2,
  },
  shadow2: {
    position: 'absolute',
    top: 6,
    left: -6,
    right: 10,
    bottom: -6,
    backgroundColor: '#000',
    borderRadius: 17,
    opacity: 0.25,
  },
  shadow1: {
    position: 'absolute',
    top: 3,
    left: -3,
    right: 5,
    bottom: -3,
    backgroundColor: '#000',
    borderRadius: 16,
    opacity: 0.3,
  },
  rankCard: {
    borderRadius: 16,
    height: 220,
    padding: 1.5,
    overflow: 'hidden',
  },
  rankCardInner: {
    flex: 1,
    borderRadius: 14.5,
    overflow: 'hidden',
  },
  cardBackground: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  staticShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  staticShimmerRight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
  },
  shimmerContainer: {
    position: 'absolute',
    top: -100,
    left: -100,
    right: -100,
    bottom: -100,
    zIndex: 10,
  },
  shimmerGradient: {
    width: 200,
    height: '200%',
  },
  innerBorder: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 84, 102, 0.18)',
  },
  cardFront: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  cornerAccentTL: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 20,
    height: 20,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderColor: 'rgba(239, 84, 102, 0.4)',
    borderTopLeftRadius: 3,
    zIndex: 2,
  },
  cornerAccentTR: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 20,
    height: 20,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(239, 84, 102, 0.4)',
    borderTopRightRadius: 3,
    zIndex: 2,
  },
  cornerAccentBL: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    width: 20,
    height: 20,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
    borderColor: 'rgba(239, 84, 102, 0.4)',
    borderBottomLeftRadius: 3,
    zIndex: 2,
  },
  cornerAccentBR: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 20,
    height: 20,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(239, 84, 102, 0.4)',
    borderBottomRightRadius: 3,
    zIndex: 2,
  },
  backgroundLogo: {
    position: 'absolute',
    width: 200,
    height: 200,
    top: '50%',
    left: '50%',
    marginTop: -100,
    marginLeft: -100,
    opacity: 0.04,
  },
  // Night Market Diamond elements
  trianglePattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  triangle: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderBottomWidth: 24,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(239, 84, 102, 0.04)',
  },
  triangleInverted: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderTopWidth: 24,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(239, 84, 102, 0.04)',
  },
  crossLine: {
    position: 'absolute',
    width: 1,
    height: 300,
    transform: [{ rotate: '45deg' }],
  },
  crossLineReverse: {
    position: 'absolute',
    width: 1,
    height: 300,
    transform: [{ rotate: '-45deg' }],
  },
  diamondContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -20,
    marginLeft: -20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  diamond: {
    width: 30,
    height: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(239, 84, 102, 0.6)',
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamondDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(239, 84, 102, 0.7)',
  },
  // Back of card styles
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
  // Bottom Stats Bar
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  statsBarItem: {
    flex: 1,
    alignItems: 'center',
  },
  statsBarValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  statsBarLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
    textTransform: 'uppercase',
  },
  statsBarDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  // Stats Layout (legacy)
  statsLayout: {
    position: 'absolute',
    top: 58,
    left: 16,
    right: 16,
    bottom: 14,
    justifyContent: 'space-between',
  },
  // Main Stats (Current & Peak Rank)
  mainStatsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  mainStatItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainStatLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  mainRankIcon: {
    width: 48,
    height: 48,
    marginBottom: 4,
  },
  mainStatValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  mainStatSubtext: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  mainStatDivider: {
    width: 1,
    height: 70,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 12,
  },
  // Side Stats (Win Rate, Games, MMR)
  sideStatsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  sideStatItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideStatLabel: {
    fontSize: 6,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  sideStatValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  sideStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 4,
  },
  // Modal styles
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blurTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  modalCard: {
    position: 'absolute',
    top: 0,
    zIndex: 2,
  },
  // Statistics Card styles - stretches from below rank card to bottom, behind match history
  statisticsCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    borderTopColor: 'rgba(239, 84, 102, 0.4)',
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
    paddingTop: 20,
    paddingBottom: 16,
  },
  statisticsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statisticsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
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
  rankSectionSubValue: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
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
    alignItems: 'center',
    justifyContent: 'center',
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
  matchHistorySection: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  matchCardList: {
    marginTop: 12,
    gap: 8,
  },
  matchCard: {
    backgroundColor: '#222',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#4ade80',
    overflow: 'hidden',
    padding: 10,
    position: 'relative',
  },
  matchCardMapBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.3,
  },
  matchCardMapGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  matchCardContent: {
    zIndex: 2,
  },
  matchCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  matchCardDate: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
  },
  matchResultBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
  matchResultBadgeWin: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
  },
  matchResultBadgeLoss: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  matchResultBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  matchCardAgentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  matchCardAgentIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCardAgentImg: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.15 }],
  },
  matchCardRankIcon: {
    width: 28,
    height: 28,
  },
  matchCardAgentName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  matchCardMapName: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
  },
  matchCardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  matchCardStat: {
    alignItems: 'center',
  },
  matchCardStatValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  matchCardStatLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});