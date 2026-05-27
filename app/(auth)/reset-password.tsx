import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../components/theme-context';

export default function ResetPasswordScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const params = useLocalSearchParams<{
    access_token?: string;
    code?: string;
    refresh_token?: string;
  }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [checkingLink, setCheckingLink] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const prepareSession = async () => {
      try {
        setCheckingLink(true);
        setError('');

        const code = Array.isArray(params.code) ? params.code[0] : params.code;
        const accessToken = Array.isArray(params.access_token) ? params.access_token[0] : params.access_token;
        const refreshToken = Array.isArray(params.refresh_token) ? params.refresh_token[0] : params.refresh_token;

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        }

        const { data, error: sessionReadError } = await supabase.auth.getSession();
        if (sessionReadError) throw sessionReadError;
        if (!data.session) {
          setError('This reset link is missing or has expired. Please request a new password reset email.');
        }
      } catch (err: any) {
        setError(err?.message || 'Could not open the password reset link.');
      } finally {
        setCheckingLink(false);
      }
    };

    prepareSession();
  }, [params.access_token, params.code, params.refresh_token]);

  const handleSavePassword = async () => {
    setError('');
    setMessage('');

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
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setMessage('Password updated. You can now log in with your new password.');
      await supabase.auth.signOut();
      setTimeout(() => router.replace('/(auth)/login'), 800);
    } catch (err: any) {
      setError(err?.message || 'Could not update password.');
    } finally {
      setSaving(false);
    }
  };

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

            {checkingLink ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.loadingText}>Checking reset link...</Text>
              </View>
            ) : (
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

                <Pressable style={styles.secondaryButton} onPress={() => router.replace('/(auth)/login')}>
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
