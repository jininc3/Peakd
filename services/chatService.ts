import { db } from '@/config/firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  increment,
  writeBatch,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';

export interface SharedPostData {
  postId: string;
  postUsername: string;
  postAvatar?: string;
  postMediaUrl: string;
  postThumbnailUrl?: string;
  postCaption?: string;
  postMediaType: 'image' | 'video';
}

export interface GameUsernameData {
  game: 'valorant' | 'league';
  inGameName: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: Timestamp;
  read: boolean;
  type?: 'text' | 'image' | 'game_invite' | 'shared_post' | 'game_username';
  sharedPost?: SharedPostData;
  gameUsername?: GameUsernameData;
}

export interface Chat {
  id: string;
  participants: string[];
  participantDetails: {
    [userId: string]: {
      username: string;
      avatar?: string;
    };
  };
  lastMessage: string;
  lastMessageTimestamp: Timestamp;
  lastMessageSenderId: string;
  unreadCount: {
    [userId: string]: number;
  };
  lastNotificationSent?: {
    [userId: string]: Timestamp;
  };
  createdAt: Timestamp;
}

/**
 * Create or get existing chat between two users
 */
export const createOrGetChat = async (
  currentUserId: string,
  currentUsername: string,
  currentUserAvatar: string | undefined,
  otherUserId: string,
  otherUsername: string,
  otherUserAvatar: string | undefined
): Promise<string> => {
  // Block check
  const { isBlocked, isBlockedBy } = await import('./blockService');
  const [blocked, blockedBy] = await Promise.all([
    isBlocked(currentUserId, otherUserId),
    isBlockedBy(currentUserId, otherUserId),
  ]);
  if (blocked || blockedBy) {
    throw new Error('Unable to message this user');
  }

  // Check if chat already exists
  const chatsRef = collection(db, 'chats');
  const q = query(
    chatsRef,
    where('participants', 'array-contains', currentUserId)
  );

  const querySnapshot = await getDocs(q);

  // Look for existing chat with both participants
  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data();
    if (data.participants.includes(otherUserId)) {
      // Update participant details to ensure avatars are current
      const chatRef = doc(db, 'chats', docSnap.id);
      await updateDoc(chatRef, {
        [`participantDetails.${currentUserId}`]: {
          username: currentUsername,
          avatar: currentUserAvatar || null,
        },
        [`participantDetails.${otherUserId}`]: {
          username: otherUsername,
          avatar: otherUserAvatar || null,
        },
      });
      return docSnap.id;
    }
  }

  // Create new chat if it doesn't exist
  // Use deterministic ID so both clients racing create the same document
  const now = Timestamp.now();
  const chatDocId = [currentUserId, otherUserId].sort().join('_');
  const newChatRef = doc(db, 'chats', chatDocId);

  await setDoc(newChatRef, {
    participants: [currentUserId, otherUserId],
    participantDetails: {
      [currentUserId]: {
        username: currentUsername,
        avatar: currentUserAvatar || null,
      },
      [otherUserId]: {
        username: otherUsername,
        avatar: otherUserAvatar || null,
      },
    },
    lastMessage: '',
    lastMessageTimestamp: now,
    lastMessageSenderId: '',
    unreadCount: {
      [currentUserId]: 0,
      [otherUserId]: 0,
    },
    lastNotificationSent: {
      [currentUserId]: Timestamp.fromMillis(0),
      [otherUserId]: Timestamp.fromMillis(0),
    },
    createdAt: now,
  });

  return newChatRef.id;
};

/**
 * Send a message in a chat
 */
