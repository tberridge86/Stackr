import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../components/auth-context';
import { useProfile } from '../components/profile-context';

export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || profileLoading) return;

    if (!user) {
      router.replace('/(auth)/login');
      return;
    }

    if (!profile?.collector_name) {
      router.replace('/profile/setup');
      return;
    }

    router.replace('/(tabs)');
  }, [user, authLoading, profile, profileLoading]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#080b1d' }}>
      <ActivityIndicator />
    </View>
  );
}