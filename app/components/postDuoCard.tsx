import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { DuoCardData } from '@/app/(tabs)/duoFinder';
import DuoCard from './duoCard';

// Roles
const VALORANT_ROLES = ['Duelist', 'Initiator', 'Controller', 'Sentinel'];
const LEAGUE_ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

// Role icons
const VALORANT_ROLE_ICONS: { [key: string]: any } = {
  Duelist: require('@/assets/images/valorantroles/Duelist.png'),
  Initiator: require('@/assets/images/valorantroles/Initiator.png'),
  Controller: require('@/assets/images/valorantroles/Controller.png'),
  Sentinel: require('@/assets/images/valorantroles/Sentinel.png'),
};

const LEAGUE_LANE_ICONS: { [key: string]: any } = {
  Top: require('@/assets/images/leaguelanes/top.png'),
  Jungle: require('@/assets/images/leaguelanes/jungle.png'),
  Mid: require('@/assets/images/leaguelanes/mid.png'),
  ADC: require('@/assets/images/leaguelanes/bottom.png'),
  Support: require('@/assets/images/leaguelanes/support.png'),
};

// Valorant agents grouped by role
const VALORANT_AGENTS: { [key: string]: string[] } = {
  Duelist: ['Jett', 'Reyna', 'Raze', 'Phoenix', 'Yoru', 'Neon', 'Iso'],
  Initiator: ['Sova', 'Breach', 'Skye', 'KAY/O', 'Fade', 'Gekko'],
  Controller: ['Brimstone', 'Omen', 'Viper', 'Astra', 'Harbor', 'Clove'],
  Sentinel: ['Sage', 'Cypher', 'Killjoy', 'Chamber', 'Deadlock', 'Vyse'],
};

const VALORANT_AGENT_ICONS: { [key: string]: any } = {
  jett: require('@/assets/images/valoranticons/jett.png'),
  reyna: require('@/assets/images/valoranticons/reyna.png'),
  raze: require('@/assets/images/valoranticons/raze.png'),
  phoenix: require('@/assets/images/valoranticons/phoenix.png'),
  yoru: require('@/assets/images/valoranticons/yoru.png'),
  neon: require('@/assets/images/valoranticons/neon.png'),
  iso: require('@/assets/images/valoranticons/iso.png'),
  sova: require('@/assets/images/valoranticons/sova.png'),
  breach: require('@/assets/images/valoranticons/breach.png'),
  skye: require('@/assets/images/valoranticons/skye.png'),
  'kay/o': require('@/assets/images/valoranticons/kayo.png'),
  fade: require('@/assets/images/valoranticons/fade.png'),
  gekko: require('@/assets/images/valoranticons/gekko.png'),
  brimstone: require('@/assets/images/valoranticons/brimstone.png'),
  omen: require('@/assets/images/valoranticons/omen.png'),
  viper: require('@/assets/images/valoranticons/viper.png'),
  astra: require('@/assets/images/valoranticons/astra.png'),
  harbor: require('@/assets/images/valoranticons/harbor.png'),
  clove: require('@/assets/images/valoranticons/clove.png'),
  sage: require('@/assets/images/valoranticons/sage.png'),
  cypher: require('@/assets/images/valoranticons/cypher.png'),
  killjoy: require('@/assets/images/valoranticons/killjoy.png'),
  chamber: require('@/assets/images/valoranticons/chamber.png'),
  deadlock: require('@/assets/images/valoranticons/deadlock.png'),
  vyse: require('@/assets/images/valoranticons/vyse.png'),
};

// League champions grouped by role
const LEAGUE_CHAMPIONS: { [key: string]: string[] } = {
  Top: ['Aatrox', 'Darius', 'Garen', 'Jax', 'Fiora', 'Camille', 'Ornn', 'Sett'],
  Jungle: ['Lee Sin', "Kha'Zix", 'Graves', 'Elise', 'Vi', "Rek'Sai", 'Hecarim'],
  Mid: ['Ahri', 'Zed', 'Yasuo', 'Syndra', 'Orianna', 'Viktor', 'LeBlanc'],
  ADC: ['Jinx', 'Caitlyn', "Kai'Sa", 'Jhin', 'Vayne', 'Ezreal', 'Ashe'],
  Support: ['Thresh', 'Leona', 'Lulu', 'Nami', 'Braum', 'Nautilus', 'Soraka'],
};

