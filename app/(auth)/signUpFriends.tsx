import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export default function EmailSignUpFriends() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const handleContinue = () => {
    router.push({
      pathname: '/(auth)/signUpInterests',
      params: { ...params },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol size={22} name="chevron.left" color="#fff" />
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={styles.progressFill} />
        </View>
      </View>

      <View style={styles.content}>
        <ThemedText style={styles.title}>Find your{'\n'}friends</ThemedText>
        <ThemedText style={styles.subtitle}>Connect with people you know.</ThemedText>

        <View style={styles.optionsContainer}>
          <TouchableOpacity style={styles.optionCard} activeOpacity={0.7}>
            <View style={styles.optionIcon}>
              <IconSymbol size={22} name="person.2.fill" color="#fff" />
            </View>
            <View style={styles.optionText}>
              <ThemedText style={styles.optionTitle}>Sync Contacts</ThemedText>
              <ThemedText style={styles.optionSubtitle}>Find friends already on Peakd</ThemedText>
            </View>
            <View style={styles.comingSoon}>
              <ThemedText style={styles.comingSoonText}>Soon</ThemedText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionCard} activeOpacity={0.7}>
            <View style={styles.optionIcon}>
              <IconSymbol size={22} name="gamecontroller.fill" color="#fff" />
            </View>
            <View style={styles.optionText}>
              <ThemedText style={styles.optionTitle}>Gaming Friends</ThemedText>
              <ThemedText style={styles.optionSubtitle}>Discover players by rank</ThemedText>
            </View>
            <View style={styles.comingSoon}>
              <ThemedText style={styles.comingSoonText}>Soon</ThemedText>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity style={styles.continueButton} onPress={handleContinue} activeOpacity={0.8}>
          <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipButton} onPress={handleContinue} activeOpacity={0.7}>
          <ThemedText style={styles.skipButtonText}>Skip for now</ThemedText>
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
  progressFill: { width: '85.7%', height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 32 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 36, marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#555' },
  optionsContainer: { marginTop: 32, gap: 12 },
  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 16,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.06)',
  },
  optionIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: '600', color: '#fff' },
  optionSubtitle: { fontSize: 12, color: '#555', marginTop: 2 },
  comingSoon: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  comingSoonText: { fontSize: 11, color: '#555', fontWeight: '600' },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 40, gap: 12 },
  continueButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  skipButton: { alignItems: 'center', paddingVertical: 8 },
  skipButtonText: { color: '#555', fontSize: 14 },
});
