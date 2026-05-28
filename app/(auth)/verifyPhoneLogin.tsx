import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import rnfbAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { auth, functions } from '@/config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

export default function VerifyPhoneLogin() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const phoneNumber = params.phoneNumber as string;

  const [code, setCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [confirmation, setConfirmation] = useState<FirebaseAuthTypes.ConfirmationResult | null>(null);
  const [codeSent, setCodeSent] = useState(false);

  const hiddenInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    sendVerificationCode();
  }, []);

  const sendVerificationCode = async () => {
    try {
      setIsSending(true);
      const confirm = await rnfbAuth().signInWithPhoneNumber(phoneNumber);
      setConfirmation(confirm);
      setCodeSent(true);
    } catch (error: any) {
      console.error('Error sending verification code:', error);
      Alert.alert('Error', 'Failed to send verification code. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCodeChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      hiddenInputRef.current?.blur();
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit verification code');
      return;
    }

    if (!confirmation) {
      Alert.alert('Error', 'No verification session found. Please resend the code.');
      return;
    }

    try {
      setIsVerifying(true);
      // Verify OTP via native SDK
      await confirmation.confirm(code);
      // Sign out of native SDK — it's a separate instance from the web SDK
      await rnfbAuth().signOut();

      // Get temp credentials from Cloud Function and sign in via web SDK
      const generateLogin = httpsCallable(functions, 'generateLoginToken');
      const result = await generateLogin({ phoneNumber });
      const { authEmail, tempPassword } = result.data as { authEmail: string; tempPassword: string };

      await signInWithEmailAndPassword(auth, authEmail, tempPassword);
      // AuthContext detects the sign-in via onAuthStateChanged and navigates automatically
    } catch (error: any) {
      console.error('Verification error:', error);
      if (error.code === 'auth/invalid-verification-code') {
        Alert.alert('Error', 'Invalid verification code. Please try again.');
      } else if (
        error?.code === 'functions/not-found' ||
        error?.details?.code === 'not-found' ||
        error?.message?.includes('No account found')
      ) {
        // Phone verified but no account exists — go straight to signup
        router.replace({
          pathname: '/(auth)/signUpBirthday',
          params: { signupMethod: 'phone', phoneNumber },
        });
        return;
      } else {
        Alert.alert('Error', 'Failed to verify code. Please try again.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setCode('');
    hiddenInputRef.current?.focus();
    await sendVerificationCode();
    Alert.alert('Code Sent', 'A new verification code has been sent to your phone.');
  };

  return (
    <ThemedView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol size={22} name="chevron.left" color="#fff" />
          </TouchableOpacity>

          <View style={styles.content}>
            <ThemedText style={styles.title}>Verify your{'\n'}phone number</ThemedText>
            <ThemedText style={styles.subtitle}>
              We sent a code to {phoneNumber}
            </ThemedText>

            {isSending && !codeSent ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#fff" />
                <ThemedText style={styles.loadingText}>Sending code...</ThemedText>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.otpContainer}
                activeOpacity={1}
                onPress={() => hiddenInputRef.current?.focus()}
              >
                <TextInput
                  ref={hiddenInputRef}
                  value={code}
                  onChangeText={handleCodeChange}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={6}
                  editable={!isVerifying}
                  autoFocus
                  style={styles.hiddenInput}
                />
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <View
                    key={index}
                    style={[styles.otpInput, code[index] ? styles.otpInputFilled : null]}
                  >
                    <ThemedText style={styles.otpDigit}>{code[index] || ''}</ThemedText>
                  </View>
                ))}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleResend}
              disabled={isSending}
            >
              <ThemedText style={styles.resendText}>
                {isSending ? 'Sending...' : 'Resend code'}
              </ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomSection}>
            <TouchableOpacity
              style={[styles.continueButton, (isVerifying || code.length !== 6) && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={isVerifying || code.length !== 6}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.continueButtonText}>
                {isVerifying ? 'Verifying...' : 'Continue'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  backButton: { position: 'absolute', top: 60, left: 16, zIndex: 10, padding: 8 },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 120 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 36, marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 32 },
  loadingContainer: { alignItems: 'center', gap: 12, marginTop: 32 },
  loadingText: { fontSize: 14, color: '#555' },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 24,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    fontSize: 22,
  },
  otpInput: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpInputFilled: {
    borderColor: '#fff',
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  resendText: { fontSize: 13, fontWeight: '600', color: '#1a73e8' },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 40 },
  continueButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
});
