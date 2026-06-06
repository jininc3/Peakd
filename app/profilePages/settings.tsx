import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from '@/hooks/useRouter';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, Switch, TouchableOpacity, View, Alert, Dimensions } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { LinearGradient } from 'expo-linear-gradient';

const settingsData = [
  {
    id: 'preferences',
    title: 'Preferences',
    items: [
      {
        id: 4,
        icon: 'bell',
        title: 'Notifications & Preferences',
        hasChevron: true,
        route: '/profilePages/notificationsPreferences',
      },
      {
        id: 5,
        icon: 'lock.shield',
        title: 'Privacy & Safety',
        hasChevron: true,
        route: '/profilePages/privacySafety',
      },
      {
        id: 6,
        icon: 'archivebox',
        title: 'Archived Posts',
        hasChevron: true,
        route: '/profilePages/archivedPosts',
      },
      {
        id: 7,
        icon: 'gamecontroller.fill',
        title: 'Game Preferences',
        hasChevron: true,
        route: '/profilePages/gamePreferences',
      },
    ],
  },
  {
    id: 'info',
    title: 'Information',
    items: [
      {
        id: 10,
        icon: 'star.circle',
        title: 'Tier Borders System',
        hasChevron: true,
        route: '/profilePages/tierBorders',
      },
    ],
  },
  {
    id: 'support',
    title: 'Support',
    items: [
      {
        id: 11,
        icon: 'questionmark.circle',
        title: 'Help Center',
        hasChevron: false,
      },
      {
        id: 12,
        icon: 'doc.text',
        title: 'Privacy Policy',
        hasChevron: false,
      },
    ],
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const [riotAccount, setRiotAccount] = useState<any>(null);
  const [valorantAccount, setValorantAccount] = useState<any>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [showRankOnPosts, setShowRankOnPosts] = useState(false);
  const [showRankCardBack, setShowRankCardBack] = useState(false);

  useEffect(() => {
    checkAccounts();
  }, [user]);

  // Refresh account status when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      checkAccounts();
    }, [user])
  );

  const checkAccounts = async () => {
    if (!user || !user.id) {
      setLoadingAccounts(false);
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', user.id));
      if (userDoc.exists()) {
        const data = userDoc.data();
        console.log('User data from Firestore:', data);

        // Check for Riot account (League of Legends)
        if (data.riotAccount) {
          setRiotAccount(data.riotAccount);
          console.log('Riot account set to:', data.riotAccount);
        } else {
          setRiotAccount(null);
          console.log('No riotAccount found in user data');
        }

        // Check for Valorant account
        if (data.valorantAccount) {
          setValorantAccount(data.valorantAccount);
          console.log('Valorant account set to:', data.valorantAccount);
        } else {
          setValorantAccount(null);
          console.log('No valorantAccount found in user data');
        }

        // Load show rank on posts preference
        setShowRankOnPosts(data.showRankOnPosts ?? false);
        setShowRankCardBack(data.showRankCardBack ?? false);
      }
    } catch (error) {
      console.error('Error checking accounts:', error);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleToggleShowRank = async (value: boolean) => {
    if (!user?.id) return;
    setShowRankOnPosts(value);
    try {
      await updateDoc(doc(db, 'users', user.id), { showRankOnPosts: value });
    } catch (error) {
      console.error('Error updating showRankOnPosts:', error);
      setShowRankOnPosts(!value);
    }
  };

  const handleToggleRankCardBack = async (value: boolean) => {
    if (!user?.id) return;
    setShowRankCardBack(value);
    try {
      await updateDoc(doc(db, 'users', user.id), { showRankCardBack: value });
    } catch (error) {
      console.error('Error updating showRankCardBack:', error);
      setShowRankCardBack(!value);
    }
  };


  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/(auth)/login');
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out');
              console.error(error);
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Ambient background glow */}
      <View style={styles.backgroundGlow} pointerEvents="none">
        <View style={styles.shimmerBand} pointerEvents="none">
          <LinearGradient
            colors={[
              'transparent',
              'rgba(212, 184, 120, 0.03)',
              'rgba(212, 184, 120, 0.06)',
              'rgba(212, 184, 120, 0.03)',
              'transparent',
            ]}
            locations={[0, 0.37, 0.5, 0.63, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={styles.shimmerBandSecondary} pointerEvents="none">
          <LinearGradient
            colors={[
              'transparent',
              'rgba(212, 184, 120, 0.035)',
              'transparent',
            ]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <IconSymbol size={20} name="chevron.left" color="#fff" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Settings</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Account Section with merged user info */}
        {user && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <IconSymbol size={18} name="person.fill" color="#fff" />
              <ThemedText style={styles.sectionHeaderTitle}>Account</ThemedText>
            </View>
            <View style={styles.settingsGroup}>
              {/* User Info - Centered */}
              <View style={[styles.settingItem, styles.userInfoItem]}>
                <View style={styles.userInfoContent}>
                  <View style={styles.userInfoRow}>
                    <IconSymbol size={28} name="person.circle" color="#fff" />
                    <ThemedText style={styles.userInfoTitle}>{user.username}</ThemedText>
                  </View>
                  <ThemedText style={styles.userInfoSubtitle}>
                    Signed in with {user.provider}
                  </ThemedText>
                </View>
              </View>

              {/* View Profile Preview */}
              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => router.push('/profilePages/profilePreview')}
              >
                <View style={styles.settingLeft}>
                  <View style={styles.iconContainer}>
                    <IconSymbol size={20} name="eye" color="#888" />
                  </View>
                  <View style={styles.settingTextContainer}>
                    <ThemedText style={styles.settingTitle}>View Profile Preview</ThemedText>
                  </View>
                </View>
                <IconSymbol size={18} name="chevron.right" color="#444" />
              </TouchableOpacity>

              {/* Account Settings */}
              <TouchableOpacity
                style={[styles.settingItem, styles.settingItemLast]}
                onPress={() => router.push('/profilePages/accountSettings')}
              >
                <View style={styles.settingLeft}>
                  <View style={styles.iconContainer}>
                    <IconSymbol size={20} name="gearshape" color="#888" />
                  </View>
                  <View style={styles.settingTextContainer}>
                    <ThemedText style={styles.settingTitle}>Account Settings</ThemedText>
                  </View>
                </View>
                <IconSymbol size={18} name="chevron.right" color="#444" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Connected Accounts Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol size={18} name="link" color="#fff" />
            <ThemedText style={styles.sectionHeaderTitle}>Connected Accounts</ThemedText>
          </View>
          <View style={styles.settingsGroup}>
            {/* Info message */}
            <View style={styles.infoMessageContainer}>
              <IconSymbol size={16} name="info.circle" color="#666" />
              <ThemedText style={styles.infoMessageText}>
                Manage account connections from your Rank Cards page
              </ThemedText>
            </View>

            {/* League of Legends - Display Only */}
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.iconContainer}>
                  <IconSymbol size={20} name="gamecontroller" color="#888" />
                </View>
                <View style={styles.settingTextContainer}>
                  <ThemedText style={styles.settingTitle}>League of Legends</ThemedText>
                  <ThemedText style={styles.settingSubtitle}>
                    {loadingAccounts
                      ? 'Checking...'
                      : riotAccount
                      ? `${riotAccount.gameName}#${riotAccount.tagLine}`
                      : 'Not connected'}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.settingRight}>
                {riotAccount ? (
                  <View style={styles.connectedBadge}>
                    <ThemedText style={styles.connectedBadgeText}>Connected</ThemedText>
                  </View>
                ) : (
                  <View style={styles.notConnectedBadge}>
                    <ThemedText style={styles.notConnectedBadgeText}>Not Connected</ThemedText>
                  </View>
                )}
              </View>
            </View>

            {/* Valorant - Display Only */}
            <View style={[styles.settingItem, styles.settingItemLast]}>
              <View style={styles.settingLeft}>
                <View style={styles.iconContainer}>
                  <IconSymbol size={20} name="target" color="#888" />
                </View>
                <View style={styles.settingTextContainer}>
                  <ThemedText style={styles.settingTitle}>Valorant</ThemedText>
                  <ThemedText style={styles.settingSubtitle}>
                    {loadingAccounts
                      ? 'Checking...'
                      : valorantAccount
                      ? `${valorantAccount.gameName}#${valorantAccount.tag}`
                      : 'Not connected'}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.settingRight}>
                {valorantAccount ? (
                  <View style={styles.connectedBadge}>
                    <ThemedText style={styles.connectedBadgeText}>Connected</ThemedText>
                  </View>
                ) : (
                  <View style={styles.notConnectedBadge}>
                    <ThemedText style={styles.notConnectedBadgeText}>Not Connected</ThemedText>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Other Settings Sections */}
        {settingsData.map((section) => (
          <View key={section.id} style={styles.section}>
            {section.title && (
              <View style={styles.sectionHeader}>
                <IconSymbol
                  size={18}
                  name={section.id === 'preferences' ? 'slider.horizontal.3' : section.id === 'info' ? 'info.circle.fill' : 'questionmark.circle.fill'}
                  color="#fff"
                />
                <ThemedText style={styles.sectionHeaderTitle}>{section.title}</ThemedText>
              </View>
            )}
            <View style={styles.settingsGroup}>
              {section.id === 'preferences' && (
                <View style={styles.settingItem}>
                  <View style={styles.settingLeft}>
                    <View style={styles.iconContainer}>
                      <IconSymbol size={20} name="trophy" color="#888" />
                    </View>
                    <View style={styles.settingTextContainer}>
                      <ThemedText style={styles.settingTitle}>Show Rank on Posts</ThemedText>
                      <ThemedText style={styles.settingSubtitle}>
                        Display your current rank next to your name
                      </ThemedText>
                    </View>
                  </View>
                  <Switch
                    value={showRankOnPosts}
                    onValueChange={handleToggleShowRank}
                    trackColor={{ false: '#333', true: '#c42743' }}
                    thumbColor="#fff"
                  />
                </View>
              )}
              {section.id === 'preferences' && (
                <View style={styles.settingItem}>
                  <View style={styles.settingLeft}>
                    <View style={styles.iconContainer}>
                      <IconSymbol size={20} name="rectangle.on.rectangle.angled" color="#888" />
                    </View>
                    <View style={styles.settingTextContainer}>
                      <ThemedText style={styles.settingTitle}>Show Rank Card Back</ThemedText>
                      <ThemedText style={styles.settingSubtitle}>
                        Display the back of your rank cards on your profile
                      </ThemedText>
                    </View>
                  </View>
                  <Switch
                    value={showRankCardBack}
                    onValueChange={handleToggleRankCardBack}
                    trackColor={{ false: '#333', true: '#c42743' }}
                    thumbColor="#fff"
                  />
                </View>
              )}
              {section.items.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.settingItem,
                    index === section.items.length - 1 && styles.settingItemLast,
                  ]}
                  onPress={() => item.route && router.push(item.route)}
                >
                  <View style={styles.settingLeft}>
                    <View style={styles.iconContainer}>
                      <IconSymbol size={20} name={item.icon} color="#888" />
                    </View>
                    <View style={styles.settingTextContainer}>
                      <ThemedText style={styles.settingTitle}>{item.title}</ThemedText>
                      {item.subtitle && (
                        <ThemedText style={styles.settingSubtitle}>{item.subtitle}</ThemedText>
                      )}
                    </View>
                  </View>
                  {item.hasChevron && (
                    <IconSymbol size={18} name="chevron.right" color="#444" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Sign Out Button */}
        <View style={styles.section}>
          <View style={styles.settingsGroup}>
            <TouchableOpacity
              style={[styles.settingItem, styles.settingItemLast, styles.signOutButton]}
              onPress={handleSignOut}
            >
              <View style={styles.settingLeft}>
                <View style={styles.iconContainer}>
                  <IconSymbol size={20} name="rectangle.portrait.and.arrow.right" color="#c42743" />
                </View>
                <ThemedText style={[styles.settingTitle, styles.signOutText]}>Sign Out</ThemedText>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  backgroundGlow: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  shimmerBand: {
    position: 'absolute',
    top: -screenHeight * 0.35,
    left: -screenWidth * 0.6,
    width: screenWidth * 2.2,
    height: screenHeight * 1.7,
    transform: [{ rotate: '20deg' }],
  },
  shimmerBandSecondary: {
    position: 'absolute',
    top: -screenHeight * 0.2,
    left: -screenWidth * 0.1,
    width: screenWidth * 1.9,
    height: screenHeight * 1.5,
    transform: [{ rotate: '-15deg' }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 15,
  },
  backButton: {
    padding: 4,
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    flex: 1,
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginHorizontal: 20,
  },
  settingsGroup: {
    marginHorizontal: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  settingItemLast: {
    borderBottomWidth: 0,
  },
  disabledSettingItem: {
    opacity: 0.6,
  },
  disabledText: {
    color: '#72767d',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectedBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  connectedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22c55e',
  },
  notConnectedBadge: {
    backgroundColor: '#252525',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  notConnectedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  infoMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#151515',
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  infoMessageText: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -0.2,
  },
  settingSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  bottomSpacer: {
    height: 40,
  },
  signOutButton: {
    backgroundColor: 'rgba(196, 39, 67, 0.1)',
  },
  signOutText: {
    color: '#c42743',
    fontWeight: '600',
  },
  unlinkButton: {
    backgroundColor: '#1a1a1a',
  },
  unlinkText: {
    color: '#c42743',
    fontWeight: '600',
  },
  compactUnlinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  compactUnlinkText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#c42743',
  },
  userInfoItem: {
    justifyContent: 'center',
    paddingVertical: 20,
  },
  userInfoContent: {
    alignItems: 'center',
    gap: 6,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userInfoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  userInfoSubtitle: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});