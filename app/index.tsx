import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';
import { useAuth } from '../components/auth-context';
import { useProfile } from '../components/profile-context';

const MIN_SPLASH_MS = 900;

export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();

  const navigatedRef = useRef(false);
  const [splashReady, setSplashReady] = useState(false);
  const authReady = !authLoading && !profileLoading;

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
    } else {
      router.replace('/(tabs)');
    }
  }, [authReady, profile?.collector_name, router, splashReady, user]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/splash.png')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
});
