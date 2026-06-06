import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Image } from 'react-native';

const GAMES = [
  { id: 'valorant', name: 'Valorant', logo: require('@/assets/images/valorant-red.png') },
  { id: 'league', name: 'League', logo: require('@/assets/images/lol-icon.png') },
];

export default function CreateLeaderboardGame() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  const handleContinue = () => {
    if (!selectedGame) return;
    const game = GAMES.find(g => g.id === selectedGame)!;
    router.push({
      pathname: '/partyPages/createLeaderboardSettings',
      params: { ...params, gameId: game.id, gameName: game.name },
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
          <View style={[styles.progressFill, { width: '50%' }]} />
        </View>
      </View>

      <View style={styles.content}>
        <ThemedText style={styles.step}>Step 2 of 4</ThemedText>
        <ThemedText style={styles.title}>Pick a game</ThemedText>

        <View style={styles.gameList}>
          {GAMES.map((game) => {
            const isSelected = selectedGame === game.id;
            return (
              <TouchableOpacity
                key={game.id}
                style={[styles.gameCard, isSelected && styles.gameCardSelected]}
                onPress={() => setSelectedGame(game.id)}
                activeOpacity={0.7}
              >
                <Image source={game.logo} style={styles.gameLogo} />
                <ThemedText style={[styles.gameName, isSelected && styles.gameNameSelected]}>
                  {game.name}
                </ThemedText>
                {isSelected && (
                  <View style={styles.checkmark}>
                    <IconSymbol size={16} name="checkmark" color="#0f0f0f" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[styles.continueButton, !selectedGame && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!selectedGame}
          activeOpacity={0.8}
        >
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
  gameList: { gap: 12 },
  gameCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    paddingVertical: 18, paddingHorizontal: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  gameCardSelected: {
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  gameLogo: { width: 36, height: 36, borderRadius: 8 },
  gameName: { flex: 1, fontSize: 17, fontWeight: '600', color: '#999' },
  gameNameSelected: { color: '#fff' },
  checkmark: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  bottomSection: { paddingHorizontal: 28, paddingBottom: 40 },
  continueButton: { backgroundColor: '#fff', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  continueButtonText: { color: '#0f0f0f', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
});
