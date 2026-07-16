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
  const [trackedSetIds, setTrackedSetIds] = useState<string[]>([]);
  const [loadingTrackedSets, setLoadingTrackedSets] = useState(true);

  const refreshTrackedSets = useCallback(async () => {
    try {
      setLoadingTrackedSets(true);

      const binders = await fetchBinders();

      const officialSetIds = binders
        .filter((binder) => binder.type === 'official' && binder.source_set_id)
        .map((binder) => getTrackedSetKey(binder.source_set_id as string, binder.language));

      setTrackedSetIds(officialSetIds);
    } catch (error) {
      console.log('Failed to load tracked sets from binders', error);
      setTrackedSetIds([]);
    } finally {
      setLoadingTrackedSets(false);
    }
  }, []);

  useEffect(() => {
    refreshTrackedSets();
  }, [refreshTrackedSets]);

  const toggleTrackedSet = useCallback(
    async (setId: string, requestedLanguage?: PokemonCardLanguage | string | null) => {
      const language = normalizePokemonCardLanguage(requestedLanguage);
      const binders = await fetchBinders();

      const existingBinder = binders.find(
        (binder) =>
          binder.type === 'official' &&
          binder.source_set_id === setId &&
          normalizePokemonCardLanguage(binder.language) === language
      );

      if (existingBinder) {
        await deleteBinder(existingBinder.id);
        await refreshTrackedSets();
        return;
      }

      const { fetchAllSets } = await import('../lib/pokemonTcg');
      const sets = await fetchAllSets({ language });
      const selectedSet = sets.find((set) => set.id === setId);

      await createBinder({
        name: selectedSet?.name ?? setId,
        color: '#2563eb',
        type: 'official',
        sourceSetId: setId,
        language,
      });

      await refreshTrackedSets();
    },
    [refreshTrackedSets]
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