export const sendMessage = async (
  chatId: string,
  senderId: string,
  text: string,
  type: 'text' | 'image' | 'game_invite' | 'shared_post' | 'game_username' = 'text',
  sharedPost?: SharedPostData,
  gameUsername?: GameUsernameData
): Promise<string> => {
  const now = Timestamp.now();

  // Spam prevention: Check recent messages from this sender
  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const tenSecondsAgo = Timestamp.fromMillis(now.toMillis() - 10000);

  const recentMessagesQuery = query(
    messagesRef,
    where('senderId', '==', senderId),
    where('timestamp', '>', tenSecondsAgo),
    orderBy('timestamp', 'desc')
  );

  const recentMessagesSnapshot = await getDocs(recentMessagesQuery);

  // Limit: 5 messages per 10 seconds
  if (recentMessagesSnapshot.size >= 5) {
    throw new Error('You are sending messages too quickly. Please wait a moment.');
  }

  // Add message to subcollection
  const messageData: any = {
    senderId,
    text,
    timestamp: now,
    read: false,
    type,
  };

  if (sharedPost) {
    messageData.sharedPost = sharedPost;
  }

  if (gameUsername) {
    messageData.gameUsername = gameUsername;
  }

  const docRef = await addDoc(messagesRef, messageData);

  // Update chat document
  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);

  if (chatSnap.exists()) {
    const chatData = chatSnap.data();
    const otherUserId = chatData.participants.find((id: string) => id !== senderId);

    await updateDoc(chatRef, {
      lastMessage: text,
      lastMessageTimestamp: now,
      lastMessageSenderId: senderId,
      [`unreadCount.${otherUserId}`]: increment(1),
    });
  }

  return docRef.id;
};

/**
 * Get all messages for a chat
 */
export const getMessages = async (chatId: string): Promise<ChatMessage[]> => {
  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const q = query(messagesRef, orderBy('timestamp', 'asc'));
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as ChatMessage));
};

/**
 * Subscribe to messages in a chat (real-time)
 */
export const subscribeToMessages = (
  chatId: string,
  callback: (messages: ChatMessage[]) => void
) => {
  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const messages: ChatMessage[] = [];
    snapshot.forEach((doc) => {
      messages.push({
        id: doc.id,
        ...doc.data()
      } as ChatMessage);
    });
    callback(messages);
  });
};

/**
 * Get initial batch of most recent messages (paginated)
 */
export const getInitialMessages = async (
  chatId: string,
  pageSize: number = 20
): Promise<{
  messages: ChatMessage[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}> => {
  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(pageSize));
  const querySnapshot = await getDocs(q);

  const messages: ChatMessage[] = [];
  querySnapshot.forEach((doc) => {
    messages.push({
      id: doc.id,
      ...doc.data()
    } as ChatMessage);
  });

  // Reverse to show oldest first (since we queried desc)
  messages.reverse();

  return {
    messages,
    lastDoc: querySnapshot.docs[querySnapshot.docs.length - 1] || null,
    hasMore: querySnapshot.docs.length === pageSize,
  };
};

/**
 * Get older messages (paginated)
 */
export const getOlderMessages = async (
  chatId: string,
  lastDoc: QueryDocumentSnapshot<DocumentData>,
  pageSize: number = 20
): Promise<{
  messages: ChatMessage[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}> => {
  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const q = query(
    messagesRef,
    orderBy('timestamp', 'desc'),
    startAfter(lastDoc),
    limit(pageSize)
  );
  const querySnapshot = await getDocs(q);

  const messages: ChatMessage[] = [];
  querySnapshot.forEach((doc) => {
    messages.push({
      id: doc.id,
      ...doc.data()
    } as ChatMessage);
  });

  // Reverse to show oldest first (since we queried desc)
  messages.reverse();

  return {
    messages,
    lastDoc: querySnapshot.docs[querySnapshot.docs.length - 1] || null,
    hasMore: querySnapshot.docs.length === pageSize,
  };
};

/**
 * Subscribe to new messages after a certain timestamp (real-time)
 */
export const subscribeToNewMessages = (
  chatId: string,
  afterTimestamp: Timestamp,
  callback: (messages: ChatMessage[]) => void
) => {
  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const q = query(
    messagesRef,
    where('timestamp', '>', afterTimestamp),
    orderBy('timestamp', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const messages: ChatMessage[] = [];
    snapshot.forEach((doc) => {
      messages.push({
        id: doc.id,
        ...doc.data()
      } as ChatMessage);
    });
    callback(messages);
  });
};

/**
 * Subscribe to whether the other user has read messages (real-time)
 * Watches the chat document's unreadCount for the other user
 */
export const subscribeToReadStatus = (
  chatId: string,
  otherUserId: string,
  callback: (hasRead: boolean) => void
) => {
  const chatRef = doc(db, 'chats', chatId);

  return onSnapshot(chatRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      const otherUnread = data.unreadCount?.[otherUserId] || 0;
      callback(otherUnread === 0);
    }
  });
};

