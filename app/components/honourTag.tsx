import { ThemedText } from '@/components/themed-text';
import { getHonourTag, honourLabel } from '@/services/honourService';
import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

/**
 * A player's shown honour tag — their most-given tag once five different
 * teammates have given it (services/honourService.ts). Renders nothing below
 * that. Quiet gold text, so it never outshouts the rank.
 */
export default function HonourTag({ userId }: { userId?: string }) {
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getHonourTag(userId)
      .then((t) => !cancelled && setTag(t))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const label = honourLabel(tag);
  if (!label) return null;
  return <ThemedText style={styles.tag} numberOfLines={1}>★ {label.toUpperCase()}</ThemedText>;
}

const styles = StyleSheet.create({
  tag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#E1C485',
    marginTop: 2,
  },
});
