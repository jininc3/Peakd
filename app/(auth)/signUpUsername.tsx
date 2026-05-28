import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { db } from '@/config/firebase';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { Asset } from 'expo-asset';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, TextInput, Image, Alert, KeyboardAvoidingView, Platform, Modal, Pressable, Keyboard, TouchableWithoutFeedback } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const PROGRESS: Record<string, string> = {
  email: '57.1%',
  phone: '57.1%',
  google: '50%',
  apple: '50%',
};

const DEFAULT_AVATARS = [
  require('@/assets/images/avatar1.png'),
  require('@/assets/images/avatar2.png'),
  require('@/assets/images/avatar3.png'),
  require('@/assets/images/avatar4.png'),
  require('@/assets/images/avatar5.png'),
];

export default function SignUpUsername() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const signupMethod = (params.signupMethod as string) || 'email';
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [selectedDefault, setSelectedDefault] = useState(
    () => Math.floor(Math.random() * DEFAULT_AVATARS.length)
  );
  const [customAvatarUri, setCustomAvatarUri] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkUsername = useCallback(async (name: string) => {
    if (name.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    setCheckingUsername(true);
    try {
      const q = query(collection(db, 'users'), where('usernameLower', '==', name.toLowerCase()));
      const snapshot = await getDocs(q);
      setUsernameAvailable(snapshot.empty);
    } catch {
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  }, []);

  const handleUsernameChange = (text: string) => {
    const cleaned = text.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 20);
    setUsername(cleaned);
    setUsernameAvailable(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (cleaned.length >= 3) {
      debounceRef.current = setTimeout(() => checkUsername(cleaned), 500);
    }
  };

  const selectDefaultAvatar = (index: number) => {
    setSelectedDefault(index);
    setCustomAvatarUri(null);
    setShowModal(false);
  };

  const pickCustomAvatar = () => {
    setShowModal(false);
    // Short delay so the modal dismiss animation doesn't block picker
    setTimeout(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        exif: false,
      });
      if (!result.canceled) setCustomAvatarUri(result.assets[0].uri);
    }, 100);
  };

  const isValid = username.length >= 3 && usernameAvailable === true;

  const handleBack = () => {
    Alert.alert(
      'Leave Signup?',
      'You can continue where you left off next time.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          onPress: () => router.replace('/(auth)/login'),
        },
      ]
    );
  };

  const handleContinue = async () => {
    if (!isValid || isNavigating) return;

    setIsNavigating(true);
    try {
      let avatarUri = '';
      if (customAvatarUri) {
        avatarUri = customAvatarUri;
      } else {
        const asset = Asset.fromModule(DEFAULT_AVATARS[selectedDefault]);
        await asset.downloadAsync();
        avatarUri = asset.localUri || '';
      }

      router.push({
        pathname: '/(auth)/signUpPassword',
        params: {
          ...params,
          username,
          avatarUri,
          // Pass the default avatar index so the password screen can assign the matching cover photo
          ...(customAvatarUri ? {} : { defaultAvatarIndex: String(selectedDefault) }),
        },
      });
    } finally {
      setIsNavigating(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <IconSymbol size={22} name="chevron.left" color="#fff" />
          </TouchableOpacity>
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: PROGRESS[signupMethod] || '57.1%' }]} />
          </View>
        </View>

        <View style={styles.content}>
          <ThemedText style={styles.title}>Pick a username{'\n'}and photo</ThemedText>

          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={() => setShowModal(true)} activeOpacity={0.7}>
              <Image
                source={customAvatarUri ? { uri: customAvatarUri } : DEFAULT_AVATARS[selectedDefault]}
                style={styles.mainAvatar}
              />
              <View style={styles.avatarBadge}>
                <IconSymbol size={12} name="pencil" color="#0f0f0f" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#555"
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
            {username.length >= 3 && (
              <View style={styles.usernameStatus}>
                {checkingUsername ? (
                  <ThemedText style={styles.statusChecking}>Checking...</ThemedText>
                ) : usernameAvailable === true ? (
                  <ThemedText style={styles.statusAvailable}>Available</ThemedText>
                ) : usernameAvailable === false ? (
                  <ThemedText style={styles.statusTaken}>Taken</ThemedText>
                ) : null}
              </View>
            )}
          </View>

          <ThemedText style={styles.hint}>3-20 characters. Letters, numbers, and underscores only.</ThemedText>

          <TouchableOpacity
            style={[styles.continueButton, (!isValid || isNavigating) && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={!isValid || isNavigating}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <ThemedText style={styles.modalTitle}>Choose avatar</ThemedText>

            <View style={styles.modalAvatarGrid}>
              {DEFAULT_AVATARS.map((src, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => selectDefaultAvatar(index)}
                  activeOpacity={0.7}
                >
                  <Image
                    source={src}
                    style={[
                      styles.modalAvatarOption,
                      !customAvatarUri && selectedDefault === index && styles.modalAvatarSelected,
                    ]}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.uploadButton} onPress={pickCustomAvatar} activeOpacity={0.8}>
              <IconSymbol size={18} name="camera.fill" color="#fff" />
              <ThemedText style={styles.uploadButtonText}>Upload photo</ThemedText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 60, paddingHorizontal: 16 },
  backButton: { padding: 8 },
  progress: { flex: 1, height: 2, marginLeft: 12, marginRight: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 1 },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  content: { paddingHorizontal: 28, paddingTop: 32 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 36, marginBottom: 24 },
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  mainAvatar: { width: 90, height: 90, borderRadius: 45 },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  inputContainer: { position: 'relative' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 16, color: '#fff',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  usernameStatus: { position: 'absolute', right: 16, top: 16 },
  statusChecking: { fontSize: 13, color: '#555' },
  statusAvailable: { fontSize: 13, color: '#22C55E' },
  statusTaken: { fontSize: 13, color: '#EF4444' },
  hint: { fontSize: 12, color: '#444', marginTop: 8 },
  continueButton: { marginTop: 24, backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 28,
    paddingBottom: 40,
    paddingTop: 12,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', color: '#fff',
    marginBottom: 20,
  },
  modalAvatarGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalAvatarOption: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, borderColor: 'transparent',
  },
  modalAvatarSelected: {
    borderColor: '#fff',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 14,
  },
  uploadButtonText: {
    fontSize: 15, fontWeight: '600', color: '#fff',
  },
});
