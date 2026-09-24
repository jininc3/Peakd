import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import {
  getAllReports,
  updateReportStatus,
  deleteReportedPost,
  Report,
  ReportStatus,
} from '@/services/reportService';
import { useRouter } from '@/hooks/useRouter';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getFunctions, httpsCallable } from 'firebase/functions';

const ADMIN_IDS = ['VljkZhdkF3gCQI0clVkbQ0XCIxp1'];

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment / Bullying',
  inappropriate: 'Inappropriate Content',
  other: 'Other',
};

const STATUS_COLORS: Record<ReportStatus, string> = {
  pending: '#f59e0b',
  dismissed: '#555',
  actioned: '#22c55e',
};

export default function AdminReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<ReportStatus | undefined>('pending');

  // Guard: only admins
  if (!user?.id || !ADMIN_IDS.includes(user.id)) {
    return (
      <ThemedView style={styles.container}>
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.02)', 'transparent']}
          locations={[0, 0.5, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.topGradient}
          pointerEvents="none"
        />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol size={20} name="chevron.left" color="#fff" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Reports</ThemedText>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <ThemedText style={styles.emptyText}>Access denied</ThemedText>
        </View>
      </ThemedView>
    );
  }

  useEffect(() => {
    fetchReports();
  }, [filterStatus]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await getAllReports(filterStatus);
      setReports(data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = (report: Report) => {
    Alert.alert('Dismiss Report', 'Mark this report as dismissed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss',
        onPress: async () => {
          try {
            await updateReportStatus(report.id, 'dismissed');
            setReports(prev =>
              prev.map(r => (r.id === report.id ? { ...r, status: 'dismissed' as ReportStatus } : r))
            );
          } catch (error) {
            Alert.alert('Error', 'Failed to dismiss report');
          }
        },
      },
    ]);
  };

  const handleDeletePost = (report: Report) => {
    if (!report.postId) return;
    const postId = report.postId;
    Alert.alert(
      'Delete Post',
      `This will permanently delete the post by ${report.postOwnerUsername}. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReportedPost(postId);
              await updateReportStatus(report.id, 'actioned');
              setReports(prev =>
                prev.map(r => (r.id === report.id ? { ...r, status: 'actioned' as ReportStatus } : r))
              );
              Alert.alert('Done', 'Post deleted and report marked as actioned.');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete post');
            }
          },
        },
      ]
    );
  };

  const [deletingAll, setDeletingAll] = useState(false);

  const handleDeleteAllAccounts = () => {
    Alert.alert(
      'Delete ALL Accounts',
      'This will permanently delete every user account, all data, and all auth accounts — including your own. This CANNOT be undone.\n\nAre you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              'Final Confirmation',
              'Type-confirm: This will wipe the entire database. Proceed?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'YES, DELETE ALL',
                  style: 'destructive',
                  onPress: async () => {
                    setDeletingAll(true);
                    try {
                      const functions = getFunctions();
                      const deleteAll = httpsCallable(functions, 'deleteAllAccounts');
                      const result = await deleteAll();
                      const data = result.data as any;
                      Alert.alert(
                        'Complete',
                        `Deleted ${data.deletedCount} accounts. ${data.errorCount} errors.`
                      );
                    } catch (error: any) {
                      console.error('Delete all accounts error:', error);
                      Alert.alert('Error', error.message || 'Failed to delete accounts.');
                    } finally {
                      setDeletingAll(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp?.toDate) return '';
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
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

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol size={20} name="chevron.left" color="#fff" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Reports</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Filter tabs */}
        <View style={styles.filterSection}>
          <View style={styles.filterRow}>
            {(['pending', 'dismissed', 'actioned', undefined] as (ReportStatus | undefined)[]).map((status) => (
              <TouchableOpacity
                key={status ?? 'all'}
                style={[styles.filterTab, filterStatus === status && styles.filterTabActive]}
                onPress={() => setFilterStatus(status)}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.filterTabText, filterStatus === status && styles.filterTabTextActive]}>
                  {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'All'}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={styles.centeredInline}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : reports.length === 0 ? (
          <View style={styles.centeredInline}>
            <IconSymbol size={32} name="checkmark.circle" color="#333" />
            <ThemedText style={styles.emptyText}>No reports found</ThemedText>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <IconSymbol size={18} name="flag.fill" color="#fff" />
              <ThemedText style={styles.sectionHeaderTitle}>
                {filterStatus ? filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1) : 'All'} Reports
              </ThemedText>
              <ThemedText style={styles.countBadge}>{reports.length}</ThemedText>
            </View>
            <View style={styles.settingsGroup}>
              {reports.map((report, index) => (
                <View
                  key={report.id}
                  style={[
                    styles.reportItem,
                    index === reports.length - 1 && styles.reportItemLast,
                  ]}
                >
                  {/* Top row: reason + status */}
                  <View style={styles.reportTopRow}>
                    <View style={styles.reportReasonRow}>
                      <View style={styles.iconContainer}>
                        <IconSymbol
                          size={16}
                          name={
                            report.reason === 'spam' ? 'xmark.bin' :
                            report.reason === 'harassment' ? 'exclamationmark.bubble' :
                            report.reason === 'inappropriate' ? 'eye.slash' :
                            'questionmark.circle'
                          }
                          color="#888"
                        />
                      </View>
                      <ThemedText style={styles.reasonText}>
                        {REASON_LABELS[report.reason] || report.reason}
                      </ThemedText>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[report.status] + '18' }]}>
                      <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[report.status] }]} />
                      <ThemedText style={[styles.statusText, { color: STATUS_COLORS[report.status] }]}>
                        {report.status}
                      </ThemedText>
                    </View>
                  </View>

                  {/* Additional info */}
                  {report.additionalInfo && (
                    <ThemedText style={styles.additionalInfo} numberOfLines={2}>
                      "{report.additionalInfo}"
                    </ThemedText>
                  )}

                  {/* Users row */}
                  <View style={styles.usersRow}>
                    <View style={styles.userChip}>
                      <ThemedText style={styles.userChipLabel}>By</ThemedText>
                      <ThemedText style={styles.userChipName}>{report.reporterUsername}</ThemedText>
                    </View>
                    <IconSymbol size={12} name="arrow.right" color="#333" />
                    <View style={styles.userChip}>
                      {/* A duo report is about a player, not a post. */}
                      <ThemedText style={styles.userChipLabel}>{report.kind === 'duo' ? 'Duo' : 'Post'}</ThemedText>
                      <ThemedText style={styles.userChipName}>{report.postOwnerUsername}</ThemedText>
                    </View>
                    <ThemedText style={styles.dateText}>{formatDate(report.createdAt)}</ThemedText>
                  </View>

                  {/* Actions */}
                  {report.status === 'pending' && (
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={styles.dismissButton}
                        onPress={() => handleDismiss(report)}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={styles.dismissText}>Dismiss</ThemedText>
                      </TouchableOpacity>
                      {report.postId && (
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => handleDeletePost(report)}
                          activeOpacity={0.7}
                        >
                          <IconSymbol size={14} name="trash" color="#fff" />
                          <ThemedText style={styles.deleteText}>Delete Post</ThemedText>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Danger Zone */}
        <View style={styles.dangerSection}>
          <View style={styles.sectionHeader}>
            <IconSymbol size={18} name="exclamationmark.triangle.fill" color="#c42743" />
            <ThemedText style={[styles.sectionHeaderTitle, { color: '#c42743' }]}>
              Danger Zone
            </ThemedText>
          </View>
          <View style={styles.settingsGroup}>
            <TouchableOpacity
              style={styles.dangerButton}
              onPress={handleDeleteAllAccounts}
              activeOpacity={0.7}
              disabled={deletingAll}
            >
              {deletingAll ? (
                <View style={styles.dangerButtonRow}>
                  <ActivityIndicator size="small" color="#fff" />
                  <ThemedText style={styles.dangerButtonText}>Deleting all accounts...</ThemedText>
                </View>
              ) : (
                <View style={styles.dangerButtonRow}>
                  <IconSymbol size={16} name="trash" color="#fff" />
                  <ThemedText style={styles.dangerButtonText}>Delete All Accounts</ThemedText>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

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
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
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
    textAlign: 'center',
  },
  headerSpacer: {
    flex: 1,
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterTab: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  filterTabActive: {
    backgroundColor: 'rgba(196, 39, 67, 0.15)',
    borderColor: 'rgba(196, 39, 67, 0.4)',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredInline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#555',
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
    flex: 1,
  },
  countBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  settingsGroup: {
    marginHorizontal: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
  },
  reportItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
    gap: 10,
  },
  reportItemLast: {
    borderBottomWidth: 0,
  },
  reportTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  reasonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -0.2,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  additionalInfo: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
    paddingLeft: 42,
  },
  usersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 42,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userChipLabel: {
    fontSize: 11,
    color: '#555',
    fontWeight: '500',
  },
  userChipName: {
    fontSize: 13,
    color: '#ccc',
    fontWeight: '600',
  },
  dateText: {
    fontSize: 11,
    color: '#444',
    marginLeft: 'auto',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 42,
  },
  dismissButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#c42743',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  dangerSection: {
    marginTop: 24,
  },
  dangerButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#c42743',
    borderRadius: 12,
    marginHorizontal: 16,
  },
  dangerButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  bottomSpacer: {
    height: 40,
  },
});
