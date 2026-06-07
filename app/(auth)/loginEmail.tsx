import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from '@/hooks/useRouter';
import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, TextInput, KeyboardAvoidingView, Platform, Keyboard, Alert } from 'react-native';
import { functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';

export default function LoginEmail() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleContinue = async () => {
    if (!isValid) return;

    const normalizedEmail = email.trim().toLowerCase();

    try {
      setIsLoading(true);

      // Check if account exists first
      const checkAccount = httpsCallable(functions, 'checkEmailAccountExists');
      await checkAccount({ email: normalizedEmail });

      // Send OTP code via Resend
      const sendCode = httpsCallable(functions, 'sendEmailVerificationCode');
      await sendCode({ email: normalizedEmail, skipRegisteredCheck: true });

      router.push({
        pathname: '/(auth)/verifyEmailLogin',
        params: { email: normalizedEmail },
      });
    } catch (error: any) {
      console.error('Error sending login code:', error);
      if (error?.message?.includes('No account found')) {
        Alert.alert(
          'No Account Found',
          'No account found with this email. Would you like to sign up?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Up', onPress: () => router.replace({ pathname: '/(auth)/signUpBirthday', params: { signupMethod: 'email' } }) },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to send verification code. Please try again.');
      }
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
          <ThemedText style={styles.title}>Enter your{'\n'}email</ThemedText>
          <ThemedText style={styles.subtitle}>We'll send a verification code to your email.</ThemedText>

          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="email" size={20} color="#555" style={{ marginRight: 10 }} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor="#555"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoFocus
                editable={!isLoading}
                returnKeyType="next"
                onSubmitEditing={handleContinue}
              />
            </View>
          </View>
        </View>

        <View style={[styles.bottomSection, !keyboardVisible && styles.bottomSectionResting]}>
          <TouchableOpacity
            style={[styles.continueButton, (!isValid || isLoading) && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={!isValid || isLoading}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.continueButtonText}>
              {isLoading ? 'Sending...' : 'Continue'}
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
  input: { flex: 1, paddingVertical: 16, fontSize: 16, color: '#fff' },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 10 },
  bottomSectionResting: { paddingBottom: 40 },
  continueButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
});
