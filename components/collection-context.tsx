import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createBinder, deleteBinder, fetchBinders } from '../lib/binders';
import { normalizePokemonCardLanguage, type PokemonCardLanguage } from '../lib/pokemonTcg';
import { isCurrentAccountRequest } from '../lib/accountRequestGuard';
import { useAuth } from './auth-context';

type CollectionContextType = {
  trackedSetIds: string[];
  loadingTrackedSets: boolean;
  toggleTrackedSet: (setId: string, language?: PokemonCardLanguage | string | null) => Promise<void>;
  isTracked: (setId: string, language?: PokemonCardLanguage | string | null) => boolean;
  refreshTrackedSets: () => Promise<void>;
};

const CollectionContext = createContext<CollectionContextType | null>(null);

function getTrackedSetKey(setId: string, language?: PokemonCardLanguage | string | null) {
  return `${normalizePokemonCardLanguage(language)}:${setId}`;
}

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const accountId = user?.id ?? null;
  const currentAccountId = React.useRef(accountId);
  const previousAccountId = React.useRef(accountId);
  const accountGeneration = React.useRef(0);
  const requestSequence = React.useRef(0);
  if (previousAccountId.current !== accountId) {
    previousAccountId.current = accountId;
    accountGeneration.current += 1;
  }
  currentAccountId.current = accountId;
  const [trackedSetState, setTrackedSetState] = useState({
    accountId: null as string | null,
    trackedSetIds: [] as string[],
    loading: true,
  });
  const belongsToCurrentAccount = trackedSetState.accountId === accountId;
  const trackedSetIds = useMemo(
    () => (!authLoading && belongsToCurrentAccount ? trackedSetState.trackedSetIds : []),
    [authLoading, belongsToCurrentAccount, trackedSetState.trackedSetIds],
  );
  const loadingTrackedSets = authLoading || !belongsToCurrentAccount || trackedSetState.loading;

  const refreshTrackedSets = useCallback(async () => {
    const expectedAccountId = accountId;
    const requestId = ++requestSequence.current;
    const request = { accountGeneration: accountGeneration.current, requestId };
    if (currentAccountId.current !== expectedAccountId) return;
    if (!expectedAccountId) {
      setTrackedSetState({ accountId: null, trackedSetIds: [], loading: false });
      return;
    }

    try {
      setTrackedSetState((previous) => ({
        accountId: expectedAccountId,
        trackedSetIds: previous.accountId === expectedAccountId ? previous.trackedSetIds : [],
        loading: true,
      }));

      const binders = await fetchBinders();
      if (
        currentAccountId.current !== expectedAccountId
        || !isCurrentAccountRequest(
          { accountGeneration: accountGeneration.current, requestId: requestSequence.current },
          request,
        )
      ) return;

      const officialSetIds = binders
        .filter((binder) => binder.type === 'official' && binder.source_set_id)
        .map((binder) => getTrackedSetKey(binder.source_set_id as string, binder.language));

      setTrackedSetState({ accountId: expectedAccountId, trackedSetIds: officialSetIds, loading: false });
    } catch (error) {
      console.log('Failed to load tracked sets from binders', error);
      if (
        currentAccountId.current === expectedAccountId
        && isCurrentAccountRequest(
          { accountGeneration: accountGeneration.current, requestId: requestSequence.current },
          request,
        )
      ) {
        setTrackedSetState({ accountId: expectedAccountId, trackedSetIds: [], loading: false });
      }
    }
  }, [accountId]);

  useEffect(() => {
    if (!authLoading) void refreshTrackedSets();
  }, [authLoading, refreshTrackedSets]);

  const toggleTrackedSet = useCallback(
    async (setId: string, requestedLanguage?: PokemonCardLanguage | string | null) => {
      const expectedAccountId = accountId;
      if (!expectedAccountId || currentAccountId.current !== expectedAccountId) return;
      const language = normalizePokemonCardLanguage(requestedLanguage);
      const binders = await fetchBinders();
      if (currentAccountId.current !== expectedAccountId) return;

      const existingBinder = binders.find(
        (binder) =>
          binder.type === 'official' &&
          binder.source_set_id === setId &&
          normalizePokemonCardLanguage(binder.language) === language
      );

      if (existingBinder) {
        await deleteBinder(existingBinder.id);
        if (currentAccountId.current !== expectedAccountId) return;
        await refreshTrackedSets();
        return;
      }

      const { fetchAllSets } = await import('../lib/pokemonTcg');
      const sets = await fetchAllSets({ language });
      const selectedSet = sets.find((set) => set.id === setId);
      if (currentAccountId.current !== expectedAccountId) return;

      await createBinder({
        name: selectedSet?.name ?? setId,
        color: '#2563eb',
        type: 'official',
        sourceSetId: setId,
        language,
      });

      if (currentAccountId.current !== expectedAccountId) return;
      await refreshTrackedSets();
    },
    [accountId, refreshTrackedSets]
  );

  const value = useMemo(
    () => ({
      trackedSetIds,
      loadingTrackedSets,
      toggleTrackedSet,
      isTracked: (setId: string, language?: PokemonCardLanguage | string | null) =>
        trackedSetIds.includes(getTrackedSetKey(setId, language)),
      refreshTrackedSets,
    }),
    [trackedSetIds, loadingTrackedSets, toggleTrackedSet, refreshTrackedSets]
  );

  return (
    <CollectionContext.Provider value={value}>
      {children}
    </CollectionContext.Provider>
  );
}

export function useCollection() {
  const ctx = useContext(CollectionContext);

  if (!ctx) {
    throw new Error('useCollection must be used inside CollectionProvider');
  }

  return ctx;
}
