import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  User as FirebaseUser,
  deleteUser,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updatePassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  usernameLower?: string;
  avatar?: string;
  coverPhoto?: string;
  coverPhotoColor?: string;
  bio?: string;
  discordLink?: string;
  instagramLink?: string;
  phoneNumber?: string;
  phoneVerified?: boolean;
  provider: 'email' | 'google' | 'phone' | 'apple';
  postsCount?: number;
  followersCount?: number;
  followingCount?: number;
  needsUsernameSetup?: boolean;
  isPrivate?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function generateRandomPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 32; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// ─── Email signup (Firebase email link verification) ──────────────────────

const SIGNUP_EMAIL_TEMP_PASSWORD_KEY = 'signupEmailTempPassword';

/**
 * Create Firebase Auth account with temp password + send verification email.
 * Called when user enters their email. Stores temp password in AsyncStorage
 * so we can re-authenticate later when setting the real password.
 */
export async function createEmailAuthAccount(email: string): Promise<string> {
  try {
    const tempPassword = generateRandomPassword();
    const userCredential = await createUserWithEmailAndPassword(auth, email, tempPassword);
    await sendEmailVerification(userCredential.user);
    await AsyncStorage.setItem(SIGNUP_EMAIL_TEMP_PASSWORD_KEY, tempPassword);
    return userCredential.user.uid;
  } catch (error: any) {
    console.error('Create auth account error:', error);
    throw error;
  }
}

/**
 * Try to resume an incomplete email signup (Auth account exists, no Firestore profile).
 */
export async function tryResumeEmailSignup(email: string): Promise<'resume' | 'registered' | 'none'> {
  try {
    const tempPassword = await AsyncStorage.getItem(SIGNUP_EMAIL_TEMP_PASSWORD_KEY);
    if (!tempPassword) return 'none';

    await signInWithEmailAndPassword(auth, email, tempPassword);
    const profile = await getUserProfile(auth.currentUser!.uid);

    if (profile) return 'registered';
    return 'resume';
  } catch {
    return 'none';
  }
}

/**
 * Complete email signup: re-auth with temp password, set real password, create Firestore profile.
 * Called at the end of the signup flow. auth.currentUser already exists from createEmailAuthAccount.
 */
export async function completeEmailSignup(data: {
  username: string;
  email: string;
  dateOfBirth: string;
  avatar?: string;
  coverPhoto?: string;
  password: string;
}): Promise<UserProfile> {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('No authenticated user found');

    // Re-authenticate to satisfy Firebase's recent-login requirement
    const tempPassword = await AsyncStorage.getItem(SIGNUP_EMAIL_TEMP_PASSWORD_KEY);
    if (tempPassword && user.email) {
      const credential = EmailAuthProvider.credential(user.email, tempPassword);
      await reauthenticateWithCredential(user, credential);
    }

    await updateProfile(user, { displayName: data.username });
    await updatePassword(user, data.password);
    await AsyncStorage.removeItem(SIGNUP_EMAIL_TEMP_PASSWORD_KEY);

    const userProfile: UserProfile = {
      id: user.uid,
      email: data.email,
      username: data.username,
      usernameLower: data.username.toLowerCase(),
      avatar: data.avatar || '',
      ...(data.coverPhoto ? { coverPhoto: data.coverPhoto } : {}),
      bio: '',
      discordLink: '',
      instagramLink: '',
      provider: 'email',
      postsCount: 0,
      followersCount: 0,
      followingCount: 0,
      dateOfBirth: data.dateOfBirth,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    await setDoc(doc(db, 'users', user.uid), userProfile);
    return userProfile;
  } catch (error: any) {
    console.error('Complete signup error:', error);
    throw new Error(getAuthErrorMessage(error.code));
  }
}

// ─── Phone signup ─────────────────────────────────────────────────────────

const SIGNUP_TEMP_PASSWORD_KEY = 'signupTempPassword';
const SIGNUP_PHONE_KEY = 'signupPhone';

/**
 * Create Firebase Auth account for phone signup (no Firestore doc yet).
 * Called after phone OTP verification succeeds.
 */
export async function createPhoneAuthAccount(phoneNumber: string): Promise<string> {
  try {
    const sanitized = phoneNumber.replace(/[^0-9]/g, '');
    const generatedEmail = `phone_${sanitized}@peakd-phone.internal`;
    const tempPassword = generateRandomPassword();
    const userCredential = await createUserWithEmailAndPassword(auth, generatedEmail, tempPassword);
    await AsyncStorage.setItem(SIGNUP_TEMP_PASSWORD_KEY, tempPassword);
    await AsyncStorage.setItem(SIGNUP_PHONE_KEY, phoneNumber);
    return userCredential.user.uid;
  } catch (error: any) {
    console.error('Create phone auth account error:', error);
    throw error;
  }
}

/**
 * Try to resume an incomplete phone signup.
 */
