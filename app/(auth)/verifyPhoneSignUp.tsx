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
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { deleteIncompleteAccount, createPhoneAuthAccount, tryResumePhoneSignup } from '@/services/authService';
import { functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';

export default function VerifyPhoneSignUp() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const phoneNumberRaw = params.phoneNumber as string;

  const formatE164 = (phone: string): string => {
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  };

  const phoneNumber = formatE164(phoneNumberRaw);

  const [code, setCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const hiddenInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    sendVerificationCode();
  }, []);

  const sendVerificationCode = async () => {
    try {
      setIsSending(true);
      const sendCode = httpsCallable(functions, 'sendPhoneVerificationCode');
      await sendCode({ phoneNumber });
      setCodeSent(true);
    } catch (error: any) {
      console.error('Error sending verification code:', error);
      const msg = error?.message || '';
      if (msg.includes('Invalid phone number')) {
        Alert.alert('Error', 'Invalid phone number. Please check and try again.');
      } else {
        Alert.alert('Error', 'Failed to send verification code. Please try again.');
      }
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

    try {
      setIsVerifying(true);

      // Verify code via Twilio
      const verifyCode = httpsCallable(functions, 'verifyPhoneCode');
      const result = await verifyCode({ phoneNumber, code });
      const data = result.data as { verified: boolean; accountExists: boolean };

      if (!data.verified) {
        Alert.alert('Error', 'Incorrect verification code. Please try again.');
        return;
      }

      if (data.accountExists) {
        // Phone already has an account
        // Check if it's an incomplete signup
        const resumeResult = await tryResumePhoneSignup(phoneNumber);
        if (resumeResult === 'resume') {
          router.replace({
            pathname: '/(auth)/signUpUsername',
            params: { ...params },
          });
          return;
        }
        Alert.alert(
          'Already Registered',
          'This phone number already has an account.',
          [
            {
              text: 'Use Different Number',
              onPress: () => router.replace('/(auth)/phoneSignUp'),
            },
            {
              text: 'Go to Login',
              onPress: () => router.replace('/(auth)/login'),
            },
          ]
        );
        return;
      }

      // Phone verified, no existing account — create the account
      try {
        await createPhoneAuthAccount(phoneNumber);
      } catch (createError: any) {
        if (createError.code === 'auth/email-already-in-use') {
          const resumeResult = await tryResumePhoneSignup(phoneNumber);
          if (resumeResult === 'resume') {
            router.replace({
              pathname: '/(auth)/signUpUsername',
              params: { ...params },
            });
            return;
          }
          Alert.alert(
            'Already Registered',
            'This phone number already has an account.',
            [
              {
                text: 'Use Different Number',
                onPress: () => router.replace('/(auth)/phoneSignUp'),
              },
              {
                text: 'Go to Login',
                onPress: () => router.replace('/(auth)/login'),
              },
            ]
          );
          return;
        }
        throw createError;
      }

      Alert.alert(
        'Success!',
        'Your phone number has been verified!',
        [
          {
            text: 'OK',
            onPress: () => {
              router.replace({
                pathname: '/(auth)/signUpUsername',
                params: { ...params },
              });
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Verification error:', error);
      const msg = error?.message || '';
      if (msg.includes('Incorrect')) {
        Alert.alert('Error', 'Incorrect verification code. Please try again.');
      } else if (msg.includes('expired')) {
        Alert.alert('Code Expired', 'Your code has expired. Please request a new one.');
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

  const handleBack = async () => {
    Alert.alert(
      'Cancel Signup?',
      'Are you sure you want to cancel? Your account will be deleted.',
      [
        { text: 'No, Stay', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIncompleteAccount();
              router.replace('/(auth)/login');
            } catch (error) {
              console.error('Error cancelling:', error);
              router.replace('/(auth)/login');
            }
          },
        },
      ]
    );
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
              <View style={styles.progressFill} />
            </View>
          </View>

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
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 60, paddingHorizontal: 16 },
  backButton: { padding: 8 },
  progress: { flex: 1, height: 2, marginLeft: 12, marginRight: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 1 },
  progressFill: { width: '42.8%', height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 32 },
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
  resendText: { fontSize: 13, fontWeight: '600', color: '#888' },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 40 },
  continueButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
});
