import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from '@/hooks/useRouter';
import { InAppNotificationData, useInAppNotification } from '@/contexts/InAppNotificationContext';

interface InAppNotificationProps {
  notification: InAppNotificationData;
}

export default function InAppNotification({ notification }: InAppNotificationProps) {
  const router = useRouter();
  const { dismissNotification } = useInAppNotification();

  const handlePress = () => {
    // Dismiss notification
    dismissNotification();

    // Navigate based on type
    const { navigationData } = notification;

    if (navigationData.type === 'follow') {
      router.push({ pathname: '/profilePages/profileView', params: { userId: navigationData.fromUserId, username: navigationData.fromUsername || '', avatar: navigationData.fromUserAvatar || '' } });
    } else if (navigationData.type === 'like' || navigationData.type === 'comment' || navigationData.type === 'tag') {
      if (navigationData.postId) {
        router.push(`/postViewer?postId=${navigationData.postId}`);
      }
    } else if (navigationData.type === 'message') {
      if (navigationData.chatId && navigationData.senderId && navigationData.senderUsername) {
        router.push(`/chatPages/chatScreen?chatId=${navigationData.chatId}&otherUserId=${navigationData.senderId}&otherUsername=${navigationData.senderUsername}`);
      }
    } else if (navigationData.type === 'follow_request') {
      router.push('/notifications');
    } else if (navigationData.type === 'challenge_invite') {
      if (navigationData.partyId && navigationData.game) {
        router.push(`/partyPages/challengeDetail?id=${navigationData.partyId}&game=${encodeURIComponent(navigationData.game)}`);
      }
    } else if (navigationData.type === 'party_invite') {
      router.push('/notifications');
    } else if (navigationData.type === 'party_complete') {
      if (navigationData.partyId && navigationData.game) {
        router.push(`/partyPages/leaderboardDetail?id=${navigationData.partyId}&game=${encodeURIComponent(navigationData.game)}`);
      }
    } else if (navigationData.type === 'honour_prompt' || navigationData.type === 'honour_received') {
      router.push('/notifications');
    }
  };

  return (
    <TouchableOpacity
      style={styles.notificationCard}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {/* Avatar */}
      {notification.fromUserAvatar ? (
        <Image
          source={{ uri: notification.fromUserAvatar }}
          style={styles.avatar}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>
            {notification.fromUsername?.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.username} numberOfLines={1}>
          {notification.fromUsername || 'Unknown'}
        </Text>
        <Text style={styles.message} numberOfLines={1}>
          {notification.message}
        </Text>
      </View>

      {/* Thumbnail (for post-related notifications) */}
      {notification.postThumbnail && (
        <Image
          source={{ uri: notification.postThumbnail }}
          style={styles.thumbnail}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2b2d31',
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e2124',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#36393e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  message: {
    fontSize: 14,
    color: '#b5bac1',
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#36393e',
    marginLeft: 8,
  },
});
