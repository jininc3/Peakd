import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from '@/hooks/useRouter';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Alert, Image, Dimensions } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function CreatePostVideo() {
  const router = useRouter();
  const [selectedMedia, setSelectedMedia] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const handleSelectVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need camera roll permissions to upload videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
      videoMaxDuration: 60,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.type === 'video') {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const sizeMB = blob.size / (1024 * 1024);
        if (sizeMB > 20) {
          Alert.alert('Video Too Large', `The video is ${sizeMB.toFixed(1)} MB. Please select one under 20 MB.`);
          return;
        }
      }
      setSelectedMedia(asset);
    }
  };

  const handleContinue = () => {
    if (!selectedMedia) return;
    router.push({
      pathname: '/postPages/createPostGame',
      params: {
        mediaUri: selectedMedia.uri,
        mediaType: selectedMedia.type || 'video',
        duration: selectedMedia.duration ? String(selectedMedia.duration) : '0',
      },
    });
  };

  const mediaHeight = selectedMedia?.type === 'video'
    ? (screenWidth - 56) * 0.5625
    : screenWidth - 56;

  return (
    <ThemedView style={styles.container}>
      {/* Ambient background glow */}
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
          <View style={[styles.progressFill, { width: '25%' }]} />
        </View>
      </View>

      <View style={styles.content}>
        <ThemedText style={styles.step}>Step 1 of 4</ThemedText>
        <ThemedText style={styles.title}>Select a clip</ThemedText>

        {selectedMedia ? (
          <View style={styles.previewContainer}>
            {selectedMedia.type === 'video' ? (
              <Video
                source={{ uri: selectedMedia.uri }}
                style={[styles.preview, { height: mediaHeight }]}
                useNativeControls
                resizeMode={ResizeMode.COVER}
                shouldPlay={false}
              />
            ) : (
              <Image
                source={{ uri: selectedMedia.uri }}
                style={[styles.preview, { height: mediaHeight }]}
                resizeMode="cover"
              />
            )}
            <TouchableOpacity style={styles.removeButton} onPress={() => setSelectedMedia(null)}>
              <IconSymbol size={18} name="xmark" color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.changeButton} onPress={handleSelectVideo}>
              <ThemedText style={styles.changeButtonText}>Change</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.selectButton} onPress={handleSelectVideo} activeOpacity={0.7}>
            <View style={styles.selectIconWrapper}>
              <IconSymbol size={28} name="video.fill" color="#555" />
            </View>
            <ThemedText style={styles.selectTitle}>Tap to select a video</ThemedText>
            <ThemedText style={styles.selectSubtext}>Max 20 MB · Up to 60 seconds</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[styles.continueButton, !selectedMedia && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!selectedMedia}
          activeOpacity={0.8}
        >
          <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
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
  title: { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 36, marginBottom: 32 },
  selectButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderStyle: 'dashed',
    gap: 10,
  },
  selectIconWrapper: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  selectTitle: { fontSize: 15, fontWeight: '600', color: '#999' },
  selectSubtext: { fontSize: 13, color: '#555' },
  previewContainer: { borderRadius: 14, overflow: 'hidden', position: 'relative' },
  preview: { width: '100%', borderRadius: 14 },
  removeButton: {
    position: 'absolute', top: 12, right: 12,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  changeButton: {
    position: 'absolute', bottom: 12, right: 12,
    paddingVertical: 6, paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
  },
  changeButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 40 },
  continueButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
});
