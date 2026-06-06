import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from '@/hooks/useRouter';
import { useNavigation } from 'expo-router';
import { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View, Alert, ActivityIndicator, Image, Dimensions, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserProfile } from '@/services/authService';
import { uploadProfilePicture, uploadCoverPhoto } from '@/services/storageService';
import * as ImagePicker from 'expo-image-picker';
import CachedImage from '@/components/ui/CachedImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Asset } from 'expo-asset';
import { getColors } from 'react-native-image-colors';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Default avatar images (local)
const defaultAvatars = [
  require('@/assets/images/avatar1.png'),
  require('@/assets/images/avatar2.png'),
  require('@/assets/images/avatar3.png'),
  require('@/assets/images/avatar4.png'),
  require('@/assets/images/avatar5.png'),
];

const defaultCoverPhotos = [
  require('@/assets/images/coverphoto1.png'),
  require('@/assets/images/coverphoto2.png'),
  require('@/assets/images/coverphoto3.png'),
  require('@/assets/images/coverphoto4.png'),
  require('@/assets/images/coverphoto5.png'),
];

export default function EditProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, refreshUser } = useAuth();

  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(user?.avatar || user?.username?.[0] || 'U');
  const [profileImage, setProfileImage] = useState<string | null>(user?.avatar || null);
  const [coverPhoto, setCoverPhoto] = useState<string | null>(user?.coverPhoto || null);
  const [discord, setDiscord] = useState(user?.discordLink || '');
  const [instagram, setInstagram] = useState(user?.instagramLink || '');
  const [isLoading, setIsLoading] = useState(false);
  const [changesSaved, setChangesSaved] = useState(false);

  // Pending changes (not saved until "Save Changes" is pressed)
  const [pendingProfileImageUri, setPendingProfileImageUri] = useState<string | null>(null);
  const [pendingCoverPhotoUri, setPendingCoverPhotoUri] = useState<string | null>(null);
  const [pendingRemoveProfileImage, setPendingRemoveProfileImage] = useState(false);
  const [pendingRemoveCoverPhoto, setPendingRemoveCoverPhoto] = useState(false);

  // Default avatar modal
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [pendingDefaultAvatarIndex, setPendingDefaultAvatarIndex] = useState<number | null>(null);

  // Default cover photo modal
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [pendingDefaultCoverIndex, setPendingDefaultCoverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setBio(user.bio || '');
      setAvatar(user.avatar || user.username?.[0] || 'U');
      setProfileImage(user.avatar || null);
      setCoverPhoto(user.coverPhoto || null);
      setDiscord(user.discordLink || '');
      setInstagram(user.instagramLink || '');
    }
  }, [user]);

  // Intercept back navigation (including swipe gestures)
  useEffect(() => {
    const beforeRemoveListener = (e: any) => {
      if (changesSaved) return;

      const changesExist =
        username !== (user?.username || '') ||
        bio !== (user?.bio || '') ||
        discord !== (user?.discordLink || '') ||
        instagram !== (user?.instagramLink || '') ||
        pendingProfileImageUri !== null ||
        pendingCoverPhotoUri !== null ||
        pendingRemoveProfileImage ||
        pendingRemoveCoverPhoto ||
        pendingDefaultAvatarIndex !== null ||
        pendingDefaultCoverIndex !== null;

      if (!changesExist) return;

      e.preventDefault();

      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to go back?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      );
    };

    navigation.addListener('beforeRemove', beforeRemoveListener);
    return () => {
      navigation.removeListener('beforeRemove', beforeRemoveListener);
    };
  }, [navigation, username, bio, discord, instagram, pendingProfileImageUri, pendingCoverPhotoUri, pendingRemoveProfileImage, pendingRemoveCoverPhoto, pendingDefaultAvatarIndex, user, changesSaved]);

  const showImageOptions = () => {
    const options: any[] = [
      { text: 'Choose Default Avatar', onPress: () => setShowAvatarModal(true) },
      { text: 'Take Photo', onPress: () => takePhoto() },
      { text: 'Choose from Library', onPress: () => pickImage() },
    ];

    if (profileImage || pendingProfileImageUri || pendingDefaultAvatarIndex !== null) {
      options.push({
        text: 'Remove Photo',
        style: 'destructive',
        onPress: () => {
          setPendingRemoveProfileImage(true);
          setPendingProfileImageUri(null);
          setPendingDefaultAvatarIndex(null);
        },
      });
    }

    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Change Profile Picture', 'Choose an option', options, { cancelable: true });
  };

  const selectDefaultAvatar = (index: number) => {
    setPendingDefaultAvatarIndex(index);
    setPendingProfileImageUri(null);
    setPendingRemoveProfileImage(false);
    setShowAvatarModal(false);
  };

  const takePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your camera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPendingProfileImageUri(result.assets[0].uri);
        setPendingRemoveProfileImage(false);
        setPendingDefaultAvatarIndex(null);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPendingProfileImageUri(result.assets[0].uri);
        setPendingRemoveProfileImage(false);
        setPendingDefaultAvatarIndex(null);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const selectDefaultCover = (index: number) => {
    setPendingDefaultCoverIndex(index);
    setPendingCoverPhotoUri(null);
    setPendingRemoveCoverPhoto(false);
    setShowCoverModal(false);
  };

  const showCoverPhotoOptions = () => {
    const options: any[] = [
      { text: 'Choose Default', onPress: () => setShowCoverModal(true) },
      { text: 'Take Photo', onPress: () => takeCoverPhoto() },
      { text: 'Choose from Library', onPress: () => pickCoverPhoto() },
    ];

    if (coverPhoto || pendingCoverPhotoUri || pendingDefaultCoverIndex !== null) {
      options.push({
        text: 'Remove Photo',
        style: 'destructive',
        onPress: () => {
          setPendingRemoveCoverPhoto(true);
          setPendingCoverPhotoUri(null);
          setPendingDefaultCoverIndex(null);
        },
      });
    }

    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Change Cover Photo', 'Choose an option', options, { cancelable: true });
  };

  const takeCoverPhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your camera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPendingCoverPhotoUri(result.assets[0].uri);
        setPendingRemoveCoverPhoto(false);
        setPendingDefaultCoverIndex(null);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const pickCoverPhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPendingCoverPhotoUri(result.assets[0].uri);
        setPendingRemoveCoverPhoto(false);
        setPendingDefaultCoverIndex(null);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const hasChanges = () => {
    if (username !== (user?.username || '')) return true;
    if (bio !== (user?.bio || '')) return true;
    if (discord !== (user?.discordLink || '')) return true;
    if (instagram !== (user?.instagramLink || '')) return true;
    if (pendingProfileImageUri !== null) return true;
    if (pendingCoverPhotoUri !== null) return true;
    if (pendingRemoveProfileImage) return true;
    if (pendingRemoveCoverPhoto) return true;
    if (pendingDefaultAvatarIndex !== null) return true;
    if (pendingDefaultCoverIndex !== null) return true;
    return false;
  };

  const handleSave = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to update your profile');
      return;
    }

    if (!username.trim()) {
      Alert.alert('Error', 'Username is required');
      return;
    }

    if (bio.length > 150) {
      Alert.alert('Error', 'Bio must be 150 characters or less');
      return;
    }

    Alert.alert(
      'Save Changes?',
      'Are you sure you want to save these changes to your profile?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async () => {
            try {
              setIsLoading(true);

              const updateData: any = {
                username: username.trim().toLowerCase(),
                bio: bio.trim(),
                discordLink: discord.trim(),
                instagramLink: instagram.trim(),
              };

              // Handle profile image changes
              if (pendingRemoveProfileImage) {
                updateData.avatar = '';
              } else if (pendingDefaultAvatarIndex !== null) {
                try {
                  const asset = Asset.fromModule(defaultAvatars[pendingDefaultAvatarIndex]);
                  await asset.downloadAsync();
                  if (asset.localUri) {
                    const avatarUrl = await uploadProfilePicture(user.id, asset.localUri);
                    updateData.avatar = avatarUrl;
                  }
                } catch (error) {
                  console.error('Error uploading default avatar:', error);
                }
              } else if (pendingProfileImageUri) {
                const avatarUrl = await uploadProfilePicture(user.id, pendingProfileImageUri);
                updateData.avatar = avatarUrl;
              }

              // Handle cover photo changes
              if (pendingRemoveCoverPhoto) {
                updateData.coverPhoto = '';
                updateData.coverPhotoColor = '';
              } else if (pendingDefaultCoverIndex !== null) {
                // User explicitly picked a default cover photo
                try {
                  const coverAsset = Asset.fromModule(defaultCoverPhotos[pendingDefaultCoverIndex]);
                  await coverAsset.downloadAsync();
                  if (coverAsset.localUri) {
                    const coverUrl = await uploadCoverPhoto(user.id, coverAsset.localUri);
                    updateData.coverPhoto = coverUrl;
                  }
                } catch (error) {
                  console.error('Error uploading default cover photo:', error);
                }
              } else if (pendingCoverPhotoUri) {
                const coverUrl = await uploadCoverPhoto(user.id, pendingCoverPhotoUri);
                updateData.coverPhoto = coverUrl;

                try {
                  const colors = await getColors(pendingCoverPhotoUri, {
                    fallback: '#24243e',
                    cache: true,
                  });
                  if (colors.platform === 'android') {
                    updateData.coverPhotoColor = colors.dominant ?? '#24243e';
                  } else if (colors.platform === 'ios') {
                    updateData.coverPhotoColor = colors.background ?? '#24243e';
                  }
                } catch {
                  updateData.coverPhotoColor = '#24243e';
                }
              } else if (pendingDefaultAvatarIndex !== null && !user.coverPhoto) {
                // Auto-assign matching default cover photo when picking a default avatar
                // and the user has no existing cover photo
                try {
                  const coverAsset = Asset.fromModule(defaultCoverPhotos[pendingDefaultAvatarIndex]);
                  await coverAsset.downloadAsync();
                  if (coverAsset.localUri) {
                    const coverUrl = await uploadCoverPhoto(user.id, coverAsset.localUri);
                    updateData.coverPhoto = coverUrl;
                  }
                } catch (error) {
                  console.error('Error uploading default cover photo:', error);
                }
              }

              await updateUserProfile(user.id, updateData);
              await refreshUser();
              setChangesSaved(true);
              router.back();
            } catch (error: any) {
              console.error('Profile update error:', error);
              Alert.alert('Error', error.message || 'Failed to update profile');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  // Get the displayed profile image
  const getDisplayedAvatar = () => {
    if (pendingRemoveProfileImage) return null;
    if (pendingDefaultAvatarIndex !== null) return { type: 'default', index: pendingDefaultAvatarIndex };
    if (pendingProfileImageUri) return { type: 'uri', uri: pendingProfileImageUri };
    if (profileImage) return { type: 'uri', uri: profileImage };
    return null;
  };

  const getDisplayedCover = (): { type: 'uri'; uri: string } | { type: 'default'; index: number } | null => {
    if (pendingRemoveCoverPhoto) return null;
    if (pendingDefaultCoverIndex !== null) return { type: 'default', index: pendingDefaultCoverIndex };
    if (pendingCoverPhotoUri) return { type: 'uri', uri: pendingCoverPhotoUri };
    if (coverPhoto) return { type: 'uri', uri: coverPhoto };
    return null;
  };

  const displayedAvatar = getDisplayedAvatar();
  const displayedCover = getDisplayedCover();

  return (
    <ThemedView style={styles.container}>
      {/* Background shimmer */}
      <View style={styles.backgroundGlow} pointerEvents="none">
        <View style={styles.shimmerBand} pointerEvents="none">
          <LinearGradient
            colors={['transparent', 'rgba(212, 184, 120, 0.03)', 'rgba(212, 184, 120, 0.06)', 'rgba(212, 184, 120, 0.03)', 'transparent']}
            locations={[0, 0.37, 0.5, 0.63, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={styles.shimmerBandSecondary} pointerEvents="none">
          <LinearGradient
            colors={['transparent', 'rgba(212, 184, 120, 0.035)', 'transparent']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => {
          if (hasChanges()) {
            Alert.alert('Discard Changes?', 'You have unsaved changes.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Discard', style: 'destructive', onPress: () => router.back() },
            ]);
          } else {
            router.back();
          }
        }}>
          <ThemedText style={styles.headerButtonText}>Cancel</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Edit Profile</ThemedText>
        <TouchableOpacity style={styles.headerButton} onPress={handleSave} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <ThemedText style={[styles.headerButtonText, styles.headerDoneText]}>Done</ThemedText>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Profile Picture Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={showImageOptions} disabled={isLoading}>
            <View style={styles.avatarCircle}>
              {displayedAvatar?.type === 'default' ? (
                <Image source={defaultAvatars[displayedAvatar.index]} style={styles.avatarImage} />
              ) : displayedAvatar?.type === 'uri' ? (
                <CachedImage uri={displayedAvatar.uri} style={styles.avatarImage} />
              ) : (
                <ThemedText style={styles.avatarInitial}>{user?.username?.[0]?.toUpperCase() || 'U'}</ThemedText>
              )}
            </View>
            <View style={styles.avatarEditBadge}>
              <IconSymbol size={12} name="camera.fill" color="#fff" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={showImageOptions} disabled={isLoading}>
            <ThemedText style={styles.changePhotoText}>Change profile photo</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Form Fields */}
        <View style={styles.formSection}>
          {/* Username */}
          <View style={styles.formRow}>
            <ThemedText style={styles.formLabel}>Username</ThemedText>
            <TextInput
              style={styles.formInput}
              value={username}
              onChangeText={(text) => setUsername(text.toLowerCase())}
              placeholder="Username"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.formDivider} />

          {/* Bio */}
          <View style={styles.formRow}>
            <ThemedText style={styles.formLabel}>Bio</ThemedText>
            <View style={styles.bioInputWrapper}>
              <TextInput
                style={styles.formInput}
                value={bio}
                onChangeText={setBio}
                placeholder="Add a bio..."
                placeholderTextColor="#555"
                multiline
                scrollEnabled={false}
                maxLength={150}
              />
              {bio.length > 0 && <ThemedText style={styles.bioCount}>{bio.length}/150</ThemedText>}
            </View>
          </View>

          <View style={styles.formDivider} />

          {/* Instagram */}
          <View style={styles.formRow}>
            <View style={styles.formLabelRow}>
              <Image source={require('@/assets/images/instagram.png')} style={styles.formLabelIcon} resizeMode="contain" />
              <ThemedText style={styles.formLabel}>Instagram</ThemedText>
            </View>
            <TextInput
              style={styles.formInput}
              value={instagram}
              onChangeText={setInstagram}
              placeholder="Username"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.formDivider} />

          {/* Discord */}
          <View style={styles.formRow}>
            <View style={styles.formLabelRow}>
              <Image source={require('@/assets/images/discord.png')} style={styles.formLabelIcon} resizeMode="contain" />
              <ThemedText style={styles.formLabel}>Discord</ThemedText>
            </View>
            <TextInput
              style={styles.formInput}
              value={discord}
              onChangeText={setDiscord}
              placeholder="Username"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Cover Photo Section */}
        <View style={styles.coverSection}>
          <ThemedText style={styles.sectionTitle}>Cover Photo</ThemedText>
          <TouchableOpacity style={styles.coverPhotoBox} onPress={showCoverPhotoOptions} disabled={isLoading} activeOpacity={0.7}>
            {displayedCover ? (
              displayedCover.type === 'default' ? (
                <Image source={defaultCoverPhotos[displayedCover.index]} style={styles.coverPhotoImage} />
              ) : (
                <CachedImage uri={displayedCover.uri} style={styles.coverPhotoImage} />
              )
            ) : (
              <View style={styles.coverPhotoPlaceholder}>
                <IconSymbol size={28} name="photo" color="#555" />
                <ThemedText style={styles.coverPhotoPlaceholderText}>Add a cover photo</ThemedText>
              </View>
            )}
            <View style={styles.coverEditBadge}>
              <IconSymbol size={14} name="camera.fill" color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Default Avatar Selection Modal */}
      <Modal
        visible={showAvatarModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAvatarModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Choose Avatar</ThemedText>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowAvatarModal(false)}>
                <IconSymbol size={24} name="xmark" color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.avatarGrid}>
              {defaultAvatars.map((avatarImg, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.avatarOption, pendingDefaultAvatarIndex === index && styles.avatarOptionSelected]}
                  onPress={() => selectDefaultAvatar(index)}
                  activeOpacity={0.7}
                >
                  <Image source={avatarImg} style={styles.avatarOptionImage} />
                  {pendingDefaultAvatarIndex === index && (
                    <View style={styles.avatarCheckmark}>
                      <IconSymbol size={16} name="checkmark" color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Default Cover Photo Selection Modal */}
      <Modal
        visible={showCoverModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCoverModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Choose Cover Photo</ThemedText>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowCoverModal(false)}>
                <IconSymbol size={24} name="xmark" color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.coverGrid}>
              {defaultCoverPhotos.map((coverImg, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.coverOption, pendingDefaultCoverIndex === index && styles.coverOptionSelected]}
                  onPress={() => selectDefaultCover(index)}
                  activeOpacity={0.7}
                >
                  <Image source={coverImg} style={styles.coverOptionImage} />
                  {pendingDefaultCoverIndex === index && (
                    <View style={styles.coverCheckmark}>
                      <IconSymbol size={16} name="checkmark" color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
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
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerButton: {
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },
  headerDoneText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  scrollContent: {
    paddingBottom: 60,
  },
  // Avatar Section
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#2c2f33',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 43,
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0f0f0f',
  },
  changePhotoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // Form Section
  formSection: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 50,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
    width: 110,
  },
  formLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 110,
    gap: 6,
  },
  formLabelIcon: {
    width: 16,
    height: 16,
  },
  formInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    padding: 0,
  },
  bioInputWrapper: {
    flex: 1,
  },
  bioCount: {
    fontSize: 11,
    color: '#555',
    textAlign: 'right',
    marginTop: 4,
  },
  formDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 16,
  },
  // Cover Photo Section
  coverSection: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 12,
  },
  coverPhotoBox: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    position: 'relative',
  },
  coverPhotoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  coverPhotoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  coverPhotoPlaceholderText: {
    fontSize: 13,
    color: '#555',
  },
  coverEditBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  modalCloseButton: {
    padding: 4,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  avatarOption: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  avatarOptionSelected: {
    borderColor: '#fff',
  },
  avatarOptionImage: {
    width: '100%',
    height: '100%',
  },
  avatarCheckmark: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverGrid: {
    gap: 12,
  },
  coverOption: {
    width: '100%',
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  coverOptionSelected: {
    borderColor: '#fff',
  },
  coverOptionImage: {
    width: '100%',
    height: '100%',
  },
  coverCheckmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
