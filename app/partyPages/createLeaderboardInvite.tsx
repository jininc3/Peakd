import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/config/firebase';
import { collection, getDocs, doc, getDoc, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { uploadPartyIcon, uploadPartyCoverPhoto } from '@/services/storageService';
import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, TextInput, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';

interface Follower {
  id: string;
  username: string;
  avatar: string;
}

export default function CreateLeaderboardInvite() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [mutualFollowers, setMutualFollowers] = useState<Follower[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchFollowers = async () => {
      if (!user?.id) { setLoading(false); return; }
      try {
        const followingRef = collection(db, 'users', user.id, 'following');
        const followingSnapshot = await getDocs(followingRef);
        if (followingSnapshot.empty) { setFollowers([]); setLoading(false); return; }

        const results = await Promise.all(
          followingSnapshot.docs.map(async (followDoc) => {
            const followingId = followDoc.data().followingId;
            if (!followingId) return null;
            const userDoc = await getDoc(doc(db, 'users', followingId));
            if (!userDoc.exists()) return null;
            const data = userDoc.data();
            const theirFollowing = await getDocs(collection(db, 'users', followingId, 'following'));
            const isMutual = theirFollowing.docs.some(d => d.data().followingId === user.id);
            return { id: followingId, username: data.username || 'Unknown', avatar: data.avatar || '', isMutual };
          })
        );

        const valid = results.filter((r): r is Follower & { isMutual: boolean } => r !== null);
        setFollowers(valid.map(({ isMutual, ...rest }) => rest));
        setMutualFollowers(valid.filter(f => f.isMutual).map(({ isMutual, ...rest }) => rest));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchFollowers();
  }, [user?.id]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = followers.filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleCreate = async () => {
    if (!user?.id) return;
    setCreating(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.id));
      const userData = userDoc.data();
      const now = new Date();

      const memberDetails = [{
        userId: user.id,
        username: userData?.username || 'Unknown',
        avatar: userData?.avatar || '',
        joinedAt: now.toISOString(),
      }];

      const pendingInvites: any[] = [];
      for (const fId of selected) {
        const fDoc = await getDoc(doc(db, 'users', fId));
        if (fDoc.exists()) {
          const fData = fDoc.data();
          pendingInvites.push({
            userId: fId,
            username: fData.username || 'Unknown',
            avatar: fData.avatar || '',
            invitedAt: now.toISOString(),
            status: 'pending',
          });
        }
      }

      const leaderboardData = {
        partyName: params.name as string,
        game: params.gameName as string,
        gameId: params.gameId as string,
        type: 'leaderboard',
        maxMembers: 20,
        duration: 30,
        startDate: null,
        endDate: null,
        challengeStatus: 'none',
        challengeType: 'climbing',
        inviteCode: params.inviteCode as string,
        invitePermission: params.invitePermission as string,
        createdBy: user.id,
        createdAt: serverTimestamp(),
        members: [user.id],
        memberDetails,
        pendingInvites,
      };

      const docRef = await addDoc(collection(db, 'parties'), leaderboardData);
      const partyId = docRef.id;
      await updateDoc(docRef, { partyId });

      // Upload icon
      const iconUri = params.iconUri as string;
      if (iconUri) {
        try {
          const url = await uploadPartyIcon(partyId, iconUri);
          await updateDoc(docRef, { partyIcon: url });
        } catch (e) { console.error('Icon upload error:', e); }
      }

      // Upload cover
      const coverUri = params.coverUri as string;
      if (coverUri) {
        try {
          const url = await uploadPartyCoverPhoto(partyId, coverUri);
          await updateDoc(docRef, { coverPhoto: url });
        } catch (e) { console.error('Cover upload error:', e); }
      }

      // Send notifications
      for (const invite of pendingInvites) {
        try {
          await addDoc(collection(db, 'users', invite.userId, 'notifications'), {
            type: 'party_invite',
            fromUserId: user.id,
            fromUsername: userData?.username || 'Unknown',
            fromAvatar: userData?.avatar || '',
            fromUserAvatar: userData?.avatar || '',
            partyId,
            partyName: params.name as string,
            game: params.gameName as string,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (e) { console.error('Notification error:', e); }
      }

      Alert.alert(
        'Success',
        selected.size > 0
          ? `Leaderboard created! Invitations sent to ${selected.size} player${selected.size !== 1 ? 's' : ''}.`
          : 'Leaderboard created!',
        [{
          text: 'OK',
          onPress: () => {
            // Dismiss all create pages so back button goes to lobbies, not create flow
            router.dismissAll();
            router.replace({
              pathname: '/partyPages/leaderboardDetail',
              params: { id: partyId, name: params.name as string, game: params.gameName as string, members: '1' },
            });
          },
        }]
      );
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', 'Failed to create leaderboard.');
    } finally {
      setCreating(false);
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

      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol size={22} name="chevron.left" color="#fff" />
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: '100%' }]} />
        </View>
      </View>

      <View style={styles.header}>
        <ThemedText style={styles.step}>Step 5 of 5</ThemedText>
        <ThemedText style={styles.title}>Invite members</ThemedText>
        <ThemedText style={styles.subtitle}>Select friends to invite to your leaderboard.</ThemedText>

        <View style={styles.searchContainer}>
          <IconSymbol size={16} name="magnifyingglass" color="#555" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search followers"
            placeholderTextColor="#555"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
        </View>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color="#555" style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <ThemedText style={styles.emptyText}>
            {followers.length === 0 ? 'No followers yet' : 'No results found'}
          </ThemedText>
        ) : (
          filtered.map(follower => {
            const isSelected = selected.has(follower.id);
            return (
              <TouchableOpacity
                key={follower.id}
                style={styles.followerRow}
                onPress={() => toggle(follower.id)}
                activeOpacity={0.7}
              >
                {follower.avatar ? (
                  <Image source={{ uri: follower.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <ThemedText style={styles.avatarInitial}>{follower.username[0]?.toUpperCase()}</ThemedText>
                  </View>
                )}
                <ThemedText style={styles.username}>{follower.username}</ThemedText>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <IconSymbol size={14} name="checkmark" color="#0f0f0f" />}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[styles.createButton, creating && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={creating}
          activeOpacity={0.8}
        >
          {creating ? (
            <ActivityIndicator color="#0f0f0f" />
          ) : (
            <ThemedText style={styles.createButtonText}>
              {selected.size > 0 ? `Create & Invite (${selected.size})` : 'Create Leaderboard'}
            </ThemedText>
          )}
        </TouchableOpacity>
        {selected.size === 0 && (
          <ThemedText style={styles.skipHint}>You can invite members later</ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 60, paddingHorizontal: 16 },
  backButton: { padding: 8 },
  progress: { flex: 1, height: 2, marginLeft: 12, marginRight: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 1 },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  header: { paddingHorizontal: 28, paddingTop: 16 },
  step: { fontSize: 13, color: '#555', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 36, marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 20 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#fff', padding: 0 },
  list: { flex: 1, paddingHorizontal: 28, marginTop: 16 },
  emptyText: { fontSize: 14, color: '#555', textAlign: 'center', marginTop: 40 },
  followerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 15, fontWeight: '600', color: '#555' },
  username: { flex: 1, fontSize: 15, fontWeight: '500', color: '#fff' },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#fff', borderColor: '#fff' },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 40, paddingTop: 12 },
  createButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  createButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  skipHint: { fontSize: 12, color: '#444', textAlign: 'center', marginTop: 8 },
});
