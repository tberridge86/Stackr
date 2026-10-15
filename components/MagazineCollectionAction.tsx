import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { PokemonCard } from '../lib/pokemonTcg';
import { createManualCollectionDraft } from '../lib/manualCollectionDraft';
import { supabase } from '../lib/supabase';
import { useAuth } from './auth-context';
import { StackrButton } from './StackrControls';
import { Text } from './Text';
import { useTheme } from './theme-context';

/** Reuses the existing private collection review. No ownership is granted here. */
export function MagazineCollectionAction({ card }: { card: PokemonCard }) {
  const { theme } = useTheme();
  const { user, loading: authLoading, cachedReadSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<symbol | null>(null);
  const focus = useRef({ active: false, generation: 0 });
  const current = useRef({ userId: user?.id, epoch: cachedReadSession?.epoch, cardId: card.id });
  current.current = { userId: user?.id, epoch: cachedReadSession?.epoch, cardId: card.id };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current = null; };
  }, []);
  useEffect(() => { operation.current = null; setBusy(false); setError(null); }, [user?.id, cachedReadSession?.epoch, card.id]);
  useFocusEffect(useCallback(() => {
    focus.current = { active: true, generation: focus.current.generation + 1 };
    setBusy(false); setError(null);
    return () => {
      focus.current = { active: false, generation: focus.current.generation + 1 };
      operation.current = null;
      setBusy(false);
    };
  }, []));

  const add = async () => {
    if (authLoading || !focus.current.active || operation.current || !card.set?.id || card.language !== 'ja') return;
    if (!user) { router.push('/(auth)/login'); return; }
    const token = Symbol('magazine-review');
    const owner = { ...current.current };
    const focusGeneration = focus.current.generation;
    const isCurrent = () => mounted.current && operation.current === token
      && focus.current.active && focus.current.generation === focusGeneration
      && current.current.userId === owner.userId && current.current.epoch === owner.epoch
      && current.current.cardId === owner.cardId;
    operation.current = token; setBusy(true); setError(null);
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (!isCurrent()) return;
      if (authError) throw new Error('Could not verify your account. Check your connection or sign in again.');
      if (data.user?.id !== owner.userId) throw new Error('Sign in again before adding this card.');
      const draft = await createManualCollectionDraft(data.user.id, {
        cardId: card.id, setId: card.set.id, language: 'ja', cardName: card.name,
        cardNumber: card.number, setName: card.set.name, imageUrl: card.images?.large ?? card.images?.small,
      });
      if (isCurrent()) router.push({ pathname: '/collection/add-card', params: { draftId: draft.id } });
    } catch (failure) {
      if (isCurrent()) setError(failure instanceof Error ? failure.message : 'Could not open your collection review. Please try again.');
    } finally {
      if (isCurrent()) { operation.current = null; setBusy(false); }
    }
  };
  return <View style={{ gap: 8 }}>
    <StackrButton label="Add to collection" variant="primary" icon="albums-outline" loading={busy} disabled={busy || authLoading} onPress={() => { void add(); }} />
    <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 18 }}>Choose your binder and quantity before saving.</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.text, lineHeight: 21 }}>{error}</Text> : null}
  </View>;
}
