import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../components/Text';
import { theme } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

export default function AuthCallbackScreen() {
  useEffect(() => {
    const checkSession = async () => {
      await supabase.auth.getSession();
      router.replace('/');
    };

    checkSession();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator color={theme.colors.primary} size="large" />
      <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
        Verifying account...
      </Text>
    </View>
  );
}