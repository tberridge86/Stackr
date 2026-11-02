import React, { useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../components/auth-context';
import { StackrScreen, StackrPageHeader } from '../../components/StackrScreen';
import { StackrButton } from '../../components/StackrControls';
import { Text } from '../../components/Text';
import { supabase } from '../../lib/supabase';

export default function CoreAccountScreen() {
  const { user, refreshAuth } = useAuth();
  const [busy, setBusy] = useState(false);
  const currentAccount = useRef(user?.id); currentAccount.current = user?.id;
  const busyRef = useRef(false);
  async function signOut() {
    if (busyRef.current || !user?.id) return;
    const expectedAccount = user.id;
    busyRef.current = true; setBusy(true);
    try {
      const verified = await supabase.auth.getUser();
      if (verified.error || verified.data.user?.id !== expectedAccount || currentAccount.current !== expectedAccount) throw new Error('Your account changed. Reopen Account before signing out.');
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      if (currentAccount.current && currentAccount.current !== expectedAccount) return;
      await refreshAuth();
      router.replace('/(auth)/login');
    } catch (error) {
      Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.');
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <StackrScreen variant="detail">
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 120 }}>
      <StackrButton label="Back" variant="secondary" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
      <StackrPageHeader title="Account" />
      <Text>{user?.email ?? 'Signed out'}</Text>
      <View style={{ gap: 12 }}>
        <StackrButton label="Help" variant="secondary" onPress={() => router.push('/help')} />
        <StackrButton label="Privacy and terms" variant="secondary" onPress={() => router.push('/legal')} />
        {user ? <StackrButton label="Sign out" loading={busy} disabled={busy} onPress={() => void signOut()} />
          : <StackrButton label="Sign in" onPress={() => router.push('/(auth)/login')} />}
      </View>
    </ScrollView>
  </StackrScreen>;
}

