import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { withStartupTimeout } from '../lib/startup';

type AuthContextType = {
  user: any;
  loading: boolean;
  error: string | null;
  refreshAuth: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
  refreshAuth: async () => {},
});

function isStaleAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /invalid refresh token|refresh token.*used|auth session missing/i.test(message);
}

async function clearStoredSupabaseSession() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const authKeys = keys.filter((key) =>
      key.startsWith('sb-') || key.toLowerCase().includes('supabase')
    );
    if (authKeys.length) {
      await AsyncStorage.multiRemove(authKeys);
    }
  } catch (error) {
    console.log('Failed to clear stale auth storage:', error);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const refreshAuth = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: authError } = await withStartupTimeout(supabase.auth.getUser());
      if (requestId !== requestSequence.current) return;
      if (authError) throw authError;

      const currentUser = data.user ?? null;
      setUser(currentUser);

    } catch (authError) {
      if (requestId !== requestSequence.current) return;
      if (isStaleAuthError(authError)) {
        await clearStoredSupabaseSession();
        if (requestId !== requestSequence.current) return;
        setUser(null);
      } else {
        setError('We could not check your account. Check your connection and try again.');
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // A restored local session does not supersede the server check. Later
        // sign-in/out events do, so a delayed result cannot undo them.
        if (event !== 'INITIAL_SESSION') {
          requestSequence.current += 1;
          setLoading(false);
          setError(null);
        }
        const currentUser = session?.user ?? null;
        setUser(currentUser);

      }
    );
    void refreshAuth();

    return () => {
      requestSequence.current += 1;
      listener.subscription.unsubscribe();
    };
  }, [refreshAuth]);

  return (
    <AuthContext.Provider value={{ user, loading, error, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
