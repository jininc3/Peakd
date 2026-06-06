import LiveSearchContent from '@/app/components/liveSearchContent';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Dimensions } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useRouter } from '@/hooks/useRouter';
import { useNavigation } from '@react-navigation/native';
import { DuoCardData } from '@/app/(tabs)/duoFinder';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Module-level cache so data persists across navigations
let _cachedData: {
  userId: string;
  valorantCard: DuoCardData | null;
  leagueCard: DuoCardData | null;
  valorantInGameIcon?: string;
  valorantInGameName?: string;
  leagueInGameIcon?: string;
  leagueInGameName?: string;
  valorantWinRate: number;
  valorantGamesPlayed: number;
  leagueWinRate: number;
  leagueGamesPlayed: number;
} | null = null;

export default function LiveSearchScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const cancelRef = useRef<(() => void) | null>(null);

  const [liveMatchState, setLiveMatchState] = useState<'idle' | 'searching' | 'accepting' | 'matched'>('idle');
  const handleMatchStateChange = useCallback((state: 'idle' | 'searching' | 'accepting' | 'matched') => {
    setLiveMatchState(state);
  }, []);

  const cached = _cachedData?.userId === user?.id ? _cachedData : null;

  const [valorantCard, setValorantCard] = useState<DuoCardData | null>(cached?.valorantCard ?? null);
  const [leagueCard, setLeagueCard] = useState<DuoCardData | null>(cached?.leagueCard ?? null);

  // In-game info
  const [valorantInGameIcon, setValorantInGameIcon] = useState<string | undefined>(cached?.valorantInGameIcon);
  const [valorantInGameName, setValorantInGameName] = useState<string | undefined>(cached?.valorantInGameName);
  const [leagueInGameIcon, setLeagueInGameIcon] = useState<string | undefined>(cached?.leagueInGameIcon);
  const [leagueInGameName, setLeagueInGameName] = useState<string | undefined>(cached?.leagueInGameName);
  const [valorantWinRate, setValorantWinRate] = useState<number>(cached?.valorantWinRate ?? 0);
  const [valorantGamesPlayed, setValorantGamesPlayed] = useState<number>(cached?.valorantGamesPlayed ?? 0);
  const [leagueWinRate, setLeagueWinRate] = useState<number>(cached?.leagueWinRate ?? 0);
  const [leagueGamesPlayed, setLeagueGamesPlayed] = useState<number>(cached?.leagueGamesPlayed ?? 0);
  const [cardsLoaded, setCardsLoaded] = useState(!!cached);

  // Load duo cards
  useEffect(() => {
    const loadCards = async () => {
      if (!user?.id) return;

      try {
        let vIcon: string | undefined;
        let vName: string | undefined;
        let lIcon: string | undefined;
        let lName: string | undefined;
        let vWr = 0, vGp = 0, lWr = 0, lGp = 0;
        let vCard: DuoCardData | null = null;
        let lCard: DuoCardData | null = null;

        const userDocRef = doc(db, 'users', user.id);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();

          if (userData.valorantStats?.card?.small) vIcon = userData.valorantStats.card.small;
          if (userData.valorantStats?.gameName) {
            const tagLine = userData.valorantAccount?.tag || userData.valorantAccount?.tagLine || '';
            vName = tagLine ? `${userData.valorantStats.gameName}#${tagLine}` : userData.valorantStats.gameName;
          }
          if (userData.valorantStats?.winRate !== undefined) vWr = userData.valorantStats.winRate;
          if (userData.valorantStats?.gamesPlayed !== undefined) vGp = userData.valorantStats.gamesPlayed;
          if (userData.riotStats?.profileIconId) {
            lIcon = `https://ddragon.leagueoflegends.com/cdn/14.1.1/img/profileicon/${userData.riotStats.profileIconId}.png`;
          }
          if (userData.riotAccount?.gameName) {
            lName = `${userData.riotAccount.gameName}#${userData.riotAccount.tagLine || ''}`;
          }
          if (userData.riotStats?.winRate !== undefined) lWr = userData.riotStats.winRate;
          if (userData.riotStats?.gamesPlayed !== undefined) lGp = userData.riotStats.gamesPlayed;
        }

        const valorantCardDoc = await getDoc(doc(db, 'duoCards', `${user.id}_valorant`));
        if (valorantCardDoc.exists()) vCard = valorantCardDoc.data() as DuoCardData;

        const leagueCardDoc = await getDoc(doc(db, 'duoCards', `${user.id}_league`));
        if (leagueCardDoc.exists()) lCard = leagueCardDoc.data() as DuoCardData;

        // Update state
        setValorantInGameIcon(vIcon); setValorantInGameName(vName);
        setValorantWinRate(vWr); setValorantGamesPlayed(vGp);
        setLeagueInGameIcon(lIcon); setLeagueInGameName(lName);
        setLeagueWinRate(lWr); setLeagueGamesPlayed(lGp);
        setValorantCard(vCard); setLeagueCard(lCard);

        // Persist to module cache
        _cachedData = {
          userId: user.id,
          valorantCard: vCard, leagueCard: lCard,
          valorantInGameIcon: vIcon, valorantInGameName: vName,
          leagueInGameIcon: lIcon, leagueInGameName: lName,
          valorantWinRate: vWr, valorantGamesPlayed: vGp,
          leagueWinRate: lWr, leagueGamesPlayed: lGp,
        };
      } catch (error) {
        console.error('Error loading duo cards:', error);
      } finally {
        setCardsLoaded(true);
      }
    };

    loadCards();
  }, [user?.id]);

  // Disable swipe-back gesture when searching or accepting
  const navigation = useNavigation();
  useEffect(() => {
    const isSearching = liveMatchState === 'searching' || liveMatchState === 'accepting';
    navigation.setOptions({ gestureEnabled: !isSearching });
  }, [navigation, liveMatchState]);

  return (
    <ThemedView style={styles.container}>
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

      {liveMatchState !== 'matched' && (
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (liveMatchState !== 'idle' && cancelRef.current) {
                cancelRef.current();
              } else {
                router.back();
              }
            }}
          >
            <IconSymbol size={20} name="chevron.left" color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTextCol}>
            <View style={styles.headerLiveRow}>
              <View style={styles.headerLiveDot} />
              <ThemedText style={styles.headerLiveText}>LIVE SEARCH</ThemedText>
            </View>
            <ThemedText style={styles.headerTitle}>FIND TEAMMATES</ThemedText>
          </View>
        </View>
      )}

      <LiveSearchContent
        cancelRef={cancelRef}
        cardsLoaded={cardsLoaded}
        valorantCard={valorantCard}
        leagueCard={leagueCard}
        valorantInGameIcon={valorantInGameIcon}
        valorantInGameName={valorantInGameName}
        leagueInGameIcon={leagueInGameIcon}
        leagueInGameName={leagueInGameName}
        valorantWinRate={valorantWinRate}
        valorantGamesPlayed={valorantGamesPlayed}
        leagueWinRate={leagueWinRate}
        leagueGamesPlayed={leagueGamesPlayed}
        onMatchStateChange={handleMatchStateChange}
      />
    </ThemedView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 8,
  },
  backButton: {
    padding: 8,
  },
  headerTextCol: {
    gap: 2,
  },
  headerLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  headerLiveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4ADE80',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.3,
  },
});
