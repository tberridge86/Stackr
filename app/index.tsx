import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../components/auth-context';
import { useProfile } from '../components/profile-context';
import { StackrLoadingScreen } from '../components/StackrLoadingScreen';
import { Text } from '../components/Text';
import { useTheme } from '../components/theme-context';
import { isBinderLibraryOverviewForUser, readPersistedBinderOverview } from '../lib/binderLibraryCache';
import { resolveStartupDestination } from '../lib/startup';

export default function Index() {
  const { user, loading: authLoading, error: authError, cachedReadSession, refreshAuth } = useAuth();
  const { profile, loading: profileLoading, error: profileError, refreshProfile } = useProfile();
  const { theme } = useTheme();
  const router = useRouter();

  const navigatedRef = useRef(false);
  const activeSavedReadKey = cachedReadSession
    ? `${cachedReadSession.userId}:${cachedReadSession.expiresAt}:${cachedReadSession.epoch}`
    : null;
  const currentSavedReadSessionRef = useRef(cachedReadSession);
  currentSavedReadSessionRef.current = cachedReadSession;
  const [savedBinderSessionKey, setSavedBinderSessionKey] = useState<string | null>(null);
  const destination = resolveStartupDestination({
    authLoading, authError, user, profileLoading, profileError, collectorName: profile?.collector_name,
  });
  const error = authError || (!authLoading && user ? profileError : null);

  useEffect(() => {
    if (!destination || navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace(destination);
  }, [destination, router]);

  useEffect(() => {
    let cancelled = false;
    const userId = cachedReadSession?.userId ?? '';
    const expiresAt = cachedReadSession?.expiresAt ?? 0;
    const epoch = cachedReadSession?.epoch ?? 0;
    if (!userId || expiresAt <= Math.floor(Date.now() / 1000)) {
      setSavedBinderSessionKey(null);
      return () => { cancelled = true; };
    }

    setSavedBinderSessionKey(null);
    void readPersistedBinderOverview(userId).then((snapshot) => {
      if (cancelled || cachedReadSession?.userId !== userId || cachedReadSession.expiresAt !== expiresAt || cachedReadSession.epoch !== epoch) return;
      if (expiresAt <= Math.floor(Date.now() / 1000)) return;
      setSavedBinderSessionKey(snapshot && isBinderLibraryOverviewForUser(snapshot, userId) ? `${userId}:${expiresAt}:${epoch}` : null);
    });
    return () => { cancelled = true; };
  }, [cachedReadSession?.epoch, cachedReadSession?.expiresAt, cachedReadSession?.userId]);

  const canViewSavedBinders = !destination
    && (authLoading || profileLoading || Boolean(error))
    && savedBinderSessionKey === activeSavedReadKey
    && Boolean(cachedReadSession && cachedReadSession.expiresAt > Math.floor(Date.now() / 1000));


  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StackrLoadingScreen
        busy={!error}
        message={error ? 'Opening paused' : authLoading ? 'Checking your account' : 'Opening your vault'}
      />
      {error ? (
        <SafeAreaView edges={['bottom']} style={{ padding: 24, gap: 16 }}>
          <Text accessibilityRole="alert" style={{ textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => { void (authError ? refreshAuth() : refreshProfile()); }}
            style={{ backgroundColor: theme.colors.primary, borderRadius: 16, padding: 16, alignItems: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Try again</Text>
          </TouchableOpacity>
          {canViewSavedBinders ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                const currentSavedReadSession = currentSavedReadSessionRef.current;
                if (
                  !currentSavedReadSession
                  || savedBinderSessionKey !== `${currentSavedReadSession.userId}:${currentSavedReadSession.expiresAt}:${currentSavedReadSession.epoch}`
                  || currentSavedReadSession.expiresAt <= Math.floor(Date.now() / 1000)
                ) return;
                navigatedRef.current = true;
                router.replace({ pathname: '/(tabs)/binder', params: { readOnly: 'true' } });
              }}
              style={{ borderColor: theme.colors.primary, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center' }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>View saved binders</Text>
            </TouchableOpacity>
          ) : null}
        </SafeAreaView>
      ) : canViewSavedBinders ? (
        <SafeAreaView edges={['bottom']} style={{ padding: 24 }}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              const currentSavedReadSession = currentSavedReadSessionRef.current;
              if (
                !currentSavedReadSession
                || savedBinderSessionKey !== `${currentSavedReadSession.userId}:${currentSavedReadSession.expiresAt}:${currentSavedReadSession.epoch}`
                || currentSavedReadSession.expiresAt <= Math.floor(Date.now() / 1000)
              ) return;
              navigatedRef.current = true;
              router.replace({ pathname: '/(tabs)/binder', params: { readOnly: 'true' } });
            }}
            style={{ borderColor: theme.colors.primary, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center' }}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>View saved binders</Text>
          </TouchableOpacity>
        </SafeAreaView>
      ) : null}
    </View>
  );
}
