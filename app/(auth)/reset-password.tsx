import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../components/theme-context';
import { firstAuthParam, getAuthParamsFromUrl, mergeAuthLinkParams } from '../../lib/authRedirects';
import {
  clearCallbackVerifiedRecoverySession,
  getPasswordResetScreenState,
  hasCallbackVerifiedRecoverySession,
} from '../../lib/passwordResetRecovery';
import { Text } from '../../components/Text';

export default function ResetPasswordScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const routeParams = useLocalSearchParams<{
    access_token?: string;
    code?: string;
    refresh_token?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
  }>();
  const url = Linking.useURL();
  const params = mergeAuthLinkParams(routeParams, getAuthParamsFromUrl(url));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [checkingLink, setCheckingLink] = useState(true);
  const [recoverySessionReady, setRecoverySessionReady] = useState(false);
  const [recoveryUserId, setRecoveryUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const prepareSession = async () => {
      try {
        setCheckingLink(true);
        setError('');
        setRecoverySessionReady(false);
        setRecoveryUserId(null);

        const linkError = firstAuthParam(params.error_description) || firstAuthParam(params.error) || firstAuthParam(params.error_code);
        if (linkError) throw new Error(linkError);

        const code = firstAuthParam(params.code);
        const accessToken = firstAuthParam(params.access_token);
        const refreshToken = firstAuthParam(params.refresh_token);
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!active) return;
          if (exchangeError) throw exchangeError;
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!active) return;
          if (sessionError) throw sessionError;
        }

        const { data, error: sessionReadError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionReadError) throw sessionReadError;
        if (!data.session) {
          clearCallbackVerifiedRecoverySession();
          setError('This reset link is missing or has expired. Please request a new password reset email.');
          return;
        }
        const callbackVerified = hasCallbackVerifiedRecoverySession(data.session.user.id);
        if (!code && !(accessToken && refreshToken) && !callbackVerified) {
          setError('This reset link is missing or has expired. Please request a new password reset email.');
          return;
        }
        setRecoveryUserId(data.session.user.id);
        setRecoverySessionReady(true);
      } catch (err: any) {
        if (!active) return;
        clearCallbackVerifiedRecoverySession();
        if (active) setError(err?.message || 'Could not open the password reset link.');
      } finally {
        if (active) setCheckingLink(false);
      }
    };

    void prepareSession();
    return () => { active = false; };
  }, [params.access_token, params.code, params.refresh_token, params.error, params.error_code, params.error_description]);

  const handleSavePassword = async () => {
    setError('');
    setMessage('');

    if (!recoverySessionReady) {
      setError('This reset link is missing or has expired. Request a new password reset email.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setSaving(true);
      const { data: currentSession, error: currentSessionError } = await supabase.auth.getSession();
      if (currentSessionError) throw currentSessionError;
      if (!recoveryUserId || currentSession.session?.user.id !== recoveryUserId) {
        clearCallbackVerifiedRecoverySession();
        setRecoverySessionReady(false);
        throw new Error('Your session changed. Please request a new password reset link.');
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setMessage('Password updated. You can now log in with your new password.');
      await supabase.auth.signOut();
      clearCallbackVerifiedRecoverySession();
      setTimeout(() => router.replace('/(auth)/login'), 800);
    } catch (err: any) {
      setError(err?.message || 'Could not update password.');
    } finally {
      setSaving(false);
    }
  };

  const screenState = getPasswordResetScreenState({ checkingLink, recoverySessionReady });

  return (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
    >
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>Choose a new password for your Stackr account.</Text>

            {screenState === 'checking' ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.loadingText}>Checking reset link...</Text>
              </View>
            ) : screenState === 'update_password' ? (
              <>
                <TextInput
                  placeholder="New password"
                  placeholderTextColor={theme.colors.textSoft}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={styles.input}
                />

                <TextInput
                  placeholder="Confirm new password"
                  placeholderTextColor={theme.colors.textSoft}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  style={styles.input}
                />

                {error ? <Text style={styles.error}>{error}</Text> : null}
                {message ? <Text style={styles.message}>{message}</Text> : null}

                <Pressable
                  style={[styles.button, saving && styles.buttonDisabled]}
                  onPress={handleSavePassword}
                  disabled={saving || Boolean(message)}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.buttonText}>Update password</Text>
                  )}
                </Pressable>

                <Pressable style={styles.secondaryButton} onPress={() => {
                  clearCallbackVerifiedRecoverySession();
                  router.replace('/(auth)/login');
                }}>
                  <Text style={styles.secondaryText}>Back to login</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text accessibilityRole="alert" style={styles.error}>
                  {error || 'This reset link is no longer valid.'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={styles.button}
                  onPress={() => {
                    clearCallbackVerifiedRecoverySession();
                    router.replace({ pathname: '/(auth)/login', params: { mode: 'reset' } });
                  }}
                >
                  <Text style={styles.buttonText}>Request a new reset link</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => {
                  clearCallbackVerifiedRecoverySession();
                  router.replace('/(auth)/login');
                }}>
                  <Text style={styles.secondaryText}>Back to login</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    keyboard: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingBottom: 40,
    },
    container: {
      padding: 24,
    },
    title: {
      color: theme.colors.text,
      fontSize: 32,
      fontWeight: '900',
      marginBottom: 8,
    },
    subtitle: {
      color: theme.colors.textSoft,
      marginBottom: 22,
      lineHeight: 20,
    },
    input: {
      backgroundColor: theme.colors.card,
      color: theme.colors.text,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    button: {
      backgroundColor: theme.colors.primary,
      padding: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 10,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      color: '#FFFFFF',
      fontWeight: '900',
    },
    secondaryButton: {
      marginTop: 12,
      alignItems: 'center',
      padding: 10,
    },
    secondaryText: {
      color: theme.colors.primary,
      fontWeight: '800',
    },
    loadingBox: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
    },
    loadingText: {
      color: theme.colors.textSoft,
      marginTop: 10,
    },
    error: {
      color: '#FF6B6B',
      marginBottom: 10,
      lineHeight: 18,
    },
    message: {
      color: '#22C55E',
      marginBottom: 10,
      lineHeight: 18,
    },
  });
}
