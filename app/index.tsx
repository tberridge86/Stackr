import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../components/auth-context';
import { useProfile } from '../components/profile-context';
import { StackrLoadingScreen } from '../components/StackrLoadingScreen';
import { Text } from '../components/Text';
import { useTheme } from '../components/theme-context';
import { resolveStartupDestination } from '../lib/startup';

export default function Index() {
  const { user, loading: authLoading, error: authError, refreshAuth } = useAuth();
  const { profile, loading: profileLoading, error: profileError, refreshProfile } = useProfile();
  const { theme } = useTheme();
  const router = useRouter();

  const navigatedRef = useRef(false);
  const destination = resolveStartupDestination({
    authLoading, authError, user, profileLoading, profileError, collectorName: profile?.collector_name,
  });
  const error = authError || (!authLoading && user ? profileError : null);

  useEffect(() => {
    if (!destination || navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace(destination);
  }, [destination, router]);

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
        </SafeAreaView>
      ) : null}
    </View>
  );
}
