import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, TouchableOpacity, View, Image, Alert, RefreshControl, Modal, ActivityIndicator, TextInput, Animated, PanResponder, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { formatRankDisplay } from '@/utils/formatRankDisplay';
import { useState, useEffect, useRef } from 'react';
import { db, functions } from '@/config/firebase';
import { doc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { uploadPartyIcon, uploadPartyCoverPhoto } from '@/services/storageService';
import { useAuth } from '@/contexts/AuthContext';
import CachedImage from '@/components/ui/CachedImage';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Game logo mapping
const GAME_LOGOS: { [key: string]: any } = {
  'Valorant': require('@/assets/images/valorant-red.png'),
  'League of Legends': require('@/assets/images/lol-icon.png'),
  'League': require('@/assets/images/lol-icon.png'),
  'Apex Legends': require('@/assets/images/apex.png'),
};

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

// Valorant rank icon mapping
const VALORANT_RANK_ICONS: { [key: string]: any } = {
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

interface Player {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  isCurrentUser?: boolean;
  currentRank: string;
  lp?: number;
  rr?: number;
  dailyGain?: number;
}

// Helper function to get League rank icon
const getLeagueRankIcon = (rank: string) => {
  if (!rank || rank === 'Unranked') {
    return LEAGUE_RANK_ICONS.unranked;
  }
  const tier = rank.split(' ')[0].toLowerCase();
  return LEAGUE_RANK_ICONS[tier] || LEAGUE_RANK_ICONS.unranked;
};

// Helper function to get Valorant rank icon
const getValorantRankIcon = (rank: string) => {
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

// Helper function to calculate League rank value for sorting
const getLeagueRankValue = (currentRank: string, lp: number): number => {
  const rankOrder: { [key: string]: number } = {
    'CHALLENGER': 10,
    'GRANDMASTER': 9,
    'MASTER': 8,
    'DIAMOND': 7,
    'EMERALD': 6,
    'PLATINUM': 5,
    'GOLD': 4,
    'SILVER': 3,
    'BRONZE': 2,
    'IRON': 1,
    'UNRANKED': 0,
  };

  const divisionOrder: { [key: string]: number } = {
    'I': 4,
    'II': 3,
    'III': 2,
    'IV': 1,
  };

  const parts = currentRank.toUpperCase().split(' ');
  const tier = parts[0];
  const division = parts[1] || '';

  const tierValue = rankOrder[tier] || 0;
  const divisionValue = divisionOrder[division] || 0;

  return tierValue * 1000 + divisionValue * 100 + lp;
};

// Helper function to calculate Valorant rank value for sorting
const getValorantRankValue = (currentRank: string, rr: number): number => {
  const rankOrder: { [key: string]: number } = {
    'RADIANT': 9,
    'IMMORTAL': 8,
    'ASCENDANT': 7,
    'DIAMOND': 6,
    'PLATINUM': 5,
    'GOLD': 4,
    'SILVER': 3,
    'BRONZE': 2,
    'IRON': 1,
    'UNRANKED': 0,
  };

  const parts = currentRank.toUpperCase().split(' ');
  const tier = parts[0];
  const division = parts[1] || '0';

  const tierValue = rankOrder[tier] || 0;
  const divisionValue = parseInt(division) || 0;

  return tierValue * 1000 + divisionValue * 100 + rr;
};

export default function LeaderboardDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();

  const id = params.id as string;
  const game = params.game as string;
  const isLeague = game === 'League of Legends' || game === 'League';

  const [partyData, setPartyData] = useState<any>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [partyDocId, setPartyDocId] = useState<string>('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [mutuals, setMutuals] = useState<{ id: string; username: string; avatar: string }[]>([]);
  const [loadingMutuals, setLoadingMutuals] = useState(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');
  const [invitingUsers, setInvitingUsers] = useState<Set<string>>(new Set());
  const [invitedUsers, setInvitedUsers] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<{ id: string; username: string; avatar: string }[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [showManageMembersModal, setShowManageMembersModal] = useState(false);
  const [kickingMember, setKickingMember] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<{ id: string; username: string; avatar: string }[]>([]);
  const [updatingPermission, setUpdatingPermission] = useState(false);
  const [startingChallenge, setStartingChallenge] = useState(false);
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [showChallengeTypeModal, setShowChallengeTypeModal] = useState(false);
  const [editDuration, setEditDuration] = useState<number>(30);
  const [editChallengeType, setEditChallengeType] = useState<'climbing' | 'rank'>('climbing');
  const [savingDuration, setSavingDuration] = useState(false);
  const [savingChallengeType, setSavingChallengeType] = useState(false);
  const [showCreateChallengeModal, setShowCreateChallengeModal] = useState(false);
  const [showChallengeDetailsModal, setShowChallengeDetailsModal] = useState(false);
  const [challengeTypeSelection, setChallengeTypeSelection] = useState<'climbing' | 'rank'>('climbing');
  const [durationSelection, setDurationSelection] = useState<number>(30);
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [customDurationText, setCustomDurationText] = useState('');
  const [selectedChallengeMembers, setSelectedChallengeMembers] = useState<string[]>([]);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [spectators, setSpectators] = useState<any[]>([]);
  const [updatingStats, setUpdatingStats] = useState(false);

  // Swipe-to-dismiss for invite modal
  const inviteModalTranslateY = useRef(new Animated.Value(0)).current;
  const invitePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          inviteModalTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          Animated.timing(inviteModalTranslateY, {
            toValue: 600,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setShowInviteModal(false);
            inviteModalTranslateY.setValue(0);
          });
        } else {
          Animated.spring(inviteModalTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const isCreator = partyData?.createdBy === user?.id;
  const isMember = partyData?.members?.includes(user?.id);
  const allowedInviters: string[] = partyData?.allowedInviters || [];
  const challengeStatus = partyData?.challengeStatus || 'none';
  const isNone = challengeStatus === 'none';
  const isPending = challengeStatus === 'pending';
  const isActive = challengeStatus === 'active';
  const canInvite = isCreator || allowedInviters.includes(user?.id || '');
  const challengeParticipants: string[] = partyData?.challengeParticipants || [];
  const challengeInvites: any[] = partyData?.challengeInvites || [];
  const acceptedCount = challengeInvites.filter((inv: any) => inv.status === 'accepted').length + 1; // +1 for leader

  // Leave party function
  const handleLeaveParty = async () => {
    if (!user?.id || !partyDocId) {
      Alert.alert('Error', 'Unable to leave leaderboard. Please try again.');
      return;
    }

    const currentMembers = partyData?.members || [];
    const hasNoMembers = !currentMembers.length || currentMembers.length === 0;

    if (hasNoMembers || (isCreator && currentMembers.length <= 1)) {
      Alert.alert(
        'Delete Leaderboard',
        'Do you want to delete this leaderboard?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                const partyRef = doc(db, 'parties', partyDocId);
                await deleteDoc(partyRef);
                Alert.alert('Leaderboard Deleted', 'The leaderboard has been deleted.');
                router.replace('/partyPages/lobbies');
              } catch (error) {
                console.error('Error deleting leaderboard:', error);
                Alert.alert('Error', 'Failed to delete leaderboard. Please try again.');
              }
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Leave Leaderboard',
      'Are you sure you want to leave this leaderboard?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              const partyRef = doc(db, 'parties', partyDocId);

              const updatedMembers = partyData.members.filter((memberId: string) => memberId !== user.id);
              const updatedMemberDetails = partyData.memberDetails.filter(
                (member: any) => member.userId !== user.id
              );

              if (updatedMembers.length === 0) {
                await deleteDoc(partyRef);
                Alert.alert('Leaderboard Deleted', 'You were the last member. The leaderboard has been deleted.');
                router.replace('/partyPages/lobbies');
                return;
              }

              // Also clean up challenge data
              const updatedChallengeInvites = (partyData?.challengeInvites || []).filter(
                (inv: any) => inv.userId !== user.id
              );
              const updatedChallengeParticipants = (partyData?.challengeParticipants || []).filter(
                (id: string) => id !== user.id
              );

              if (isCreator) {
                const newLeader = updatedMembers[0];
                const newLeaderDetails = updatedMemberDetails[0];

                await updateDoc(partyRef, {
                  members: updatedMembers,
                  memberDetails: updatedMemberDetails,
                  createdBy: newLeader,
                  challengeInvites: updatedChallengeInvites,
                  challengeParticipants: updatedChallengeParticipants,
                });

                Alert.alert(
                  'Leadership Transferred',
                  `You have left the leaderboard. Leadership has been transferred to ${newLeaderDetails?.username || 'another member'}.`
                );
              } else {
                await updateDoc(partyRef, {
                  members: updatedMembers,
                  memberDetails: updatedMemberDetails,
                  challengeInvites: updatedChallengeInvites,
                  challengeParticipants: updatedChallengeParticipants,
                });

                Alert.alert('Success', 'You have left the leaderboard.');
              }

              router.replace('/(tabs)/leaderboards');
            } catch (error) {
              console.error('Error leaving leaderboard:', error);
              Alert.alert('Error', 'Failed to leave leaderboard. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Copy invite code to clipboard
  const handleCopyInviteCode = async () => {
    if (inviteCode) {
      await Clipboard.setStringAsync(inviteCode);
      Alert.alert('Copied!', 'Invite code copied to clipboard');
    }
  };

  // Open invite modal and fetch mutuals
  const handleOpenInviteModal = async () => {
    setShowInviteModal(true);
    setInviteSearchQuery('');
    setLoadingMutuals(true);

    try {
      if (!user?.id) return;

      // Set pending invites from party data
      const currentPendingInvites = partyData?.pendingInvites || [];
      setPendingInvites(currentPendingInvites.map((inv: any) => ({
        id: inv.userId,
        username: inv.username,
        avatar: inv.avatar || '',
      })));

      const followingRef = collection(db, 'users', user.id, 'following');
      const followingSnapshot = await getDocs(followingRef);
      const followingIds = followingSnapshot.docs.map(doc => doc.data().followingId);

      const followersRef = collection(db, 'users', user.id, 'followers');
      const followersSnapshot = await getDocs(followersRef);
      const followerIds = followersSnapshot.docs.map(doc => doc.data().followerId);

      const mutualIds = followingIds.filter(id => followerIds.includes(id));

      const mutualUsers: { id: string; username: string; avatar: string }[] = [];
      for (const mutualId of mutualIds) {
        if (partyData?.members?.includes(mutualId)) continue;
        if (partyData?.pendingInvites?.some((inv: any) => inv.userId === mutualId)) continue;

        const userDoc = await getDoc(doc(db, 'users', mutualId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          mutualUsers.push({
            id: mutualId,
            username: userData.username || 'Unknown',
            avatar: userData.avatar || '',
          });
        }
      }

      setMutuals(mutualUsers);
    } catch (error) {
      console.error('Error fetching mutuals:', error);
    } finally {
      setLoadingMutuals(false);
    }
  };

  // Invite a user
  const handleInviteUser = async (invitee: { id: string; username: string; avatar: string }) => {
    if (!user?.id || !partyDocId) return;

    setInvitingUsers(prev => new Set(prev).add(invitee.id));

    try {
      const partyRef = doc(db, 'parties', partyDocId);

      const newPendingInvite = {
        userId: invitee.id,
        username: invitee.username,
        avatar: invitee.avatar,
        invitedAt: new Date().toISOString(),
        status: 'pending',
      };

      const currentPendingInvites = partyData?.pendingInvites || [];
      await updateDoc(partyRef, {
        pendingInvites: [...currentPendingInvites, newPendingInvite],
      });

      const notificationRef = collection(db, 'users', invitee.id, 'notifications');
      await addDoc(notificationRef, {
        type: 'party_invite',
        fromUserId: user.id,
        fromUsername: user.username || user.email?.split('@')[0] || 'Unknown',
        fromAvatar: user.avatar || '',
        partyId: id,
        partyName: partyData?.partyName || leaderboardName,
        game: game,
        read: false,
        createdAt: serverTimestamp(),
      });

      setInvitedUsers(prev => new Set(prev).add(invitee.id));
      setPendingInvites(prev => [...prev, { id: invitee.id, username: invitee.username, avatar: invitee.avatar }]);
      setMutuals(prev => prev.filter(m => m.id !== invitee.id));
    } catch (error) {
      console.error('Error inviting user:', error);
      Alert.alert('Error', 'Failed to send invite');
    } finally {
      setInvitingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(invitee.id);
        return newSet;
      });
    }
  };

  const [revokingUsers, setRevokingUsers] = useState<Set<string>>(new Set());

  const handleRevokeInvite = async (inviteeId: string) => {
    if (!partyDocId) return;

    setRevokingUsers(prev => new Set(prev).add(inviteeId));

    try {
      const partyRef = doc(db, 'parties', partyDocId);
      const currentPendingInvites = partyData?.pendingInvites || [];
      const updatedInvites = currentPendingInvites.filter(
        (inv: any) => inv.userId !== inviteeId
      );
      await updateDoc(partyRef, { pendingInvites: updatedInvites });

      // Move user back to suggestions
      const revokedUser = pendingInvites.find(u => u.id === inviteeId);
      setPendingInvites(prev => prev.filter(u => u.id !== inviteeId));
      setInvitedUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(inviteeId);
        return newSet;
      });
      if (revokedUser) {
        setMutuals(prev => [...prev, revokedUser]);
      }
    } catch (error) {
      console.error('Error revoking invite:', error);
      Alert.alert('Error', 'Failed to revoke invite');
    } finally {
      setRevokingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(inviteeId);
        return newSet;
      });
    }
  };

  // Search users
  const handleInviteSearch = async (query: string) => {
    setInviteSearchQuery(query);

    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchingUsers(true);
    try {
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);

      const results: { id: string; username: string; avatar: string }[] = [];
      usersSnapshot.docs.forEach(userDoc => {
        const userData = userDoc.data();
        const username = userData.username || '';

        if (userDoc.id === user?.id) return;
        if (partyData?.members?.includes(userDoc.id)) return;
        if (partyData?.pendingInvites?.some((inv: any) => inv.userId === userDoc.id)) return;

        if (username.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            id: userDoc.id,
            username: username,
            avatar: userData.avatar || '',
          });
        }
      });

      setSearchResults(results.slice(0, 20));
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearchingUsers(false);
    }
  };

  const displayUsers = inviteSearchQuery.trim().length >= 2 ? searchResults : mutuals;

  // Pick a new cover photo from the library and upload it
  const pickAndUploadCoverPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setShowEditModal(false);
        setUploading(true);
        try {
          const coverPhotoUrl = await uploadPartyCoverPhoto(partyDocId, result.assets[0].uri);
          const partyRef = doc(db, 'parties', partyDocId);
          await updateDoc(partyRef, { coverPhoto: coverPhotoUrl });
        } catch (error) {
          console.error('Error uploading cover photo:', error);
          Alert.alert('Error', 'Failed to update cover photo');
        }
        setUploading(false);
      }
    } catch (error) {
      console.error('Error picking cover photo:', error);
      Alert.alert('Error', 'Failed to select cover photo');
    }
  };

  // Remove the current cover photo
  const removeCoverPhoto = async () => {
    setShowEditModal(false);
    setUploading(true);
    try {
      const partyRef = doc(db, 'parties', partyDocId);
      await updateDoc(partyRef, { coverPhoto: null });
    } catch (error) {
      console.error('Error removing cover photo:', error);
      Alert.alert('Error', 'Failed to remove cover photo');
    }
    setUploading(false);
  };

  // Handle changing cover photo — offer options if one already exists
  const handleChangeCoverPhoto = () => {
    if (partyData?.coverPhoto) {
      Alert.alert(
        'Cover Photo',
        'What would you like to do?',
        [
          { text: 'Choose New Photo', onPress: pickAndUploadCoverPhoto },
          { text: 'Remove Current Photo', style: 'destructive', onPress: removeCoverPhoto },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } else {
      pickAndUploadCoverPhoto();
    }
  };

  // Handle changing leaderboard icon
  const handleChangeLeaderboardIcon = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setShowEditModal(false);
        setUploading(true);
        try {
          const iconUrl = await uploadPartyIcon(partyDocId, result.assets[0].uri);
          const partyRef = doc(db, 'parties', partyDocId);
          await updateDoc(partyRef, { partyIcon: iconUrl });
        } catch (error) {
          console.error('Error uploading leaderboard icon:', error);
          Alert.alert('Error', 'Failed to update leaderboard icon');
        }
        setUploading(false);
      }
    } catch (error) {
      console.error('Error picking leaderboard icon:', error);
      Alert.alert('Error', 'Failed to select leaderboard icon');
    }
  };

  // Handle creating a challenge
  const handleCreateChallenge = async () => {
    if (!partyDocId || !user?.id || !isCreator) return;
    if (selectedChallengeMembers.length === 0) {
      Alert.alert('Select Members', 'Select at least one member to challenge.');
      return;
    }

    setCreatingChallenge(true);
    try {
      const partyRef = doc(db, 'parties', partyDocId);
      const memberDetails = partyData?.memberDetails || [];

      // Build challenge invites from selected members
      const invites = selectedChallengeMembers.map((memberId: string) => {
        const member = memberDetails.find((m: any) => m.userId === memberId);
        return {
          userId: memberId,
          username: member?.username || 'Unknown',
          avatar: member?.avatar || '',
          status: 'pending',
          invitedAt: new Date().toISOString(),
        };
      });

      // Update party with challenge data (leader auto-participates)
      await updateDoc(partyRef, {
        challengeStatus: 'pending',
        challengeType: challengeTypeSelection,
        duration: durationSelection,
        challengeInvites: invites,
        challengeParticipants: [user.id],
      });

      // Send notifications to each invited member
      for (const memberId of selectedChallengeMembers) {
        const notifRef = collection(db, 'users', memberId, 'notifications');
        await addDoc(notifRef, {
          type: 'challenge_invite',
          fromUserId: user.id,
          fromUsername: user.username || '',
          fromAvatar: user.avatar || '',
          partyId: partyDocId,
          partyName: partyData?.partyName || '',
          game: partyData?.game || '',
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      setShowCreateChallengeModal(false);
      setSelectedChallengeMembers([]);
    } catch (error) {
      console.error('Error creating challenge:', error);
      Alert.alert('Error', 'Failed to create challenge. Please try again.');
    } finally {
      setCreatingChallenge(false);
    }
  };

  // Handle starting the challenge
  const handleStartChallenge = async () => {
    if (!partyDocId || !isCreator) return;

    if (challengeParticipants.length < 2) {
      Alert.alert('Not Enough Participants', 'At least 2 people must accept the challenge before you can start.');
      return;
    }

    const startChallenge = async () => {
      setStartingChallenge(true);
      try {
        const partyRef = doc(db, 'parties', partyDocId);
        const duration = partyData?.duration || 30;

        const now = new Date();
        const end = new Date(now);
        end.setDate(end.getDate() + duration);
        end.setHours(23, 59, 59, 999);

        const formatDateStr = (date: Date) => {
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const year = date.getFullYear();
          return `${month}/${day}/${year}`;
        };

        // Snapshot starting stats (LP/RR + wins/losses for challenge tracking)
        let startingStats: any[] = [];
        const gameStatsPath = isLeague ? 'league' : 'valorant';
        const statsPromises = challengeParticipants.map(async (userId: string) => {
          try {
            const statsDoc = await getDoc(doc(db, 'users', userId, 'gameStats', gameStatsPath));
            const stats = statsDoc.data();
            const userDoc = await getDoc(doc(db, 'users', userId));
            const userData = userDoc.data();

            let wins = 0, losses = 0;
            if (isLeague && userData?.riotStats?.rankedSolo) {
              wins = userData.riotStats.rankedSolo.wins || 0;
              losses = userData.riotStats.rankedSolo.losses || 0;
            } else if (!isLeague && userData?.valorantStats) {
              wins = userData.valorantStats.wins || 0;
              losses = userData.valorantStats.losses || 0;
            }

            return {
              userId,
              lp: isLeague ? (stats?.lp || 0) : 0,
              rr: !isLeague ? (stats?.rr || 0) : 0,
              wins,
              losses,
            };
          } catch {
            return { userId, lp: 0, rr: 0, wins: 0, losses: 0 };
          }
        });
        startingStats = await Promise.all(statsPromises);

        await updateDoc(partyRef, {
          challengeStatus: 'active',
          startDate: formatDateStr(now),
          endDate: formatDateStr(end),
          pendingInvites: [],
          startingStats,
        });
      } catch (error) {
        console.error('Error starting challenge:', error);
        Alert.alert('Error', 'Failed to start challenge');
      } finally {
        setStartingChallenge(false);
      }
    };

    Alert.alert(
      'Start Challenge',
      `Start the challenge with ${challengeParticipants.length} participants? The timer will begin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start', onPress: startChallenge },
      ]
    );
  };

  // Handle updating invite permission
  const handleToggleInvitePermission = async (memberId: string) => {
    if (!partyDocId) return;

    setUpdatingPermission(true);
    try {
      const partyRef = doc(db, 'parties', partyDocId);
      const currentAllowed = partyData?.allowedInviters || [];
      const newAllowed = currentAllowed.includes(memberId)
        ? currentAllowed.filter((id: string) => id !== memberId)
        : [...currentAllowed, memberId];
      await updateDoc(partyRef, { allowedInviters: newAllowed });
    } catch (error) {
      console.error('Error updating invite permission:', error);
      Alert.alert('Error', 'Failed to update invite permission');
    } finally {
      setUpdatingPermission(false);
    }
  };

  // Handle kicking a member
  const handleKickMember = (player: Player) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${player.username} from the leaderboard?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setKickingMember(player.userId);
            try {
              const partyRef = doc(db, 'parties', partyDocId);
              const updatedMembers = (partyData?.members || []).filter((id: string) => id !== player.userId);
              const updatedMemberDetails = (partyData?.memberDetails || []).filter(
                (m: any) => m.userId !== player.userId
              );

              const updatedChallengeInvites = (partyData?.challengeInvites || []).filter(
                (inv: any) => inv.userId !== player.userId
              );
              const updatedChallengeParticipants = (partyData?.challengeParticipants || []).filter(
                (id: string) => id !== player.userId
              );

              await updateDoc(partyRef, {
                members: updatedMembers,
                memberDetails: updatedMemberDetails,
                challengeInvites: updatedChallengeInvites,
                challengeParticipants: updatedChallengeParticipants,
              });
            } catch (error) {
              console.error('Error kicking member:', error);
              Alert.alert('Error', 'Failed to remove member');
            } finally {
              setKickingMember(null);
            }
          },
        },
      ]
    );
  };

  // Set up real-time listener
  useEffect(() => {
    if (!id) return;

    let unsubscribe: (() => void) | undefined;

    const setupRealtimeListener = async () => {
      try {
        const partyRef = doc(db, 'parties', id);

        unsubscribe = onSnapshot(partyRef, async (docSnapshot) => {
          if (!docSnapshot.exists()) {
            console.log('Leaderboard document no longer exists');
            return;
          }

          const partyDoc = docSnapshot.data();
          setPartyData(partyDoc);
          setPartyDocId(id);
          setInviteCode(partyDoc.inviteCode || '');
          setEditDuration(partyDoc.duration || 30);
          setEditChallengeType(partyDoc.challengeType || 'climbing');

          if (!partyDoc.memberDetails || partyDoc.memberDetails.length === 0) {
            setPlayers([]);
            setRefreshing(false);
            return;
          }

          const gameStatsPath = isLeague ? 'league' : 'valorant';

          const memberPromises = partyDoc.memberDetails.map(async (member: any, index: number) => {
            let stats: any = null;

            try {
              const userStatsDoc = await getDoc(doc(db, 'users', member.userId, 'gameStats', gameStatsPath));
              stats = userStatsDoc.data();

              if (!stats || !stats.currentRank) {
                const userDoc = await getDoc(doc(db, 'users', member.userId));
                const userData = userDoc.data();

                if (isLeague && userData?.riotStats?.rankedSolo) {
                  stats = {
                    currentRank: `${userData.riotStats.rankedSolo.tier} ${userData.riotStats.rankedSolo.rank}`,
                    lp: userData.riotStats.rankedSolo.leaguePoints || 0,
                    dailyGain: 0,
                  };
                } else if (!isLeague && userData?.valorantStats) {
                  stats = {
                    currentRank: userData.valorantStats.currentRank || 'Unranked',
                    rr: userData.valorantStats.rankRating || 0,
                    dailyGain: 0,
                  };
                }
              }
            } catch (error) {
              // Handle permission errors gracefully - use default values
              console.log(`Could not fetch stats for member ${member.userId}:`, error);
            }

            return {
              rank: index + 1,
              userId: member.userId,
              username: member.username,
              avatar: member.avatar,
              currentRank: stats?.currentRank || 'Unranked',
              lp: isLeague ? (stats?.lp || 0) : undefined,
              rr: !isLeague ? (stats?.rr || 0) : undefined,
              dailyGain: stats?.dailyGain || 0,
              isCurrentUser: member.userId === user?.id,
            };
          });

          const fetchedPlayers = await Promise.all(memberPromises);

          fetchedPlayers.sort((a, b) => {
            if (isLeague) {
              const aValue = getLeagueRankValue(a.currentRank, a.lp || 0);
              const bValue = getLeagueRankValue(b.currentRank, b.lp || 0);
              return bValue - aValue;
            } else {
              const aValue = getValorantRankValue(a.currentRank, a.rr || 0);
              const bValue = getValorantRankValue(b.currentRank, b.rr || 0);
              return bValue - aValue;
            }
          });

          // Always show all members ranked equally
          fetchedPlayers.forEach((player, index) => {
            player.rank = index + 1;
          });
          setPlayers(fetchedPlayers);
          setSpectators([]);
          setRefreshing(false);
        }, (error) => {
          console.error('Error in real-time listener:', error);
          setRefreshing(false);
        });
      } catch (error) {
        console.error('Error setting up real-time listener:', error);
      }
    };

    setupRealtimeListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [id, game, isLeague, user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const handleUpdateStats = async () => {
    if (updatingStats || !id) return;
    setUpdatingStats(true);
    try {
      const refreshPartyStatsFn = httpsCallable(functions, 'refreshPartyStats');
      await refreshPartyStatsFn({ partyId: id });
    } catch (error: any) {
      const msg = error?.message || 'Failed to update stats';
      Alert.alert('Update Failed', msg.includes('wait') ? msg : 'Could not refresh stats. Try again later.');
    } finally {
      setUpdatingStats(false);
    }
  };

  const leaderboardName = partyData?.partyName || params.name as string;
  const memberCount = partyData?.members?.length || Number(params.members);

  // Convert to Date helper
  const convertToDate = (dateValue: any): Date | null => {
    if (!dateValue) return null;
    if (dateValue.toDate && typeof dateValue.toDate === 'function') {
      return dateValue.toDate();
    }
    if (dateValue instanceof Date) {
      return dateValue;
    }
    if (typeof dateValue === 'string') {
      const parts = dateValue.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0], 10) - 1;
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
      const parsed = new Date(dateValue);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  };

  // Format date string for display (e.g. "25Mar26")
  const formatDisplayDate = (dateValue: any): string => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = convertToDate(dateValue);
    if (!d) return String(dateValue);
    const day = d.getDate();
    const mon = months[d.getMonth()];
    const yr = String(d.getFullYear()).slice(-2);
    return `${day}${mon}${yr}`;
  };

  const startDate = partyData?.startDate || params.startDate;
  const endDate = partyData?.endDate || params.endDate;

  const calculateDaysRemaining = () => {
    const start = convertToDate(startDate);
    const end = convertToDate(endDate);

    if (!start || !end) return null;

    const today = new Date();
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const msElapsed = today.getTime() - start.getTime();
    const completedDays = Math.floor(msElapsed / (1000 * 60 * 60 * 24));

    const msLeft = Math.max(0, end.getTime() - today.getTime());
    const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

    return { currentDay: Math.max(0, Math.min(completedDays, totalDays)), totalDays, daysLeft, hoursLeft };
  };

  const daysInfo = calculateDaysRemaining();
  const progress = daysInfo ? (daysInfo.currentDay / daysInfo.totalDays) * 100 : 0;

  const getBorderColor = (rank: number) => {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return '#333';
  };

  const handlePlayerPress = (player: Player) => {
    if (player.userId === user?.id) {
      router.push('/(tabs)/profile');
    } else {
      router.push({ pathname: '/profilePages/profileView', params: { userId: player.userId, username: player.username || '', avatar: player.avatar || '' } });
    }
  };

  const coverPhoto = partyData?.coverPhoto;
  const leaderboardIcon = partyData?.partyIcon;
  const gameLogo = GAME_LOGOS[game];

  return (
    <ThemedView style={styles.container}>
      {/* Background shimmer */}
      <View style={styles.backgroundGlow} pointerEvents="none">
        <View style={styles.shimmerBand} pointerEvents="none">
          <LinearGradient
            colors={[
              'transparent',
              'rgba(139, 127, 232, 0.03)',
              'rgba(139, 127, 232, 0.06)',
              'rgba(139, 127, 232, 0.03)',
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
              'rgba(139, 127, 232, 0.035)',
              'transparent',
            ]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
        }
      >
        {/* Cover Photo Section */}
        <View style={styles.coverPhotoSection}>
          {/* Header Icons */}
          <View style={styles.headerIconsRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <IconSymbol size={20} name="chevron.left" color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerRightButtons}>
              {isCreator && (
                <TouchableOpacity style={styles.headerPillButton} onPress={() => setShowEditModal(true)}>
                  <IconSymbol size={16} name="gearshape.fill" color="#ccc" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.headerPillButton} onPress={handleLeaveParty}>
                <ThemedText style={[styles.headerPillButtonText, { color: '#ff6b6b' }]}>Leave</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          {/* Cover Photo — only render shadow/image when a cover is set */}
          <View style={styles.coverPhotoWrapper}>
            {coverPhoto && (
              <Image source={{ uri: coverPhoto }} style={styles.coverPhotoImage} />
            )}
          </View>
        </View>

        {/* Leaderboard Info Section */}
        <View style={styles.leaderboardInfoSection}>
          {/* Icon + Name Row */}
          <View style={styles.infoRow}>
            <View style={styles.leaderboardIconWrapper}>
              {leaderboardIcon ? (
                <Image source={{ uri: leaderboardIcon }} style={styles.leaderboardIcon} />
              ) : gameLogo ? (
                <View style={styles.leaderboardIconPlaceholder}>
                  <Image source={gameLogo} style={styles.leaderboardIconGameLogo} resizeMode="contain" />
                </View>
              ) : (
                <View style={styles.leaderboardIconPlaceholder}>
                  <ThemedText style={styles.leaderboardIconInitial}>{leaderboardName?.[0]?.toUpperCase()}</ThemedText>
                </View>
              )}
            </View>

            <View style={styles.infoDetails}>
              <ThemedText style={styles.leaderboardName} numberOfLines={1}>{leaderboardName}</ThemedText>
              <View style={styles.leaderboardMeta}>
                {gameLogo && (
                  <Image source={gameLogo} style={styles.gameLogoSmall} resizeMode="contain" />
                )}
                <ThemedText style={styles.leaderboardMetaText}>{game}</ThemedText>
                <View style={styles.metaDot} />
                <ThemedText style={styles.leaderboardMetaText}>{memberCount} {memberCount === 1 ? 'Player' : 'Players'}</ThemedText>
              </View>
            </View>
          </View>

          {/* Challenge Button */}
          {isNone && isCreator ? (
            <TouchableOpacity
              style={styles.createChallengeInlineBtn}
              onPress={() => {
                setSelectedChallengeMembers([]);
                setChallengeTypeSelection('climbing');
                setDurationSelection(30);
                setShowCustomDuration(false);
                setCustomDurationText('');
                setShowCreateChallengeModal(true);
              }}
              activeOpacity={0.7}
            >
              <IconSymbol size={14} name="trophy.fill" color="#fff" />
              <ThemedText style={styles.createChallengeInlineBtnText}>Create Challenge</ThemedText>
            </TouchableOpacity>
          ) : null}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {(isPending || isActive) && (
              <TouchableOpacity style={[styles.challengeButton, isActive && styles.challengeButtonActive]} onPress={() => router.push({ pathname: '/partyPages/challengeDetail', params: { id: partyDocId, game } })}>
                <IconSymbol size={14} name="trophy.fill" color="#D4A843" />
                <ThemedText style={[styles.challengeButtonText, isActive && styles.challengeButtonTextActive]}>Challenge</ThemedText>
              </TouchableOpacity>
            )}
            {canInvite && (
              <TouchableOpacity style={styles.inviteButton} onPress={handleOpenInviteModal}>
                <IconSymbol size={14} name="person.badge.plus" color="#fff" />
                <ThemedText style={styles.inviteButtonText}>Invite</ThemedText>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.updateButtonSecondary, updatingStats && { opacity: 0.5 }]}
              onPress={handleUpdateStats}
              disabled={updatingStats}
              activeOpacity={0.7}
            >
              {updatingStats ? (
                <ActivityIndicator size={12} color="#666" />
              ) : (
                <IconSymbol size={14} name="arrow.clockwise" color="#666" />
              )}
              <ThemedText style={styles.updateButtonSecondaryText}>
                {updatingStats ? 'Refreshing...' : 'Refresh'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Column Headers */}
        <View style={styles.columnHeaders}>
          <ThemedText style={[styles.columnHeaderText, { width: 40 }]}>RANK</ThemedText>
          <ThemedText style={[styles.columnHeaderText, { flex: 1, paddingLeft: 40 }]}>PLAYER</ThemedText>
          <ThemedText style={[styles.columnHeaderText, { width: 145, marginLeft: 'auto', textAlign: 'center' }]}>
            CURRENT RANK
          </ThemedText>
        </View>

        {/* Player Rows */}
        <View style={styles.playerList}>
          {players.map((player, index) => {
            const rankIcon = isLeague
              ? getLeagueRankIcon(player.currentRank)
              : getValorantRankIcon(player.currentRank);

            return (
              <View
                key={player.userId}
                style={[
                  styles.playerRow,
                  index % 2 === 0 ? styles.evenRow : styles.oddRow,
                  { borderLeftWidth: 4, borderLeftColor: getBorderColor(player.rank) },
                  player.rank === 1 && styles.firstPlaceRow,
                  player.isCurrentUser && styles.currentUserRow,
                ]}
              >
                {/* Rank Number */}
                <View style={styles.rankContainer}>
                  <ThemedText style={[styles.rankText, player.rank <= 3 && { color: getBorderColor(player.rank) }]}>{player.rank}</ThemedText>
                </View>

                {/* Player Info */}
                <View style={styles.playerInfo}>
                  <TouchableOpacity
                    style={[
                      styles.playerAvatarRing,
                      player.rank <= 3 && { borderColor: getBorderColor(player.rank), borderWidth: 2 },
                    ]}
                    onPress={() => handlePlayerPress(player)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.playerAvatar}>
                      {player.avatar && player.avatar.startsWith('http') ? (
                        <CachedImage uri={player.avatar} style={styles.playerAvatarImage} />
                      ) : (
                        <ThemedText style={styles.avatarText}>
                          {player.avatar || player.username[0].toUpperCase()}
                        </ThemedText>
                      )}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.playerNameContainer}>
                    <TouchableOpacity onPress={() => handlePlayerPress(player)} activeOpacity={0.7} style={styles.playerNameRow}>
                      <ThemedText style={[styles.playerName, player.isCurrentUser && styles.currentUserName]} numberOfLines={1}>
                        {player.username}
                      </ThemedText>
                      {player.rank === 1 && (
                        <IconSymbol size={10} name="crown.fill" color="#FFD700" />
                      )}
                      {player.userId === partyData?.createdBy && (
                        <View style={styles.leaderBadge}>
                          <ThemedText style={styles.creatorBadgeText}>Leader</ThemedText>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Current Rank with Icon and LP/RR */}
                <View style={styles.rankInfoContainer}>
                  <Image source={rankIcon} style={styles.rankIconSmall} resizeMode="contain" />
                  <View style={styles.rankTextContainer}>
                    <ThemedText style={styles.currentRankText}>
                      {formatRankDisplay(player.currentRank)}{' '}
                      <ThemedText style={styles.rankPointsText}>
                        {isLeague ? `(${player.lp || 0} LP)` : `(${player.rr || 0} RR)`}
                      </ThemedText>
                    </ThemedText>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Create Challenge Modal */}
      <Modal
        visible={showCreateChallengeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateChallengeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCreateChallengeModal(false)}
        >
          <View style={styles.createChallengeModal} onStartShouldSetResponder={() => true}>
            {/* Header */}
            <View style={styles.createChallengeHeader}>
              <TouchableOpacity onPress={() => setShowCreateChallengeModal(false)}>
                <ThemedText style={{ fontSize: 15, color: '#666' }}>Cancel</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.createChallengeTitle}>New Challenge</ThemedText>
              <View style={{ width: 50 }} />
            </View>

            {/* Challenge Type */}
            <ThemedText style={styles.createChallengeLabel}>TYPE</ThemedText>
            <View style={styles.createChallengeTypeRow}>
              <TouchableOpacity
                style={[
                  styles.createChallengeTypeBtn,
                  challengeTypeSelection === 'climbing' && styles.createChallengeTypeBtnActive
                ]}
                onPress={() => setChallengeTypeSelection('climbing')}
              >
                <IconSymbol
                  size={20}
                  name="chart.line.uptrend.xyaxis"
                  color={challengeTypeSelection === 'climbing' ? '#fff' : '#555'}
                />
                <ThemedText style={[
                  styles.createChallengeTypeBtnTitle,
                  challengeTypeSelection === 'climbing' && styles.createChallengeTypeBtnTitleActive
                ]}>Climbing</ThemedText>
                <ThemedText style={[
                  styles.createChallengeTypeBtnDesc,
                  challengeTypeSelection === 'climbing' && styles.createChallengeTypeBtnDescActive
                ]}>Most LP/RR gained</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.createChallengeTypeBtn,
                  challengeTypeSelection === 'rank' && styles.createChallengeTypeBtnActive
                ]}
                onPress={() => setChallengeTypeSelection('rank')}
              >
                <IconSymbol
                  size={20}
                  name="trophy.fill"
                  color={challengeTypeSelection === 'rank' ? '#fff' : '#555'}
                />
                <ThemedText style={[
                  styles.createChallengeTypeBtnTitle,
                  challengeTypeSelection === 'rank' && styles.createChallengeTypeBtnTitleActive
                ]}>Rank</ThemedText>
                <ThemedText style={[
                  styles.createChallengeTypeBtnDesc,
                  challengeTypeSelection === 'rank' && styles.createChallengeTypeBtnDescActive
                ]}>Highest rank wins</ThemedText>
              </TouchableOpacity>
            </View>

            {/* Duration */}
            <ThemedText style={styles.createChallengeLabel}>DURATION</ThemedText>
            <View style={styles.createChallengeDurationRow}>
              {[7, 14, 30].map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.createChallengeDurationChip,
                    !showCustomDuration && durationSelection === days && styles.createChallengeDurationChipActive
                  ]}
                  onPress={() => {
                    setDurationSelection(days);
                    setShowCustomDuration(false);
                    setCustomDurationText('');
                  }}
                >
                  <ThemedText style={[
                    styles.createChallengeDurationText,
                    !showCustomDuration && durationSelection === days && styles.createChallengeDurationTextActive
                  ]}>{days}d</ThemedText>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.createChallengeDurationChip,
                  showCustomDuration && styles.createChallengeDurationChipActive
                ]}
                onPress={() => setShowCustomDuration(true)}
              >
                <ThemedText style={[
                  styles.createChallengeDurationText,
                  showCustomDuration && styles.createChallengeDurationTextActive
                ]}>Custom</ThemedText>
              </TouchableOpacity>
            </View>
            {showCustomDuration && (
              <View style={styles.customDurationRow}>
                <TextInput
                  style={styles.customDurationInput}
                  placeholder="Enter days"
                  placeholderTextColor="#555"
                  keyboardType="number-pad"
                  value={customDurationText}
                  onChangeText={(text) => {
                    const num = text.replace(/[^0-9]/g, '');
                    setCustomDurationText(num);
                    const parsed = parseInt(num, 10);
                    if (parsed > 0) setDurationSelection(parsed);
                  }}
                  maxLength={3}
                  autoFocus
                />
                <ThemedText style={styles.customDurationLabel}>days</ThemedText>
              </View>
            )}

            {/* Member Selection */}
            <ThemedText style={styles.createChallengeLabel}>
              INVITE MEMBERS ({selectedChallengeMembers.length} selected)
            </ThemedText>
            <ScrollView style={styles.challengeMemberList} nestedScrollEnabled>
              {(partyData?.memberDetails || [])
                .filter((member: any) => member.userId !== user?.id)
                .map((member: any) => {
                  const isSelected = selectedChallengeMembers.includes(member.userId);
                  return (
                    <TouchableOpacity
                      key={member.userId}
                      style={[styles.createChallengeMemberRow, isSelected && styles.createChallengeMemberRowSelected]}
                      onPress={() => {
                        setSelectedChallengeMembers(prev =>
                          isSelected
                            ? prev.filter(id => id !== member.userId)
                            : [...prev, member.userId]
                        );
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.challengeMemberInfo}>
                        {member.avatar && member.avatar.startsWith('http') ? (
                          <CachedImage uri={member.avatar} style={styles.challengeMemberAvatar} />
                        ) : (
                          <View style={styles.challengeMemberAvatarPlaceholder}>
                            <ThemedText style={styles.challengeMemberAvatarText}>
                              {member.username?.[0]?.toUpperCase()}
                            </ThemedText>
                          </View>
                        )}
                        <ThemedText style={styles.challengeMemberName}>{member.username}</ThemedText>
                      </View>
                      <View style={[styles.createChallengeCheckbox, isSelected && styles.createChallengeCheckboxActive]}>
                        {isSelected && <IconSymbol size={12} name="checkmark" color="#D4A843" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            {/* Create Button */}
            <TouchableOpacity
              style={[styles.createChallengeBtn, (creatingChallenge || selectedChallengeMembers.length === 0) && { opacity: 0.4 }]}
              disabled={creatingChallenge || selectedChallengeMembers.length === 0}
              onPress={handleCreateChallenge}
            >
              {creatingChallenge ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.createChallengeBtnText}>
                  Create Challenge
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowEditModal(false)}
        >
          <View style={styles.editModalContent}>
            <View style={styles.editModalHeader}>
              <ThemedText style={styles.editModalTitle}>Edit Leaderboard</ThemedText>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <IconSymbol size={20} name="xmark" color="#888" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.editModalOption} onPress={handleChangeCoverPhoto}>
              <View style={styles.editModalOptionIcon}>
                <IconSymbol size={18} name="photo" color="#888" />
              </View>
              <View style={styles.editModalOptionText}>
                <ThemedText style={styles.editModalOptionTitle}>Change Cover Photo</ThemedText>
                <ThemedText style={styles.editModalOptionSubtitle}>Update the banner image</ThemedText>
              </View>
              <IconSymbol size={16} name="chevron.right" color="#444" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.editModalOption} onPress={handleChangeLeaderboardIcon}>
              <View style={styles.editModalOptionIcon}>
                <IconSymbol size={18} name="square.and.pencil" color="#888" />
              </View>
              <View style={styles.editModalOptionText}>
                <ThemedText style={styles.editModalOptionTitle}>Change Leaderboard Icon</ThemedText>
                <ThemedText style={styles.editModalOptionSubtitle}>Update the leaderboard icon</ThemedText>
              </View>
              <IconSymbol size={16} name="chevron.right" color="#444" />
            </TouchableOpacity>

            {partyData?.challengeStatus === 'pending' && (
              <TouchableOpacity
                style={styles.editModalOption}
                onPress={() => {
                  setShowEditModal(false);
                  setShowDurationModal(true);
                }}
              >
                <View style={styles.editModalOptionIcon}>
                  <IconSymbol size={18} name="clock.fill" color="#888" />
                </View>
                <View style={styles.editModalOptionText}>
                  <ThemedText style={styles.editModalOptionTitle}>Challenge Duration</ThemedText>
                  <ThemedText style={styles.editModalOptionSubtitle}>{partyData?.duration || 30} days</ThemedText>
                </View>
                <IconSymbol size={16} name="chevron.right" color="#444" />
              </TouchableOpacity>
            )}

            {partyData?.challengeStatus === 'pending' && (
              <TouchableOpacity
                style={styles.editModalOption}
                onPress={() => {
                  setShowEditModal(false);
                  setShowChallengeTypeModal(true);
                }}
              >
                <View style={styles.editModalOptionIcon}>
                  <IconSymbol size={18} name="trophy.fill" color="#888" />
                </View>
                <View style={styles.editModalOptionText}>
                  <ThemedText style={styles.editModalOptionTitle}>Challenge Type</ThemedText>
                  <ThemedText style={styles.editModalOptionSubtitle}>
                    {(partyData?.challengeType || 'climbing') === 'climbing' ? 'LP/RR Climbing' : 'Highest Rank'}
                  </ThemedText>
                </View>
                <IconSymbol size={16} name="chevron.right" color="#444" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.editModalOption}
              onPress={() => {
                setShowEditModal(false);
                setShowManageMembersModal(true);
              }}
            >
              <View style={styles.editModalOptionIcon}>
                <IconSymbol size={18} name="person.2.fill" color="#888" />
              </View>
              <View style={styles.editModalOptionText}>
                <ThemedText style={styles.editModalOptionTitle}>Manage Members</ThemedText>
                <ThemedText style={styles.editModalOptionSubtitle}>Permissions & remove members</ThemedText>
              </View>
              <IconSymbol size={16} name="chevron.right" color="#444" />
            </TouchableOpacity>

            {inviteCode && (
              <TouchableOpacity
                style={styles.editModalOption}
                onPress={() => {
                  handleCopyInviteCode();
                  setShowEditModal(false);
                }}
              >
                <View style={styles.editModalOptionIcon}>
                  <IconSymbol size={18} name="doc.on.doc" color="#888" />
                </View>
                <View style={styles.editModalOptionText}>
                  <ThemedText style={styles.editModalOptionTitle}>Invite Code</ThemedText>
                  <ThemedText style={styles.editModalOptionSubtitle}>{inviteCode}</ThemedText>
                </View>
                <IconSymbol size={16} name="doc.on.doc" color="#444" />
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowInviteModal(false)}
        >
          <Animated.View
            style={[styles.inviteModalContent, { transform: [{ translateY: inviteModalTranslateY }] }]}
            {...invitePanResponder.panHandlers}
          >
            <View style={styles.inviteModalHandle} />

            <View style={styles.inviteModalHeader}>
              <ThemedText style={styles.inviteModalTitle}>Invite to Leaderboard</ThemedText>
            </View>

            <View style={styles.inviteSearchContainer}>
              <IconSymbol size={16} name="magnifyingglass" color="#555" />
              <TextInput
                style={styles.inviteSearchInput}
                placeholder="Search users..."
                placeholderTextColor="#555"
                value={inviteSearchQuery}
                onChangeText={handleInviteSearch}
              />
              {inviteSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setInviteSearchQuery(''); setSearchResults([]); }}>
                  <IconSymbol size={16} name="xmark.circle.fill" color="#555" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.inviteUsersList} showsVerticalScrollIndicator={false}>
              {loadingMutuals || searchingUsers ? (
                <View style={styles.inviteLoadingContainer}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : (
                <>
                  {/* Pending Invites Section */}
                  {inviteSearchQuery.trim().length < 2 && pendingInvites.length > 0 && (
                    <>
                      <ThemedText style={styles.inviteSectionLabel}>Pending Invites</ThemedText>
                      {pendingInvites.map((userItem) => (
                        <TouchableOpacity
                          key={userItem.id}
                          style={styles.inviteUserItem}
                          onPress={() => {
                            Alert.alert(
                              'Remove Invite',
                              `Remove the invite for ${userItem.username}?`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Remove', style: 'destructive', onPress: () => handleRevokeInvite(userItem.id) },
                              ]
                            );
                          }}
                          disabled={revokingUsers.has(userItem.id)}
                          activeOpacity={0.6}
                        >
                          <View style={styles.inviteUserAvatar}>
                            {userItem.avatar && userItem.avatar.startsWith('http') ? (
                              <CachedImage uri={userItem.avatar} style={styles.inviteUserAvatarImage} />
                            ) : (
                              <ThemedText style={styles.inviteUserAvatarText}>
                                {userItem.username[0].toUpperCase()}
                              </ThemedText>
                            )}
                          </View>
                          <ThemedText style={styles.inviteUserName}>{userItem.username}</ThemedText>
                          {revokingUsers.has(userItem.id) ? (
                            <View style={styles.pendingBadge}>
                              <ActivityIndicator size="small" color="#888" />
                            </View>
                          ) : (
                            <View style={styles.pendingBadge}>
                              <IconSymbol size={12} name="clock" color="#888" />
                              <ThemedText style={styles.pendingBadgeText}>Pending</ThemedText>
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </>
                  )}

                  {/* Suggestions Section */}
                  {inviteSearchQuery.trim().length < 2 && mutuals.length > 0 && (
                    <ThemedText style={[styles.inviteSectionLabel, pendingInvites.length > 0 && { marginTop: 16 }]}>Suggestions</ThemedText>
                  )}

                  {displayUsers.length === 0 && pendingInvites.length === 0 ? (
                    <View style={styles.inviteEmptyContainer}>
                      <ThemedText style={styles.inviteEmptyText}>
                        {inviteSearchQuery.trim().length >= 2
                          ? 'No users found'
                          : 'No suggestions available'
                        }
                      </ThemedText>
                    </View>
                  ) : (
                    displayUsers.map((userItem) => (
                      <View key={userItem.id} style={styles.inviteUserItem}>
                        <View style={styles.inviteUserAvatar}>
                          {userItem.avatar && userItem.avatar.startsWith('http') ? (
                            <CachedImage uri={userItem.avatar} style={styles.inviteUserAvatarImage} />
                          ) : (
                            <ThemedText style={styles.inviteUserAvatarText}>
                              {userItem.username[0].toUpperCase()}
                            </ThemedText>
                          )}
                        </View>
                        <ThemedText style={styles.inviteUserName}>{userItem.username}</ThemedText>
                        <TouchableOpacity
                          style={[
                            styles.inviteSendButton,
                            invitedUsers.has(userItem.id) && styles.inviteSendButtonSent
                          ]}
                          onPress={() => handleInviteUser(userItem)}
                          disabled={invitingUsers.has(userItem.id) || invitedUsers.has(userItem.id)}
                        >
                          {invitingUsers.has(userItem.id) ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : invitedUsers.has(userItem.id) ? (
                            <IconSymbol size={14} name="checkmark" color="#fff" />
                          ) : (
                            <ThemedText style={styles.inviteSendButtonText}>Invite</ThemedText>
                          )}
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </>
              )}
            </ScrollView>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Manage Members Modal */}
      <Modal
        visible={showManageMembersModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManageMembersModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowManageMembersModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.manageMembersModalContent}
          >
            <View style={styles.inviteModalHandle} />

            <View style={styles.inviteModalHeader}>
              <ThemedText style={styles.inviteModalTitle}>Manage Members</ThemedText>
              <TouchableOpacity onPress={() => setShowManageMembersModal(false)}>
                <IconSymbol size={20} name="xmark" color="#888" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.manageMembersList} showsVerticalScrollIndicator={false}>
              {/* Members List */}
              <ThemedText style={styles.manageSectionLabel}>
                MEMBERS ({players.filter(p => p.userId !== user?.id).length})
              </ThemedText>
              {players
                .filter(player => player.userId !== user?.id)
                .map((player) => (
                  <View key={player.userId} style={styles.manageMemberItem}>
                    <View style={styles.manageMemberAvatar}>
                      {player.avatar && player.avatar.startsWith('http') ? (
                        <CachedImage uri={player.avatar} style={styles.manageMemberAvatarImage} />
                      ) : (
                        <ThemedText style={styles.manageMemberAvatarText}>
                          {player.username[0].toUpperCase()}
                        </ThemedText>
                      )}
                    </View>
                    <View style={styles.manageMemberInfo}>
                      <ThemedText style={styles.manageMemberName}>{player.username}</ThemedText>
                      <ThemedText style={styles.manageMemberRank}>
                        Rank #{player.rank} • {formatRankDisplay(player.currentRank)}
                      </ThemedText>
                    </View>
                    <View style={styles.manageMemberActions}>
                      <TouchableOpacity
                        style={[
                          styles.canInviteToggle,
                          allowedInviters.includes(player.userId) && styles.canInviteToggleActive
                        ]}
                        onPress={() => handleToggleInvitePermission(player.userId)}
                        disabled={updatingPermission}
                      >
                        <IconSymbol size={10} name="person.badge.plus" color={allowedInviters.includes(player.userId) ? '#fff' : '#555'} />
                        <ThemedText style={[
                          styles.canInviteToggleText,
                          allowedInviters.includes(player.userId) && styles.canInviteToggleTextActive
                        ]}>{allowedInviters.includes(player.userId) ? 'Can invite' : 'No invite'}</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => handleKickMember(player)}
                        disabled={kickingMember === player.userId}
                      >
                        {kickingMember === player.userId ? (
                          <ActivityIndicator size="small" color="#ff6b6b" />
                        ) : (
                          <ThemedText style={styles.removeButtonText}>Remove</ThemedText>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

              {players.filter(p => p.userId !== user?.id).length === 0 && (
                <View style={styles.inviteEmptyContainer}>
                  <ThemedText style={styles.inviteEmptyText}>No other members in this leaderboard</ThemedText>
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Uploading Overlay */}
      {/* Duration Modal */}
      <Modal
        visible={showDurationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDurationModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDurationModal(false)}
        >
          <View style={styles.editModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.editModalHeader}>
              <ThemedText style={styles.editModalTitle}>Challenge Duration</ThemedText>
              <TouchableOpacity onPress={() => setShowDurationModal(false)}>
                <IconSymbol size={20} name="xmark" color="#888" />
              </TouchableOpacity>
            </View>

            <View style={styles.durationOptionsRow}>
              {[10, 30, 60, 90].map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.durationChip,
                    editDuration === days && styles.durationChipActive
                  ]}
                  onPress={() => setEditDuration(days)}
                >
                  <ThemedText style={[
                    styles.durationChipText,
                    editDuration === days && styles.durationChipTextActive
                  ]}>{days} days</ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.saveSettingButton, savingDuration && { opacity: 0.6 }]}
              disabled={savingDuration}
              onPress={async () => {
                if (!partyDocId) return;
                setSavingDuration(true);
                try {
                  await updateDoc(doc(db, 'parties', partyDocId), { duration: editDuration });
                  setShowDurationModal(false);
                } catch (e) {
                  Alert.alert('Error', 'Failed to update duration.');
                } finally {
                  setSavingDuration(false);
                }
              }}
            >
              {savingDuration ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.saveSettingButtonText}>Save</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Challenge Type Modal */}
      <Modal
        visible={showChallengeTypeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChallengeTypeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowChallengeTypeModal(false)}
        >
          <View style={styles.editModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.editModalHeader}>
              <ThemedText style={styles.editModalTitle}>Challenge Type</ThemedText>
              <TouchableOpacity onPress={() => setShowChallengeTypeModal(false)}>
                <IconSymbol size={20} name="xmark" color="#888" />
              </TouchableOpacity>
            </View>

            <View style={styles.challengeTypeRow}>
              <TouchableOpacity
                style={[
                  styles.challengeTypeButton,
                  editChallengeType === 'climbing' && styles.challengeTypeButtonActive
                ]}
                onPress={() => setEditChallengeType('climbing')}
              >
                <IconSymbol
                  size={18}
                  name="chart.line.uptrend.xyaxis"
                  color={editChallengeType === 'climbing' ? '#fff' : '#555'}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText style={[
                    styles.challengeTypeTitle,
                    editChallengeType === 'climbing' && styles.challengeTypeTitleActive
                  ]}>Climbing</ThemedText>
                  <ThemedText style={[
                    styles.challengeTypeDesc,
                    editChallengeType === 'climbing' && styles.challengeTypeDescActive
                  ]}>Most LP/RR gained</ThemedText>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.challengeTypeButton,
                  editChallengeType === 'rank' && styles.challengeTypeButtonActive
                ]}
                onPress={() => setEditChallengeType('rank')}
              >
                <IconSymbol
                  size={18}
                  name="trophy.fill"
                  color={editChallengeType === 'rank' ? '#fff' : '#555'}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText style={[
                    styles.challengeTypeTitle,
                    editChallengeType === 'rank' && styles.challengeTypeTitleActive
                  ]}>Rank</ThemedText>
                  <ThemedText style={[
                    styles.challengeTypeDesc,
                    editChallengeType === 'rank' && styles.challengeTypeDescActive
                  ]}>Highest rank wins</ThemedText>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.saveSettingButton, savingChallengeType && { opacity: 0.6 }]}
              disabled={savingChallengeType}
              onPress={async () => {
                if (!partyDocId) return;
                setSavingChallengeType(true);
                try {
                  await updateDoc(doc(db, 'parties', partyDocId), { challengeType: editChallengeType });
                  setShowChallengeTypeModal(false);
                } catch (e) {
                  Alert.alert('Error', 'Failed to update challenge type.');
                } finally {
                  setSavingChallengeType(false);
                }
              }}
            >
              {savingChallengeType ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.saveSettingButtonText}>Save</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>


      {uploading && (
        <View style={styles.uploadingOverlay}>
          <View style={styles.uploadingContent}>
            <ActivityIndicator size="large" color="#fff" />
            <ThemedText style={styles.uploadingText}>Uploading...</ThemedText>
          </View>
        </View>
      )}
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
  scrollView: {
    flex: 1,
  },
  // Cover Photo Section
  coverPhotoSection: {
    position: 'relative',
  },
  headerIconsRow: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  challengeDetailButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPillButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPillButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  coverPhotoWrapper: {
    width: '100%',
    height: 130,
  },
  coverPhotoImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.5,
  },
  coverPhotoGradient: {
    width: '100%',
    height: '100%',
  },
  coverPhotoFadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    zIndex: 1,
  },
  coverPhotoFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    zIndex: 1,
  },
  // Leaderboard Info Section
  leaderboardInfoSection: {
    marginTop: -34,
    paddingHorizontal: 20,
    zIndex: 2,
    gap: 16,
    paddingBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
  },
  infoDetails: {
    flex: 1,
    paddingBottom: 4,
  },
  leaderboardIconWrapper: {
  },
  leaderboardIcon: {
    width: 68,
    height: 68,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#0f0f0f',
  },
  leaderboardIconPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 3,
    borderColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardIconGameLogo: {
    width: 32,
    height: 32,
    opacity: 0.8,
  },
  leaderboardIconInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
  },
  leaderboardName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  leaderboardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gameLogoSmall: {
    width: 16,
    height: 16,
    opacity: 0.6,
  },
  leaderboardMetaText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#333',
  },
  // Pending Section
  pendingSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  pendingChallengeSection: {
    width: '100%',
    marginBottom: 14,
  },
  pendingChallengeCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 16,
    gap: 14,
  },
  pcCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pcCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pcTrophyCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pcCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ddd',
  },
  pcCardSubtitle: {
    fontSize: 12,
    color: '#777',
    marginTop: 1,
  },
  pcStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  pcStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  pcStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  pcParticipants: {
    gap: 8,
  },
  pcParticipantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pcAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pcAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#151513',
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pcAvatarImage: {
    width: '100%',
    height: '100%',
  },
  pcAvatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#888',
  },
  pcParticipantsText: {
    fontSize: 12,
    color: '#777',
  },
  pcProgressBar: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  pcProgressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  pcStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pcStartBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  pcActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pcAcceptBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pcAcceptBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  pcDeclineBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
  },
  pcStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pcUserStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pcUserStatusText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  pcChangeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  // Challenge Details Modal
  cdModal: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  cdHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  cdHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cdTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#eee',
  },
  cdGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 0,
  },
  cdGridItem: {
    width: '50%',
    paddingVertical: 12,
    gap: 4,
  },
  cdGridLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.5,
  },
  cdGridValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
  },
  cdGridValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cdDatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 14,
    marginTop: 4,
    marginBottom: 4,
  },
  cdDateItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  cdDateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  cdDateDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cdSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 10,
  },
  cdParticipantsList: {
    maxHeight: 180,
  },
  cdParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cdParticipantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cdParticipantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  cdParticipantAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cdParticipantAvatarText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  cdParticipantName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ccc',
  },
  cdLeaderBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  cdLeaderBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  cdInviteStatus: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
  startChallengeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D4A843',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
  },
  startChallengeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  waitingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  waitingText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888',
  },
  durationPreview: {
    fontSize: 12,
    color: '#555',
  },
  // Duration Section
  durationSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  daysLeftText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  progressBarBackground: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  // Action Buttons
  activeProgressSection: {
    gap: 6,
    width: '100%',
  },
  activeProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeProgressLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  activeProgressText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  activeProgressDays: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  pendingChallengeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pendingChallengeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  createChallengeInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
  },
  createChallengeInlineBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 20,
    marginBottom: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  challengeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  challengeButtonActive: {
    backgroundColor: '#111',
    borderColor: 'rgba(212, 168, 67, 0.3)',
  },
  challengeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D4A843',
  },
  challengeButtonTextActive: {
    color: '#D4A843',
  },
  updateButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  updateButtonSecondaryText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  inviteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  inviteButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  codeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  codeButtonActive: {
    backgroundColor: '#D4A843',
  },
  codeButtonTextActive: {
    color: '#0f0f0f',
  },
  codeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 1.5,
  },
  columnHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 0,
    marginHorizontal: 6,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  columnHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  alignRight: {
    textAlign: 'right',
  },
  playerList: {
    paddingHorizontal: 0,
    marginHorizontal: 6,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    position: 'relative',
    borderLeftWidth: 3,
  },
  firstPlaceRow: {
    paddingVertical: 14,
  },
  evenRow: {
    backgroundColor: '#141414',
  },
  oddRow: {
    backgroundColor: '#1a1a1a',
  },
  currentUserRow: {
    backgroundColor: '#252525',
  },
  currentUserName: {
    color: '#C9A84E',
  },
  rankContainer: {
    width: 40,
    alignItems: 'flex-start',
  },
  rankText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  playerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerAvatarRing: {
    borderRadius: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 1,
  },
  playerAvatar: {
    width: 32,
    height: 32,
    backgroundColor: '#252525',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playerAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  avatarText: {
    fontSize: 12,
    textAlign: 'center',
    color: '#888',
  },
  playerNameContainer: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  leaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  leaderBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFD700',
  },
  creatorBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
  rankInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 145,
    marginLeft: 'auto',
  },
  rankIconSmall: {
    width: 26,
    height: 26,
  },
  rankTextContainer: {
    flex: 1,
    alignItems: 'flex-start',
  },
  currentRankText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 14,
  },
  rankPointsText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#666',
    lineHeight: 13,
  },
  yourProgressWrapper: {
    marginTop: 20,
    marginHorizontal: 6,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(139, 127, 232, 0.25)',
    overflow: 'hidden',
  },
  yourProgressHero: {
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 20,
  },
  yourProgressHeroCenter: {
    alignItems: 'center',
    gap: 6,
  },
  youBadge: {
    backgroundColor: 'rgba(139, 127, 232, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  youBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8B7FE8',
    letterSpacing: 1,
  },
  yourProgressAvatarRing: {
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(139, 127, 232, 0.4)',
    padding: 2,
  },
  yourProgressAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  yourProgressAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  yourProgressAvatarFallback: {
    fontSize: 20,
    fontWeight: '700',
    color: '#888',
  },
  yourProgressUsername: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginTop: 2,
  },
  yourProgressRankBig: {
    fontSize: 36,
    fontWeight: '900',
    color: '#8B7FE8',
    lineHeight: 40,
    marginTop: 2,
  },
  yourProgressOfTotal: {
    fontSize: 13,
    fontWeight: '500',
    color: '#555',
    marginTop: -2,
  },
  yourProgressRankRight: {
    alignItems: 'center',
    marginTop: 14,
    gap: 2,
  },
  yourProgressRankIcon: {
    width: 36,
    height: 36,
  },
  yourProgressRankText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  yourProgressRankPoints: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
  },
  yourProgressBottom: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#151515',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    gap: 8,
  },
  gapBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  gapBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF4444',
  },
  yourProgressBarTrack: {
    height: 6,
    backgroundColor: '#252525',
    borderRadius: 3,
    overflow: 'hidden',
  },
  yourProgressBarFill: {
    height: '100%',
    backgroundColor: '#8B7FE8',
    borderRadius: 3,
  },
  yourProgressBarLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#555',
    textAlign: 'right',
  },
  bottomSpacer: {
    height: 40,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  editModalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  editModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
    gap: 14,
  },
  editModalOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalOptionText: {
    flex: 1,
  },
  editModalOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  editModalOptionSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  // Invite Modal
  inviteModalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '75%',
    paddingBottom: 20,
  },
  inviteModalHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  inviteModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  inviteModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  inviteSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 20,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 10,
  },
  inviteSearchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#fff',
  },
  inviteSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  inviteUsersList: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  inviteLoadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  inviteEmptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  inviteEmptyText: {
    fontSize: 14,
    color: '#555',
  },
  inviteUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  inviteUserAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inviteUserAvatarImage: {
    width: '100%',
    height: '100%',
  },
  inviteUserAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  inviteUserName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  inviteSendButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 84,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteSendButtonSent: {
    backgroundColor: '#2a2a2a',
  },
  inviteSendButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.3,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    borderRadius: 8,
    minWidth: 84,
    height: 30,
  },
  pendingBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#888',
    letterSpacing: 0.3,
  },
  // Uploading Overlay
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingContent: {
    alignItems: 'center',
    gap: 16,
  },
  uploadingText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  // Manage Members Modal
  manageMembersModalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '50%',
    paddingBottom: 40,
  },
  manageMembersList: {
    paddingHorizontal: 20,
  },
  manageSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  manageMemberActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  canInviteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  canInviteToggleActive: {
    backgroundColor: '#fff',
  },
  canInviteToggleText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#555',
  },
  canInviteToggleTextActive: {
    color: '#fff',
  },
  manageMemberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  manageMemberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  manageMemberAvatarImage: {
    width: '100%',
    height: '100%',
  },
  manageMemberAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  manageMemberInfo: {
    flex: 1,
  },
  manageMemberName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  manageMemberRank: {
    fontSize: 12,
    color: '#555',
  },
  removeButton: {
    backgroundColor: 'rgba(255,100,100,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ff6b6b',
  },
  // Permission Modal
  permissionModalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    height: '60%',
  },
  permissionDescription: {
    fontSize: 12,
    color: '#666',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  permissionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  permissionOptionActive: {
    backgroundColor: '#1f1518',
    borderColor: '#fff',
  },
  permissionOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  permissionOptionIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionOptionIconActive: {
    backgroundColor: '#fff',
  },
  permissionOptionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  permissionOptionTitleActive: {
    color: '#fff',
  },
  permissionOptionSubtitle: {
    fontSize: 10,
    color: '#555',
  },
  permissionUpdating: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  // Duration modal
  durationOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  durationChip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  durationChipActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: '#fff',
  },
  durationChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  durationChipTextActive: {
    color: '#fff',
  },
  saveSettingButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  saveSettingButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Challenge Type modal
  challengeTypeRow: {
    gap: 10,
    marginBottom: 20,
  },
  challengeTypeButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  challengeTypeButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: '#fff',
  },
  challengeTypeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  challengeTypeTitleActive: {
    color: '#fff',
  },
  challengeTypeDesc: {
    fontSize: 11,
    color: '#555',
    marginTop: 2,
  },
  challengeTypeDescActive: {
    color: '#888',
  },
  // Create Challenge Modal (white/black theme)
  createChallengeModal: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  createChallengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  createChallengeTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  createChallengeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
    marginTop: 20,
    marginBottom: 10,
    paddingHorizontal: 20,
    letterSpacing: 0.5,
  },
  createChallengeTypeRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
  },
  createChallengeTypeBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  createChallengeTypeBtnActive: {
    backgroundColor: '#1a1a1a',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  createChallengeTypeBtnTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#555',
  },
  createChallengeTypeBtnTitleActive: {
    color: '#fff',
  },
  createChallengeTypeBtnDesc: {
    fontSize: 11,
    color: '#444',
  },
  createChallengeTypeBtnDescActive: {
    color: '#888',
  },
  createChallengeDurationRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
  },
  createChallengeDurationChip: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  createChallengeDurationChipActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  createChallengeDurationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  createChallengeDurationTextActive: {
    color: '#000',
  },
  customDurationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  customDurationInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    width: 100,
    textAlign: 'center',
  },
  customDurationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  challengeMemberList: {
    maxHeight: 200,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  createChallengeMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#1a1a1a',
  },
  createChallengeMemberRowSelected: {
    backgroundColor: '#1a1a1a',
  },
  challengeMemberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  challengeMemberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  challengeMemberAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeMemberAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  challengeMemberName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ccc',
  },
  createChallengeCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createChallengeCheckboxActive: {
    backgroundColor: 'transparent',
    borderColor: '#333',
  },
  createChallengeBtn: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 16,
    marginHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  createChallengeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  challengeAcceptedCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
  },
  challengeInlineActions: {
    alignItems: 'center',
    gap: 10,
  },
  challengeInlineText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  challengeInlineButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  challengeAcceptBtn: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  challengeAcceptBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  challengeDeclineBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  challengeDeclineBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  // Spectators
  spectatorsSection: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
  spectatorsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  spectatorsHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
