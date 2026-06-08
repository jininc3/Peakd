import { ThemedText } from '@/components/themed-text';
import { StyleSheet, View, Image, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { formatRankDisplay } from '@/utils/formatRankDisplay';
import { useState, useEffect } from 'react';

const { width: screenWidth } = Dimensions.get('window');
const cardWidth = screenWidth - 32;        // Full width with padding
const cardHeight = cardWidth * 1.3;         // Shorter height ratio

interface CompactDuoCardProps {
  game: 'valorant' | 'league';
  username?: string;
  avatar?: string;
  inGameName?: string;
  inGameIcon?: string;
  currentRank?: string;
  mainRole?: string;
  mainAgent?: string;  // Agent name for Valorant, champion for League
  onPress?: () => void;
  onViewProfile?: () => void;
  onAvatarLoad?: () => void;
  showContent?: boolean;
  isEditMode?: boolean;
}

// League rank icon mapping
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

// Valorant rank icon mapping
const VALORANT_RANK_ICONS: { [key: string]: any } = {
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
  unranked: require('@/assets/images/valorantranks/unranked.png'),
};

// League lane icons
const LEAGUE_LANE_ICONS: { [key: string]: any } = {
  'Top': require('@/assets/images/leaguelanes/top.png'),
  'Jungle': require('@/assets/images/leaguelanes/jungle.png'),
  'Mid': require('@/assets/images/leaguelanes/mid.png'),
  'ADC': require('@/assets/images/leaguelanes/bottom.png'),
  'Support': require('@/assets/images/leaguelanes/support.png'),
};

// Game logo mapping
const GAME_LOGOS: { [key: string]: any } = {
  valorant: require('@/assets/images/valorant-red.png'),
  league: require('@/assets/images/lol-icon.png'),
};

// Game background images
const GAME_BACKGROUNDS: { [key: string]: any } = {
  valorant: require('@/assets/images/valorant-background.png'),
  league: require('@/assets/images/lol-background.png'),
};

export default function CompactDuoCard({
  game,
  username = 'YourUsername',
  avatar,
  inGameName,
  inGameIcon,
  currentRank = 'Unranked',
  mainRole = 'Mid',
  mainAgent,
  onPress,
  onViewProfile,
  onAvatarLoad,
  showContent = true,
  isEditMode = false,
}: CompactDuoCardProps) {
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [hasNotifiedParent, setHasNotifiedParent] = useState(false);

  useEffect(() => {
    if (!inGameIcon || !inGameIcon.startsWith('http')) {
      setAvatarLoaded(true);
    } else {
      setAvatarLoaded(false);
      setHasNotifiedParent(false);
    }
  }, [inGameIcon]);

  useEffect(() => {
    if (avatarLoaded && onAvatarLoad && !hasNotifiedParent) {
      onAvatarLoad();
      setHasNotifiedParent(true);
    }
  }, [avatarLoaded, onAvatarLoad, hasNotifiedParent]);

  const getRankIcon = (rank: string) => {
    if (!rank || rank === 'Unranked') {
      return game === 'valorant' ? VALORANT_RANK_ICONS.unranked : LEAGUE_RANK_ICONS.unranked;
    }
    const parts = rank.split(' ');
    const tier = parts[0].toLowerCase();
    const division = parts[1] || '';
    const fullKey = (tier + division).toLowerCase();
    if (game === 'valorant') {
      return VALORANT_RANK_ICONS[fullKey] || VALORANT_RANK_ICONS[tier] || VALORANT_RANK_ICONS.unranked;
    }
    return LEAGUE_RANK_ICONS[tier] || LEAGUE_RANK_ICONS.unranked;
  };

  const getLaneIcon = (role: string) => {
    return LEAGUE_LANE_ICONS[role] || LEAGUE_LANE_ICONS['Mid'];
  };

  const CardContent = (
    <View style={styles.card}>
      {/* Background Image */}
      <Image
        source={GAME_BACKGROUNDS[game]}
        style={styles.backgroundImage}
        resizeMode="cover"
        blurRadius={10}
      />
      {/* Gradient Overlay */}
      <LinearGradient
        colors={['rgba(18, 18, 22, 0.3)', 'rgba(18, 18, 22, 0.6)', 'rgba(18, 18, 22, 0.9)', 'rgb(18, 18, 22)']}
        locations={[0, 0.3, 0.6, 1]}
        style={styles.fadeOverlay}
      />

      <View style={styles.cardContent}>
        {/* Game Logo - Top Left */}
        <View style={styles.gameIndicator}>
          <Image
            source={GAME_LOGOS[game]}
            style={styles.gameLogo}
            resizeMode="contain"
          />
        </View>

        {/* Large Icon — avatar, in-game icon, or placeholder */}
        <View style={styles.iconContainer}>
          {avatar && avatar.startsWith('http') ? (
            <Image
              source={{ uri: avatar }}
              style={styles.inGameIcon}
              onLoad={() => setAvatarLoaded(true)}
              onError={() => setAvatarLoaded(true)}
            />
          ) : inGameIcon && inGameIcon.startsWith('http') ? (
            <Image
              source={{ uri: inGameIcon }}
              style={styles.inGameIcon}
              onLoad={() => setAvatarLoaded(true)}
              onError={() => setAvatarLoaded(true)}
            />
          ) : (
            <View style={styles.iconPlaceholder}>
              <ThemedText style={styles.iconInitial}>
                {(inGameName || username)[0]?.toUpperCase() || '?'}
              </ThemedText>
            </View>
          )}
        </View>

        {/* In-Game Name */}
        <ThemedText style={styles.playerName} numberOfLines={1}>
          {inGameName || username}
        </ThemedText>

        {/* Rank Section - no container, large icon */}
        <View style={styles.rankSection}>
          <Image
            source={getRankIcon(currentRank)}
            style={styles.rankIcon}
            resizeMode="contain"
          />
          <ThemedText style={styles.rankText}>{formatRankDisplay(currentRank)}</ThemedText>
          {/* Game-specific info inline */}
          {game === 'valorant' ? (
            <View style={styles.agentsRow}>
              {(mainAgent || mainRole).split(',').map((agent, index) => (
                <ThemedText key={index} style={styles.agentText}>
                  {agent.trim()}{index < (mainAgent || mainRole).split(',').length - 1 ? ' · ' : ''}
                </ThemedText>
              ))}
            </View>
          ) : (
            <Image
              source={getLaneIcon(mainRole)}
              style={styles.laneIcon}
              resizeMode="contain"
            />
          )}
        </View>

        {/* View Profile Button */}
        {onViewProfile && (
          <TouchableOpacity
            style={styles.viewProfileButton}
            onPress={onViewProfile}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.viewProfileText}>View Profile</ThemedText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.cardWrapper}>
        {CardContent}
      </TouchableOpacity>
    );
  }

  return <View style={styles.cardWrapper}>{CardContent}</View>;
}