/**
 * Get all chats for a user
 */
export const getUserChats = async (userId: string): Promise<Chat[]> => {
  const chatsRef = collection(db, 'chats');
  const q = query(
    chatsRef,
    where('participants', 'array-contains', userId),
    orderBy('lastMessageTimestamp', 'desc')
  );

  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Chat));
};

/**
 * Subscribe to user's chats (real-time)
 */
export const subscribeToUserChats = (
  userId: string,
  callback: (chats: Chat[]) => void
) => {
  const chatsRef = collection(db, 'chats');
  const q = query(
    chatsRef,
    where('participants', 'array-contains', userId),
    orderBy('lastMessageTimestamp', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const chats: Chat[] = [];
    snapshot.forEach((doc) => {
      chats.push({
        id: doc.id,
        ...doc.data()
      } as Chat);
    });
    callback(chats);
  }, () => {});
};

/**
 * Mark messages as read
 */
export const markMessagesAsRead = async (
  chatId: string,
  userId: string
): Promise<void> => {
  const chatRef = doc(db, 'chats', chatId);
  await updateDoc(chatRef, {
    [`unreadCount.${userId}`]: 0,
  });

  // Mark individual messages as read
  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const q = query(messagesRef, where('senderId', '!=', userId), where('read', '==', false));
  const querySnapshot = await getDocs(q);

  const batch = writeBatch(db);
  querySnapshot.forEach((docSnap) => {
    batch.update(docSnap.ref, { read: true });
  });

  await batch.commit();
};

/**
 * Get chat by ID
 */
export const getChat = async (chatId: string): Promise<Chat | null> => {
  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);

  if (chatSnap.exists()) {
    return {
      id: chatSnap.id,
      ...chatSnap.data()
    } as Chat;
  }

  return null;
};

/**
 * Delete a message
 */
export const deleteMessage = async (
  chatId: string,
  messageId: string,
  senderId: string
): Promise<void> => {
  const messageRef = doc(db, `chats/${chatId}/messages`, messageId);
  const messageSnap = await getDoc(messageRef);

  if (!messageSnap.exists()) {
    throw new Error('Message not found');
  }

  const messageData = messageSnap.data();

  // Only allow sender to delete their own message
  if (messageData.senderId !== senderId) {
    throw new Error('You can only delete your own messages');
  }

  // Delete the message
  await deleteDoc(messageRef);

  // Update chat's last message if this was the last message
  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);

  if (chatSnap.exists()) {
    const chatData = chatSnap.data();

    // If the deleted message was the last message, update to previous message
    const messagesRef = collection(db, `chats/${chatId}/messages`);
    const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(1));
    const lastMessageSnapshot = await getDocs(q);

    if (lastMessageSnapshot.empty) {
      // No messages left
      await updateDoc(chatRef, {
        lastMessage: '',
        lastMessageTimestamp: Timestamp.now(),
        lastMessageSenderId: '',
      });
    } else {
      const lastMsg = lastMessageSnapshot.docs[0].data();
      await updateDoc(chatRef, {
        lastMessage: lastMsg.text,
        lastMessageTimestamp: lastMsg.timestamp,
        lastMessageSenderId: lastMsg.senderId,
      });
    }
  }
};

/**
 * Delete a chat
 */
export const deleteChat = async (chatId: string): Promise<void> => {
  // Delete all messages first
  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const messagesSnapshot = await getDocs(messagesRef);

  const batch = writeBatch(db);
  messagesSnapshot.forEach((doc) => {
    batch.delete(doc.ref);
  });

  // Delete the chat document
  const chatRef = doc(db, 'chats', chatId);
  batch.delete(chatRef);

  await batch.commit();
};
