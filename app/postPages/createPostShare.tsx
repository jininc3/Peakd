import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { db, storage } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { addDoc, collection, doc, increment, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  StyleSheet, TouchableOpacity, View, Alert, Image, ScrollView,
  ActivityIndicator, Dimensions,
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function CreatePostShare() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, refreshUser } = useAuth();

  const mediaUri = params.mediaUri as string;
  const mediaType = (params.mediaType as string) || 'video';
  const duration = parseInt(params.duration as string) || 0;
  const game = params.game as string;
  const caption = (params.caption as string) || '';
  const taggedUsers = params.taggedUsers ? JSON.parse(params.taggedUsers as string) : [];

  const [thumbnailOption, setThumbnailOption] = useState<'auto' | 'custom'>('auto');
  const [selectedThumbnailUri, setSelectedThumbnailUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickCustomThumbnail = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedThumbnailUri(result.assets[0].uri);
      setThumbnailOption('custom');
    }
  };

  const handleShare = async () => {
    if (!user?.id) return;

    const MAX_POSTS = 5;
    if ((user.postsCount || 0) >= MAX_POSTS) {
      Alert.alert('Post Limit Reached', `You've reached the maximum of ${MAX_POSTS} posts. Delete a post first.`);
      return;
    }

    setUploading(true);
    try {
      const timestamp = Date.now();
      const ext = mediaUri.split('.').pop() || 'mp4';
      const fileName = `posts/${user.id}/${timestamp}.${ext}`;
      const storageRef = ref(storage, fileName);

      const response = await fetch(mediaUri);
      const blob = await response.blob();
      const uploadTask = await uploadBytesResumable(storageRef, blob);
      const downloadURL = await getDownloadURL(uploadTask.ref);

      let thumbnailUrl: string | undefined;
      if (mediaType === 'video') {
        try {
          let thumbUri = selectedThumbnailUri;
          if (!thumbUri || thumbnailOption === 'auto') {
            const { uri } = await VideoThumbnails.getThumbnailAsync(mediaUri, { time: 1000 });
            thumbUri = uri;
          }
          const thumbName = `posts/${user.id}/${timestamp}_thumb.jpg`;
          const thumbRef = ref(storage, thumbName);
          const thumbResponse = await fetch(thumbUri);
          const thumbBlob = await thumbResponse.blob();
          const thumbUpload = await uploadBytesResumable(thumbRef, thumbBlob);
          thumbnailUrl = await getDownloadURL(thumbUpload.ref);
        } catch (e) {
          console.error('Thumbnail upload error:', e);
        }
      }

      const postData: any = {
        userId: user.id,
        username: user.username || 'User',
        avatar: user.avatar || null,
        mediaUrl: downloadURL,
        mediaUrls: [downloadURL],
        mediaType,
        mediaTypes: [mediaType],
        taggedGame: game,
        createdAt: Timestamp.now(),
        likes: 0,
      };

      if (thumbnailUrl) {
        postData.thumbnailUrl = thumbnailUrl;
        if (thumbnailOption !== 'auto') postData.thumbnailType = thumbnailOption;
      }
      if (duration) postData.duration = Math.round(duration / 1000);
      if (caption) postData.caption = caption;
      if (taggedUsers.length > 0) {
        postData.taggedUsers = taggedUsers.map((u: any) => ({
          userId: u.userId, username: u.username, avatar: u.avatar || null,
        }));
      }

      const postDocRef = await addDoc(collection(db, 'posts'), postData);
      await updateDoc(doc(db, 'users', user.id), { postsCount: increment(1) });

      // Send tag notifications
      if (taggedUsers.length > 0) {
        const now = Timestamp.now();
        for (const tagged of taggedUsers) {
          if (tagged.userId !== user.id) {
            try {
              await setDoc(
                doc(db, `users/${tagged.userId}/notifications/${user.id}_tag_${postDocRef.id}_${Date.now()}`),
                {
                  type: 'tag',
                  fromUserId: user.id,
                  fromUsername: user.username || 'User',
                  fromUserAvatar: user.avatar || null,
                  postId: postDocRef.id,
                  postThumbnail: thumbnailUrl || downloadURL,
                  read: false,
                  createdAt: now,
                }
              );
            } catch (e) {
              console.log('Notification error:', e);
            }
          }
        }
      }

      await refreshUser();
      Alert.alert('Success', 'Post shared!', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Error', 'Failed to create post. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const mediaHeight = mediaType === 'video' ? (screenWidth - 56) * 0.5625 : screenWidth - 56;

  return (
    <ThemedView style={styles.container}>
      {/* Background shimmer — matches the rest of the app */}
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

      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol size={22} name="chevron.left" color="#fff" />
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: '100%' }]} />
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.step}>Step 4 of 4</ThemedText>
        <ThemedText style={styles.title}>Review & share</ThemedText>

        {/* Preview */}
        <View style={styles.previewCard}>
          {mediaType === 'video' ? (
            <Video
              source={{ uri: mediaUri }}
              style={[styles.preview, { height: mediaHeight }]}
              useNativeControls
              resizeMode={ResizeMode.COVER}
              shouldPlay={false}
            />
          ) : (
            <Image source={{ uri: mediaUri }} style={[styles.preview, { height: mediaHeight }]} resizeMode="cover" />
          )}
        </View>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <ThemedText style={styles.summaryLabel}>Game</ThemedText>
          <ThemedText style={styles.summaryValue}>{game === 'valorant' ? 'Valorant' : 'League of Legends'}</ThemedText>
        </View>
        {caption ? (
          <View style={styles.summaryRow}>
            <ThemedText style={styles.summaryLabel}>Caption</ThemedText>
            <ThemedText style={styles.summaryValue} numberOfLines={2}>{caption}</ThemedText>
          </View>
        ) : null}
        {taggedUsers.length > 0 && (
          <View style={styles.summaryRow}>
            <ThemedText style={styles.summaryLabel}>Tagged</ThemedText>
            <ThemedText style={styles.summaryValue}>{taggedUsers.map((u: any) => u.username).join(', ')}</ThemedText>
          </View>
        )}

        {/* Thumbnail options (video only) */}
        {mediaType === 'video' && (
          <View style={styles.thumbnailSection}>
            <ThemedText style={styles.sectionLabel}>Thumbnail</ThemedText>

            {selectedThumbnailUri && thumbnailOption !== 'auto' && (
              <Image source={{ uri: selectedThumbnailUri }} style={styles.thumbnailPreview} resizeMode="cover" />
            )}

            <View style={styles.thumbnailButtons}>
              <TouchableOpacity
                style={[styles.thumbnailBtn, thumbnailOption === 'auto' && styles.thumbnailBtnSelected]}
                onPress={() => { setThumbnailOption('auto'); setSelectedThumbnailUri(null); }}
              >
                <ThemedText style={[styles.thumbnailBtnText, thumbnailOption === 'auto' && styles.thumbnailBtnTextSelected]}>Auto</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.thumbnailBtn} onPress={pickCustomThumbnail}>
                <ThemedText style={styles.thumbnailBtnText}>Custom</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[styles.shareButton, uploading && styles.buttonDisabled]}
          onPress={handleShare}
          disabled={uploading}
          activeOpacity={0.8}
        >
          <ThemedText style={styles.shareButtonText}>
            {uploading ? 'Uploading...' : 'Share'}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
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
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 60, paddingHorizontal: 16 },
  backButton: { padding: 8 },
  progress: { flex: 1, height: 2, marginLeft: 12, marginRight: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 1 },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 16 },
  step: { fontSize: 13, color: '#F0D6A2', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 36, marginBottom: 24 },
  previewCard: { borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  preview: { width: '100%' },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  summaryLabel: { fontSize: 14, color: '#555', width: 80 },
  summaryValue: { flex: 1, fontSize: 14, color: '#fff', textAlign: 'right' },
  thumbnailSection: { marginTop: 20 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 12 },
  thumbnailPreview: { width: '100%', height: 120, borderRadius: 10, marginBottom: 12 },
  thumbnailButtons: { flexDirection: 'row', gap: 10 },
  thumbnailBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  thumbnailBtnSelected: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' },
  thumbnailBtnText: { fontSize: 13, fontWeight: '600', color: '#999' },
  thumbnailBtnTextSelected: { color: '#fff' },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 40 },
  shareButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  shareButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
});
