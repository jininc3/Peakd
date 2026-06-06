import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter } from '@/hooks/useRouter';
import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { TIER_COLORS } from '@/utils/tierBorderUtils';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
};

// League rank images mapping
const leagueRankImages: { [key: string]: any } = {
  'Unranked': require('@/assets/images/leagueranks/unranked.png'),
  'Iron': require('@/assets/images/leagueranks/iron.png'),
  'Bronze': require('@/assets/images/leagueranks/bronze.png'),
  'Silver': require('@/assets/images/leagueranks/silver.png'),
  'Gold': require('@/assets/images/leagueranks/gold.png'),
  'Platinum': require('@/assets/images/leagueranks/platinum.png'),
  'Emerald': require('@/assets/images/leagueranks/emerald.png'),
  'Diamond': require('@/assets/images/leagueranks/diamond.png'),
  'Master': require('@/assets/images/leagueranks/masters.png'),
  'Grandmaster': require('@/assets/images/leagueranks/grandmaster.png'),
  'Challenger': require('@/assets/images/leagueranks/challenger.png'),
};

// Valorant rank images mapping
const valorantRankImages: { [key: string]: any } = {
  'Unranked': require('@/assets/images/valorantranks/unranked.png'),
  'Iron 1': require('@/assets/images/valorantranks/iron1.png'),
  'Iron 2': require('@/assets/images/valorantranks/iron2.png'),
  'Iron 3': require('@/assets/images/valorantranks/iron3.png'),
  'Bronze 1': require('@/assets/images/valorantranks/bronze1.png'),
  'Bronze 2': require('@/assets/images/valorantranks/bronze2.png'),
  'Bronze 3': require('@/assets/images/valorantranks/bronze3.png'),
  'Silver 1': require('@/assets/images/valorantranks/silver1.png'),
  'Silver 2': require('@/assets/images/valorantranks/silver2.png'),
  'Silver 3': require('@/assets/images/valorantranks/silver3.png'),
  'Gold 1': require('@/assets/images/valorantranks/gold1.png'),
  'Gold 2': require('@/assets/images/valorantranks/gold2.png'),
  'Gold 3': require('@/assets/images/valorantranks/gold3.png'),
  'Platinum 1': require('@/assets/images/valorantranks/platinum1.png'),
  'Platinum 2': require('@/assets/images/valorantranks/platinum2.png'),
  'Platinum 3': require('@/assets/images/valorantranks/platinum3.png'),
  'Diamond 1': require('@/assets/images/valorantranks/diamond1.png'),
  'Diamond 2': require('@/assets/images/valorantranks/diamond2.png'),
  'Diamond 3': require('@/assets/images/valorantranks/diamond3.png'),
  'Ascendant 1': require('@/assets/images/valorantranks/ascendant1.png'),
  'Ascendant 2': require('@/assets/images/valorantranks/ascendant2.png'),
  'Ascendant 3': require('@/assets/images/valorantranks/ascendant3.png'),
  'Immortal 1': require('@/assets/images/valorantranks/immortal1.png'),
  'Immortal 2': require('@/assets/images/valorantranks/immortal2.png'),
  'Immortal 3': require('@/assets/images/valorantranks/immortal3.png'),
  'Radiant': require('@/assets/images/valorantranks/radiant.png'),
};

