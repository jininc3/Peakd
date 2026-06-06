import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export interface TaggedUser {
  userId: string;
  username: string;
  avatar?: string;
}

interface TagUsersModalProps {
  visible: boolean;
  onClose: () => void;
  onTagsSelected: (users: TaggedUser[]) => void;
  initialSelectedUsers?: TaggedUser[];
}

export default function TagUsersModal({
  visible,
  onClose,
  onTagsSelected,
  initialSelectedUsers = [],
}: TagUsersModalProps) {
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TaggedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<TaggedUser[]>(initialSelectedUsers);
  const [followingList, setFollowingList] = useState<TaggedUser[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);

  useEffect(() => {
    if (visible && currentUser?.id) {
      fetchFollowingList();
    }
  }, [visible, currentUser?.id]);

  const fetchFollowingList = async () => {
    if (!currentUser?.id) return;
    setLoadingFollowing(true);
    try {
      const followingRef = collection(db, 'users', currentUser.id, 'following');
      const followingSnapshot = await getDocs(followingRef);
      const following: TaggedUser[] = [];
      for (const followDoc of followingSnapshot.docs) {
        const followingId = followDoc.data().followingId;
        const userRef = doc(db, 'users', followingId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          following.push({
            userId: userSnap.id,
            username: userData.username,
            avatar: userData.avatar,
          });
        }
      }
      setFollowingList(following);
    } catch (error) {
      console.error('Error fetching following list:', error);
      setFollowingList([]);
    } finally {
      setLoadingFollowing(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text.trim() === '') {
      setSearchResults([]);
      return;
    }
    const searchLower = text.toLowerCase();
    const filtered = followingList.filter(user =>
      user.username.toLowerCase().includes(searchLower)
    );
    setSearchResults(filtered);
  };

  const handleSelectUser = (user: TaggedUser) => {
    const isSelected = selectedUsers.some(u => u.userId === user.userId);
    if (isSelected) {
      setSelectedUsers(selectedUsers.filter(u => u.userId !== user.userId));
    } else if (selectedUsers.length < 20) {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleDone = () => {
    onTagsSelected(selectedUsers);
    onClose();
  };

  const handleCancel = () => {
    setSelectedUsers(initialSelectedUsers);
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  };

  const isUserSelected = (userId: string) => selectedUsers.some(u => u.userId === userId);
  const displayList = searchQuery.trim() === '' ? followingList : searchResults;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <View style={styles.container}>
        {/* Ambient background glow */}
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

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
            <IconSymbol size={22} name="chevron.left" color="#fff" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Tag People</ThemedText>
          <TouchableOpacity onPress={handleDone} style={styles.doneBtn}>
            <ThemedText style={styles.doneText}>Done</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <IconSymbol size={16} name="magnifyingglass" color="#555" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search followers..."
            placeholderTextColor="#555"
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <IconSymbol size={16} name="xmark.circle.fill" color="#555" />
            </TouchableOpacity>
          )}
        </View>

        {/* Selected Users */}
        {selectedUsers.length > 0 && (
          <View style={styles.selectedSection}>
            <View style={styles.selectedHeader}>
              <ThemedText style={styles.selectedLabel}>Selected</ThemedText>
              <View style={styles.selectedBadge}>
                <ThemedText style={styles.selectedBadgeText}>{selectedUsers.length}</ThemedText>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectedScrollContent}
            >
              {selectedUsers.map((user) => (
                <TouchableOpacity
                  key={user.userId}
                  style={styles.selectedChip}
                  onPress={() => handleSelectUser(user)}
                  activeOpacity={0.7}
                >
                  <View style={styles.chipAvatarWrapper}>
                    <View style={styles.chipAvatar}>
                      {user.avatar && user.avatar.startsWith('http') ? (
                        <Image source={{ uri: user.avatar }} style={styles.chipAvatarImage} />
                      ) : (
                        <ThemedText style={styles.chipAvatarInitial}>
                          {user.username[0].toUpperCase()}
                        </ThemedText>
                      )}
                    </View>
                    <View style={styles.chipRemoveBadge}>
                      <IconSymbol size={8} name="xmark" color="#fff" />
                    </View>
                  </View>
                  <ThemedText style={styles.chipUsername} numberOfLines={1}>{user.username}</ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Results */}
        <ScrollView style={styles.resultsContainer} showsVerticalScrollIndicator={false}>
          {loadingFollowing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          ) : displayList.length > 0 ? (
            displayList.map((user) => {
              const selected = isUserSelected(user.userId);
              return (
                <TouchableOpacity
                  key={user.userId}
                  style={styles.userItem}
                  onPress={() => handleSelectUser(user)}
                  activeOpacity={0.7}
                >
                  <View style={styles.userLeft}>
                    <View style={styles.userAvatar}>
                      {user.avatar && user.avatar.startsWith('http') ? (
                        <Image source={{ uri: user.avatar }} style={styles.userAvatarImage} />
                      ) : (
                        <ThemedText style={styles.userAvatarInitial}>
                          {user.username[0].toUpperCase()}
                        </ThemedText>
                      )}
                    </View>
                    <ThemedText style={[styles.username, selected && styles.usernameSelected]}>{user.username}</ThemedText>
                  </View>
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected && <IconSymbol size={12} name="checkmark" color="#0f0f0f" />}
                  </View>
                </TouchableOpacity>
              );
            })
          ) : searchQuery.trim() !== '' ? (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyTitle}>No matches</ThemedText>
              <ThemedText style={styles.emptySubtext}>
                No one you follow matches "{searchQuery}"
              </ThemedText>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyTitle}>No followers</ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Follow people to tag them in posts
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
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
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  doneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 16,
  },
  doneText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f0f0f',
  },
  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    padding: 0,
  },
  // Selected
  selectedSection: {
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  selectedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  selectedBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  selectedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  selectedScrollContent: {
    gap: 14,
  },
  selectedChip: {
    alignItems: 'center',
    width: 52,
  },
  chipAvatarWrapper: {
    position: 'relative',
    marginBottom: 5,
  },
  chipAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipAvatarImage: {
    width: '100%',
    height: '100%',
  },
  chipAvatarInitial: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  chipRemoveBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0f0f0f',
  },
  chipUsername: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    maxWidth: 52,
  },
  // Divider
  divider: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 20,
  },
  // Results
  resultsContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyState: {
    paddingTop: 60,
    paddingHorizontal: 8,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 36,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#555',
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  userLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  userAvatarImage: {
    width: '100%',
    height: '100%',
  },
  userAvatarInitial: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  username: {
    fontSize: 15,
    fontWeight: '500',
    color: '#999',
    flex: 1,
  },
  usernameSelected: {
    color: '#fff',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
});
