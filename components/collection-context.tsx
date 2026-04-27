import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { fetchAllSets } from '../lib/pokemonTcg';
import { createBinder, deleteBinder, fetchBinders } from '../lib/binders';

type CollectionContextType = {
  trackedSetIds: string[];
  loadingTrackedSets: boolean;
  toggleTrackedSet: (setId: string) => Promise<void>;
  isTracked: (setId: string) => boolean;
  refreshTrackedSets: () => Promise<void>;
};

const CollectionContext = createContext<CollectionContextType | null>(null);

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const [trackedSetIds, setTrackedSetIds] = useState<string[]>([]);
  const [loadingTrackedSets, setLoadingTrackedSets] = useState(true);

  const refreshTrackedSets = useCallback(async () => {
    try {
      setLoadingTrackedSets(true);

      const binders = await fetchBinders();

      const officialSetIds = binders
        .filter((binder) => binder.type === 'official' && binder.source_set_id)
        .map((binder) => binder.source_set_id as string);

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
    async (setId: string) => {
      const binders = await fetchBinders();

      const existingBinder = binders.find(
        (binder) =>
          binder.type === 'official' &&
          binder.source_set_id === setId
      );

      if (existingBinder) {
        await deleteBinder(existingBinder.id);
        await refreshTrackedSets();
        return;
      }

      const sets = await fetchAllSets();
      const selectedSet = sets.find((set) => set.id === setId);

      await createBinder({
        name: selectedSet?.name ?? setId,
        color: '#2563eb',
        type: 'official',
        sourceSetId: setId,
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
      isTracked: (setId: string) => trackedSetIds.includes(setId),
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