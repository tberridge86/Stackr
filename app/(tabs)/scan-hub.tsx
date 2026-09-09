import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StackrButton } from '../../components/StackrControls';
import { StackrPageHeader, StackrScreen } from '../../components/StackrScreen';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { loadManualCollectionDraft, type ManualCollectionDraft } from '../../lib/manualCollectionDraft';
import { loadRecoverableBinderPageScanSessions, getBinderPageScanRecoverySummary, type BinderPageScanSession } from '../../lib/binderPageScanStore';
import { listPendingScanCollectionVariants, resumePendingScanCollectionVariant, type ScanCollectionVariantSaveInput } from '../../lib/scanCollectionVariantSave';
import { supabase } from '../../lib/supabase';

export default function ScanWorkspace() {
  const { theme } = useTheme();
  const [draft, setDraft] = useState<ManualCollectionDraft | null>(null);
  const [scans, setScans] = useState<BinderPageScanSession[]>([]);
  const [pendingSaves, setPendingSaves] = useState<ScanCollectionVariantSaveInput[]>([]);
  const [resumingSourceSessionId, setResumingSourceSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signIn, setSignIn] = useState(false);
  const requestRef = useRef(0);
  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true); setError(null); setDraft(null); setScans([]); setPendingSaves([]); setSignIn(false);
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (request !== requestRef.current) return;
      if (authError && authError.name !== 'AuthSessionMissingError') throw authError;
      if (!data.user) { setSignIn(true); return; }
      const [manual, batches, composite] = await Promise.allSettled([
        loadManualCollectionDraft(data.user.id), loadRecoverableBinderPageScanSessions(data.user.id), listPendingScanCollectionVariants(data.user.id),
      ]);
      if (request !== requestRef.current) return;
      if (manual.status === 'fulfilled') setDraft(manual.value?.state === 'saved' ? null : manual.value);
      if (batches.status === 'fulfilled') setScans(batches.value);
      if (composite.status === 'fulfilled') setPendingSaves(composite.value);
      if (manual.status === 'rejected' || batches.status === 'rejected' || composite.status === 'rejected') setError('Some saved work could not be checked. Retry before starting another collection add.');
    } catch { if (request === requestRef.current) setError('Saved work could not be loaded. Check your connection and try again.'); }
    finally { if (request === requestRef.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { requestRef.current += 1; }; }, [load]));
  const panel = { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, gap: 10 };
  return <StackrScreen variant="tab">
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150, gap: 20 }}>
      <StackrPageHeader title="Scan" subtitle="Identify, review and add to your collection." />
      {loading ? <Text style={{ color: theme.colors.textSoft }}>Checking saved work…</Text> : null}
      {signIn ? <StackrButton label="Sign in to resume saved work" onPress={() => router.push('/(auth)/login' as any)} /> : null}
      {error ? <View style={panel}><Text accessibilityRole="alert" style={{ color: theme.colors.text, lineHeight: 20 }}>{error}</Text><StackrButton label="Retry saved work" onPress={() => { void load(); }} /></View> : null}
      {draft ? <View style={panel}>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '800' }}>Resume collection add</Text>
        <Text style={{ color: theme.colors.textSoft }}>{draft.card.cardName ?? draft.card.cardId} · {draft.quantity} {draft.quantity === 1 ? 'copy' : 'copies'}</Text>
        <StackrButton label="Resume review" onPress={() => router.push({ pathname: '/collection/add-card', params: { draftId: draft.id } } as any)} />
      </View> : null}
      {pendingSaves.map((pending) => <View key={pending.sourceSessionId} style={panel}>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '800' }}>Finish saving scanned card</Text>
        <Text style={{ color: theme.colors.textSoft }}>{pending.cards[0]?.cardName ?? pending.cards[0]?.cardId ?? 'Scanned card'}{pending.variant ? ` · ${pending.variant.variant}` : ''}</Text>
        <StackrButton label={resumingSourceSessionId === pending.sourceSessionId ? 'Finishing save…' : 'Resume save'} disabled={resumingSourceSessionId !== null} onPress={() => {
          void (async () => {
            try {
              setResumingSourceSessionId(pending.sourceSessionId);
              const { data } = await supabase.auth.getUser();
              if (!data.user) throw new Error('Sign in to resume this saved scan.');
              await resumePendingScanCollectionVariant(data.user.id, pending.sourceSessionId);
              await load();
            } catch (resumeError) {
              setError(resumeError instanceof Error ? resumeError.message : 'Saved scan could not be resumed. Try again.');
            } finally { setResumingSourceSessionId(null); }
          })();
        }} />
      </View>)}
      {scans.map((session) => {
        const summary = getBinderPageScanRecoverySummary(session);
        return <View key={session.scanSessionId} style={panel}>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '800' }}>Resume scan review</Text>
        <Text style={{ color: theme.colors.textSoft }}>{summary.confirmedPockets} confirmed · {summary.needsReviewPockets} to review · {summary.totalPockets} pockets</Text>
        <StackrButton label="Resume review" onPress={() => router.push({ pathname: '/scan/binder-page-result', params: { scanSessionId: session.scanSessionId, layout: String(session.layout), ...(session.binderId ? { binderId: session.binderId } : {}) } } as any)} />
      </View>;
      })}
      <View style={panel}>
        <Ionicons name="scan-outline" size={32} color={theme.colors.primary} />
        <Text accessibilityRole="header" style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800' }}>Start with one card</Text>
        <Text style={{ color: theme.colors.textSoft, lineHeight: 21 }}>Check the exact card before choosing where to save it.</Text>
        <StackrButton label="Start camera" icon="camera-outline" variant="primary" onPress={() => router.push('/scan' as any)} />
      </View>
      <StackrButton label="Add without a camera" icon="search-outline" onPress={() => router.navigate('/(tabs)/search' as any)} />
      <Text style={{ color: theme.colors.textSoft, lineHeight: 20 }}>Find a card in Search, then choose Add to collection on its details.</Text>
      <StackrButton label="Scan into a binder" icon="albums-outline" onPress={() => router.navigate('/(tabs)/binder' as any)} />
    </ScrollView>
  </StackrScreen>;
}