const TIER_PREVIEW_DATA: { tier: string; color: string; level: number; ranks: { lol: string[]; valorant: string[] } }[] = [
  { tier: 'F', color: TIER_COLORS.F, level: 1, ranks: { lol: ['Unranked', 'Iron', 'Bronze'], valorant: ['Unranked', 'Iron 1', 'Iron 2', 'Iron 3', 'Bronze 1', 'Bronze 2', 'Bronze 3'] } },
  { tier: 'D', color: TIER_COLORS.D, level: 2, ranks: { lol: ['Silver', 'Gold'], valorant: ['Silver 1', 'Silver 2', 'Silver 3'] } },
  { tier: 'C', color: TIER_COLORS.C, level: 3, ranks: { lol: ['Platinum', 'Emerald'], valorant: ['Gold 1', 'Gold 2', 'Gold 3', 'Platinum 1', 'Platinum 2'] } },
  { tier: 'B', color: TIER_COLORS.B, level: 4, ranks: { lol: ['Emerald', 'Diamond'], valorant: ['Platinum 3', 'Diamond 1', 'Diamond 2', 'Diamond 3', 'Ascendant 1'] } },
  { tier: 'A', color: TIER_COLORS.A, level: 5, ranks: { lol: ['Diamond', 'Master'], valorant: ['Ascendant 2', 'Ascendant 3', 'Immortal 1'] } },
  { tier: 'S', color: TIER_COLORS.S, level: 6, ranks: { lol: ['Grandmaster', 'Challenger'], valorant: ['Immortal 2', 'Immortal 3', 'Radiant'] } },
];

