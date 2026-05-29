import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from '@/hooks/useRouter';
import { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  Modal,
  Keyboard,
} from 'react-native';
import * as Clipboard2 from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/config/firebase';
import { collection, getDocs, doc, getDoc, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { uploadPartyIcon, uploadPartyCoverPhoto } from '@/services/storageService';

const DEFAULT_LOBBY_ICONS = [
  { id: 'lobby1', source: require('@/assets/images/lobby1.png') },
  { id: 'lobby2', source: require('@/assets/images/lobby2.png') },
  { id: 'lobby3', source: require('@/assets/images/lobby3.png') },
  { id: 'lobby4', source: require('@/assets/images/lobby4.png') },
  { id: 'lobby5', source: require('@/assets/images/lobby5.png') },
];

// Available games
const AVAILABLE_GAMES = [
  {
    id: 'valorant',
    name: 'Valorant',
    logo: require('@/assets/images/valorant-red.png'),
  },
  {
    id: 'league',
    name: 'League',
    logo: require('@/assets/images/lol-icon.png'),
  },
];

const GAME_LOGOS: { [key: string]: any } = {
  'Valorant': require('@/assets/images/valorant-red.png'),
  'League': require('@/assets/images/lol-icon.png'),
};

interface Follower {
  id: string;
  username: string;
  avatar: string;
}

export default function CreateLeaderboardScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [selectedGame, setSelectedGame] = useState<typeof AVAILABLE_GAMES[0] | null>(null);
  const [leaderboardName, setLeaderboardName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [selectedFollowers, setSelectedFollowers] = useState<string[]>([]);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [mutualFollowers, setMutualFollowers] = useState<Follower[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [leaderboardIcon, setLeaderboardIcon] = useState<string | null>(null);
  const [selectedDefaultIcon, setSelectedDefaultIcon] = useState<string>('lobby1');
  const [coverPhoto, setCoverPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [invitePermission, setInvitePermission] = useState<'leader_only' | 'anyone'>('leader_only');
  const [showPreview, setShowPreview] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setInviteCode(code);
  }, []);

  useEffect(() => {
    const fetchFollowers = async () => {
      if (!user?.id) {
        setLoadingFollowers(false);
        return;
      }

      try {
        const followingRef = collection(db, 'users', user.id, 'following');
        const followingSnapshot = await getDocs(followingRef);

        if (followingSnapshot.empty) {
          setFollowers([]);
          setMutualFollowers([]);
          setLoadingFollowers(false);
          return;
        }

        const followerPromises = followingSnapshot.docs.map(async (followDoc) => {
          const followingData = followDoc.data();
          const followingId = followingData.followingId;
          if (!followingId) return null;

          const followingUserDoc = await getDoc(doc(db, 'users', followingId));
          if (followingUserDoc.exists()) {
            const followingUserData = followingUserDoc.data();

            // Check if they follow us back (mutual)
            const theirFollowingRef = collection(db, 'users', followingId, 'following');
            const theirFollowingSnapshot = await getDocs(theirFollowingRef);
            const isMutual = theirFollowingSnapshot.docs.some(
              (doc) => doc.data().followingId === user.id
            );

            return {
              id: followingId,
              username: followingUserData.username || 'Unknown',
              avatar: followingUserData.avatar || '',
              isMutual,
            };
          }
          return null;
        });

        const fetchedFollowers = (await Promise.all(followerPromises)).filter(
          (follower): follower is Follower & { isMutual: boolean } => follower !== null
        );

        // Set all followers
        setFollowers(fetchedFollowers.map(({ isMutual, ...rest }) => rest));

        // Set mutual followers (up to 5 for suggestions)
        const mutuals = fetchedFollowers
          .filter((f) => f.isMutual)
          .map(({ isMutual, ...rest }) => rest);
        setMutualFollowers(mutuals);
      } catch (error) {
        console.error('Error fetching followers:', error);
      } finally {
        setLoadingFollowers(false);
      }
    };

    fetchFollowers();
  }, [user?.id]);

  const toggleFollower = (followerId: string) => {
    if (selectedFollowers.includes(followerId)) {
      setSelectedFollowers(selectedFollowers.filter(id => id !== followerId));
    } else {
      setSelectedFollowers([...selectedFollowers, followerId]);
    }
  };

  const getFilteredFollowers = () => {
    return followers.filter(follower =>
      follower.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const filteredFollowers = getFilteredFollowers();

  const handleCopyInviteCode = async () => {
    if (inviteCode) {
      await Clipboard2.setStringAsync(inviteCode);
      Alert.alert('Copied!', 'Invite code copied to clipboard');
    }
  };

  const handlePickLeaderboardIcon = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setLeaderboardIcon(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking leaderboard icon:', error);
      Alert.alert('Error', 'Failed to select leaderboard icon');
    }
  };

  const handlePickCoverPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setCoverPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking cover photo:', error);
      Alert.alert('Error', 'Failed to select cover photo');
    }
  };

  const handleCreateLeaderboard = async () => {
    if (!selectedGame) {
      Alert.alert('Error', 'Please select a game');
      return;
    }
    if (!leaderboardName.trim()) {
      Alert.alert('Error', 'Please enter a leaderboard name');
      return;
    }
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to create a leaderboard');
      return;
    }

    setUploading(true);

    try {
      const partiesRef = collection(db, 'parties');

      const userDoc = await getDoc(doc(db, 'users', user.id));
      const userData = userDoc.data();

      const now = new Date();
      const memberDetails = [{
        userId: user.id,
        username: userData?.username || 'Unknown',
        avatar: userData?.avatar || '',
        joinedAt: now.toISOString(),
      }];

      const pendingInvites = [];
      for (const followerId of selectedFollowers) {
        const followerDoc = await getDoc(doc(db, 'users', followerId));
        if (followerDoc.exists()) {
          const followerData = followerDoc.data();
          pendingInvites.push({
            userId: followerId,
            username: followerData.username || 'Unknown',
            avatar: followerData.avatar || '',
            invitedAt: now.toISOString(),
            status: 'pending',
          });
        }
      }

      const leaderboardData = {
        partyName: leaderboardName,
        game: selectedGame.name,
        gameId: selectedGame.id,
        type: 'leaderboard',
        maxMembers: 20,
        duration: 30,
        startDate: null,
        endDate: null,
        challengeStatus: 'none',
        challengeType: 'climbing',
        inviteCode: inviteCode || '',
        invitePermission,
        createdBy: user.id,
        createdAt: serverTimestamp(),
        members: [user.id],
        memberDetails,
        pendingInvites,
      };

      // Create the leaderboard first to get the document ID
      const leaderboardDocRef = await addDoc(partiesRef, leaderboardData);
      const generatedPartyId = leaderboardDocRef.id;

      // Update with partyId field
      await updateDoc(leaderboardDocRef, { partyId: generatedPartyId });

      // Upload leaderboard icon (custom or default)
      try {
        let iconUri = leaderboardIcon;
        if (!iconUri && selectedDefaultIcon) {
          const defaultIcon = DEFAULT_LOBBY_ICONS.find(i => i.id === selectedDefaultIcon);
          if (defaultIcon) {
            iconUri = Image.resolveAssetSource(defaultIcon.source).uri;
          }
        }
        if (iconUri) {
          const iconUrl = await uploadPartyIcon(generatedPartyId, iconUri);
          await updateDoc(leaderboardDocRef, { partyIcon: iconUrl });
        }
      } catch (uploadError) {
        console.error('Error uploading leaderboard icon:', uploadError);
      }

      // Upload cover photo if selected
      if (coverPhoto) {
        try {
          const coverPhotoUrl = await uploadPartyCoverPhoto(generatedPartyId, coverPhoto);
          await updateDoc(leaderboardDocRef, { coverPhoto: coverPhotoUrl });
        } catch (uploadError) {
          console.error('Error uploading cover photo:', uploadError);
        }
      }

      if (selectedFollowers.length > 0) {
        for (const invite of pendingInvites) {
          try {
            const notificationRef = collection(db, 'users', invite.userId, 'notifications');
            await addDoc(notificationRef, {
              type: 'party_invite',
              fromUserId: user.id,
              fromUsername: userData?.username || 'Unknown',
              fromAvatar: userData?.avatar || '',
              fromUserAvatar: userData?.avatar || '',
              partyId: generatedPartyId,
              partyName: leaderboardName,
              game: selectedGame.name,
              read: false,
              createdAt: serverTimestamp(),
            });
          } catch (notifError) {
            console.error('Error sending notification:', notifError);
          }
        }
      }

      setUploading(false);

      Alert.alert(
        'Success',
        selectedFollowers.length > 0
          ? `Leaderboard created! Invitations sent to ${selectedFollowers.length} player${selectedFollowers.length !== 1 ? 's' : ''}.`
          : 'Leaderboard created!',
        [{
          text: 'OK',
          onPress: () => {
            router.replace({
              pathname: '/partyPages/leaderboardDetail',
              params: {
                id: generatedPartyId,
                name: leaderboardName,
                game: selectedGame.name,
                members: '1',
              },
            });
          },
        }]
      );
    } catch (error) {
      console.error('Error creating leaderboard:', error);
      setUploading(false);
      Alert.alert('Error', 'Failed to create leaderboard. Please try again.');
    }
  };

  return (
    <ThemedView style={styles.container}>
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
          <IconSymbol size={20} name="chevron.left" color="#888" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerTrophyCircle}>
            <IconSymbol size={14} name="trophy.fill" color="#a08845" />
          </View>
          <ThemedText style={styles.headerTitle}>Create Leaderboard</ThemedText>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.formScroll}
        contentContainerStyle={styles.formScrollContent}
      >
        {/* Leaderboard Name */}
        <View style={styles.formSection}>
          <ThemedText style={styles.formLabel}>NAME</ThemedText>
          <TextInput
            style={styles.nameInput}
            placeholder="Enter leaderboard name..."
            placeholderTextColor="#555"
            value={leaderboardName}
            onChangeText={(text) => setLeaderboardName(text.toUpperCase())}
            maxLength={30}
            autoCapitalize="characters"
          />
          <ThemedText style={styles.nameCharCount}>{leaderboardName.length}/30</ThemedText>
        </View>

        {/* Icon Selection */}
        <View style={styles.formSection}>
          <ThemedText style={styles.formLabel}>ICON</ThemedText>
          <View style={styles.iconSelectionRow}>
            {DEFAULT_LOBBY_ICONS.map((icon) => (
              <TouchableOpacity
                key={icon.id}
                style={[
                  styles.defaultIconOption,
                  !leaderboardIcon && selectedDefaultIcon === icon.id && styles.defaultIconOptionSelected,
                ]}
                onPress={() => {
                  setSelectedDefaultIcon(icon.id);
                  setLeaderboardIcon(null);
                }}
                activeOpacity={0.7}
              >
                <Image source={icon.source} style={styles.defaultIconImage} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                styles.defaultIconOption,
                leaderboardIcon && styles.defaultIconOptionSelected,
              ]}
              onPress={handlePickLeaderboardIcon}
              activeOpacity={0.7}
            >
              {leaderboardIcon ? (
                <Image source={{ uri: leaderboardIcon }} style={styles.defaultIconImage} />
              ) : (
                <IconSymbol size={22} name="camera.fill" color="#555" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Game Selection */}
        <View style={styles.formSection}>
          <View style={styles.formGridItemFlex}>
            <ThemedText style={styles.formLabel}>GAME</ThemedText>
            <View style={styles.gameRow}>
              {AVAILABLE_GAMES.map((game) => (
                <TouchableOpacity
                  key={game.id}
                  style={[
                    styles.gameChip,
                    selectedGame?.id === game.id && styles.gameChipSelected
                  ]}
                  onPress={() => setSelectedGame(game)}
                >
                  <Image source={game.logo} style={styles.gameChipLogo} />
                  <ThemedText style={[
                    styles.gameChipText,
                    selectedGame?.id === game.id && styles.gameChipTextSelected
                  ]}>{game.name}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <ThemedText style={styles.formHint}>Choose which game you want to create a leaderboard for</ThemedText>
          </View>
        </View>

        {/* Cover Photo */}
        <View style={styles.formSection}>
          <ThemedText style={styles.formLabel}>COVER PHOTO</ThemedText>
          <TouchableOpacity
            style={styles.coverPhotoPicker}
            onPress={handlePickCoverPhoto}
            activeOpacity={0.7}
          >
            {coverPhoto ? (
              <Image source={{ uri: coverPhoto }} style={styles.coverPhotoPreview} />
            ) : (
              <View style={styles.coverPhotoPlaceholder}>
                <IconSymbol size={22} name="photo" color="#555" />
                <ThemedText style={styles.coverPhotoPlaceholderText}>Tap to add</ThemedText>
              </View>
            )}
            <View style={styles.coverPhotoEditBadge}>
              <IconSymbol size={12} name="camera.fill" color="#fff" />
            </View>
          </TouchableOpacity>
          <ThemedText style={styles.formHint}>Optional - displayed at the top of your leaderboard</ThemedText>
        </View>

        {/* Settings Grid */}
        <View style={styles.formDivider} />
        <View style={styles.formGrid}>
          <View style={styles.formGridItem}>
            <ThemedText style={styles.formLabel}>INVITE CODE</ThemedText>
            <TouchableOpacity style={styles.settingValueRow} onPress={handleCopyInviteCode}>
              <ThemedText style={styles.settingValue}>{inviteCode}</ThemedText>
              <IconSymbol size={14} name="doc.on.doc" color="#555" />
            </TouchableOpacity>
            <ThemedText style={styles.formHint}>Tap to copy and share</ThemedText>
          </View>
          <View style={styles.formGridItemFlex}>
            <ThemedText style={styles.formLabel}>WHO CAN INVITE</ThemedText>
            <View style={styles.permissionRow}>
              <TouchableOpacity
                style={[
                  styles.permissionButton,
                  invitePermission === 'leader_only' && styles.permissionButtonActive
                ]}
                onPress={() => setInvitePermission('leader_only')}
              >
                <IconSymbol
                  size={12}
                  name="crown.fill"
                  color={invitePermission === 'leader_only' ? '#fff' : '#555'}
                />
                <ThemedText style={[
                  styles.permissionButtonText,
                  invitePermission === 'leader_only' && styles.permissionButtonTextActive
                ]}>Leader</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.permissionButton,
                  invitePermission === 'anyone' && styles.permissionButtonActive
                ]}
                onPress={() => setInvitePermission('anyone')}
              >
                <IconSymbol
                  size={12}
                  name="person.2.fill"
                  color={invitePermission === 'anyone' ? '#fff' : '#555'}
                />
                <ThemedText style={[
                  styles.permissionButtonText,
                  invitePermission === 'anyone' && styles.permissionButtonTextActive
                ]}>Anyone</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Invite Members Section */}
        <View style={styles.formDivider} />
        <View style={styles.formSection}>
          <View style={styles.sectionTitleRow}>
            <View>
              <ThemedText style={styles.formLabel}>INVITE MEMBERS</ThemedText>
              <ThemedText style={styles.formHint}>You can add more members later</ThemedText>
            </View>
            {selectedFollowers.length > 0 && (
              <View style={styles.selectedBadge}>
                <ThemedText style={styles.selectedBadgeText}>{selectedFollowers.length}</ThemedText>
              </View>
            )}
          </View>

          {/* Search button */}
          <TouchableOpacity
            style={styles.inviteSearchButton}
            onPress={() => setInviteModalVisible(true)}
          >
            <IconSymbol size={15} name="magnifyingglass" color="#555" />
            <ThemedText style={styles.inviteSearchPlaceholder}>
              {loadingFollowers ? 'Loading...' : followers.length === 0 ? 'No followers to invite' : 'Search followers...'}
            </ThemedText>
          </TouchableOpacity>

          {/* Selected chips */}
          {selectedFollowers.length > 0 && (
            <View style={styles.selectedChipsContainer}>
              {followers
                .filter(f => selectedFollowers.includes(f.id))
                .map((follower) => (
                  <View key={follower.id} style={styles.selectedChip}>
                    <View style={styles.selectedChipAvatar}>
                      {follower.avatar && follower.avatar.startsWith('http') ? (
                        <Image source={{ uri: follower.avatar }} style={styles.selectedChipAvatarImage} />
                      ) : (
                        <ThemedText style={styles.selectedChipAvatarText}>
                          {follower.username[0].toUpperCase()}
                        </ThemedText>
                      )}
                    </View>
                    <ThemedText style={styles.selectedChipText}>{follower.username}</ThemedText>
                    <TouchableOpacity onPress={() => toggleFollower(follower.id)} hitSlop={8}>
                      <IconSymbol size={12} name="xmark" color="#666" />
                    </TouchableOpacity>
                  </View>
                ))}
            </View>
          )}

          {/* Suggestions */}
          {!loadingFollowers && mutualFollowers.length > 0 && (
            <>
              <ThemedText style={[styles.formLabel, { marginTop: 16 }]}>QUICK ADD</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsScroll}>
                <View style={styles.suggestionsRow}>
                  {mutualFollowers
                    .filter((f) => !selectedFollowers.includes(f.id))
                    .slice(0, 8)
                    .map((follower) => (
                      <TouchableOpacity
                        key={follower.id}
                        style={styles.suggestionItem}
                        onPress={() => toggleFollower(follower.id)}
                      >
                        <View style={styles.suggestionAvatarWrapper}>
                          <View style={styles.suggestionAvatar}>
                            {follower.avatar && follower.avatar.startsWith('http') ? (
                              <Image source={{ uri: follower.avatar }} style={styles.suggestionAvatarImage} />
                            ) : (
                              <ThemedText style={styles.suggestionAvatarText}>
                                {follower.username[0].toUpperCase()}
                              </ThemedText>
                            )}
                          </View>
                          <View style={styles.suggestionAddBadge}>
                            <IconSymbol size={8} name="plus" color="#fff" />
                          </View>
                        </View>
                        <ThemedText style={styles.suggestionName} numberOfLines={1}>
                          {follower.username}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  {mutualFollowers.filter((f) => !selectedFollowers.includes(f.id)).length === 0 && (
                    <ThemedText style={styles.allSelectedText}>All added</ThemedText>
                  )}
                </View>
              </ScrollView>
            </>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Fixed Buttons */}
      <View style={styles.createButtonContainer}>
        <TouchableOpacity
          style={styles.previewButton}
          onPress={() => setShowPreview(true)}
          activeOpacity={0.7}
        >
          <IconSymbol size={16} name="eye.fill" color="#a08845" />
          <ThemedText style={styles.previewButtonText}>Preview</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.createButton, uploading && styles.createButtonDisabled]}
          onPress={handleCreateLeaderboard}
          disabled={uploading}
          activeOpacity={0.8}
        >
          {uploading ? (
            <View style={styles.createButtonLoading}>
              <ActivityIndicator size="small" color="#fff" />
              <ThemedText style={styles.createButtonText}>Creating...</ThemedText>
            </View>
          ) : (
            <ThemedText style={styles.createButtonText}>Create Leaderboard</ThemedText>
          )}
        </TouchableOpacity>
      </View>

      {/* Preview Modal */}
      <Modal
        visible={showPreview}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPreview(false)}
      >
        <View style={pvStyles.container}>
          {/* Cover Photo */}
          <View style={pvStyles.coverSection}>
            {coverPhoto ? (
              <Image source={{ uri: coverPhoto }} style={pvStyles.coverImage} />
            ) : (
              <LinearGradient
                colors={['#252525', '#1a1a1a', '#0f0f0f']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={pvStyles.coverImage}
              />
            )}
            <LinearGradient
              colors={['transparent', '#0f0f0f']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={pvStyles.coverFade}
            />
            <TouchableOpacity style={pvStyles.closeButton} onPress={() => setShowPreview(false)}>
              <IconSymbol size={14} name="xmark" color="#fff" />
            </TouchableOpacity>
            <View style={pvStyles.previewBadge}>
              <ThemedText style={pvStyles.previewBadgeText}>PREVIEW</ThemedText>
            </View>
          </View>

          {/* Leaderboard Info */}
          <View style={pvStyles.infoSection}>
            <View style={pvStyles.infoRow}>
              <View style={pvStyles.iconWrapper}>
                {leaderboardIcon ? (
                  <Image source={{ uri: leaderboardIcon }} style={pvStyles.icon} />
                ) : selectedDefaultIcon ? (
                  <Image source={DEFAULT_LOBBY_ICONS.find(i => i.id === selectedDefaultIcon)?.source} style={pvStyles.icon} />
                ) : selectedGame ? (
                  <View style={pvStyles.iconPlaceholder}>
                    <Image source={GAME_LOGOS[selectedGame.name]} style={pvStyles.iconGameLogo} resizeMode="contain" />
                  </View>
                ) : (
                  <View style={pvStyles.iconPlaceholder}>
                    <ThemedText style={pvStyles.iconInitial}>{leaderboardName?.[0] || '?'}</ThemedText>
                  </View>
                )}
              </View>
              <View style={pvStyles.infoDetails}>
                <ThemedText style={pvStyles.name} numberOfLines={1}>
                  {leaderboardName || 'LEADERBOARD NAME'}
                </ThemedText>
                <View style={pvStyles.meta}>
                  {selectedGame && GAME_LOGOS[selectedGame.name] && (
                    <Image source={GAME_LOGOS[selectedGame.name]} style={pvStyles.metaLogo} resizeMode="contain" />
                  )}
                  <ThemedText style={pvStyles.metaText}>{selectedGame?.name || 'No game selected'}</ThemedText>
                  <View style={pvStyles.metaDot} />
                  <ThemedText style={pvStyles.metaText}>1 Player</ThemedText>
                </View>
              </View>
            </View>
          </View>

          {/* Column Headers */}
          <View style={pvStyles.columnHeaders}>
            <ThemedText style={[pvStyles.columnText, { width: 40 }]}>RANK</ThemedText>
            <ThemedText style={[pvStyles.columnText, { flex: 1, paddingLeft: 40 }]}>PLAYER</ThemedText>
            <ThemedText style={[pvStyles.columnText, { width: 130, textAlign: 'center', marginLeft: 'auto' }]}>CURRENT RANK</ThemedText>
          </View>

          {/* Current user as only player */}
          <View style={[pvStyles.playerRow, { borderLeftWidth: 4, borderLeftColor: '#FFD700' }]}>
            <View style={pvStyles.rankContainer}>
              <ThemedText style={pvStyles.rankNumber}>1</ThemedText>
            </View>
            <View style={pvStyles.playerInfo}>
              <View style={pvStyles.playerAvatar}>
                {user?.avatar ? (
                  <Image source={{ uri: user.avatar }} style={pvStyles.playerAvatarImage} />
                ) : (
                  <ThemedText style={pvStyles.playerAvatarText}>
                    {(user?.username || 'U')[0].toUpperCase()}
                  </ThemedText>
                )}
              </View>
              <ThemedText style={pvStyles.playerName} numberOfLines={1}>
                {user?.username || 'You'} (You)
              </ThemedText>
            </View>
            <View style={pvStyles.rankInfo}>
              <ThemedText style={pvStyles.currentRank}>-</ThemedText>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Members Modal */}
      <Modal
        visible={inviteModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Invite Members</ThemedText>
          </View>

          <TextInput
            style={styles.modalSearchInput}
            placeholder="Search followers..."
            placeholderTextColor="#555"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />

          <ScrollView style={styles.modalFollowersList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Invited members section */}
              {selectedFollowers.length > 0 && (
                <View style={styles.invitedSection}>
                  <ThemedText style={styles.invitedSectionTitle}>INVITED</ThemedText>
                  {followers
                    .filter(f => selectedFollowers.includes(f.id))
                    .map((follower) => (
                      <TouchableOpacity
                        key={follower.id}
                        style={[styles.followerItem, styles.followerItemSelected]}
                        onPress={() => toggleFollower(follower.id)}
                      >
                        <View style={styles.followerAvatar}>
                          {follower.avatar && follower.avatar.startsWith('http') ? (
                            <Image source={{ uri: follower.avatar }} style={styles.followerAvatarImage} />
                          ) : (
                            <ThemedText style={styles.followerAvatarText}>
                              {follower.username[0].toUpperCase()}
                            </ThemedText>
                          )}
                        </View>
                        <ThemedText style={styles.followerName}>{follower.username}</ThemedText>
                        <ThemedText style={styles.invitedBadgeText}>Invited</ThemedText>
                        <TouchableOpacity onPress={() => toggleFollower(follower.id)} hitSlop={8}>
                          <IconSymbol size={14} name="xmark" color="#666" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                </View>
              )}

              {/* All followers */}
              {loadingFollowers ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#c42743" />
                </View>
              ) : followers.length === 0 ? (
                <ThemedText style={styles.emptyText}>No followers to invite</ThemedText>
              ) : filteredFollowers.filter(f => !selectedFollowers.includes(f.id)).length === 0 && searchQuery ? (
                <ThemedText style={styles.emptyText}>No results</ThemedText>
              ) : (
                <View style={styles.followersList}>
                  {filteredFollowers
                    .filter(f => !selectedFollowers.includes(f.id))
                    .map((follower) => (
                    <TouchableOpacity
                      key={follower.id}
                      style={styles.followerItem}
                      onPress={() => toggleFollower(follower.id)}
                    >
                      <View style={styles.followerAvatar}>
                        {follower.avatar && follower.avatar.startsWith('http') ? (
                          <Image source={{ uri: follower.avatar }} style={styles.followerAvatarImage} />
                        ) : (
                          <ThemedText style={styles.followerAvatarText}>
                            {follower.username[0].toUpperCase()}
                          </ThemedText>
                        )}
                      </View>
                      <ThemedText style={styles.followerName}>{follower.username}</ThemedText>
                      <View style={styles.checkCircle} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>

          <TouchableOpacity
            style={[styles.modalDoneButton, keyboardHeight > 0 && { marginBottom: keyboardHeight - 10 }]}
            onPress={() => setInviteModalVisible(false)}
          >
            <ThemedText style={styles.modalDoneButtonText}>Done</ThemedText>
          </TouchableOpacity>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(160, 136, 69, 0.1)',
  },
  backButton: {
    padding: 4,
    width: 28,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTrophyCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(160, 136, 69, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#eee',
  },
  headerSpacer: {
    width: 28,
  },
  formScroll: {
    flex: 1,
  },
  formScrollContent: {
    paddingBottom: 20,
    paddingHorizontal: 20,
  },

  // Form layout
  formSection: {
    marginTop: 16,
  },
  formLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  formHint: {
    fontSize: 11,
    color: '#444',
    marginTop: 6,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 0,
  },
  formGridItem: {
    paddingRight: 16,
    marginBottom: 4,
  },
  formGridItemFlex: {
    flex: 1,
    marginBottom: 4,
  },
  formDivider: {
    height: 1,
    backgroundColor: 'rgba(160, 136, 69, 0.1)',
    marginTop: 16,
  },

  // Cover Photo
  coverPhotoPicker: {
    width: '100%',
    height: 120,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  coverPhotoPreview: {
    width: '100%',
    height: '100%',
  },
  coverPhotoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  coverPhotoPlaceholderText: {
    fontSize: 12,
    color: '#444',
  },
  coverPhotoEditBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Icon Selection
  iconSelectionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  defaultIconOption: {
    width: 50,
    height: 50,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  defaultIconOptionSelected: {
    borderColor: '#8B7FE8',
  },
  defaultIconImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  leaderboardIconPicker: {
    width: 56,
    height: 56,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  leaderboardIconPreview: {
    width: '100%',
    height: '100%',
  },
  leaderboardIconPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Game chips
  gameRow: {
    flexDirection: 'row',
    gap: 8,
  },
  gameChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1a1a1a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  gameChipSelected: {
    backgroundColor: '#a08845',
  },
  gameChipLogo: {
    width: 16,
    height: 16,
  },
  gameChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  gameChipTextSelected: {
    color: '#fff',
  },

  // Name input
  nameInput: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.3,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  nameCharCount: {
    fontSize: 10,
    color: '#333',
    textAlign: 'right',
    marginTop: 6,
  },

  // Settings
  settingValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
  },
  settingValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#a08845',
    letterSpacing: 2,
  },

  // Permission
  permissionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  permissionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 10,
  },
  permissionButtonActive: {
    backgroundColor: '#a08845',
  },
  permissionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
  },
  permissionButtonTextActive: {
    color: '#fff',
  },

  // Section title row
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  suggestionsScroll: {
    marginHorizontal: 0,
  },
  suggestionsRow: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 4,
  },
  suggestionItem: {
    alignItems: 'center',
    width: 52,
  },
  suggestionAvatarWrapper: {
    position: 'relative',
    marginBottom: 5,
  },
  suggestionAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  suggestionAvatarImage: {
    width: '100%',
    height: '100%',
  },
  suggestionAvatarText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  suggestionName: {
    fontSize: 10,
    color: '#888',
    textAlign: 'center',
  },
  suggestionAddBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#a08845',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#111',
  },
  allSelectedText: {
    fontSize: 12,
    color: '#444',
    fontStyle: 'italic',
    alignSelf: 'center',
    paddingVertical: 8,
  },

  // Selected chips
  selectedChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#a08845',
  },
  selectedChipAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selectedChipAvatarImage: {
    width: '100%',
    height: '100%',
  },
  selectedChipAvatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#555',
  },
  selectedChipText: {
    fontSize: 12,
    color: '#ccc',
    fontWeight: '500',
  },

  // Search
  inviteSearchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  inviteSearchPlaceholder: {
    fontSize: 14,
    color: '#444',
  },

  // Badge
  selectedBadge: {
    backgroundColor: '#a08845',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  selectedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },

  // Create Button
  createButtonContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: 'rgba(160, 136, 69, 0.1)',
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  previewButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#a08845',
  },
  createButton: {
    backgroundColor: '#a08845',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bottomSpacer: {
    height: 10,
  },

  // Modal
  modalSheet: {
    flex: 1,
    backgroundColor: '#111',
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(160, 136, 69, 0.1)',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#eee',
  },
  modalSearchInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#fff',
    marginBottom: 12,
  },
  modalFollowersList: {
    flex: 1,
  },
  modalDoneButton: {
    backgroundColor: '#a08845',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  modalDoneButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#444',
    paddingVertical: 20,
    textAlign: 'center',
  },

  // Followers list
  invitedSection: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(160, 136, 69, 0.1)',
  },
  invitedSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#a08845',
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  invitedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a08845',
  },
  followersList: {
    gap: 2,
  },
  followerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 10,
  },
  followerItemSelected: {
    backgroundColor: '#1a1a1a',
  },
  followerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  followerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  followerAvatarText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  followerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: '#a08845',
    borderColor: '#a08845',
  },
});

const pvStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  coverSection: {
    height: 130,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(160, 136, 69, 0.8)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  infoSection: {
    marginTop: -34,
    zIndex: 2,
    paddingHorizontal: 20,
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconWrapper: {
    width: 68,
    height: 68,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#0f0f0f',
  },
  icon: {
    width: '100%',
    height: '100%',
  },
  iconPlaceholder: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGameLogo: {
    width: 32,
    height: 32,
  },
  iconInitial: {
    fontSize: 24,
    fontWeight: '700',
    color: '#555',
  },
  infoDetails: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaLogo: {
    width: 14,
    height: 14,
  },
  metaText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#333',
  },
  columnHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 20,
    marginHorizontal: 16,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  columnText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 16,
    backgroundColor: '#141414',
    marginHorizontal: 16,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  rankContainer: {
    width: 40,
    alignItems: 'flex-start',
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFD700',
  },
  playerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  playerAvatarText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  playerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  rankInfo: {
    width: 130,
    marginLeft: 'auto',
    alignItems: 'center',
  },
  currentRank: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
});
