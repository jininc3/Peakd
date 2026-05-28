import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { getUserProfile, signOut as authSignOut } from '@/services/authService';
import type { UserProfile } from '@/services/authService';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { getFollowing } from '@/services/followService';
import { getBlockedUsers, getBlockedByUserIds } from '@/services/blockService';
import { getReportedPostIds } from '@/services/reportService';
import { Image } from 'react-native';
import { registerForPushNotificationsAsync } from '@/services/notificationService';
import { clearLeagueStatsCache } from '@/services/riotService';

interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  coverPhoto?: string;
  coverPhotoColor?: string;
  bio?: string;
  discordLink?: string;
  instagramLink?: string;
  postsCount?: number;
  followersCount?: number;
  followingCount?: number;
  needsUsernameSetup?: boolean;
  isPrivate?: boolean;
  provider: 'email' | 'google' | 'apple' | 'phone' | 'discord' | 'instagram';
  interests?: string[];
  showRankOnPosts?: boolean;
}

interface Post {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  mediaUrl: string;
  mediaUrls?: string[];
  mediaType: 'image' | 'video';
  mediaTypes?: string[];
  thumbnailUrl?: string;
  caption?: string;
  taggedPeople?: any[];
  taggedGame?: string;
  createdAt: Timestamp;
  likes: number;
  commentsCount?: number;
  leagueRank?: string;
  valorantRank?: string;
  showRankOnPosts?: boolean;
  categories?: string[];
}