function FlippableTierCard({ data, shimmerTranslate, shimmerTranslate2, glowOpacity }: {
  data: typeof TIER_PREVIEW_DATA[0];
  shimmerTranslate: Animated.AnimatedInterpolation<string | number>;
  shimmerTranslate2: Animated.AnimatedInterpolation<string | number>;
  glowOpacity: Animated.AnimatedInterpolation<string | number>;
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;

  const handleFlip = () => {
    Animated.spring(flipAnim, {
      toValue: isFlipped ? 0 : 1,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const rgb = hexToRgb(data.color);
  const { level } = data;

  const renderFront = () => (
    <Animated.View style={[styles.flipFace, { transform: [{ rotateY: frontRotate }], backfaceVisibility: 'hidden' }]}>
      <LinearGradient
        colors={
          level === 6
            ? [`rgba(${rgb}, 1)`, `rgba(${rgb}, 0.5)`, `rgba(${rgb}, 0.8)`, `rgba(${rgb}, 0.4)`, `rgba(${rgb}, 1)`]
            : [`rgba(${rgb}, 0.9)`, `rgba(${rgb}, 0.3)`, `rgba(${rgb}, 0.6)`, `rgba(${rgb}, 0.2)`, `rgba(${rgb}, 0.8)`]
        }
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.rankCard, level === 6 && { padding: 2 }]}
      >
        <View style={styles.rankCardInner}>
          <LinearGradient
            colors={level === 6 ? ['#1c1a14', '#1e1c16', '#201e18', '#1e1c16', '#1c1a14'] : ['#1a1a1a', '#1e1e1e', '#222222']}
            locations={level === 6 ? [0, 0.25, 0.5, 0.75, 1] : undefined}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardBackground}
          >
            {level === 6 ? (
              <>
                <Animated.View
                  style={[styles.shimmerContainer, { transform: [{ translateX: shimmerTranslate }, { rotate: '20deg' }] }]}
                  pointerEvents="none"
                >
                  <LinearGradient
                    colors={['transparent', `rgba(${rgb}, 0.04)`, `rgba(${rgb}, 0.18)`, 'rgba(255,255,255,0.30)', `rgba(${rgb}, 0.18)`, `rgba(${rgb}, 0.04)`, 'transparent']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.shimmerGradient}
                  />
                </Animated.View>
                <Animated.View
                  style={[styles.shimmerContainer, { transform: [{ translateX: shimmerTranslate2 }, { rotate: '-25deg' }] }]}
                  pointerEvents="none"
                >
                  <LinearGradient
                    colors={['transparent', `rgba(${rgb}, 0.03)`, `rgba(${rgb}, 0.12)`, 'rgba(255,255,255,0.18)', `rgba(${rgb}, 0.12)`, `rgba(${rgb}, 0.03)`, 'transparent']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.shimmerGradient}
                  />
                </Animated.View>
                <Animated.View style={[styles.radialGlow, { opacity: glowOpacity }]} pointerEvents="none">
                  <LinearGradient
                    colors={[`rgba(${rgb}, 0.12)`, `rgba(${rgb}, 0.04)`, 'transparent']}
                    start={{ x: 0.5, y: 0.5 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                <LinearGradient
                  colors={[`rgba(${rgb}, 0.10)`, 'rgba(0,0,0,0.05)', `rgba(${rgb}, 0.08)`, 'rgba(0,0,0,0.05)', `rgba(${rgb}, 0.06)`]}
                  locations={[0, 0.25, 0.5, 0.75, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.glassOverlay}
                />
                <View style={[styles.innerBorder, { top: 6, left: 6, right: 6, bottom: 6, borderRadius: 11, borderColor: `rgba(${rgb}, 0.12)` }]} />
                <View style={[styles.innerBorder, { borderColor: `rgba(${rgb}, 0.30)` }]} />
                {[72, 110, 160, 220, 300].map((size, i) => (
                  <View
                    key={`ring${i}`}
                    style={[
                      styles.concentricRing,
                      {
                        width: size,
                        height: size,
                        marginTop: -size / 2,
                        marginLeft: -size / 2,
                        borderColor: `rgba(${rgb}, ${[0.14, 0.10, 0.07, 0.05, 0.03][i]})`,
                      },
                    ]}
                  />
                ))}
                <View style={[styles.cornerTL, { width: 28, height: 28, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderColor: `rgba(${rgb}, 0.55)` }]} />
                <View style={[styles.cornerTR, { width: 28, height: 28, borderTopWidth: 2.5, borderRightWidth: 2.5, borderColor: `rgba(${rgb}, 0.55)` }]} />
                <View style={[styles.cornerBL, { width: 28, height: 28, borderBottomWidth: 2.5, borderLeftWidth: 2.5, borderColor: `rgba(${rgb}, 0.55)` }]} />
                <View style={[styles.cornerBR, { width: 28, height: 28, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderColor: `rgba(${rgb}, 0.55)` }]} />
                <View style={[styles.accentDot, { top: 20, left: 42, backgroundColor: `rgba(${rgb}, 0.35)` }]} />
                <View style={[styles.accentDot, { top: 42, left: 20, backgroundColor: `rgba(${rgb}, 0.35)` }]} />
                <View style={[styles.accentDot, { top: 20, right: 42, backgroundColor: `rgba(${rgb}, 0.35)` }]} />
                <View style={[styles.accentDot, { top: 42, right: 20, backgroundColor: `rgba(${rgb}, 0.35)` }]} />
                <View style={[styles.accentDot, { bottom: 20, left: 42, backgroundColor: `rgba(${rgb}, 0.35)` }]} />
                <View style={[styles.accentDot, { bottom: 42, left: 20, backgroundColor: `rgba(${rgb}, 0.35)` }]} />
                <View style={[styles.accentDot, { bottom: 20, right: 42, backgroundColor: `rgba(${rgb}, 0.35)` }]} />
                <View style={[styles.accentDot, { bottom: 42, right: 20, backgroundColor: `rgba(${rgb}, 0.35)` }]} />
                <Animated.View style={[styles.edgeDot, { top: 8, left: '50%', marginLeft: -3, backgroundColor: `rgba(${rgb}, 0.5)`, opacity: glowOpacity }]} />
                <Animated.View style={[styles.edgeDot, { bottom: 8, left: '50%', marginLeft: -3, backgroundColor: `rgba(${rgb}, 0.5)`, opacity: glowOpacity }]} />
                <Animated.View style={[styles.edgeDot, { left: 8, top: '50%', marginTop: -3, backgroundColor: `rgba(${rgb}, 0.5)`, opacity: glowOpacity }]} />
                <Animated.View style={[styles.edgeDot, { right: 8, top: '50%', marginTop: -3, backgroundColor: `rgba(${rgb}, 0.5)`, opacity: glowOpacity }]} />
                <View style={styles.sDiamondContainer}>
                  <Animated.View style={[styles.sDiamondOuter, { borderColor: `rgba(${rgb}, 0.25)`, opacity: glowOpacity }]} />
                  <View style={[styles.sDiamondMiddle, { borderColor: `rgba(${rgb}, 0.45)` }]}>
                    <Animated.View style={[styles.sDiamondDot, { backgroundColor: `rgba(${rgb}, 0.8)`, opacity: glowOpacity }]} />
                  </View>
                </View>
              </>
            ) : (
              <>
                {level >= 4 && (
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
                )}
                <View
                  style={[
                    styles.innerBorder,
                    { borderColor: `rgba(${rgb}, ${level === 1 ? 0.08 : level === 2 ? 0.12 : level <= 4 ? 0.18 : 0.22})` },
                  ]}
                />
                {level >= 3 && (
                  <LinearGradient
                    colors={[`rgba(${rgb}, 0.05)`, 'rgba(0,0,0,0.1)', `rgba(${rgb}, 0.03)`, 'rgba(0,0,0,0.1)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.glassOverlay}
                  />
                )}
                {level >= 4 && (
                  <View style={styles.patternContainer}>
                    <View style={[styles.crossLine, { top: -20, left: 30, backgroundColor: `rgba(${rgb}, 0.06)` }]} />
                    <View style={[styles.crossLine, { top: -20, left: 80, backgroundColor: `rgba(${rgb}, 0.04)` }]} />
                    <View style={[styles.crossLine, { top: -20, right: 80, backgroundColor: `rgba(${rgb}, 0.04)` }]} />
                    <View style={[styles.crossLine, { top: -20, right: 30, backgroundColor: `rgba(${rgb}, 0.06)` }]} />
                    {level >= 5 && (
                      <>
                        <View style={[styles.crossLineReverse, { top: -20, left: 30, backgroundColor: `rgba(${rgb}, 0.06)` }]} />
                        <View style={[styles.crossLineReverse, { top: -20, left: 80, backgroundColor: `rgba(${rgb}, 0.04)` }]} />
                        <View style={[styles.crossLineReverse, { top: -20, right: 80, backgroundColor: `rgba(${rgb}, 0.04)` }]} />
                        <View style={[styles.crossLineReverse, { top: -20, right: 30, backgroundColor: `rgba(${rgb}, 0.06)` }]} />
                      </>
                    )}
                  </View>
                )}
                {level >= 4 && (
                  <>
                    <View style={[styles.horizLine, { top: '30%', backgroundColor: `rgba(${rgb}, 0.05)` }]} />
                    <View style={[styles.horizLine, { top: '70%', backgroundColor: `rgba(${rgb}, 0.05)` }]} />
                  </>
                )}
                {level >= 2 && (
                  <>
                    <View style={[styles.cornerTL, { borderColor: `rgba(${rgb}, ${level <= 2 ? 0.25 : level <= 4 ? 0.35 : 0.4})`, borderTopWidth: 1.5, borderLeftWidth: 1.5 }]} />
                    {level >= 3 && <View style={[styles.cornerTR, { borderColor: `rgba(${rgb}, ${level <= 4 ? 0.35 : 0.4})`, borderTopWidth: 1.5, borderRightWidth: 1.5 }]} />}
                    {level >= 3 && <View style={[styles.cornerBL, { borderColor: `rgba(${rgb}, ${level <= 4 ? 0.35 : 0.4})`, borderBottomWidth: 1.5, borderLeftWidth: 1.5 }]} />}
                    <View style={[styles.cornerBR, { borderColor: `rgba(${rgb}, ${level <= 2 ? 0.25 : level <= 4 ? 0.35 : 0.4})`, borderBottomWidth: 1.5, borderRightWidth: 1.5 }]} />
                  </>
                )}
                {level >= 4 && (
                  <>
                    <View style={[styles.accentDot, { top: 19, left: 38, backgroundColor: `rgba(${rgb}, 0.3)` }]} />
                    <View style={[styles.accentDot, { top: 19, right: 38, backgroundColor: `rgba(${rgb}, 0.3)` }]} />
                    <View style={[styles.accentDot, { bottom: 19, left: 38, backgroundColor: `rgba(${rgb}, 0.3)` }]} />
                    <View style={[styles.accentDot, { bottom: 19, right: 38, backgroundColor: `rgba(${rgb}, 0.3)` }]} />
                  </>
                )}
                {level === 4 && (
                  <View style={styles.centerDotContainer}>
                    <View style={[styles.centerDot, { backgroundColor: `rgba(${rgb}, 0.25)` }]} />
                  </View>
                )}
                {level === 5 && (
                  <View style={styles.diamondContainer}>
                    <View style={[styles.diamond, { borderColor: `rgba(${rgb}, 0.3)` }]} />
                  </View>
                )}
              </>
            )}
          </LinearGradient>
        </View>
      </LinearGradient>
    </Animated.View>
  );

  const renderBack = () => (
    <Animated.View style={[styles.flipFace, styles.flipFaceBack, { transform: [{ rotateY: backRotate }], backfaceVisibility: 'hidden' }]}>
      <LinearGradient
        colors={
          level === 6
            ? [`rgba(${rgb}, 1)`, `rgba(${rgb}, 0.5)`, `rgba(${rgb}, 0.8)`, `rgba(${rgb}, 0.4)`, `rgba(${rgb}, 1)`]
            : [`rgba(${rgb}, 0.9)`, `rgba(${rgb}, 0.3)`, `rgba(${rgb}, 0.6)`, `rgba(${rgb}, 0.2)`, `rgba(${rgb}, 0.8)`]
        }
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.rankCard, level === 6 && { padding: 2 }]}
      >
        <View style={styles.rankCardInner}>
          <LinearGradient
            colors={level === 6 ? ['#1c1a14', '#1e1c16', '#201e18', '#1e1c16', '#1c1a14'] : ['#1a1a1a', '#1e1e1e', '#222222']}
            locations={level === 6 ? [0, 0.25, 0.5, 0.75, 1] : undefined}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.cardBackground, { justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 14 }]}
          >
            {/* Inner border on back too */}
            <View
              style={[
                styles.innerBorder,
                { borderColor: `rgba(${rgb}, ${level <= 2 ? 0.12 : level <= 4 ? 0.18 : 0.25})` },
              ]}
            />

            {/* LoL ranks */}
            <View style={styles.backGameSection}>
              <View style={styles.backGameTitleRow}>
                <ThemedText style={styles.backGameTitle}>League of Legends</ThemedText>
              </View>
              <View style={styles.backRanksList}>
                {data.ranks.lol.map((rank, idx) => (
                  <View key={idx} style={styles.backRankItem}>
                    <Image
                      source={leagueRankImages[rank]}
                      style={styles.backRankImage}
                      resizeMode="contain"
                    />
                    <ThemedText style={styles.backRankText}>{rank}</ThemedText>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.backDivider, { backgroundColor: `rgba(${rgb}, 0.15)` }]} />

            {/* Valorant ranks */}
            <View style={styles.backGameSection}>
              <View style={styles.backGameTitleRow}>
                <ThemedText style={styles.backGameTitle}>Valorant</ThemedText>
              </View>
              <View style={styles.backRanksList}>
                {data.ranks.valorant.map((rank, idx) => (
                  <View key={idx} style={styles.backRankItem}>
                    <Image
                      source={valorantRankImages[rank]}
                      style={styles.backRankImage}
                      resizeMode="contain"
                    />
                    <ThemedText style={styles.backRankText}>{rank}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
          </LinearGradient>
        </View>
      </LinearGradient>
    </Animated.View>
  );

  return (
    <View style={styles.cardSection}>
      <View style={styles.tierLabel}>
        <ThemedText style={[styles.tierLetter, { color: data.color }]}>
          {data.tier} Tier
        </ThemedText>
      </View>

      <TouchableOpacity style={styles.cardWrapper} onPress={handleFlip} activeOpacity={0.9}>
        {renderBack()}
        {renderFront()}
      </TouchableOpacity>
    </View>
  );
}

export default function TierCardsScreen() {
  const router = useRouter();

  // Shared shimmer animation
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim2 = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 3500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();

    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(1500),
        Animated.timing(shimmerAnim2, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shimmerAnim2, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop2.start();

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    glowLoop.start();

    return () => { loop.stop(); loop2.stop(); glowLoop.stop(); };
  }, []);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-screenWidth * 1.5, screenWidth * 1.5],
  });

  const shimmerTranslate2 = shimmerAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [screenWidth * 1.5, -screenWidth * 1.5],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <View style={styles.container}>
      {/* Background shimmer */}
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

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol size={22} name="chevron.left" color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <ThemedText style={styles.step}>Rank Cards</ThemedText>
          <ThemedText style={styles.title}>Tier Designs</ThemedText>
          <ThemedText style={styles.description}>
            Card designs scale with your rank. Higher tiers unlock more intricate visual effects.
          </ThemedText>
        </View>

        {/* Tier Cards */}
        <View style={styles.cardsContainer}>
          {TIER_PREVIEW_DATA.map((data) => (
            <FlippableTierCard
              key={data.tier}
              data={data}
              shimmerTranslate={shimmerTranslate}
              shimmerTranslate2={shimmerTranslate2}
              glowOpacity={glowOpacity}
            />
          ))}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  backgroundGlow: {
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
  scrollView: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 16,
  },
  step: {
    fontSize: 13,
    color: '#555',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 36,
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 8,
  },
  cardsContainer: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 24,
  },
  cardSection: {},
  tierLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  tierLetter: {
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 1,
  },
  cardWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 8, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 16,
  },
  flipFace: {
    width: '100%',
  },
  flipFaceBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  },
  glassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  patternContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
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
  cornerTL: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 20,
    height: 20,
    borderTopLeftRadius: 3,
    zIndex: 2,
  },
  cornerTR: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 20,
    height: 20,
    borderTopRightRadius: 3,
    zIndex: 2,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    width: 20,
    height: 20,
    borderBottomLeftRadius: 3,
    zIndex: 2,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 20,
    height: 20,
    borderBottomRightRadius: 3,
    zIndex: 2,
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
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamondDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  horizLine: {
    position: 'absolute',
    left: 24,
    right: 24,
    height: 1,
  },
  centerDotContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -5,
    marginLeft: -5,
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  centerDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  concentricRing: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    borderWidth: 1,
    transform: [{ rotate: '45deg' }],
    zIndex: 2,
  },
  radialGlow: {
    position: 'absolute',
    top: '20%',
    left: '20%',
    right: '20%',
    bottom: '20%',
    borderRadius: 100,
    zIndex: 1,
  },
  accentDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    zIndex: 4,
  },
  edgeDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    zIndex: 4,
  },
  sDiamondContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -28,
    marginLeft: -28,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  sDiamondOuter: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
  sDiamondMiddle: {
    width: 28,
    height: 28,
    borderWidth: 1.5,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sDiamondDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  // Back face styles
  backGameSection: {
    gap: 6,
  },
  backGameTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backGameTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  backRanksList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  backRankItem: {
    alignItems: 'center',
    gap: 2,
  },
  backRankImage: {
    width: 36,
    height: 36,
  },
  backRankText: {
    fontSize: 9,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
  },
  backDivider: {
    height: 1,
    marginVertical: 10,
  },
});
