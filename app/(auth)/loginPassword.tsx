import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { auth, db, functions } from '@/config/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, TextInput, Alert, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';

export default function LoginPassword() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const usernameOrEmail = params.username as string;
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const isEmailInput = (input: string) => input.includes('@');

  const isPhoneEmail = (email: string) => email.endsWith('@peakd-phone.internal');

  const getPhoneFromEmail = async (email: string): Promise<string | null> => {
    try {
      // Try by Firestore email first
      let q = query(collection(db, 'users'), where('email', '==', email));
      let snapshot = await getDocs(q);
      if (!snapshot.empty) return snapshot.docs[0].data().phoneNumber || null;
      // Phone users have empty email — extract phone digits from internal email and match
      if (email.endsWith('@peakd-phone.internal')) {
        const digits = email.replace('phone_', '').replace('@peakd-phone.internal', '');
        const phoneWithPlus = '+' + digits;
        q = query(collection(db, 'users'), where('phoneNumber', '==', phoneWithPlus));
        snapshot = await getDocs(q);
        if (!snapshot.empty) return snapshot.docs[0].data().phoneNumber || null;
      }
      return null;
    } catch { return null; }
  };

  const handleForgotPassword = async () => {
    try {
      let email = usernameOrEmail;
      if (!isEmailInput(usernameOrEmail)) {
        const resolved = await getEmailFromUsername(usernameOrEmail);
        if (!resolved) {
          Alert.alert('Error', 'No account found with this username.');
          return;
        }
        email = resolved;
      }

      // Phone users: send Twilio OTP
      if (isPhoneEmail(email)) {
        const phone = await getPhoneFromEmail(email);
        if (!phone) {
          Alert.alert('Error', 'Could not find phone number for this account.');
          return;
        }
        router.push({
          pathname: '/(auth)/resetPasswordPhone',
          params: { phoneNumber: phone },
        });
        return;
      }

      // Email users: send Resend OTP code
      const sendCode = httpsCallable(functions, 'sendEmailVerificationCode');
      await sendCode({ email, skipRegisteredCheck: true });
      router.push({
        pathname: '/(auth)/resetPasswordEmail',
        params: { email },
      });
    } catch (error: any) {
      Alert.alert('Error', 'Failed to send reset code. Please try again.');
    }
  };

  const getEmailFromUsername = async (username: string): Promise<string | null> => {
    try {
      const q = query(collection(db, 'users'), where('usernameLower', '==', username.toLowerCase()));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        if (data.email) return data.email;
        // Phone users have empty email in Firestore — derive auth email from phone number
        if (data.phoneNumber) {
          const sanitized = data.phoneNumber.replace(/[^0-9]/g, '');
          return `phone_${sanitized}@peakd-phone.internal`;
        }
      }
      return null;
    } catch { return null; }
  };

  const handleSignIn = async () => {
    if (!password) return;

    try {
      setIsLoading(true);
      const login = httpsCallable<
        { username: string; password: string },
        { customToken: string }
      >(functions, 'loginWithUsername');
      const result = await login({ username: usernameOrEmail, password });
      await signInWithCustomToken(auth, result.data.customToken);
      // Navigation handled by AuthContext
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('No account found')) {
        Alert.alert('Sign In Failed', 'No account found with this username.');
      } else if (msg.includes('Incorrect password')) {
        Alert.alert('Sign In Failed', 'Incorrect password.');
      } else {
        Alert.alert('Sign In Failed', 'Incorrect username or password.');
      }
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol size={22} name="chevron.left" color="#fff" />
        </TouchableOpacity>

        <View style={styles.content}>
          <ThemedText style={styles.title}>Enter your{'\n'}password</ThemedText>
          <ThemedText style={styles.subtitle}>
            {usernameOrEmail.endsWith('@peakd-phone.internal')
              ? 'Signing in with phone number'
              : `Signing in as @${usernameOrEmail}`}
          </ThemedText>

          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="lock" size={20} color="#555" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#555"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoFocus
                editable={!isLoading}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <IconSymbol size={20} name={showPassword ? 'eye.slash.fill' : 'eye.fill'} color="#555" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity onPress={handleForgotPassword}>
            <ThemedText style={styles.forgotText}>Forgot password?</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={[styles.bottomSection, !keyboardVisible && styles.bottomSectionResting]}>
          <TouchableOpacity
            style={[styles.signInButton, (!password || isLoading) && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={!password || isLoading}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.signInButtonText}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  backButton: { position: 'absolute', top: 60, left: 16, zIndex: 10, padding: 8 },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 120 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 36, marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 32 },
  inputContainer: {},
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingHorizontal: 18,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 16, fontSize: 16, color: '#fff' },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 10 },
  bottomSectionResting: { paddingBottom: 40 },
  signInButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  signInButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
  forgotText: { fontSize: 13, fontWeight: '600', color: '#1a73e8', marginTop: 16 },
});
