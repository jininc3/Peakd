import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendPushNotification } from './sendPushNotification';

/**
 * Cloud Function that triggers when a new message is created
 * Sends push notifications with rate limiting (1 per minute per chat)
 */
export const onMessageCreated = onDocumentCreated(
  'chats/{chatId}/messages/{messageId}',
  async (event) => {
    const message = event.data?.data();
    const chatId = event.params.chatId;
    const messageId = event.params.messageId;

    if (!message) {
      console.log('No message data found');
      return;
    }

    console.log(`Processing message ${messageId} in chat ${chatId}:`, message);

    const db = getFirestore();

    try {
      // Get the chat document to find the recipient
      const chatRef = db.collection('chats').doc(chatId);
      const chatDoc = await chatRef.get();

      if (!chatDoc.exists) {
        console.log(`Chat ${chatId} not found`);
        return;
      }

      const chatData = chatDoc.data();
      if (!chatData) {
        console.log('No chat data found');
        return;
      }

      // Find the recipient (the user who didn't send the message)
      const recipientUserId = chatData.participants.find(
        (userId: string) => userId !== message.senderId
      );

      if (!recipientUserId) {
        console.log('No recipient found');
        return;
      }

      // Get recipient's notification preferences
      const recipientDoc = await db.collection('users').doc(recipientUserId).get();
      const recipientData = recipientDoc.data();
      const preferences = recipientData?.notificationPreferences;

      // Check if user has disabled message notifications
      if (preferences && preferences.messages === false) {
        console.log('User disabled message notifications');
        return;
      }

      // Rate limiting: Check if 60 seconds have passed since last notification
      const now = new Date();
      const lastNotificationSent = chatData.lastNotificationSent?.[recipientUserId];

      if (lastNotificationSent) {
        const lastNotificationTime = lastNotificationSent.toDate();
        const timeSinceLastNotification = now.getTime() - lastNotificationTime.getTime();
        const oneMinuteInMs = 60 * 1000;

        if (timeSinceLastNotification < oneMinuteInMs) {
          console.log(
            `Skipping notification - only ${Math.round(timeSinceLastNotification / 1000)}s since last notification`
          );
          return;
        }
      }

      // Get sender's username and avatar from chat participant details
      const senderDetails = chatData.participantDetails?.[message.senderId];
      const senderUsername = senderDetails?.username || 'Someone';
      const senderAvatar = senderDetails?.avatar || null;

      // Build notification
      const title = senderUsername;
      const body = message.text.length > 100
        ? message.text.substring(0, 100) + '...'
        : message.text;

      // Send the push notification
      await sendPushNotification(recipientUserId, title, body, {
        type: 'message',
        chatId: chatId,
        messageId: messageId,
        senderId: message.senderId,
        senderUsername: senderUsername,
        fromUserId: message.senderId,
        fromUsername: senderUsername,
        fromUserAvatar: senderAvatar,
        messageText: message.text,
        timestamp: now.toISOString(),
      });

      // Update the lastNotificationSent timestamp for this recipient
      await chatRef.update({
        [`lastNotificationSent.${recipientUserId}`]: FieldValue.serverTimestamp(),
      });

      console.log(
        `Push notification sent to user ${recipientUserId} for message in chat ${chatId}`
      );
    } catch (error) {
      console.error('Error processing message notification:', error);
      // Don't throw error - we don't want to retry failed push notifications
    }
  }
);
