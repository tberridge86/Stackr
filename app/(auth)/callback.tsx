import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { supabase } from '../../lib/supabase';

export default function AuthCallbackScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    access_token?: string;
    code?: string;
    refresh_token?: string;
    type?: string;
  }>();

  useEffect(() => {
    const checkSession = async () => {
      const code = Array.isArray(params.code) ? params.code[0] : params.code;
      const accessToken = Array.isArray(params.access_token) ? params.access_token[0] : params.access_token;
      const refreshToken = Array.isArray(params.refresh_token) ? params.refresh_token[0] : params.refresh_token;
      const type = Array.isArray(params.type) ? params.type[0] : params.type;

      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      } else if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      } else {
        await supabase.auth.getSession();
      }

      if (type === 'recovery') {
        router.replace('/(auth)/reset-password');
        return;
      }

      router.replace('/');
    };

    checkSession();
  }, [params.access_token, params.code, params.refresh_token, params.type]);

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