interface SearchUser {
  id: string;
  username: string;
  avatar?: string;
  bio?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  leagueRank?: string;
  valorantRank?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  preloadedPosts: Post[] | null;
  preloadedFollowingIds: string[] | null;
  preloadedSearchHistory: SearchUser[] | null;
  preloadedProfilePosts: Post[] | null;
  preloadedRiotStats: any | null;
  newlyFollowedUserPosts: Post[] | null;
  newlyFollowedUserId: string | null;
  newlyUnfollowedUserId: string | null;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  needsUsernameSetup: boolean;
  clearPreloadedPosts: () => void;
  clearPreloadedSearchHistory: () => void;
  clearPreloadedProfileData: () => void;
  setNewlyFollowedUserPosts: (posts: Post[], userId: string) => void;
  clearNewlyFollowedUserPosts: () => void;
  setNewlyUnfollowedUserId: (userId: string) => void;
  clearNewlyUnfollowedUserId: () => void;
  isUserBlocked: (userId: string) => boolean;
  addBlockedUser: (userId: string) => void;
  removeBlockedUser: (userId: string) => void;
  isPostReported: (postId: string) => boolean;
  addReportedPost: (postId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [preloadedPosts, setPreloadedPosts] = useState<Post[] | null>(null);
  const [preloadedSearchHistory, setPreloadedSearchHistory] = useState<SearchUser[] | null>(null);
  const [preloadedProfilePosts, setPreloadedProfilePosts] = useState<Post[] | null>(null);
  const [preloadedRiotStats, setPreloadedRiotStats] = useState<any | null>(null);
  const [newlyFollowedUserPosts, setNewlyFollowedUserPostsState] = useState<Post[] | null>(null);
  const [newlyFollowedUserId, setNewlyFollowedUserIdState] = useState<string | null>(null);
  const [preloadedFollowingIds, setPreloadedFollowingIds] = useState<string[] | null>(null);
  const [newlyUnfollowedUserId, setNewlyUnfollowedUserIdState] = useState<string | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [blockedByUserIds, setBlockedByUserIds] = useState<Set<string>>(new Set());
  const [reportedPostIds, setReportedPostIds] = useState<Set<string>>(new Set());
  // Immediately transition to home screen (skeleton shimmer shows there)
  const setLoadingFalse = () => {
    setIsLoading(false);
  };

  // Preload feed posts while loading screen is shown
  const preloadFeed = async (userId: string, blocked?: Set<string>, blockedBy?: Set<string>) => {
    try {
      const POSTS_PER_PAGE = 8;

      // Get following users
      const followingData = await getFollowing(userId);
      let userIds = followingData.map(follow => follow.followingId);

      // Remove current user and blocked users from the list
      userIds = userIds.filter(id => id !== userId);
      if (blocked && blockedBy) {
        userIds = userIds.filter(id => !blocked.has(id) && !blockedBy.has(id));
      }

      // Store following IDs so home screen doesn't need to re-fetch
      setPreloadedFollowingIds(userIds);

      if (userIds.length === 0) {
        setPreloadedPosts([]);
        return;
      }

      // Batch queries (Firestore 'in' limited to 10 items)
      const batchSize = 10;
      const batches: string[][] = [];
      for (let i = 0; i < userIds.length; i += batchSize) {
        batches.push(userIds.slice(i, i + batchSize));
      }

      let allBatchPosts: any[] = [];

      // Fetch posts from each batch
      for (const batch of batches) {
        const q = query(
          collection(db, 'posts'),
          where('userId', 'in', batch),
          orderBy('createdAt', 'desc'),
          limit(POSTS_PER_PAGE * 2)
        );

        const snapshot = await getDocs(q);
        const batchPosts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Post));

        allBatchPosts = [...allBatchPosts, ...batchPosts];
      }

      // Sort all posts by date
      allBatchPosts.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

      // Take only what we need (8 posts)
      const postsToShow = allBatchPosts.slice(0, POSTS_PER_PAGE);

      // Enrich posts with user avatar and rank data (so home screen doesn't need to)
      const uniquePostUserIds = [...new Set(postsToShow.map((p: Post) => p.userId))];
      const userDataMap = new Map<string, any>();
      const userBatchSize = 10;
      for (let i = 0; i < uniquePostUserIds.length; i += userBatchSize) {
        const batch = uniquePostUserIds.slice(i, i + userBatchSize);
        try {
          const userQuery = query(
            collection(db, 'users'),
            where('__name__', 'in', batch)
          );
          const userSnapshot = await getDocs(userQuery);
          userSnapshot.docs.forEach(doc => {
            userDataMap.set(doc.id, doc.data());
          });
        } catch (error) {
          console.error('Error batch fetching users for enrichment:', error);
        }
      }

      const enrichedPosts = postsToShow.map((post: Post) => {
        const userData = userDataMap.get(post.userId);
        if (userData) {
          let leagueRank = undefined;
          let valorantRank = undefined;
          if (userData.riotStats?.rankedSolo) {
            leagueRank = `${userData.riotStats.rankedSolo.tier} ${userData.riotStats.rankedSolo.rank}`;
          }
          if (userData.valorantStats?.currentRank) {
            valorantRank = userData.valorantStats.currentRank;
          }
          return {
            ...post,
            avatar: userData.avatar || post.avatar || null,
            leagueRank,
            valorantRank,
            showRankOnPosts: userData.showRankOnPosts ?? false,
          };
        }
        return post;
      });

      setPreloadedPosts(enrichedPosts);
      console.log(`✅ Preloaded ${enrichedPosts.length} posts (enriched)`);

      // Prefetch feed images for instant rendering
      const imageUrls: string[] = [];
      enrichedPosts.forEach((post: Post) => {
        if (post.avatar) {
          imageUrls.push(post.avatar);
        }
        if (post.mediaType === 'video' && post.thumbnailUrl) {
          imageUrls.push(post.thumbnailUrl);
        } else if (post.mediaUrl) {
          imageUrls.push(post.mediaUrl);
        }
        if (post.mediaUrls && post.mediaUrls.length > 1) {
          post.mediaUrls.forEach(url => imageUrls.push(url));
        }
      });

      // Prefetch all images in parallel (don't await - run in background)
      if (imageUrls.length > 0) {
        Promise.all(
          imageUrls.map(url => Image.prefetch(url).catch(() => {}))
        );
      }
    } catch (error) {
      console.error('Error preloading feed:', error);
      setPreloadedPosts([]);
    }
  };

  // Preload search history while loading screen is shown
  const preloadSearchHistory = async (userId: string) => {
    try {
      const MAX_HISTORY_ITEMS = 7;

      const historyRef = collection(db, 'users', userId, 'searchHistory');
      const q = query(historyRef, orderBy('searchedAt', 'desc'), limit(MAX_HISTORY_ITEMS));
      const querySnapshot = await getDocs(q);

      const history: SearchUser[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        history.push({
          id: doc.id,
          username: data.username,
          avatar: data.avatar,
          bio: data.bio,
          followersCount: data.followersCount,
          followingCount: data.followingCount,
          postsCount: data.postsCount,
          leagueRank: data.leagueRank,
          valorantRank: data.valorantRank,
        });
      });

      setPreloadedSearchHistory(history);
    } catch (error) {
      console.error('Error preloading search history:', error);
      setPreloadedSearchHistory([]);
    }
  };

  // Preload profile posts and Riot stats while loading screen is shown
  const preloadProfileData = async (userId: string, userProfile?: any) => {
    try {
      // Prefetch user's avatar and cover photo in background (non-blocking)
      const headerImages: string[] = [];
      if (userProfile?.avatar) {
        headerImages.push(userProfile.avatar);
      }
      if (userProfile?.coverPhoto) {
        headerImages.push(userProfile.coverPhoto);
      }
      if (headerImages.length > 0) {
        Promise.all(
          headerImages.map(url => Image.prefetch(url).catch(() => {}))
        );
      }

      // Preload user's posts
      const postsQuery = query(
        collection(db, 'posts'),
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(postsQuery);
      const fetchedPosts: Post[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Post));

      // Sort by newest first
      fetchedPosts.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      setPreloadedProfilePosts(fetchedPosts);
      console.log(`✅ Preloaded ${fetchedPosts.length} profile posts`);

      // Prefetch images for instant rendering
      const imageUrls: string[] = [];
      fetchedPosts.forEach(post => {
        // Add thumbnail for videos, or main image for images
        if (post.mediaType === 'video' && post.thumbnailUrl) {
          imageUrls.push(post.thumbnailUrl);
        } else if (post.mediaUrl) {
          imageUrls.push(post.mediaUrl);
        }
        // Also prefetch additional media if present
        if (post.mediaUrls && post.mediaUrls.length > 1) {
          post.mediaUrls.forEach(url => imageUrls.push(url));
        }
      });

      // Prefetch all images in parallel (don't await - run in background)
      if (imageUrls.length > 0) {
        Promise.all(
          imageUrls.map(url => Image.prefetch(url).catch(() => {}))
        );
      }

      // Use cached Riot stats from Firestore (no cloud function call during preload)
      try {
        const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
        if (!userDoc.empty) {
          const userData = userDoc.docs[0].data();
          if (userData.riotStats) {
            setPreloadedRiotStats(userData.riotStats);
          }
        }
      } catch (error) {
        setPreloadedRiotStats(null);
      }
    } catch (error) {
      console.error('Error preloading profile data:', error);
      setPreloadedProfilePosts([]);
    }
  };

  useEffect(() => {
    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Check email verification for email providers (skip phone users with internal emails)
        const isEmailProvider = firebaseUser.providerData.some(p => p.providerId === 'password');
        const isPhoneUser = firebaseUser.email?.endsWith('@peakd-phone.internal');
        if (isEmailProvider && !isPhoneUser && !firebaseUser.emailVerified) {
          // Email signup users must verify their email first
          // Don't set user state - keeps them in auth screens
          setUser(null);
          setLoadingFalse();
          return;
        }

        // User is signed in, get their profile
        try {
          const userProfile = await getUserProfile(firebaseUser.uid);

          if (userProfile) {
            setUser({
              id: userProfile.id,
              username: userProfile.username,
              email: userProfile.email,
              avatar: userProfile.avatar,
              coverPhoto: userProfile.coverPhoto,
              coverPhotoColor: userProfile.coverPhotoColor,
              bio: userProfile.bio,
              discordLink: userProfile.discordLink,
              instagramLink: userProfile.instagramLink,
              postsCount: userProfile.postsCount || 0,
              followersCount: userProfile.followersCount || 0,
              followingCount: userProfile.followingCount || 0,
              needsUsernameSetup: userProfile.needsUsernameSetup || false,
              isPrivate: userProfile.isPrivate || false,
              provider: userProfile.provider,
              interests: (userProfile as any).interests || [],
            });

            // Preload feed before showing home page; others run in background
            if (!userProfile.needsUsernameSetup) {
              // Load block lists and reported posts before feed so they are filtered
              let blocked = new Set<string>();
              let blockedBy = new Set<string>();
              try {
                const [blockedData, blockedByData, reportedIds] = await Promise.all([
                  getBlockedUsers(userProfile.id),
                  getBlockedByUserIds(userProfile.id),
                  getReportedPostIds(userProfile.id),
                ]);
                blocked = new Set(blockedData.map(b => b.blockedUserId));
                blockedBy = new Set(blockedByData);
                setBlockedUserIds(blocked);
                setBlockedByUserIds(blockedBy);
                setReportedPostIds(new Set(reportedIds));
              } catch (e) {
                console.log('Block/report lists not available yet, continuing without filtering');
              }

              await preloadFeed(userProfile.id, blocked, blockedBy);
              // Don't block home page for search/profile data
              preloadSearchHistory(userProfile.id).catch(() => {});
              preloadProfileData(userProfile.id, userProfile).catch(() => {});
            }

            // Register for push notifications (run in background, don't block loading)
            registerForPushNotificationsAsync(userProfile.id).catch(error => {
              console.error('Error registering for push notifications:', error);
            });
          } else {
            // Fallback if profile doesn't exist (new user or race condition)
            const isGoogleUser = firebaseUser.providerData.some(p => p.providerId === 'google.com');
            const isAppleUser = firebaseUser.providerData.some(p => p.providerId === 'apple.com');
            const isEmailProvider = firebaseUser.providerData.some(p => p.providerId === 'password');

            // Email users without verified email should not get user state (skip phone users)
            if (isEmailProvider && !firebaseUser.email?.endsWith('@peakd-phone.internal') && !firebaseUser.emailVerified) {
              setUser(null);
              setLoadingFalse();
              return;
            }

            // Phone users mid-signup (no profile yet) — keep them in auth screens
            if (isEmailProvider && firebaseUser.email?.endsWith('@peakd-phone.internal') && !isGoogleUser && !isAppleUser) {
              setUser(null);
              setLoadingFalse();
              return;
            }

            setUser({
              id: firebaseUser.uid,
              username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              email: firebaseUser.email || '',
              avatar: firebaseUser.photoURL || undefined,
              needsUsernameSetup: isGoogleUser || isAppleUser,
              provider: isAppleUser ? 'apple' : isGoogleUser ? 'google' : 'email',
              interests: [],
            });

            // Preload feed before showing home page; others run in background
            if (!isGoogleUser && !isAppleUser) {
              let blocked = new Set<string>();
              let blockedBy = new Set<string>();
              try {
                const [blockedData, blockedByData, reportedIds] = await Promise.all([
                  getBlockedUsers(firebaseUser.uid),
                  getBlockedByUserIds(firebaseUser.uid),
                  getReportedPostIds(firebaseUser.uid),
                ]);
                blocked = new Set(blockedData.map(b => b.blockedUserId));
                blockedBy = new Set(blockedByData);
                setBlockedUserIds(blocked);
                setBlockedByUserIds(blockedBy);
                setReportedPostIds(new Set(reportedIds));
              } catch (e) {
                console.log('Block/report lists not available yet, continuing without filtering');
              }

              await preloadFeed(firebaseUser.uid, blocked, blockedBy);
              preloadSearchHistory(firebaseUser.uid).catch(() => {});
              preloadProfileData(firebaseUser.uid, {
                avatar: firebaseUser.photoURL,
                coverPhoto: undefined,
              }).catch(() => {});
            }

            // Register for push notifications (run in background, don't block loading)
            registerForPushNotificationsAsync(firebaseUser.uid).catch(error => {
              console.error('Error registering for push notifications:', error);
            });
          }
        } catch (error) {
          console.error('Error loading user profile:', error);
          setUser(null);
        }
      } else {
        // User is signed out
        setUser(null);
      }
      setLoadingFalse();
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const refreshUser = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    try {
      const userProfile = await getUserProfile(currentUser.uid);
      if (userProfile) {
        setUser({
          id: userProfile.id,
          username: userProfile.username,
          email: userProfile.email,
          avatar: userProfile.avatar,
          coverPhoto: userProfile.coverPhoto,
          coverPhotoColor: userProfile.coverPhotoColor,
          bio: userProfile.bio,
          discordLink: userProfile.discordLink,
          instagramLink: userProfile.instagramLink,
          postsCount: userProfile.postsCount || 0,
          followersCount: userProfile.followersCount || 0,
          followingCount: userProfile.followingCount || 0,
          needsUsernameSetup: userProfile.needsUsernameSetup || false,
          isPrivate: userProfile.isPrivate || false,
          provider: userProfile.provider,
          interests: (userProfile as any).interests || [],
        });
      }
    } catch (error) {
      console.error('Error refreshing user profile:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      // Don't unregister push notifications on logout
      // Users should keep their tokens so they can receive notifications
      // Tokens will be automatically cleaned up if they become invalid

      await authSignOut();
      clearLeagueStatsCache();
      setUser(null);
      setPreloadedPosts(null);
      setPreloadedFollowingIds(null);
      setPreloadedSearchHistory(null);
      setPreloadedProfilePosts(null);
      setPreloadedRiotStats(null);
      setBlockedUserIds(new Set());
      setBlockedByUserIds(new Set());
      setReportedPostIds(new Set());
    } catch (error) {
      console.error('Failed to sign out:', error);
      throw error;
    }
  };

  const clearPreloadedPosts = () => {
    setPreloadedPosts(null);
  };

  const clearPreloadedSearchHistory = () => {
    setPreloadedSearchHistory(null);
  };

  const clearPreloadedProfileData = () => {
    setPreloadedProfilePosts(null);
    setPreloadedRiotStats(null);
  };

  const setNewlyFollowedUserPosts = (posts: Post[], userId: string) => {
    setNewlyFollowedUserPostsState(posts);
    setNewlyFollowedUserIdState(userId);
  };

  const clearNewlyFollowedUserPosts = () => {
    setNewlyFollowedUserPostsState(null);
    setNewlyFollowedUserIdState(null);
  };

  const setNewlyUnfollowedUserId = (userId: string) => {
    setNewlyUnfollowedUserIdState(userId);
  };

  const clearNewlyUnfollowedUserId = () => {
    setNewlyUnfollowedUserIdState(null);
  };

  const isUserBlocked = (userId: string): boolean => {
    return blockedUserIds.has(userId) || blockedByUserIds.has(userId);
  };

  const addBlockedUser = (userId: string) => {
    setBlockedUserIds(prev => new Set([...prev, userId]));
  };

  const removeBlockedUser = (userId: string) => {
    setBlockedUserIds(prev => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  };

  const isPostReported = (postId: string): boolean => {
    return reportedPostIds.has(postId);
  };

  const addReportedPost = (postId: string) => {
    setReportedPostIds(prev => new Set([...prev, postId]));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        preloadedPosts,
        preloadedFollowingIds,
        preloadedSearchHistory,
        preloadedProfilePosts,
        preloadedRiotStats,
        newlyFollowedUserPosts,
        newlyFollowedUserId,
        newlyUnfollowedUserId,
        setUser,
        refreshUser,
        signOut: handleSignOut,
        isAuthenticated: !!user,
        needsUsernameSetup: !!user?.needsUsernameSetup,
        clearPreloadedPosts,
        clearPreloadedSearchHistory,
        clearPreloadedProfileData,
        setNewlyFollowedUserPosts,
        clearNewlyFollowedUserPosts,
        setNewlyUnfollowedUserId,
        clearNewlyUnfollowedUserId,
        isUserBlocked,
        addBlockedUser,
        removeBlockedUser,
        isPostReported,
        addReportedPost,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
