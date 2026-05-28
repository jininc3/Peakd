import { ThemedView } from '@/components/themed-view';
import { useRouter } from '@/hooks/useRouter';
import { useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import PostViewerModal from '@/app/components/postViewerModal';
import ReportPostModal from '@/app/components/reportPostModal';
import { Timestamp } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';

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
  taggedPeople?: string[];
  taggedGame?: string;
  createdAt: Timestamp;
  likes: number;
  commentsCount?: number;
}

export default function PostViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user: currentUser, addReportedPost } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [startIndex, setStartIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [reportingPost, setReportingPost] = useState<Post | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const postId = params.postId as string;
  const allPostIdsRaw = params.allPostIds as string | undefined;

  useEffect(() => {
    const parsePost = (postSnap: any): Post => {
      const postData = postSnap.data();
      return {
        id: postSnap.id,
        userId: postData.userId,
        username: postData.username,
        avatar: postData.avatar,
        mediaUrl: postData.mediaUrl,
        mediaUrls: postData.mediaUrls,
        mediaType: postData.mediaType,
        mediaTypes: postData.mediaTypes,
        thumbnailUrl: postData.thumbnailUrl,
        caption: postData.caption,
        taggedPeople: postData.taggedPeople,
        taggedGame: postData.taggedGame,
        createdAt: postData.createdAt,
        likes: postData.likes || 0,
        commentsCount: postData.commentsCount || 0,
      };
    };

    const fetchPosts = async () => {
      if (!postId) {
        router.back();
        return;
      }

      try {
        let postIds: string[] = [];
        if (allPostIdsRaw) {
          try { postIds = JSON.parse(allPostIdsRaw); } catch {}
        }

        if (postIds.length > 1) {
          // Fetch all posts
          const snapshots = await Promise.all(
            postIds.map(id => getDoc(doc(db, 'posts', id)))
          );
          const fetched = snapshots
            .filter(snap => snap.exists())
            .map(snap => parsePost(snap));
          const idx = fetched.findIndex(p => p.id === postId);
          setAllPosts(fetched);
          setStartIndex(idx >= 0 ? idx : 0);
          setPost(fetched[idx >= 0 ? idx : 0] || null);
          setShowModal(true);
        } else {
          // Single post
          const postSnap = await getDoc(doc(db, 'posts', postId));
          if (postSnap.exists()) {
            const fetchedPost = parsePost(postSnap);
            setPost(fetchedPost);
            setAllPosts([fetchedPost]);
            setStartIndex(0);
            setShowModal(true);
          } else {
            router.back();
          }
        }
      } catch (error) {
        console.error('Error fetching post:', error);
        router.back();
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [postId]);

  const handleClose = () => {
    router.back();
  };

  if (loading) {
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </ThemedView>
    );
  }

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
      {post && (
        <PostViewerModal
          visible={true}
          useModal={false}
          post={post}
          posts={allPosts}
          currentIndex={startIndex}
          userAvatar={currentUser?.avatar}
          onClose={handleClose}
          onReport={(p) => {
            setReportingPost(p);
            setShowReportModal(true);
          }}
        />
      )}

      {reportingPost && (
        <ReportPostModal
          visible={showReportModal}
          postId={reportingPost.id}
          postOwnerId={reportingPost.userId}
          postOwnerUsername={reportingPost.username}
          onClose={() => {
            setShowReportModal(false);
            setReportingPost(null);
          }}
          onReported={(postId) => {
            addReportedPost(postId);
            handleClose();
          }}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
