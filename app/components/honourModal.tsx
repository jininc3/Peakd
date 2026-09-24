import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/AuthContext';
import { blockUser } from '@/services/blockService';
import { HONOUR_TAGS, HonourTagId, dismissHonourPrompt, honourDuo } from '@/services/honourService';
import { reportDuoPartner, ReportReason } from '@/services/reportService';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

/**
 * The answer to an `honour_prompt` notification (see services/honourService.ts).
 *
 * Two questions, never more: honour them or not, and if so, for what. Saying
 * no is silent — nothing negative is ever shown on anyone. A bad teammate is
 * handled privately instead, by the block and report options behind "No".
 * Mirrors Peakd-web/components/HonourModal.tsx.
 */

export interface HonourPrompt {
  id: string;
  playId?: string;
  fromUserId?: string;
  fromUsername?: string;
  fromUserAvatar?: string;
}

type Step = 'ask' | 'tag' | 'declined' | 'report' | 'done';

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Toxic or abusive' },
  { value: 'inappropriate', label: 'Griefing or throwing' },
  { value: 'spam', label: "Didn't show up" },
  { value: 'other', label: 'Something else' },
];

export default function HonourModal({
  prompt,
  onClose,
}: {
  /** The prompt being answered; null hides the sheet. */
  prompt: HonourPrompt | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('ask');
  const [tag, setTag] = useState<HonourTagId | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneText, setDoneText] = useState('');

  // Fresh sheet for each prompt.
  useEffect(() => {
    setStep('ask');
    setTag(null);
    setReason(null);
    setError(null);
    setDoneText('');
  }, [prompt?.id]);

  const partnerName = prompt?.fromUsername || 'your duo';

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (!done) {
        onClose();
        return;
      }
      setDoneText(done);
      setStep('done');
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!prompt || !user) return null;

  const submitHonour = () =>
    tag && prompt.playId && run(() => honourDuo(prompt.playId!, tag), `You honoured ${partnerName}.`);

  const notThisTime = () => run(() => dismissHonourPrompt(user.id, prompt.id), '');

  const block = () =>
    prompt.fromUserId &&
    run(async () => {
      await blockUser(user.id, prompt.fromUserId!, partnerName, prompt.fromUserAvatar);
      await dismissHonourPrompt(user.id, prompt.id);
    }, `You blocked ${partnerName}.`);

  const submitReport = () =>
    reason &&
    prompt.fromUserId &&
    run(async () => {
      await reportDuoPartner({
        reporterId: user.id,
        reporterUsername: user.username,
        reportedUserId: prompt.fromUserId!,
        reportedUsername: partnerName,
        playId: prompt.playId,
        reason,
      });
      await dismissHonourPrompt(user.id, prompt.id);
    }, "Thanks, we'll look into it. They won't know you reported them.");

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <ThemedText style={styles.eyebrow}>HONOUR</ThemedText>
          <ThemedText style={styles.title} numberOfLines={1}>{partnerName}</ThemedText>

          {step === 'ask' && (
            <>
              <ThemedText style={styles.question}>Were they a good teammate?</ThemedText>
              <ThemedText style={styles.subtitle}>Honour them for it. It&apos;s anonymous, and only ever positive.</ThemedText>
            </>
          )}

          {step === 'tag' && (
            <>
              <ThemedText style={styles.question}>What stood out?</ThemedText>
              <View style={styles.tagWrap}>
                {HONOUR_TAGS.map((t) => {
                  const on = tag === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.tag, on && styles.tagOn]}
                      onPress={() => setTag(t.id)}
                      activeOpacity={0.7}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <ThemedText style={[styles.tagText, on && styles.tagTextOn]}>{t.label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {step === 'declined' && (
            <>
              <ThemedText style={styles.question}>Had a problem with them?</ThemedText>
              <ThemedText style={styles.subtitle}>
                Nothing negative is shown on anyone&apos;s profile. If something went wrong, you can block or report them privately.
              </ThemedText>
              <TouchableOpacity style={styles.secondary} onPress={() => setStep('report')} disabled={busy} activeOpacity={0.7}>
                <ThemedText style={styles.secondaryText}>Report</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondary, { marginTop: 8 }]} onPress={block} disabled={busy} activeOpacity={0.7}>
                <ThemedText style={styles.secondaryText}>Block {partnerName}</ThemedText>
              </TouchableOpacity>
            </>
          )}

          {step === 'report' && (
            <>
              <ThemedText style={styles.question}>What happened?</ThemedText>
              {REPORT_REASONS.map((r) => {
                const on = reason === r.value;
                return (
                  <TouchableOpacity key={r.value} style={styles.reasonOption} onPress={() => setReason(r.value)} activeOpacity={0.7}>
                    <View style={styles.radio}>{on && <View style={styles.radioInner} />}</View>
                    <ThemedText style={[styles.reasonText, on && { color: '#fff' }]}>{r.label}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {step === 'done' && <ThemedText style={styles.question}>{doneText}</ThemedText>}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <View style={styles.actions}>
            {step === 'ask' && (
              <>
                <TouchableOpacity style={[styles.secondary, styles.flex]} onPress={() => setStep('declined')} activeOpacity={0.7}>
                  <ThemedText style={styles.secondaryText}>No</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primary, styles.flex]} onPress={() => setStep('tag')} activeOpacity={0.7}>
                  <ThemedText style={styles.primaryText}>Honour</ThemedText>
                </TouchableOpacity>
              </>
            )}
            {step === 'tag' && (
              <>
                <TouchableOpacity style={[styles.secondary, styles.flex]} onPress={() => setStep('ask')} disabled={busy} activeOpacity={0.7}>
                  <ThemedText style={styles.secondaryText}>Back</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primary, styles.flex, (!tag || busy) && styles.disabled]}
                  onPress={submitHonour}
                  disabled={!tag || busy}
                  activeOpacity={0.7}
                >
                  {busy ? <ActivityIndicator size="small" color="#0f0f0f" /> : <ThemedText style={styles.primaryText}>Honour</ThemedText>}
                </TouchableOpacity>
              </>
            )}
            {step === 'declined' && (
              <TouchableOpacity style={[styles.primary, styles.flex]} onPress={notThisTime} disabled={busy} activeOpacity={0.7}>
                {busy ? <ActivityIndicator size="small" color="#0f0f0f" /> : <ThemedText style={styles.primaryText}>Not this time</ThemedText>}
              </TouchableOpacity>
            )}
            {step === 'report' && (
              <>
                <TouchableOpacity style={[styles.secondary, styles.flex]} onPress={() => setStep('declined')} disabled={busy} activeOpacity={0.7}>
                  <ThemedText style={styles.secondaryText}>Back</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primary, styles.flex, (!reason || busy) && styles.disabled]}
                  onPress={submitReport}
                  disabled={!reason || busy}
                  activeOpacity={0.7}
                >
                  {busy ? <ActivityIndicator size="small" color="#0f0f0f" /> : <ThemedText style={styles.primaryText}>Send report</ThemedText>}
                </TouchableOpacity>
              </>
            )}
            {step === 'done' && (
              <TouchableOpacity style={[styles.primary, styles.flex]} onPress={onClose} activeOpacity={0.7}>
                <ThemedText style={styles.primaryText}>Done</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
  content: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#CFAF54',
  },
  handle: { width: 40, height: 4, backgroundColor: '#444', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 3, color: '#CFAF54', marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 16 },
  question: { fontSize: 17, fontWeight: '700', color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#888', lineHeight: 20, marginBottom: 16 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 8 },
  tag: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  tagOn: { borderColor: '#CFAF54', backgroundColor: 'rgba(207,175,84,0.12)' },
  tagText: { fontSize: 14, fontWeight: '600', color: '#999' },
  tagTextOn: { color: '#fff' },
  reasonOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#555', alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  reasonText: { fontSize: 15, color: '#999', fontWeight: '500' },
  error: { fontSize: 13, color: '#f87171', marginTop: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  flex: { flex: 1 },
  primary: { backgroundColor: '#fff', paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#0f0f0f', fontSize: 14, fontWeight: '700' },
  secondary: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  secondaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
