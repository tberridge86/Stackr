import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type CollectionContextType = {
  trackedSetIds: string[];
  toggleTrackedSet: (setId: string) => void;
  isTracked: (setId: string) => boolean;
};

const CollectionContext = createContext<CollectionContextType | null>(null);

const STORAGE_KEY = 'trackedSetIds';

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const [trackedSetIds, setTrackedSetIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadTracked = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          setTrackedSetIds(JSON.parse(saved));
        } else {
          setTrackedSetIds(['sv3pt5', 'base1', 'base2', 'base3']);
        }
      } catch (error) {
        console.log('Failed to load tracked sets', error);
      } finally {
        setLoaded(true);
      }
    };

    loadTracked();
  }, []);

  useEffect(() => {
    if (!loaded) return;

    const saveTracked = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trackedSetIds));
      } catch (error) {
        console.log('Failed to save tracked sets', error);
      }
    };

    saveTracked();
  }, [trackedSetIds, loaded]);

  const value = useMemo(
    () => ({
      trackedSetIds,
      toggleTrackedSet: (setId: string) => {
        setTrackedSetIds((prev) =>
          prev.includes(setId)
            ? prev.filter((id) => id !== setId)
            : [...prev, setId]
        );
      },
      isTracked: (setId: string) => trackedSetIds.includes(setId),
    }),
    [trackedSetIds]
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