export async function tryResumePhoneSignup(phoneNumber: string): Promise<'resume' | 'registered' | 'none'> {
  try {
    const tempPassword = await AsyncStorage.getItem(SIGNUP_TEMP_PASSWORD_KEY);
    if (!tempPassword) return 'none';

    const sanitized = phoneNumber.replace(/[^0-9]/g, '');
    const generatedEmail = `phone_${sanitized}@peakd-phone.internal`;

    await signInWithEmailAndPassword(auth, generatedEmail, tempPassword);
    const profile = await getUserProfile(auth.currentUser!.uid);

    if (profile) return 'registered';
    return 'resume';
  } catch {
    return 'none';
  }
}

/**
 * Complete phone signup: set real password + create Firestore profile.
 */
export async function completePhoneSignup(data: {
  username: string;
  phoneNumber: string;
  dateOfBirth: string;
  avatar?: string;
  coverPhoto?: string;
  password: string;
}): Promise<UserProfile> {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('No authenticated user found');

    // Re-authenticate to satisfy Firebase's recent-login requirement
    const tempPassword = await AsyncStorage.getItem(SIGNUP_TEMP_PASSWORD_KEY);
    if (tempPassword && user.email) {
      const credential = EmailAuthProvider.credential(user.email, tempPassword);
      await reauthenticateWithCredential(user, credential);
    }

    await updateProfile(user, { displayName: data.username });
    await updatePassword(user, data.password);
    await AsyncStorage.multiRemove([SIGNUP_TEMP_PASSWORD_KEY, SIGNUP_PHONE_KEY]);

    const userProfile: UserProfile = {
      id: user.uid,
      email: '',
      username: data.username,
      usernameLower: data.username.toLowerCase(),
      avatar: data.avatar || '',
      ...(data.coverPhoto ? { coverPhoto: data.coverPhoto } : {}),
      bio: '',
      discordLink: '',
      instagramLink: '',
      phoneNumber: data.phoneNumber,
      phoneVerified: true,
      provider: 'phone',
      postsCount: 0,
      followersCount: 0,
      followingCount: 0,
      dateOfBirth: data.dateOfBirth,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    await setDoc(doc(db, 'users', user.uid), userProfile);
    return userProfile;
  } catch (error: any) {
    console.error('Complete phone signup error:', error);
    throw new Error(getAuthErrorMessage(error.code));
  }
}

// ─── Passwordless email link sign-in ──────────────────────────────────────

export async function sendEmailSignInLink(email: string): Promise<void> {
  try {
    const actionCodeSettings = {
      url: `https://${process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN}`,
      handleCodeInApp: true,
      iOS: { bundleId: 'com.jininc3.Peakd' },
      android: { packageName: 'com.jininc3.Peakd', installApp: true },
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    await AsyncStorage.setItem('emailForSignIn', email);
  } catch (error: any) {
    console.error('Send sign-in link error:', error);
    throw new Error(getAuthErrorMessage(error.code));
  }
}

export async function completeEmailLinkSignIn(link: string): Promise<UserProfile | null> {
  try {
    if (!isSignInWithEmailLink(auth, link)) return null;

    const email = await AsyncStorage.getItem('emailForSignIn');
    if (!email) throw new Error('Email not found. Please try signing in again.');

    const userCredential = await signInWithEmailLink(auth, email, link);
    await AsyncStorage.removeItem('emailForSignIn');
    return await getUserProfile(userCredential.user.uid);
  } catch (error: any) {
    console.error('Email link sign-in error:', error);
    throw new Error(getAuthErrorMessage(error.code));
  }
}

export function isEmailSignInLink(link: string): boolean {
  return isSignInWithEmailLink(auth, link);
}

// ─── Standard sign-in ─────────────────────────────────────────────────────

export async function signInWithEmail(
  email: string,
  password: string
): Promise<UserProfile> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const userProfile = await getUserProfile(user.uid);

    if (!userProfile) {
      const newProfile: UserProfile = {
        id: user.uid,
        email: user.email!,
        username: user.displayName || user.email!.split('@')[0],
        usernameLower: (user.displayName || user.email!.split('@')[0]).toLowerCase(),
        bio: '',
        discordLink: '',
        instagramLink: '',
        provider: 'email',
        postsCount: 0,
        followersCount: 0,
        followingCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await setDoc(doc(db, 'users', user.uid), newProfile);
      return newProfile;
    }

    return userProfile;
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw new Error(getAuthErrorMessage(error.code));
  }
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// ─── Google sign-in ───────────────────────────────────────────────────────

export async function signInWithGoogleCredential(idToken: string): Promise<UserProfile> {
  try {
    const googleCredential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, googleCredential);
    const user = userCredential.user;

    let userProfile = await getUserProfile(user.uid);

    if (!userProfile) {
      userProfile = {
        id: user.uid,
        email: user.email!,
        username: user.displayName || user.email!.split('@')[0],
        usernameLower: (user.displayName || user.email!.split('@')[0]).toLowerCase(),
        bio: '',
        discordLink: '',
        instagramLink: '',
        provider: 'google',
        postsCount: 0,
        followersCount: 0,
        followingCount: 0,
        needsUsernameSetup: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await setDoc(doc(db, 'users', user.uid), userProfile);
    }

    return userProfile;
  } catch (error: any) {
    console.error('Google sign in error:', error);
    throw new Error('Failed to sign in with Google');
  }
}

// ─── Apple sign-in ────────────────────────────────────────────────────────

export async function signInWithAppleCredential(
  identityToken: string,
  rawNonce: string
): Promise<UserProfile> {
  try {
    const appleProvider = new OAuthProvider('apple.com');
    const oauthCredential = appleProvider.credential({
      idToken: identityToken,
      rawNonce: rawNonce,
    });
    const userCredential = await signInWithCredential(auth, oauthCredential);
    const user = userCredential.user;

    let userProfile = await getUserProfile(user.uid);

    if (!userProfile) {
      userProfile = {
        id: user.uid,
        email: user.email || '',
        username: user.displayName || user.email?.split('@')[0] || 'User',
        usernameLower: (user.displayName || user.email?.split('@')[0] || 'user').toLowerCase(),
        bio: '',
        discordLink: '',
        instagramLink: '',
        provider: 'apple',
        postsCount: 0,
        followersCount: 0,
        followingCount: 0,
        needsUsernameSetup: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await setDoc(doc(db, 'users', user.uid), userProfile);
    }

    return userProfile;
  } catch (error: any) {
    console.error('Apple sign in error:', error);
    throw new Error('Failed to sign in with Apple');
  }
}

// ─── Sign out & account deletion ──────────────────────────────────────────

export async function signOut(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Sign out error:', error);
    throw new Error('Failed to sign out');
  }
}

export async function deleteIncompleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    console.log('No user to delete');
    return;
  }

  const userId = user.uid;

  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (firestoreError) {
    console.error('Error deleting Firestore document:', firestoreError);
  }

  await deleteUser(user);
  console.log('Deleted Firebase Auth account for user:', userId);
}

