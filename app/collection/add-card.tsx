import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { StackrBackButton } from '../../components/StackrBackButton';
import { useTheme } from '../../components/theme-context';
import { fetchBinders, type BinderRecord } from '../../lib/binders';
import { supabase } from '../../lib/supabase';
import { discardManualCollectionDraft, loadManualCollectionDraft, updateManualCollectionDraft, type ManualCollectionDraft } from '../../lib/manualCollectionDraft';
import { addOwnedCardBatchToBinder, createCollectionBatchRequestKey, persistVerifiedCollectionBatchRecoveryIntent } from '../../lib/collectionBatch';

export default function ManualCollectionReviewScreen() {
  const { theme } = useTheme();
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const [draft, setDraft] = useState<ManualCollectionDraft | null>(null);
  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [discarded, setDiscarded] = useState(false);
  const operation = useRef(false);
  const saved = draft?.state === 'saved';
  const locked = busy || draft?.state !== 'review';
  const buttonStyle = { minHeight: 48, borderRadius: 12, padding: 14, justifyContent: 'center' as const, alignItems: 'center' as const };

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setDraft(null);
    setBinders([]);
    void (async () => {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!data.user) throw new Error('Sign in with the account that started this review.');
      const [restored, destinations] = await Promise.all([loadManualCollectionDraft(data.user.id), fetchBinders()]);
      if (!restored || (draftId && restored.id !== draftId)) throw new Error('This review is unavailable. Resume your saved review from Scan.');
      if (active) { setDraft(restored); setBinders(destinations); }
    })().catch((failure) => { if (active) setError(failure?.message ?? 'Could not load the collection review.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // Retry deliberately reloads the account, review and available destinations.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, retry]));

  usePreventRemove(busy && !discarded, () => Alert.alert('Saving review', 'Wait for this operation to finish before leaving.'));
  const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/scan-hub' as any);
  useEffect(() => { if (discarded) { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/scan-hub' as any); } }, [discarded]);

  const change = async (patch: Partial<Pick<ManualCollectionDraft, 'binderId' | 'quantity'>>) => {
    if (!draft || locked || operation.current) return;
    operation.current = true; setBusy(true); setError(null);
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (data.user?.id !== draft.userId) throw new Error('Account changed. Reopen this review under its original account.');
      setDraft(await updateManualCollectionDraft(draft.userId, draft.id, patch));
    } catch (failure: any) { setError(failure?.message ?? 'Could not save your review choice.'); }
    finally { operation.current = false; setBusy(false); }
  };

  const save = async () => {
    if (!draft?.binderId || saved || operation.current) return;
    operation.current = true; setBusy(true); setError(null);
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (data.user?.id !== draft.userId) throw new Error('Sign in with the account that started this review.');
      if (!binders.some((binder) => binder.id === draft.binderId && binder.user_id === draft.userId)) throw new Error('The destination binder is unavailable. Reload your review.');
      const fixed = await updateManualCollectionDraft(draft.userId, draft.id, { state: 'saving' });
      setDraft(fixed);
      const cards = [{ ...fixed.card, quantity: fixed.quantity, notes: 'Added from Stackr catalogue' }];
      const requestKey = createCollectionBatchRequestKey({ sourceSessionId: fixed.id, binderId: fixed.binderId!, cards });
      const intent = await persistVerifiedCollectionBatchRecoveryIntent({ sourceSessionId: fixed.id, binderId: fixed.binderId!, cards, requestKey });
      await addOwnedCardBatchToBinder(intent.binderId, [...intent.cards], { requestKey: intent.requestKey });
      // Show confirmed success even if the local completion marker needs recovery.
      setDraft({ ...fixed, state: 'saved' });
      await updateManualCollectionDraft(fixed.userId, fixed.id, { state: 'saved' }).catch(() => {
        setError('Collection saved. The local completion record needs verification; any recovered review reuses this same save.');
      });
    } catch (failure: any) { setError(failure?.message ?? 'The add was not confirmed. Retry the original request.'); }
    finally { operation.current = false; setBusy(false); }
  };

  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
      <StackrBackButton onPress={back} />
      <Text accessibilityRole="header" style={{ color: theme.colors.text, fontSize: 23, fontWeight: '900' }}>Add to collection</Text>
    </View>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 130 }}>
      {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      {error ? <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={{ color: theme.colors.text, lineHeight: 21 }}>{error}</Text>
        {!busy && !saved ? <TouchableOpacity accessibilityRole="button" style={buttonStyle} onPress={() => setRetry((value) => value + 1)}><Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Reload review</Text></TouchableOpacity> : null}
      </View> : null}
      {!loading && draft ? <>
        <View style={{ padding: 18, borderRadius: 16, backgroundColor: theme.colors.card, gap: 8 }}>
          <Text style={{ color: theme.colors.text, fontSize: 21, fontWeight: '800' }}>{draft.card.cardName ?? draft.card.cardId}</Text>
          <Text style={{ color: theme.colors.textSoft }}>{draft.card.setName ?? draft.card.setId} · {draft.card.cardNumber ?? draft.card.cardId} · {String(draft.card.language ?? 'en').toUpperCase()}</Text>
          <Text style={{ color: theme.colors.textSoft, lineHeight: 20 }}>Check this is the card you own, then choose its destination and quantity.</Text>
        </View>
        {saved ? <Text accessibilityRole="alert" style={{ color: theme.colors.primary, fontSize: 18, fontWeight: '800' }}>Collection updated — {draft.quantity} {draft.quantity === 1 ? 'copy' : 'copies'} added.</Text> : <>
          {draft.state === 'saving' ? <Text style={{ color: theme.colors.text, lineHeight: 21 }}>The original card, quantity and binder are preserved. Retry uses the same save request.</Text> : null}
          <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '800' }}>Choose binder</Text>
          {binders.map((binder) => <TouchableOpacity key={binder.id} accessibilityRole="button" accessibilityState={{ selected: draft.binderId === binder.id, disabled: locked }} disabled={locked}
            onPress={() => { void change({ binderId: binder.id }); }} style={[buttonStyle, { alignItems: 'flex-start', borderWidth: draft.binderId === binder.id ? 2 : 1, borderColor: draft.binderId === binder.id ? theme.colors.primary : theme.colors.border }]}>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{draft.binderId === binder.id ? '✓ ' : ''}{binder.name}</Text>
          </TouchableOpacity>)}
          {!binders.length ? <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/binder/new' as any)} style={buttonStyle}><Text style={{ color: theme.colors.primary }}>Create a binder</Text></TouchableOpacity> : null}
          <Text style={{ color: theme.colors.textSoft, lineHeight: 20 }}>New entries use the binder’s default condition. Existing entries keep their condition.</Text>
          <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '800' }}>Copies to add</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Decrease quantity" disabled={locked || draft.quantity <= 1} onPress={() => { void change({ quantity: draft.quantity - 1 }); }} style={[buttonStyle, { minWidth: 56, borderWidth: 1, borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text, fontSize: 24 }}>−</Text></TouchableOpacity>
            <Text accessibilityLabel={`${draft.quantity} copies`} style={{ color: theme.colors.text, fontSize: 23, fontWeight: '800' }}>{draft.quantity}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Increase quantity" disabled={locked || draft.quantity >= 999} onPress={() => { void change({ quantity: draft.quantity + 1 }); }} style={[buttonStyle, { minWidth: 56, borderWidth: 1, borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text, fontSize: 24 }}>+</Text></TouchableOpacity>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy || !draft.binderId, busy }} disabled={busy || !draft.binderId} onPress={() => { void save(); }} style={[buttonStyle, { backgroundColor: theme.colors.primary, opacity: busy || !draft.binderId ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>{draft.state === 'saving' ? 'Retry original add' : `Confirm and add ${draft.quantity}`}</Text>}
          </TouchableOpacity>
          {draft.state === 'review' ? <TouchableOpacity accessibilityRole="button" disabled={busy} style={buttonStyle} onPress={() => {
            if (operation.current) return;
            operation.current = true; setBusy(true);
            void discardManualCollectionDraft(draft.userId, draft.id).then(() => setDiscarded(true)).catch((failure) => setError(failure.message)).finally(() => { operation.current = false; setBusy(false); });
          }}><Text style={{ color: theme.colors.textSoft }}>Discard this review</Text></TouchableOpacity> : null}
        </>}
        {draft.binderId ? <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => router.push({ pathname: '/binder/[id]', params: { id: draft.binderId! } })} style={buttonStyle}><Text style={{ color: theme.colors.primary, fontWeight: '800' }}>View binder</Text></TouchableOpacity> : null}
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}
