import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { withStartupTimeout } from '../lib/startup';

type AuthContextType = {
  user: any;
  loading: boolean;
  error: string | null;
  /** A local session envelope only; it never grants live account access or writes. */
  cachedReadSession: CachedReadSession | null;
  refreshAuth: () => Promise<void>;
};

export type CachedReadSession = {
  userId: string;
  /** Supabase session expiry, in Unix seconds. */
  expiresAt: number;
  /** Changes for every local auth event, including same-account token changes. */
  epoch: number;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
  cachedReadSession: null,
  refreshAuth: async () => {},
});

function isStaleAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /invalid refresh token|expired refresh token|refresh token.*(?:used|expired)|auth session missing/i.test(message);
}

export function isKnownAuthDenial(error: unknown) {
  if (isStaleAuthError(error)) return true;
  const candidate = error && typeof error === 'object'
    ? error as { status?: unknown; code?: unknown; message?: unknown }
    : null;
  if (candidate?.status === 401 || candidate?.status === 403) return true;
  const message = typeof candidate?.message === 'string' ? candidate.message : String(error ?? '');
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  if (['bad_jwt', 'session_not_found', 'session_expired', 'user_not_found', 'user_banned',
    'refresh_token_not_found', 'refresh_token_already_used'].includes(code)) return true;
  const classificationText = `${message} ${code.replace(/[_-]/g, ' ')}`;
  return /invalid jwt|jwt expired|not authenticated|unauthorized|user not found|(?:invalid|expired|bad).*token|(?:invalid|expired|bad).*jwt/i.test(classificationText);
}

/**
 * A restored session can nominate only its own unexpired local cache. The
 * server check remains the authority for the normal app and every write.
 */
export function getCachedReadSession(session: unknown, nowSeconds = Math.floor(Date.now() / 1000)): CachedReadSession | null {
  if (!session || typeof session !== 'object') return null;
  const candidate = session as { user?: { id?: unknown } | null; expires_at?: unknown };
  const userId = typeof candidate.user?.id === 'string' ? candidate.user.id.trim() : '';
  const expiresAt = typeof candidate.expires_at === 'number' ? candidate.expires_at : Number(candidate.expires_at);
  if (!userId || !Number.isFinite(expiresAt) || expiresAt <= nowSeconds) return null;
  return { userId, expiresAt, epoch: 0 };
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
  const [cachedReadSession, setCachedReadSession] = useState<CachedReadSession | null>(null);
  const requestSequence = useRef(0);
  const mountedRef = useRef(false);
  const hasNonInitialAuthEventRef = useRef(false);
  const knownAuthDenialRef = useRef(false);
  const cachedReadSessionEpochRef = useRef(0);
  const cachedReadSessionRef = useRef<CachedReadSession | null>(cachedReadSession);
  cachedReadSessionRef.current = cachedReadSession;

  const updateCachedReadSession = useCallback((next: Omit<CachedReadSession, 'epoch'> | null) => {
    const value = next ? { ...next, epoch: ++cachedReadSessionEpochRef.current } : null;
    if (!next) cachedReadSessionEpochRef.current += 1;
    cachedReadSessionRef.current = value;
    setCachedReadSession(value);
  }, []);

  const refreshAuth = useCallback(async () => {
    const requestId = ++requestSequence.current;
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: authError } = await withStartupTimeout(supabase.auth.getUser());
      if (!mountedRef.current || requestId !== requestSequence.current) return;
      if (authError) throw authError;

      const currentUser = data.user ?? null;
      setUser(currentUser);
      if (!currentUser || cachedReadSessionRef.current?.userId !== currentUser.id) {
        updateCachedReadSession(null);
      }

    } catch (authError) {
      if (!mountedRef.current || requestId !== requestSequence.current) return;
      if (isKnownAuthDenial(authError)) {
        knownAuthDenialRef.current = true;
        updateCachedReadSession(null);
        setUser(null);
        await clearStoredSupabaseSession();
        if (!mountedRef.current || requestId !== requestSequence.current) return;
      } else {
        setError('We could not check your account. Check your connection and try again.');
      }
    } finally {
      if (mountedRef.current && requestId === requestSequence.current) setLoading(false);
    }
  }, [updateCachedReadSession]);

  useEffect(() => {
    mountedRef.current = true;
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // A restored local session does not supersede the server check. Later
        // sign-in/out events do, so a delayed result cannot undo them.
        if (!mountedRef.current) return;
        if (event === 'INITIAL_SESSION' && hasNonInitialAuthEventRef.current) return;
        if (event !== 'INITIAL_SESSION') hasNonInitialAuthEventRef.current = true;
        if (event === 'INITIAL_SESSION' && knownAuthDenialRef.current) return;
        const sessionUser = session?.user ?? null;
        const localReadSession = getCachedReadSession(session);
        if (event !== 'INITIAL_SESSION') {
          requestSequence.current += 1;
          // A genuinely new auth event may establish a fresh local session;
          // an old INITIAL_SESSION event may not revive a denied one.
          knownAuthDenialRef.current = false;
          setLoading(false);
          setError(null);
        }
        setUser(sessionUser);
        updateCachedReadSession(localReadSession);

      }
    );
    void refreshAuth();

    return () => {
      mountedRef.current = false;
      requestSequence.current += 1;
      listener.subscription.unsubscribe();
    };
  }, [refreshAuth, updateCachedReadSession]);

  return (
    <AuthContext.Provider value={{ user, loading, error, cachedReadSession, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
