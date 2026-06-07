import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { auth, functions } from '@/config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

const CODE_LENGTH = 6;
type Step = 'code' | 'password';

export default function ResetPasswordEmail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const email = params.email as string;

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    setTimeout(() => inputRefs.current[0]?.focus(), 300);
  }, []);

  const handleCodeChange = (text: string, index: number) => {
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH).split('');
      const newCode = [...code];
      digits.forEach((d, i) => {
        if (index + i < CODE_LENGTH) newCode[index + i] = d;
      });
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, CODE_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
      if (newCode.every(d => d !== '')) handleVerifyCode(newCode.join(''));
      return;
    }

    const newCode = [...code];
    newCode[index] = text.replace(/\D/g, '');
    setCode(newCode);
    if (text && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    if (newCode.every(d => d !== '')) handleVerifyCode(newCode.join(''));
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyCode = async (fullCode?: string) => {
    const codeStr = fullCode || code.join('');
    if (codeStr.length !== CODE_LENGTH) return;

    try {
      setIsVerifying(true);
      Keyboard.dismiss();
      const verifyCode = httpsCallable(functions, 'verifyEmailCode');
      await verifyCode({ email, code: codeStr });
      setStep('password');
    } catch (error: any) {
      setCode(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      const msg = error?.message || '';
      if (msg.includes('expired')) {
        Alert.alert('Code Expired', 'Please request a new code.');
      } else if (msg.includes('Incorrect')) {
        Alert.alert('Incorrect Code', 'Please try again.');
      } else if (msg.includes('Too many')) {
        Alert.alert('Too Many Attempts', 'Please request a new code.');
      } else {
        Alert.alert('Error', 'Failed to verify. Please try again.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    try {
      setIsResending(true);
      const sendCode = httpsCallable(functions, 'sendEmailVerificationCode');
      await sendCode({ email, skipRegisteredCheck: true });
      setCode(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      Alert.alert('Code Sent', 'A new code has been sent to your email.');
    } catch {
      Alert.alert('Error', 'Failed to resend code.');
    } finally {
      setIsResending(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    try {
      setIsResetting(true);
      // Generate temp credentials, sign in, then set the new password
      const generateLogin = httpsCallable(functions, 'generateEmailLoginToken');
      const result = await generateLogin({ email });
      const { authEmail, tempPassword } = result.data as { authEmail: string; tempPassword: string };

      // Sign in with temp password first (to authenticate)
      await signInWithEmailAndPassword(auth, authEmail, tempPassword);

      // Now set the real password (user is authenticated)
      const setPasswordFn = httpsCallable(functions, 'setUserPassword');
      await setPasswordFn({ password: newPassword });

      // Sign out and sign back in with the new password
      await auth.signOut();
      await signInWithEmailAndPassword(auth, authEmail, newPassword);
      // AuthContext detects sign-in and navigates automatically
    } catch (error: any) {
      console.error('Error resetting password:', error);
      Alert.alert('Error', 'Failed to reset password. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  const isFilled = code.every(d => d !== '');
  const passwordValid = newPassword.length >= 6 && newPassword === confirmPassword;

  if (step === 'code') {
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

            <View style={styles.codeRow}>
              {code.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => { inputRefs.current[index] = ref; }}
                  style={[styles.codeInput, digit ? styles.codeInputFilled : {}]}
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
              onPress={() => handleVerifyCode()}
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

  // Password Step
  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('code')}>
          <IconSymbol size={22} name="chevron.left" color="#fff" />
        </TouchableOpacity>

        <View style={styles.content}>
          <ThemedText style={styles.title}>Set new{'\n'}password</ThemedText>
          <ThemedText style={styles.subtitle}>Enter your new password below.</ThemedText>

          <View style={styles.inputWrapper}>
            <MaterialIcons name="lock" size={20} color="#555" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="New password"
              placeholderTextColor="#555"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showPassword}
              autoFocus
              editable={!isResetting}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <IconSymbol size={20} name={showPassword ? 'eye.slash.fill' : 'eye.fill'} color="#555" />
            </TouchableOpacity>
          </View>

          <View style={[styles.inputWrapper, { marginTop: 12 }]}>
            <MaterialIcons name="lock" size={20} color="#555" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor="#555"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              editable={!isResetting}
            />
          </View>
        </View>

        <View style={[styles.bottomSection, !keyboardVisible && styles.bottomSectionResting]}>
          <TouchableOpacity
            style={[styles.continueButton, (!passwordValid || isResetting) && styles.buttonDisabled]}
            onPress={handleResetPassword}
            disabled={!passwordValid || isResetting}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.continueButtonText}>
              {isResetting ? 'Resetting...' : 'Reset Password'}
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
  continueButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
});
