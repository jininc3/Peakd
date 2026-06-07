import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { auth, functions } from '@/config/firebase';
import { signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

const CODE_LENGTH = 6;

export default function VerifyEmailLogin() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const email = params.email as string;

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const verifyingRef = useRef(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Auto-focus first input
  useEffect(() => {
    setTimeout(() => inputRefs.current[0]?.focus(), 300);
  }, []);

  const handleCodeChange = (text: string, index: number) => {
    // Handle paste of full code
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH).split('');
      const newCode = [...code];
      digits.forEach((d, i) => {
        if (index + i < CODE_LENGTH) newCode[index + i] = d;
      });
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, CODE_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
      if (newCode.every(d => d !== '')) {
        handleVerify(newCode.join(''));
      }
      return;
    }

    const newCode = [...code];
    newCode[index] = text.replace(/\D/g, '');
    setCode(newCode);

    if (text && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newCode.every(d => d !== '')) {
      handleVerify(newCode.join(''));
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (fullCode?: string) => {
    const codeStr = fullCode || code.join('');
    if (codeStr.length !== CODE_LENGTH) return;
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    try {
      setIsVerifying(true);
      Keyboard.dismiss();

      // Verify the OTP code
      const verifyCode = httpsCallable(functions, 'verifyEmailCode');
      await verifyCode({ email, code: codeStr });

      // Code verified — now sign in via custom token
      const generateLogin = httpsCallable<{ email: string }, { customToken: string }>(functions, 'generateEmailLoginToken');
      const result = await generateLogin({ email });
      await signInWithCustomToken(auth, result.data.customToken);
      // AuthContext detects sign-in via onAuthStateChanged and navigates automatically
    } catch (error: any) {
      console.error('Email verification error:', error);
      setCode(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      // Only reset on error so user can retry; on success, stay locked until AuthContext navigates
      verifyingRef.current = false;
      setIsVerifying(false);

      if (error?.message?.includes('expired')) {
        Alert.alert('Code Expired', 'Your code has expired. Please request a new one.');
      } else if (error?.message?.includes('Incorrect')) {
        Alert.alert('Incorrect Code', 'The code you entered is incorrect. Please try again.');
      } else if (error?.message?.includes('Too many')) {
        Alert.alert('Too Many Attempts', 'Too many incorrect attempts. Please request a new code.');
      } else if (error?.message?.includes('No account found')) {
        Alert.alert(
          'No Account Found',
          'No account is linked to this email. Would you like to sign up?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Up', onPress: () => router.replace({ pathname: '/(auth)/signUpBirthday', params: { signupMethod: 'email' } }) },
          ]
        );
      } else if (error?.message?.includes('No verification code found')) {
        Alert.alert('Code Not Found', 'Your verification code was not found. Please request a new one.', [
          { text: 'Resend Code', onPress: handleResend },
        ]);
      } else {
        Alert.alert('Error', 'Failed to verify. Please try again.');
      }
    }
  };

  const handleResend = async () => {
    try {
      setIsResending(true);
      const sendCode = httpsCallable(functions, 'sendEmailVerificationCode');
      await sendCode({ email, skipRegisteredCheck: true });
      setCode(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      Alert.alert('Code Sent', 'A new verification code has been sent to your email.');
    } catch (error) {
      console.error('Error resending code:', error);
      Alert.alert('Error', 'Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const isFilled = code.every(d => d !== '');

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol size={22} name="chevron.left" color="#fff" />
        </TouchableOpacity>

        <View style={styles.content}>
          <ThemedText style={styles.title}>Enter the{'\n'}code</ThemedText>
          <ThemedText style={styles.subtitle}>
            We sent a 6-digit code to {email}
          </ThemedText>

          {/* Code Input */}
          <View style={styles.codeRow}>
            {code.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => { inputRefs.current[index] = ref; }}
                style={[
                  styles.codeInput,
                  digit ? styles.codeInputFilled : {},
                ]}
                value={digit}
                onChangeText={(text) => handleCodeChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={index === 0 ? CODE_LENGTH : 1}
                editable={!isVerifying}
                selectTextOnFocus
              />
            ))}
          </View>

          <TouchableOpacity onPress={handleResend} disabled={isResending}>
            <ThemedText style={styles.resendText}>
              {isResending ? 'Sending...' : "Didn't get a code? Resend"}
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={[styles.bottomSection, !keyboardVisible && styles.bottomSectionResting]}>
          <TouchableOpacity
            style={[styles.continueButton, (!isFilled || isVerifying) && styles.buttonDisabled]}
            onPress={() => handleVerify()}
            disabled={!isFilled || isVerifying}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.continueButtonText}>
              {isVerifying ? 'Verifying...' : 'Continue'}
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
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 24,
  },
  codeInput: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  codeInputFilled: {
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  resendText: { fontSize: 13, fontWeight: '600', color: '#888' },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 10 },
  bottomSectionResting: { paddingBottom: 40 },
  continueButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
});
