import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { sendPushNotification } from './sendPushNotification';

/**
 * Cloud Function that triggers when a new notification is created
 * Automatically sends a push notification to the user's device
 */
export const onNotificationCreated = onDocumentCreated(
  'users/{userId}/notifications/{notificationId}',
  async (event) => {
    const notification = event.data?.data();
    const userId = event.params.userId;

    if (!notification) {
      console.log('No notification data found');
      return;
    }

    console.log(`Processing notification for user ${userId}:`, notification);

    const db = getFirestore();

    try {
      // Check if sender is blocked by recipient (skip notification if so)
      if (notification.fromUserId) {
        const [blockedDoc, blockedByDoc] = await Promise.all([
          db.collection('users').doc(userId).collection('blockedUsers').doc(notification.fromUserId).get(),
          db.collection('users').doc(userId).collection('blockedByUsers').doc(notification.fromUserId).get(),
        ]);
        if (blockedDoc.exists || blockedByDoc.exists) {
          console.log('Notification involves blocked user, skipping push');
          return;
        }
      }

      // Get user's notification preferences
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      const preferences = userData?.notificationPreferences;

      // Check if user has disabled this type of notification
      if (preferences) {
        // Social notifications
        if (notification.type === 'like' && preferences.likes === false) {
          console.log('User disabled like notifications');
          return;
        }
        if (notification.type === 'comment' && preferences.comments === false) {
          console.log('User disabled comment notifications');
          return;
        }
        if ((notification.type === 'follow' || notification.type === 'follow_request') && preferences.followers === false) {
          console.log('User disabled follower notifications');
          return;
        }

        // Gaming activity notifications
        if (notification.type === 'party_ranking_change' && preferences.rankUps === false) {
          console.log('User disabled rank update notifications');
          return;
        }
        if (notification.type === 'achievement' && preferences.achievements === false) {
          console.log('User disabled achievement notifications');
          return;
        }
        if (
          (notification.type === 'party_invite' ||
            notification.type === 'challenge_invite' ||
            notification.type === 'party_complete') &&
          preferences.challenges === false
        ) {
          console.log('User disabled party invite notifications');
          return;
        }
      }

      // Build notification title and body based on type
      const title = 'RankdUp';
      let body = '';

      switch (notification.type) {
        case 'follow':
          body = `${notification.fromUsername} started following you`;
          break;

        case 'like':
          body = `${notification.fromUsername} liked your post`;
          break;

        case 'comment':
          const commentPreview = notification.commentText?.substring(0, 50) || '';
          const commentSuffix = notification.commentText?.length > 50 ? '...' : '';
          body = `${notification.fromUsername}: ${commentPreview}${commentSuffix}`;
          break;

        case 'tag':
          body = `${notification.fromUsername} tagged you in a post`;
          break;

        case 'party_invite':
          body = `${notification.fromUsername} invited you to join "${notification.partyName}" for ${notification.game}!`;
          break;

        case 'challenge_invite':
          body = `${notification.fromUsername} challenged you in "${notification.partyName}"! Accept to compete.`;
          break;

        case 'follow_request':
          body = `${notification.fromUsername} wants to follow you`;
          break;

        case 'party_complete':
          if (notification.isWinner) {
            body = `🏆 Congratulations! You won "${notification.partyName}"! You ranked #${notification.finalRank}!`;
          } else {
            body = `"${notification.partyName}" has ended. You ranked #${notification.finalRank}. Winner: ${notification.winnerUsername}`;
          }
          break;

        default:
          console.log(`Unknown notification type: ${notification.type}`);
          return;
      }

      // Send the push notification
      const pushData: Record<string, any> = {
        notificationId: event.params.notificationId,
        type: notification.type,
        fromUserId: notification.fromUserId,
        fromUsername: notification.fromUsername,
        timestamp: new Date().toISOString(),
      };

      // Add avatar (some notifications use fromUserAvatar, others fromAvatar)
      const avatar = notification.fromUserAvatar || notification.fromAvatar;
      if (avatar) {
        pushData.fromUserAvatar = avatar;
      }

      // Add type-specific data
      if (notification.postId) {
        pushData.postId = notification.postId;
      }
      if (notification.partyId) {
        pushData.partyId = notification.partyId;
        pushData.partyName = notification.partyName;
        pushData.game = notification.game;
      }

      await sendPushNotification(userId, title, body, pushData);

      console.log(`Push notification sent to user ${userId}`);
    } catch (error) {
      console.error('Error processing notification:', error);
      // Don't throw error - we don't want to retry failed push notifications
      // The in-app notification is already created, which is the most important part
    }
  }
);
