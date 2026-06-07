import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Platform, Alert, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createPhoneAuthAccount, tryResumePhoneSignup } from '@/services/authService';

const PROGRESS: Record<string, string> = {
  email: '14.3%',
  phone: '14.3%',
  google: '33.3%',
  apple: '33.3%',
};

export default function SignUpBirthday() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const navigation = useNavigation();
  const signupMethod = (params.signupMethod as string) || 'email';
  const [dateOfBirth, setDateOfBirth] = useState(new Date(2000, 0, 1));
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const canGoBack = navigation.canGoBack();
  // Phone already verified from login flow — skip phone entry & verification
  const phoneAlreadyVerified = signupMethod === 'phone' && !!params.phoneNumber;

  const getAge = (dob: Date) => {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  };

  const handleContinue = async () => {
    const age = getAge(dateOfBirth);
    if (age < 13) {
      Alert.alert('Age Requirement', 'You must be at least 13 years old to use Peakd.');
      return;
    }

    const nextParams = { ...params, dateOfBirth: dateOfBirth.toISOString(), signupMethod };

    if (signupMethod === 'email') {
      router.push({ pathname: '/(auth)/emailSignUpEmail', params: nextParams });
    } else if (phoneAlreadyVerified) {
      // Phone was already verified from the login flow — create auth account and skip to username
      setIsCreatingAccount(true);
      try {
        await createPhoneAuthAccount(params.phoneNumber as string);
      } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
          const result = await tryResumePhoneSignup(params.phoneNumber as string);
          if (result === 'resume') {
            router.replace({ pathname: '/(auth)/signUpUsername', params: nextParams });
            return;
          }
          Alert.alert('Error', 'This phone number already has an account.');
          return;
        }
        Alert.alert('Error', 'Failed to create account. Please try again.');
        return;
      } finally {
        setIsCreatingAccount(false);
      }
      router.push({ pathname: '/(auth)/signUpUsername', params: nextParams });
    } else if (signupMethod === 'phone') {
      router.push({ pathname: '/(auth)/phoneSignUpPhone', params: nextParams });
    } else {
      router.push({ pathname: '/(auth)/signUpUsername', params: nextParams });
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (canGoBack) {
              router.back();
            } else {
              router.replace('/(auth)/login');
            }
          }}
        >
          <IconSymbol size={22} name="chevron.left" color="#fff" />
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: PROGRESS[signupMethod] || '14.3%' }]} />
        </View>
      </View>

      <View style={styles.content}>
        <ThemedText style={styles.title}>What's your{'\n'}birthday?</ThemedText>
        <ThemedText style={styles.subtitle}>This won't be shown publicly.</ThemedText>

        <View style={styles.pickerContainer}>
          {Platform.OS === 'android' && (
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowPicker(true)}>
              <ThemedText style={styles.dateButtonText}>
                {dateOfBirth.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </ThemedText>
            </TouchableOpacity>
          )}
          {showPicker && (
            <DateTimePicker
              value={dateOfBirth}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              minimumDate={new Date(1920, 0, 1)}
              onChange={(_, date) => {
                if (Platform.OS === 'android') setShowPicker(false);
                if (date) setDateOfBirth(date);
              }}
              themeVariant="dark"
              textColor="#fff"
            />
          )}
        </View>
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity style={[styles.continueButton, isCreatingAccount && styles.buttonDisabled]} onPress={handleContinue} disabled={isCreatingAccount} activeOpacity={0.8}>
          <ThemedText style={styles.continueButtonText}>{isCreatingAccount ? 'Setting up...' : 'Continue'}</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 60, paddingHorizontal: 16 },
  backButton: { padding: 8 },
  progress: { flex: 1, height: 2, marginLeft: 12, marginRight: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 1 },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 32 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 36, marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#555' },
  pickerContainer: { marginTop: 32, alignItems: 'center' },
  dateButton: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 24 },
  dateButtonText: { color: '#fff', fontSize: 16 },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 40 },
  continueButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
});
