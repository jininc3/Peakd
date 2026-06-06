import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from '@/hooks/useRouter';
import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View, TextInput, Image, KeyboardAvoidingView, Platform, ScrollView, Keyboard, Modal, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const DEFAULT_LOBBY_ICONS = [
  { id: 'lobby1', source: require('@/assets/images/lobby1.png') },
  { id: 'lobby2', source: require('@/assets/images/lobby2.png') },
  { id: 'lobby3', source: require('@/assets/images/lobby3.png') },
  { id: 'lobby4', source: require('@/assets/images/lobby4.png') },
  { id: 'lobby5', source: require('@/assets/images/lobby5.png') },
];

export default function CreateLeaderboardName() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [customIconUri, setCustomIconUri] = useState<string | null>(null);
  const [selectedDefaultIcon, setSelectedDefaultIcon] = useState<string>(() => {
    const idx = Math.floor(Math.random() * DEFAULT_LOBBY_ICONS.length);
    return DEFAULT_LOBBY_ICONS[idx].id;
  });
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const pickIcon = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setCustomIconUri(result.assets[0].uri);
      setSelectedDefaultIcon('');
    }
  };

  const resolvedIconUri = useMemo(() => {
    if (customIconUri) return customIconUri;
    const defaultIcon = DEFAULT_LOBBY_ICONS.find(i => i.id === selectedDefaultIcon);
    if (defaultIcon) return Image.resolveAssetSource(defaultIcon.source).uri;
    return '';
  }, [customIconUri, selectedDefaultIcon]);

  const handleContinue = () => {
    if (!name.trim()) return;
    router.push({
      pathname: '/partyPages/createLeaderboardGame',
      params: { name: name.trim().toUpperCase(), iconUri: resolvedIconUri },
    });
  };

  // Current display icon
  const displaySource = customIconUri
    ? { uri: customIconUri }
    : DEFAULT_LOBBY_ICONS.find(i => i.id === selectedDefaultIcon)?.source;

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

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol size={22} name="chevron.left" color="#fff" />
          </TouchableOpacity>
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: '25%' }]} />
          </View>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ThemedText style={styles.step}>Step 1 of 4</ThemedText>
          <ThemedText style={styles.title}>Name your{'\n'}leaderboard</ThemedText>

          {/* Main icon display – tap to open avatar picker modal */}
          <TouchableOpacity style={styles.iconPicker} onPress={() => setAvatarModalVisible(true)} activeOpacity={0.8}>
            {displaySource ? (
              <Image source={displaySource} style={styles.iconImage} />
            ) : (
              <View style={styles.iconPlaceholder}>
                <IconSymbol size={28} name="trophy.fill" color="#555" />
              </View>
            )}
            <View style={styles.editBadge}>
              <IconSymbol size={10} name="pencil" color="#fff" />
            </View>
          </TouchableOpacity>

          {/* Avatar picker modal */}
          <Modal
            visible={avatarModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setAvatarModalVisible(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setAvatarModalVisible(false)}>
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                <ThemedText style={styles.modalTitle}>Choose an avatar</ThemedText>

                <View style={styles.modalIconGrid}>
                  {DEFAULT_LOBBY_ICONS.map((icon) => (
                    <TouchableOpacity
                      key={icon.id}
                      style={[
                        styles.modalIconOption,
                        !customIconUri && selectedDefaultIcon === icon.id && styles.modalIconOptionSelected,
                      ]}
                      onPress={() => {
                        setSelectedDefaultIcon(icon.id);
                        setCustomIconUri(null);
                        setAvatarModalVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Image source={icon.source} style={styles.modalIconImage} />
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={async () => {
                    setAvatarModalVisible(false);
                    await pickIcon();
                  }}
                  activeOpacity={0.7}
                >
                  <IconSymbol size={16} name="camera.fill" color="#fff" />
                  <ThemedText style={styles.uploadButtonText}>Upload your own</ThemedText>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="LEADERBOARD NAME"
              placeholderTextColor="#555"
              value={name}
              onChangeText={(t) => setName(t.substring(0, 30))}
              autoCapitalize="characters"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
          </View>
          <ThemedText style={styles.charCount}>{name.length}/30</ThemedText>
        </ScrollView>

        <View style={[styles.bottomSection, !keyboardVisible && styles.bottomSectionResting]}>
          <TouchableOpacity
            style={[styles.continueButton, !name.trim() && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={!name.trim()}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  content: { flex: 1, paddingHorizontal: 28 },
  contentInner: { paddingTop: 16, paddingBottom: 20 },
  step: { fontSize: 13, color: '#555', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 36, marginBottom: 24 },
  iconPicker: { alignSelf: 'center', marginBottom: 24, position: 'relative' },
  iconImage: { width: 80, height: 80, borderRadius: 16 },
  iconPlaceholder: {
    width: 80, height: 80, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute', bottom: -4, right: -4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#D4B878',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#0f0f0f',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    width: '80%',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 20,
  },
  modalIconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  modalIconOption: {
    width: 56, height: 56, borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent',
  },
  modalIconOptionSelected: {
    borderColor: '#D4B878',
  },
  modalIconImage: {
    width: '100%', height: '100%', borderRadius: 12,
  },
  uploadButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20,
    width: '100%', justifyContent: 'center',
  },
  uploadButtonText: {
    fontSize: 14, fontWeight: '600', color: '#fff',
  },
  inputContainer: { marginTop: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 16, color: '#fff', letterSpacing: 1,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  charCount: { fontSize: 12, color: '#444', textAlign: 'right', marginTop: 6 },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 10 },
  bottomSectionResting: { paddingBottom: 40 },
  continueButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
});
