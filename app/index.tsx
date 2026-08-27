import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';
import { useAuth } from '../components/auth-context';
import { useProfile } from '../components/profile-context';
import { useAppMode } from '../components/app-mode-context';

const MIN_SPLASH_MS = 120;

export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { mode, hydrated: appModeHydrated } = useAppMode();
  const router = useRouter();

  const navigatedRef = useRef(false);
  const [splashReady, setSplashReady] = useState(false);
  const authReady = !authLoading && !profileLoading && appModeHydrated;

  useEffect(() => {
    const timeout = setTimeout(() => setSplashReady(true), MIN_SPLASH_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!authReady || !splashReady || navigatedRef.current) return;
    navigatedRef.current = true;

    if (!user) {
      router.replace('/(auth)/login');
    } else if (!profile?.collector_name) {
      router.replace('/profile/setup');
    } else if (mode === 'seller') {
      router.replace('/seller');
    } else {
      router.replace('/(tabs)');
    }
  }, [authReady, mode, profile?.collector_name, router, splashReady, user]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/rev2/01-brand/app/splash.png')}
        style={styles.logo}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  logo: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});
