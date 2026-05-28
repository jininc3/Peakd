import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { completeEmailSignup, completePhoneSignup } from '@/services/authService';
import { uploadProfilePicture, uploadCoverPhoto } from '@/services/storageService';
import { Asset } from 'expo-asset';

const DEFAULT_COVER_PHOTOS = [
  require('@/assets/images/coverphoto1.png'),
  require('@/assets/images/coverphoto2.png'),
  require('@/assets/images/coverphoto3.png'),
  require('@/assets/images/coverphoto4.png'),
  require('@/assets/images/coverphoto5.png'),
];
import { auth, db, functions } from '@/config/firebase';

import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';

const PROGRESS: Record<string, string> = {
  email: '71.4%',
  phone: '71.4%',
  google: '66.6%',
  apple: '66.6%',
};

export default function SignUpPassword() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const signupMethod = (params.signupMethod as string) || 'email';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isValid = password.length >= 8 && password === confirmPassword;

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
    if (password.length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    try {
      setIsLoading(true);

      // Upload avatar if provided
      let avatarUrl = '';
      const avatarUri = params.avatarUri as string;
      const defaultAvatarIndex = params.defaultAvatarIndex != null ? Number(params.defaultAvatarIndex) : null;

      // Upload matching default cover photo if the user picked a default avatar
      let coverPhotoUrl = '';
      if (defaultAvatarIndex != null && defaultAvatarIndex >= 0 && defaultAvatarIndex < DEFAULT_COVER_PHOTOS.length) {
        try {
          const uid = auth.currentUser?.uid;
          if (uid) {
            const coverAsset = Asset.fromModule(DEFAULT_COVER_PHOTOS[defaultAvatarIndex]);
            await coverAsset.downloadAsync();
            if (coverAsset.localUri) {
              coverPhotoUrl = await uploadCoverPhoto(uid, coverAsset.localUri);
            }
          }
        } catch (error) {
          console.error('Error uploading default cover photo:', error);
        }
      }

      if (signupMethod === 'google' || signupMethod === 'apple') {
        const user = auth.currentUser;
        if (!user) throw new Error('No authenticated user');

        if (avatarUri) {
          avatarUrl = await uploadProfilePicture(user.uid, avatarUri);
        }

        await updateProfile(user, { displayName: params.username as string });

        // Set password via Admin SDK (works regardless of session age)
        const setPasswordFn = httpsCallable(functions, 'setUserPassword');
        await setPasswordFn({ password });

        await updateDoc(doc(db, 'users', user.uid), {
          username: params.username as string,
          usernameLower: (params.username as string).toLowerCase(),
          dateOfBirth: params.dateOfBirth as string,
          avatar: avatarUrl || user.photoURL || '',
          ...(coverPhotoUrl ? { coverPhoto: coverPhotoUrl } : {}),
          needsUsernameSetup: false,
          updatedAt: new Date(),
        });
      } else if (signupMethod === 'phone') {
        if (avatarUri && auth.currentUser) {
          avatarUrl = await uploadProfilePicture(auth.currentUser.uid, avatarUri);
        }

        await completePhoneSignup({
          username: params.username as string,
          phoneNumber: params.phoneNumber as string,
          dateOfBirth: params.dateOfBirth as string,
          avatar: avatarUrl,
          coverPhoto: coverPhotoUrl,
          password,
        });
      } else {
        if (avatarUri && auth.currentUser) {
          avatarUrl = await uploadProfilePicture(auth.currentUser.uid, avatarUri);
        }

        await completeEmailSignup({
          username: params.username as string,
          email: params.email as string,
          dateOfBirth: params.dateOfBirth as string,
          avatar: avatarUrl,
          coverPhoto: coverPhotoUrl,
          password,
        });
      }

      router.push({
        pathname: '/(auth)/signUpFriends',
        params: { ...params },
      });
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <IconSymbol size={22} name="chevron.left" color="#fff" />
          </TouchableOpacity>
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: PROGRESS[signupMethod] || '71.4%' }]} />
          </View>
        </View>

        <View style={styles.content}>
          <ThemedText style={styles.title}>Create a{'\n'}password</ThemedText>
          <ThemedText style={styles.subtitle}>At least 8 characters.</ThemedText>

          <View style={styles.inputGroup}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#555"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoFocus
                editable={!isLoading}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <IconSymbol size={20} name={showPassword ? 'eye.slash.fill' : 'eye.fill'} color="#555" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Confirm password"
                placeholderTextColor="#555"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                editable={!isLoading}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.continueButton, (!isValid || isLoading) && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={!isValid || isLoading}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.continueButtonText}>
              {isLoading ? 'Setting up...' : 'Continue'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  title: { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 36, marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#555' },
  inputGroup: { marginTop: 32, gap: 12 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 16, color: '#fff',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  eyeButton: { position: 'absolute', right: 16 },
  continueButton: { marginTop: 24, backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
});