const styles = StyleSheet.create({
  cardWrapper: {
    width: cardWidth,
    alignSelf: 'center',
    // 3D Shadow effect
    shadowColor: '#000',
    shadowOffset: {
      width: -4,
      height: 8,
    },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  card: {
    width: '100%',
    height: cardHeight,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgb(18, 18, 22)',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.95,
  },
  fadeOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  cardContent: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 8,
  },
  // Large In-Game Icon
  iconContainer: {
    width: cardWidth * 0.28,
    height: cardWidth * 0.28,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  inGameIcon: {
    width: '100%',
    height: '100%',
  },
  iconPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconInitial: {
    fontSize: 32,
    fontWeight: '700',
    color: '#666',
  },
  // Player Name
  playerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  // Game Indicator - Top Left
  gameIndicator: {
    position: 'absolute',
    top: 16,
    left: 16,
  },
  gameLogo: {
    width: 24,
    height: 24,
    opacity: 0.9,
  },
  // Rank Section - no container, vertical layout
  rankSection: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  rankIcon: {
    width: 90,
    height: 90,
  },
  rankText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  agentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  agentText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  laneIcon: {
    width: 24,
    height: 24,
    opacity: 0.7,
  },
  // View Profile Button
  viewProfileButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  viewProfileText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.5,
  },
});
