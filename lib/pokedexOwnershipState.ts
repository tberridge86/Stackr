import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../components/auth-context';
import { createAccountLoadGeneration } from './accountLoadGeneration';
import { supabase } from './supabase';
import type { PokedexOwnershipReadOptions } from './pokedexCollection';

type OwnershipSnapshot = {
  accountId: string | null;
  values: Set<string> | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
};

type PendingMarker = { accountId: string; key: string; owned: boolean; isCurrent: () => boolean };
type OwnershipFailure = { error: unknown; isCurrent: () => boolean };

/** Shared account boundary for species names and exact set:printing ownership. */
export function usePokedexOwnership(readOwnership: (accountId: string, options: PokedexOwnershipReadOptions) => Promise<Set<string>>) {
  const { user, loading: authLoading, error: authError, refreshAuth } = useAuth();
  const accountId: string | null = user?.id ?? null;
  const authReady = !authLoading && !authError;
  const currentAccount = useRef(accountId);
  const currentAuthReady = useRef(authReady);
  const focused = useRef(false);
  const loadGeneration = useRef(createAccountLoadGeneration()).current;
  const mutationGeneration = useRef(createAccountLoadGeneration()).current;
  const [snapshot, setSnapshot] = useState<OwnershipSnapshot>({
    accountId: null, values: null, status: 'idle', error: null,
  });
  const [pendingMarker, setPendingMarker] = useState<PendingMarker | null>(null);
  const activeMutation = useRef<PendingMarker | null>(null);
  const activeRead = useRef<AbortController | null>(null);

  // Invalidate during render: an old completion must not win before effects run,
  // including an A -> B -> A transition that returns to the same account ID.
  if (currentAccount.current !== accountId || currentAuthReady.current !== authReady) {
    activeRead.current?.abort();
    loadGeneration.invalidate();
    mutationGeneration.invalidate();
  }
  currentAccount.current = accountId;
  currentAuthReady.current = authReady;
  if (activeMutation.current && !activeMutation.current.isCurrent()) activeMutation.current = null;

  const isAccountActive = useCallback((expectedAccountId: string) => (
    focused.current && currentAuthReady.current && currentAccount.current === expectedAccountId
  ), []);

  const loadOwnership = useCallback(async () => {
    if (!authReady || !focused.current || currentAccount.current !== accountId) return;
    activeRead.current?.abort();
    const isCurrentLoad = loadGeneration.begin();
    if (!accountId) {
      setSnapshot({ accountId: null, values: null, status: 'idle', error: null });
      return;
    }
    const isCurrent = () => isCurrentLoad() && isAccountActive(accountId);
    const request = new AbortController();
    activeRead.current = request;
    setSnapshot((previous) => ({
      accountId, values: previous.accountId === accountId ? previous.values : null,
      status: 'loading', error: null,
    }));
    try {
      const values = await readOwnership(accountId, { signal: request.signal, isCurrent });
      if (!isCurrent()) return;
      const { data: { user: currentUser }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!isCurrent()) return;
      if ((currentUser?.id ?? null) !== accountId) throw new Error('Your account changed. Retry ownership.');
      setSnapshot({ accountId, values, status: 'success', error: null });
    } catch (error) {
      if (!isCurrent()) return;
      console.log('Failed to refresh Pokédex ownership', error);
      setSnapshot((previous) => ({
        accountId, values: previous.accountId === accountId ? previous.values : null,
        status: 'error', error: 'Ownership could not be refreshed. Please retry.',
      }));
    } finally {
      request.abort();
      if (activeRead.current === request) activeRead.current = null;
    }
  }, [accountId, authReady, isAccountActive, loadGeneration, readOwnership]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setPendingMarker(null);
    void loadOwnership();
    return () => {
      focused.current = false;
      activeRead.current?.abort();
      loadGeneration.invalidate();
      mutationGeneration.invalidate();
    };
  }, [loadOwnership, loadGeneration, mutationGeneration]));

  const belongsToAccount = Boolean(accountId) && snapshot.accountId === accountId;
  const values = !authLoading && belongsToAccount ? snapshot.values : null;
  const status = authLoading ? 'loading' : authError ? 'error'
    : !accountId ? 'idle' : belongsToAccount ? snapshot.status : 'loading';
  const pending = pendingMarker?.isCurrent() ? pendingMarker : null;
  const visibleValues = values && pending?.owned ? new Set(values).add(pending.key) : values;
  const canMutate = Boolean(accountId && authReady && focused.current && status === 'success' && !pending);
  const message = authLoading ? 'Checking your account…'
    : !accountId && !authError ? 'Sign in to view ownership.'
      : status === 'error' ? values ? 'Could not refresh ownership. Showing saved ownership.' : 'Ownership unavailable. Retry to check your collection.'
        : status === 'loading' ? values ? 'Refreshing ownership…' : 'Loading ownership…' : null;

  const changeOwnership = useCallback(async (
    key: string,
    owned: boolean,
    persist: (expectedAccountId: string, isCurrentAccount: () => boolean) => Promise<void>,
  ): Promise<OwnershipFailure | null> => {
    if (!accountId || !canMutate || !isAccountActive(accountId) || activeMutation.current?.isCurrent()) return null;
    const isCurrentMutation = mutationGeneration.begin();
    const isCurrent = () => isCurrentMutation() && isAccountActive(accountId);
    loadGeneration.invalidate();
    activeRead.current?.abort();
    const intent = { accountId, key, owned, isCurrent };
    activeMutation.current = intent;
    setPendingMarker(intent);
    try {
      await persist(accountId, isCurrent);
      if (!isCurrent()) return null;
      await loadOwnership();
      return null;
    } catch (error) {
      if (!isCurrent()) return null;
      // Optimism is an overlay, so rollback never deletes a key from a newer
      // successful snapshot (even if both accounts own the same printing).
      if (activeMutation.current === intent) setPendingMarker(null);
      await loadOwnership();
      // The caller rechecks this exact token at the final synchronous side
      // effect. Its await continuation can run after another account renders.
      return isCurrent() ? { error, isCurrent } : null;
    } finally {
      if (activeMutation.current === intent) {
        activeMutation.current = null;
        if (isCurrent()) setPendingMarker(null);
      }
    }
  }, [accountId, canMutate, isAccountActive, loadGeneration, loadOwnership, mutationGeneration]);

  const retryOwnership = useCallback(async () => {
    if (authError) await refreshAuth();
    else await loadOwnership();
  }, [authError, loadOwnership, refreshAuth]);

  return {
    values: visibleValues, status, message, canMutate,
    busyKey: pending?.key ?? null, changeOwnership, retryOwnership,
  };
}
