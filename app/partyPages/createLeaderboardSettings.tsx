import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export default function CreateLeaderboardSettings() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [inviteCode, setInviteCode] = useState('');
  const [permission, setPermission] = useState<'leader_only' | 'anyone'>('leader_only');

  useEffect(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setInviteCode(code);
  }, []);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(inviteCode);
    Alert.alert('Copied!', 'Invite code copied to clipboard.');
  };

  const handleContinue = () => {
    router.push({
      pathname: '/partyPages/createLeaderboardInvite',
      params: { ...params, inviteCode, invitePermission: permission },
    });
  };

  return (
    <ThemedView style={styles.container}>
      {/* Top background gradient */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.02)', 'transparent']}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topGradient}
        pointerEvents="none"
      />

      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol size={22} name="chevron.left" color="#fff" />
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: '75%' }]} />
        </View>
      </View>

      <View style={styles.content}>
        <ThemedText style={styles.step}>Step 3 of 4</ThemedText>
        <ThemedText style={styles.title}>Settings</ThemedText>

        {/* Invite Code */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionLabel}>INVITE CODE</ThemedText>
          <TouchableOpacity style={styles.codeRow} onPress={handleCopy} activeOpacity={0.7}>
            <ThemedText style={styles.codeText}>{inviteCode}</ThemedText>
            <IconSymbol size={18} name="doc.on.doc" color="#555" />
          </TouchableOpacity>
          <ThemedText style={styles.sectionHint}>Share this code so others can join.</ThemedText>
        </View>

        {/* Invite Permission */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionLabel}>WHO CAN INVITE</ThemedText>
          <View style={styles.permissionRow}>
            <TouchableOpacity
              style={[styles.permissionOption, permission === 'leader_only' && styles.permissionSelected]}
              onPress={() => setPermission('leader_only')}
              activeOpacity={0.7}
            >
              <ThemedText style={[styles.permissionText, permission === 'leader_only' && styles.permissionTextSelected]}>
                Leader Only
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.permissionOption, permission === 'anyone' && styles.permissionSelected]}
              onPress={() => setPermission('anyone')}
              activeOpacity={0.7}
            >
              <ThemedText style={[styles.permissionText, permission === 'anyone' && styles.permissionTextSelected]}>
                Anyone
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity style={styles.continueButton} onPress={handleContinue} activeOpacity={0.8}>
          <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 60, paddingHorizontal: 16 },
  backButton: { padding: 8 },
  progress: { flex: 1, height: 2, marginLeft: 12, marginRight: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 1 },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 16 },
  step: { fontSize: 13, color: '#555', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 36, marginBottom: 32 },
  section: { marginBottom: 28 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#555', letterSpacing: 0.5, marginBottom: 10 },
  codeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 18,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  codeText: { fontSize: 22, fontWeight: '700', color: '#fff', letterSpacing: 4 },
  sectionHint: { fontSize: 12, color: '#444', marginTop: 8 },
  permissionRow: { flexDirection: 'row', gap: 10 },
  permissionOption: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  permissionSelected: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  permissionText: { fontSize: 14, fontWeight: '600', color: '#999' },
  permissionTextSelected: { color: '#0f0f0f' },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 40 },
  continueButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
});