// ─── User profile helpers ─────────────────────────────────────────────────

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as UserProfile;
    }

    return null;
  } catch (error) {
    console.error('Get user profile error:', error);
    return null;
  }
}

export async function updateUserProfile(
  userId: string,
  data: {
    username?: string;
    bio?: string;
    discordLink?: string;
    instagramLink?: string;
    avatar?: string;
    coverPhoto?: string;
    coverPhotoColor?: string;
  }
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const updateData: Record<string, any> = { ...data };
    if (updateData.username) {
      updateData.usernameLower = updateData.username.toLowerCase();
    }
    await updateDoc(userRef, { ...updateData, updatedAt: new Date() });

    // Propagate avatar change to denormalized copies
    if (data.avatar !== undefined) {
      propagateAvatarToParties(userId, data.avatar).catch((err) =>
        console.error('Error propagating avatar to parties:', err)
      );
      propagateAvatarToDuoPosts(userId, data.avatar).catch((err) =>
        console.error('Error propagating avatar to duo posts:', err)
      );
    }
  } catch (error: any) {
    console.error('Update user profile error:', error);
    throw new Error('Failed to update profile');
  }
}

/**
 * Update avatar in all party memberDetails arrays the user belongs to.
 */
async function propagateAvatarToParties(userId: string, newAvatar: string): Promise<void> {
  const partiesQuery = query(
    collection(db, 'parties'),
    where('members', 'array-contains', userId)
  );
  const snapshot = await getDocs(partiesQuery);

  const updates = snapshot.docs.map(async (partyDoc) => {
    const partyData = partyDoc.data();
    if (!Array.isArray(partyData.memberDetails)) return;

    const memberIndex = partyData.memberDetails.findIndex(
      (m: any) => m.userId === userId
    );
    if (memberIndex === -1) return;

    const updatedMembers = [...partyData.memberDetails];
    updatedMembers[memberIndex] = {
      ...updatedMembers[memberIndex],
      avatar: newAvatar,
    };
    await updateDoc(partyDoc.ref, { memberDetails: updatedMembers });
  });

  await Promise.all(updates);
}

/**
 * Update avatar in the user's active duo posts.
 */
async function propagateAvatarToDuoPosts(userId: string, newAvatar: string): Promise<void> {
  const postIds = [`${userId}_valorant`, `${userId}_league`];
  const updates = postIds.map(async (postId) => {
    const postRef = doc(db, 'duoPosts', postId);
    const postDoc = await getDoc(postRef);
    if (postDoc.exists()) {
      await updateDoc(postRef, { avatar: newAvatar });
    }
  });
  await Promise.all(updates);
}

export function getCurrentUser(): FirebaseUser | null {
  return auth.currentUser;
}

function getAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'This email is already registered';
    case 'auth/invalid-email':
      return 'Invalid email address';
    case 'auth/operation-not-allowed':
      return 'Operation not allowed';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 6 characters';
    case 'auth/user-disabled':
      return 'This account has been disabled';
    case 'auth/user-not-found':
      return 'No account found with this email';
    case 'auth/wrong-password':
      return 'Incorrect password';
    case 'auth/invalid-credential':
      return 'Invalid email or password';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later';
    default:
      return 'An error occurred. Please try again';
  }
}
