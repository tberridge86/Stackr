import { theme } from '../../lib/theme';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingAction, setLoadingAction] = useState<'login' | 'signup' | null>(
    null
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loading = loadingAction !== null;

  const handleLogin = async () => {
    try {
      setLoadingAction('login');
      setError('');
      setMessage('');

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.user) {
        router.replace('/(tabs)');
      } else {
        setError('Login did not return a user.');
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSignup = async () => {
    try {
      setLoadingAction('signup');
      setError('');
      setMessage('');

      if (!email.trim() || !password.trim()) {
        setError('To register, enter your email and create a password first.');
        return;
      }

      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: 'pocketvaultnative://auth/callback',
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.user) {
        setMessage(
          'Account created. Please check your email to verify your account. After verification, you can set your Collector Name on your profile.'
        );
      } else {
        setMessage('Signup completed. Please check your email.');
      }
    } catch (err: any) {
      setError(err?.message || 'Signup failed.');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <Text style={styles.title}>Stackr</Text>
            <Text style={styles.subtitle}>
              Track your cards, value your collection, and trade with other
              collectors.
            </Text>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>New to Stackr?</Text>
              <Text style={styles.infoText}>
                Enter your email and create a password, then tap Create account.
                You’ll choose your Collector Name next, which will appear on your
                profile.
              </Text>
            </View>

            <TextInput
              placeholder="Email"
              placeholderTextColor={theme.colors.textSoft}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />

            <TextInput
              placeholder="Password"
              placeholderTextColor={theme.colors.textSoft}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {message ? <Text style={styles.message}>{message}</Text> : null}

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loadingAction === 'login' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, loading && styles.buttonDisabled]}
              onPress={handleSignup}
              disabled={loading}
            >
              {loadingAction === 'signup' ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <Text style={styles.secondaryText}>Create account</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  container: {
    padding: 24,
  },
  title: {
    color: theme.colors.text,
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 6,
  },
  subtitle: {
    color: theme.colors.textSoft,
    marginBottom: 18,
    lineHeight: 20,
  },
  infoBox: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  infoTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    marginBottom: 6,
  },
  infoText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
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
  error: {
    color: '#FF6B6B',
    marginBottom: 10,
  },
  message: {
    color: '#22C55E',
    marginBottom: 10,
    lineHeight: 18,
  },
});