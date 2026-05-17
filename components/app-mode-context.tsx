import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type AppMode = 'collector' | 'seller';

const MODE_KEY = 'stackr:app-mode';
const MODE_CHOSEN_KEY = 'stackr:app-mode-chosen';

type AppModeContextValue = {
  mode: AppMode;
  hasChosenMode: boolean;
  setMode: (mode: AppMode) => Promise<void>;
};

const AppModeContext = createContext<AppModeContextValue>({
  mode: 'collector',
  hasChosenMode: false,
  setMode: async () => {},
});

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('collector');
  const [hasChosenMode, setHasChosenMode] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [storedMode, chosen] = await Promise.all([
        AsyncStorage.getItem(MODE_KEY),
        AsyncStorage.getItem(MODE_CHOSEN_KEY),
      ]);
      if (storedMode === 'seller' || storedMode === 'collector') setModeState(storedMode);
      setHasChosenMode(chosen === 'true');
    };
    load();
  }, []);

  const setMode = useCallback(async (nextMode: AppMode) => {
    setModeState(nextMode);
    setHasChosenMode(true);
    await AsyncStorage.multiSet([
      [MODE_KEY, nextMode],
      [MODE_CHOSEN_KEY, 'true'],
    ]);
  }, []);

  return (
    <AppModeContext.Provider value={{ mode, hasChosenMode, setMode }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  return useContext(AppModeContext);
}
