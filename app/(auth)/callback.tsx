import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { supabase } from '../../lib/supabase';
import { firstAuthParam, getAuthParamsFromUrl, mergeAuthLinkParams } from '../../lib/authRedirects';

export default function AuthCallbackScreen() {
  const { theme } = useTheme();
  const routeParams = useLocalSearchParams<{
    access_token?: string;
    code?: string;
    error?: string;
    error_description?: string;
    refresh_token?: string;
    type?: string;
  }>();
  const url = Linking.useURL();
  const params = mergeAuthLinkParams(routeParams, getAuthParamsFromUrl(url));
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const checkSession = async () => {
      const authError = firstAuthParam(params.error);
      const authErrorDescription = firstAuthParam(params.error_description);

      if (authError || authErrorDescription) {
        setErrorMessage(authErrorDescription || authError || 'The sign-in link could not be verified.');
        return;
      }

      const code = firstAuthParam(params.code);
      const accessToken = firstAuthParam(params.access_token);
      const refreshToken = firstAuthParam(params.refresh_token);
      const type = firstAuthParam(params.type);

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMessage(error.message);
          return;
        }
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setErrorMessage(error.message);
          return;
        }
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
  }, [params.access_token, params.code, params.error, params.error_description, params.refresh_token, params.type]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {errorMessage ? (
        <>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' }}>
            Email link could not be completed
          </Text>
          <Text style={{ color: theme.colors.textSoft, marginTop: 8, textAlign: 'center', paddingHorizontal: 24 }}>
            {errorMessage}
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
            Verifying account...
          </Text>
        </>
      )}
    </View>
  );
}
