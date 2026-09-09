import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { Text } from '../../components/Text';
import { StackrButton } from '../../components/StackrControls';
import { useTheme } from '../../components/theme-context';
import { supabase } from '../../lib/supabase';
import { firstAuthParam, getAuthParamsFromUrl, mergeAuthLinkParams } from '../../lib/authRedirects';
import { clearCallbackVerifiedRecoverySession, markCallbackVerifiedRecoverySession } from '../../lib/passwordResetRecovery';

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
    let active = true;
    const checkSession = async () => {
      setErrorMessage('');
      try {
        const authError = firstAuthParam(params.error);
        const authErrorDescription = firstAuthParam(params.error_description);

        if (authError || authErrorDescription) {
          clearCallbackVerifiedRecoverySession();
          setErrorMessage(authErrorDescription || authError || 'The sign-in link could not be verified.');
          return;
        }

        const code = firstAuthParam(params.code);
        const accessToken = firstAuthParam(params.access_token);
        const refreshToken = firstAuthParam(params.refresh_token);
        const type = firstAuthParam(params.type);

        if (type === 'recovery' && !code && !(accessToken && refreshToken)) {
          throw new Error('This reset link is missing or has expired.');
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!active) return;
          if (error) {
            clearCallbackVerifiedRecoverySession();
            setErrorMessage(error.message);
            return;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!active) return;
          if (error) {
            clearCallbackVerifiedRecoverySession();
            setErrorMessage(error.message);
            return;
          }
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionError) throw sessionError;
        if (!data.session) throw new Error('This email link is missing or has expired.');

        if (type === 'recovery') {
          markCallbackVerifiedRecoverySession(data.session.user.id);
          router.replace('/(auth)/reset-password');
          return;
        }

        clearCallbackVerifiedRecoverySession();
        router.replace('/');
      } catch (error: any) {
        clearCallbackVerifiedRecoverySession();
        if (active) setErrorMessage(error?.message || 'The email link could not be verified. Please try signing in again.');
      }
    };

    void checkSession();
    return () => { active = false; };
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
          <Text accessibilityRole="alert" style={{ color: theme.colors.textSoft, marginTop: 8, textAlign: 'center', paddingHorizontal: 24 }}>
            {errorMessage}
          </Text>
          <View style={{ gap: 10, marginTop: 24, paddingHorizontal: 24, width: '100%', maxWidth: 420 }}>
            <StackrButton label="Sign in" variant="primary" onPress={() => router.replace('/(auth)/login')} />
            <StackrButton label="Request a new reset link" onPress={() => router.replace({ pathname: '/(auth)/login', params: { mode: 'reset' } })} />
          </View>
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
