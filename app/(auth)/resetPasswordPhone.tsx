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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { signInWithEmail } from '@/services/authService';
import { functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';

type Step = 'otp' | 'password';

export default function ResetPasswordPhone() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const phoneNumber = params.phoneNumber as string;

  const [step, setStep] = useState<Step>('otp');

  // OTP state
  const [code, setCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const hiddenInputRef = useRef<TextInput | null>(null);

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    sendVerificationCode();
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const sendVerificationCode = async () => {
    try {
      setIsSending(true);
      const sendCode = httpsCallable(functions, 'sendPhoneVerificationCode');
      await sendCode({ phoneNumber });
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

  const handleVerifyOtp = async () => {
    if (code.length !== 6) return;

    try {
      setIsVerifying(true);
      const verifyCode = httpsCallable(functions, 'verifyPhoneCode');
      const result = await verifyCode({ phoneNumber, code });
      const data = result.data as { verified: boolean };

      if (!data.verified) {
        Alert.alert('Error', 'Incorrect verification code. Please try again.');
        return;
      }

      setStep('password');
    } catch (error: any) {
      console.error('Verification error:', error);
      const msg = error?.message || '';
      if (msg.includes('Incorrect')) {
        Alert.alert('Error', 'Incorrect verification code. Please try again.');
      } else if (msg.includes('expired')) {
        Alert.alert('Error', 'Code expired. Please request a new one.');
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

      const resetFn = httpsCallable(functions, 'resetPhonePassword');
      const result = await resetFn({ phoneNumber, newPassword });
      const { email } = result.data as { email: string };

      await signInWithEmail(email, newPassword);
      // AuthContext detects sign-in and navigates automatically
    } catch (error: any) {
      console.error('Error resetting password:', error);
      Alert.alert('Error', 'Failed to reset password. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  const passwordValid = newPassword.length >= 6 && newPassword === confirmPassword;

  // OTP Step
  if (step === 'otp') {
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

              <TouchableOpacity onPress={handleResend} disabled={isSending}>
                <ThemedText style={styles.resendText}>
                  {isSending ? 'Sending...' : 'Resend code'}
                </ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.bottomSection}>
              <TouchableOpacity
                style={[styles.continueButton, (isVerifying || code.length !== 6) && styles.buttonDisabled]}
                onPress={handleVerifyOtp}
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

  // Password Step
  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('otp')}>
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
    top: 0, left: 0, right: 0, bottom: 0,
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
  otpInputFilled: { borderColor: '#fff' },
  otpDigit: { fontSize: 22, fontWeight: '700', color: '#fff' },
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