const getChampionIconUrl = (champion: string) => {
  const ddKey = champion.replace(/[\s'.]/g, '');
  return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/${ddKey}.png`;
};

interface PostDuoCardProps {
  visible: boolean;
  onClose: () => void;
  onPostCreated: () => void;
  valorantCard: DuoCardData | null;
  leagueCard: DuoCardData | null;
  userAvatar?: string;
  valorantInGameIcon?: string;
  valorantInGameName?: string;
  valorantWinRate?: number;
  leagueInGameIcon?: string;
  leagueInGameName?: string;
  leagueWinRate?: number;
  valorantGamesPlayed?: number;
  leagueGamesPlayed?: number;
}

export default function PostDuoCard({
  visible,
  onClose,
  onPostCreated,
  valorantCard,
  leagueCard,
  userAvatar,
  valorantInGameIcon,
  valorantInGameName,
  valorantWinRate,
  leagueInGameIcon,
  leagueInGameName,
  leagueWinRate,
  valorantGamesPlayed,
  leagueGamesPlayed,
}: PostDuoCardProps) {
  const { user } = useAuth();
  const [selectedGame, setSelectedGame] = useState<'valorant' | 'league' | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [message, setMessage] = useState('');
  const [posting, setPosting] = useState(false);
  const [activeValorantPost, setActiveValorantPost] = useState(false);
  const [activeLeaguePost, setActiveLeaguePost] = useState(false);
  const [checkingPosts, setCheckingPosts] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Scroll to bottom when keyboard shows so the post button stays visible
  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, () => {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => sub.remove();
  }, []);

  // Reset state and check for active posts when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedGame(null);
      setSelectedRole('');
      setSelectedAgent('');
      setMessage('');
      checkActivePosts();
    }
  }, [visible]);

  // Pre-fill role/agent from the selected card whenever the user picks a card
  useEffect(() => {
    if (!selectedGame) {
      setSelectedRole('');
      setSelectedAgent('');
      return;
    }
    const card = selectedGame === 'valorant' ? valorantCard : leagueCard;
    if (card) {
      setSelectedRole(card.mainRole || '');
      // mainAgent may be a comma-separated string — take the first
      const firstAgent = card.mainAgent ? card.mainAgent.split(',')[0].trim() : '';
      setSelectedAgent(firstAgent);
    }
  }, [selectedGame, valorantCard, leagueCard]);

  const checkActivePosts = async () => {
    if (!user?.id) return;
    setCheckingPosts(true);
    try {
      const now = new Date();
      const [valDoc, leagueDoc] = await Promise.all([
        valorantCard ? getDoc(doc(db, 'duoPosts', `${user.id}_valorant`)) : Promise.resolve(null),
        leagueCard ? getDoc(doc(db, 'duoPosts', `${user.id}_league`)) : Promise.resolve(null),
      ]);

      const valData = valDoc?.exists() ? valDoc.data() : null;
      setActiveValorantPost(
        !!(valData && valData.expiresAt && valData.expiresAt.toDate() > now)
      );

      const leagueData = leagueDoc?.exists() ? leagueDoc.data() : null;
      setActiveLeaguePost(
        !!(leagueData && leagueData.expiresAt && leagueData.expiresAt.toDate() > now)
      );
    } catch (error) {
      console.error('Error checking active posts:', error);
    } finally {
      setCheckingPosts(false);
    }
  };

  // Cards available to post (not already active in feed)
  const availableValorantCard = valorantCard && !activeValorantPost ? valorantCard : null;
  const availableLeagueCard = leagueCard && !activeLeaguePost ? leagueCard : null;

  const selectedCard = selectedGame === 'valorant' ? availableValorantCard : selectedGame === 'league' ? availableLeagueCard : null;

  const getInGameIcon = () => selectedGame === 'valorant' ? valorantInGameIcon : leagueInGameIcon;
  const getInGameName = () => selectedGame === 'valorant' ? valorantInGameName : leagueInGameName;
  const getWinRate = () => selectedGame === 'valorant' ? (valorantWinRate || 0) : (leagueWinRate || 0);
  const getGamesPlayed = () => selectedGame === 'valorant' ? (valorantGamesPlayed || 0) : (leagueGamesPlayed || 0);

  const handlePost = async () => {
    if (!user?.id || !selectedCard || !selectedGame) return;

    setPosting(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.id));
      const userData = userDoc.data();

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);

      const postData = {
        userId: user.id,
        username: selectedCard.username,
        game: selectedGame,
        currentRank: selectedCard.currentRank,
        peakRank: selectedCard.peakRank,
        mainRole: selectedRole || selectedCard.mainRole,
        mainAgent: selectedAgent || selectedCard.mainAgent || '',
        region: selectedCard.region,
        lookingFor: selectedCard.lookingFor || 'Any',
        avatar: userData?.avatar || '',
        inGameIcon: selectedGame === 'valorant'
          ? userData?.valorantStats?.card?.small || ''
          : (userData?.riotStats?.profileIconId ? `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${userData?.riotStats?.profileIconId}.png` : ''),
        inGameName: selectedGame === 'valorant'
          ? (() => {
              const gn = userData?.valorantStats?.gameName;
              const tag = userData?.valorantAccount?.tag || userData?.valorantAccount?.tagLine;
              return gn ? `${gn}${tag ? '#' + tag : ''}` : '';
            })()
          : (userData?.riotAccount?.gameName ? `${userData.riotAccount.gameName}${userData?.riotAccount?.tagLine ? '#' + userData.riotAccount.tagLine : ''}` : ''),
        winRate: getWinRate(),
        gamesPlayed: getGamesPlayed(),
        message: message.trim(),
        createdAt: Timestamp.fromDate(now),
        expiresAt: Timestamp.fromDate(expiresAt),
        status: 'active',
      };

      await setDoc(doc(db, 'duoPosts', `${user.id}_${selectedGame}`), postData);

      setMessage('');
      setSelectedGame(null);
      onPostCreated();
      onClose();
    } catch (error) {
      console.error('Error posting duo card:', error);
      Alert.alert('Error', 'Failed to post duo card. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const handleClose = () => {
    setMessage('');
    setSelectedGame(null);
    onClose();
  };

  const hasOnlyOneCard = (availableValorantCard ? 1 : 0) + (availableLeagueCard ? 1 : 0) === 1;
  const hasNoCards = !availableValorantCard && !availableLeagueCard;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <ThemedText style={styles.title}>Post to Feed</ThemedText>
          <TouchableOpacity onPress={handleClose}>
            <IconSymbol size={20} name="xmark" color="#888" />
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          {checkingPosts ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          ) : hasNoCards ? (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyStateText}>
                {!valorantCard && !leagueCard
                  ? 'You need to create a duo card first'
                  : 'Your cards are already posted in the feed. You can delete active posts in My Cards to post again.'}
              </ThemedText>
            </View>
          ) : (
          <>
          {/* Card selection header */}
          <View style={styles.cardSectionHeader}>
            <ThemedText style={styles.label}>{selectedGame ? 'YOUR CARD' : 'SELECT CARD'}</ThemedText>
            {selectedGame && !hasOnlyOneCard && (
              <TouchableOpacity onPress={() => { setSelectedGame(null); setMessage(''); }}>
                <ThemedText style={styles.changeCardText}>Change</ThemedText>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.cardOptions}>
            {/* Valorant card - show if no selection yet, or if it's the selected one */}
            {availableValorantCard && (!selectedGame || selectedGame === 'valorant') && (
              <TouchableOpacity
                style={[styles.cardOption, selectedGame === 'valorant' && styles.cardOptionSelected]}
                onPress={() => !selectedGame && setSelectedGame('valorant')}
                activeOpacity={selectedGame ? 1 : 0.7}
              >
                <View pointerEvents="none">
                  <DuoCard
                    noShadow
                    duo={{
                      id: 0,
                      username: valorantCard.username,
                      status: 'active',
                      matchPercentage: 0,
                      currentRank: valorantCard.currentRank,
                      peakRank: valorantCard.peakRank,
                      favoriteAgent: selectedGame === 'valorant' && selectedAgent ? selectedAgent : (valorantCard.mainAgent || ''),
                      favoriteRole: selectedGame === 'valorant' && selectedRole ? selectedRole : (valorantCard.mainRole || ''),
                      winRate: valorantWinRate || 0,
                      gamesPlayed: valorantGamesPlayed || 0,
                      game: 'Valorant',
                      avatar: userAvatar,
                      inGameIcon: valorantInGameIcon,
                      inGameName: valorantInGameName,
                      message: selectedGame === 'valorant' && message.trim() ? message.trim() : undefined,
                      region: valorantCard.region,
                    }}
                  />
                </View>
              </TouchableOpacity>
            )}

            {/* League card - show if no selection yet, or if it's the selected one */}
            {availableLeagueCard && (!selectedGame || selectedGame === 'league') && (
              <TouchableOpacity
                style={[styles.cardOption, selectedGame === 'league' && styles.cardOptionSelected]}
                onPress={() => !selectedGame && setSelectedGame('league')}
                activeOpacity={selectedGame ? 1 : 0.7}
              >
                <View pointerEvents="none">
                  <DuoCard
                    noShadow
                    duo={{
                      id: 1,
                      username: leagueCard.username,
                      status: 'active',
                      matchPercentage: 0,
                      currentRank: leagueCard.currentRank,
                      peakRank: leagueCard.peakRank,
                      favoriteAgent: selectedGame === 'league' && selectedAgent ? selectedAgent : (leagueCard.mainAgent || ''),
                      favoriteRole: selectedGame === 'league' && selectedRole ? selectedRole : (leagueCard.mainRole || ''),
                      winRate: leagueWinRate || 0,
                      gamesPlayed: leagueGamesPlayed || 0,
                      game: 'League of Legends',
                      avatar: userAvatar,
                      inGameIcon: leagueInGameIcon,
                      inGameName: leagueInGameName,
                      message: selectedGame === 'league' && message.trim() ? message.trim() : undefined,
                      region: leagueCard.region,
                    }}
                  />
                </View>
              </TouchableOpacity>
            )}
          </View>

          {selectedCard && (
            <ThemedText style={styles.hint}>Your card will be visible in the feed for 72 hours</ThemedText>
          )}

          {/* Role picker */}
          {selectedCard && (() => {
            const roles = selectedGame === 'valorant' ? VALORANT_ROLES : LEAGUE_ROLES;
            const roleIcons = selectedGame === 'valorant' ? VALORANT_ROLE_ICONS : LEAGUE_LANE_ICONS;
            return (
              <>
                <ThemedText style={styles.label}>ROLE</ThemedText>
                <View style={styles.roleRow}>
                  {roles.map(role => {
                    const isSelected = selectedRole === role;
                    const icon = roleIcons[role];
                    return (
                      <TouchableOpacity
                        key={role}
                        style={[styles.roleChip, isSelected && styles.roleChipSelected]}
                        onPress={() => {
                          setSelectedRole(role);
                          // Reset agent if it doesn't belong to the new role
                          const agentList = selectedGame === 'valorant'
                            ? (VALORANT_AGENTS[role] || [])
                            : (LEAGUE_CHAMPIONS[role] || []);
                          if (selectedAgent && !agentList.includes(selectedAgent)) {
                            setSelectedAgent('');
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        {icon && <Image source={icon} style={styles.roleChipIcon} resizeMode="contain" />}
                        <ThemedText style={[styles.roleChipText, isSelected && styles.roleChipTextSelected]}>
                          {role}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            );
          })()}

          {/* Agent / Champion picker */}
          {selectedCard && selectedRole && (() => {
            const list = selectedGame === 'valorant'
              ? (VALORANT_AGENTS[selectedRole] || [])
              : (LEAGUE_CHAMPIONS[selectedRole] || []);
            return (
              <>
                <ThemedText style={styles.label}>
                  {selectedGame === 'valorant' ? 'AGENT' : 'CHAMPION'}
                </ThemedText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.agentScrollContent}
                >
                  {list.map(name => {
                    const isSelected = selectedAgent === name;
                    const iconSrc = selectedGame === 'valorant'
                      ? VALORANT_AGENT_ICONS[name.toLowerCase()]
                      : { uri: getChampionIconUrl(name) };
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[styles.agentChip, isSelected && styles.agentChipSelected]}
                        onPress={() => setSelectedAgent(name)}
                        activeOpacity={0.7}
                      >
                        {iconSrc && (
                          <Image source={iconSrc} style={styles.agentChipIcon} resizeMode="cover" />
                        )}
                        <ThemedText style={[styles.agentChipText, isSelected && styles.agentChipTextSelected]} numberOfLines={1}>
                          {name}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            );
          })()}

          {/* Message Input - shown after selecting a card */}
          {selectedCard && (
            <>
              <ThemedText style={styles.label}>MESSAGE (OPTIONAL)</ThemedText>
              <TextInput
                style={styles.messageInput}
                placeholder="What are you looking for?"
                placeholderTextColor="#555"
                value={message}
                onChangeText={setMessage}
                maxLength={140}
                multiline
                numberOfLines={2}
              />
              <ThemedText style={styles.charCount}>{message.length}/140</ThemedText>
            </>
          )}
          </>
          )}
        </ScrollView>

        {/* Post Button — pinned above keyboard */}
        {selectedCard && (
          <View style={styles.bottomSection}>
            <TouchableOpacity
              style={[styles.postButton, (!selectedCard || posting) && styles.postButtonDisabled]}
              onPress={handlePost}
              disabled={!selectedCard || posting}
              activeOpacity={0.8}
            >
              {posting ? (
                <View style={styles.postingRow}>
                  <ActivityIndicator size="small" color="#0f0f0f" />
                  <ThemedText style={styles.postButtonText}>Posting...</ThemedText>
                </View>
              ) : (
                <ThemedText style={styles.postButtonText}>Post to Feed</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingHorizontal: 28,
  },
  scrollContent: {
    paddingBottom: 34,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    lineHeight: 34,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    marginTop: 24,
    marginBottom: 12,
  },
  cardSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardOptions: {
    gap: 12,
  },
  cardOption: {
    borderRadius: 16,
  },
  cardOptionSelected: {},
  changeCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginTop: 24,
  },
  messageInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: '#fff',
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  // Role picker
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  roleChipSelected: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  roleChipIcon: {
    width: 18,
    height: 18,
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
  },
  roleChipTextSelected: {
    color: '#fff',
  },
  // Agent picker
  agentScrollContent: {
    gap: 8,
    paddingRight: 28,
  },
  agentChip: {
    alignItems: 'center',
    width: 64,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 4,
  },
  agentChipSelected: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.25)',
  },
  agentChipIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  agentChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#aaa',
    textAlign: 'center',
  },
  agentChipTextSelected: {
    color: '#fff',
  },
  charCount: {
    fontSize: 11,
    color: '#555',
    textAlign: 'right',
    marginTop: 8,
  },
  hint: {
    fontSize: 12,
    color: '#555',
    marginTop: 14,
    textAlign: 'center',
  },
  bottomSection: {
    paddingTop: 16,
    paddingBottom: 32,
    backgroundColor: '#0f0f0f',
  },
  postButton: {
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  postButtonDisabled: {
    opacity: 0.4,
  },
  postButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f0f0f',
  },
  postingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
});
