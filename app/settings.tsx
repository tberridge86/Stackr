import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, Switch, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image as CachedImage } from 'expo-image';
import { UtilityGroup, UtilityRow, UtilityScreen } from '../components/UtilityScreen';
import { Text } from '../components/Text';
import { useAuth } from '../components/auth-context';
import { useTheme } from '../components/theme-context';
import { supabase } from '../lib/supabase';
import { getPasswordResetRedirectUrl } from '../lib/authRedirects';
import { getStackrHapticsEnabled, hydrateStackrHapticsPreference, saveStackrHapticsEnabled } from '../lib/haptics';
import { cardMotionPreference, useCardMotionPreference } from '../lib/cardMotionPreference';
import { CollectionDataControls } from '../components/CollectionDataControls';
import { MintyPreferenceControls } from '../components/MintyPreferenceControls';

function describePermission(value: { status: string; accessPrivileges?: string }) {
  return value.accessPrivileges === 'limited' ? 'Selected photos only' : value.status === 'granted' ? 'Allowed' : value.status === 'denied' ? 'Not allowed' : 'Not requested';
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const accountId = user?.id ?? null;
  const currentAccount = useRef(accountId); currentAccount.current = accountId;
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [haptics, setHaptics] = useState(getStackrHapticsEnabled);
  const [hapticsLoaded, setHapticsLoaded] = useState(false);
  const motion = useCardMotionPreference();
  const [permissions, setPermissions] = useState({ camera: 'Checking…', photos: 'Checking…', notifications: 'Checking…' });

  const refreshPermissions = useCallback(async () => {
    if (Platform.OS === 'web') {
      setPermissions({ camera: 'Managed by your browser', photos: 'Selected when choosing a photo', notifications: 'Manage in the mobile app' });
      return;
    }
    const read = async (name: keyof typeof permissions, get: () => Promise<string>) => {
      try { const value = await get(); setPermissions(previous => ({ ...previous, [name]: value })); }
      catch { setPermissions(previous => ({ ...previous, [name]: 'Could not check · reopen to retry' })); }
    };
    await Promise.all([
      read('camera', async () => describePermission(await (await import('expo-camera')).Camera.getCameraPermissionsAsync())),
      read('photos', async () => describePermission(await (await import('expo-image-picker')).getMediaLibraryPermissionsAsync())),
      read('notifications', async () => describePermission(await (await import('expo-notifications')).getPermissionsAsync())),
    ]);
  }, []);
  useFocusEffect(useCallback(() => { void refreshPermissions(); }, [refreshPermissions]));
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refreshPermissions(); });
    let active = true;
    void hydrateStackrHapticsPreference().then(value => { if (active) { setHaptics(value); setHapticsLoaded(true); } });
    return () => { active = false; listener.remove(); };
  }, [refreshPermissions]);
  useEffect(() => { setMessage(null); }, [accountId]);

  const run = async (name: string, work: () => Promise<string | void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(name); setMessage(null);
    const owner = currentAccount.current;
    try {
      const result = await work();
      if (owner === currentAccount.current && result) setMessage(result);
    } catch {
      if (owner === currentAccount.current) setMessage(`${name} could not be completed. Please try again. Your saved choices have been kept.`);
    } finally { busyRef.current = false; setBusy(null); }
  };
  const openDeviceSettings = () => {
    void run('Open device settings', async () => {
      if (Platform.OS === 'web') return 'Use your browser’s site permissions, or open Settings on your phone.';
      await Linking.openSettings();
    });
  };
  const signOut = (scope: 'local' | 'others') => {
    const expectedAccount = accountId;
    Alert.alert(scope === 'local' ? 'Log out of this device?' : 'Sign out other sessions?',
      scope === 'local' ? 'Finish any unsaved changes first. Saved binders remain in your account.' : 'This device stays signed in. Existing access on other devices may continue until its current token expires.', [
        { text: 'Cancel', style: 'cancel' },
        { text: scope === 'local' ? 'Log out' : 'Sign out others', style: 'destructive', onPress: () => { void run('Sign out', async () => {
          if (!expectedAccount || currentAccount.current !== expectedAccount) throw new Error('Account changed');
          const verified = await supabase.auth.getUser();
          if (verified.error || verified.data.user?.id !== expectedAccount || currentAccount.current !== expectedAccount) throw new Error('Account changed');
          const { error } = await supabase.auth.signOut({ scope }); if (error) throw error;
          if (scope === 'local') router.replace('/login');
          else return 'Other sessions were signed out. Existing access may continue until its current token expires.';
        }); } },
      ]);
  };

  return <UtilityScreen title="Settings">
    <UtilityGroup title="Account & security">
      {user ? <>
        <UtilityRow title={user.email ?? 'Signed in'} detail="Your Stackr account" />
        {user.identities?.some((identity: { provider: string }) => identity.provider === 'email') && user.email ? <UtilityRow title="Send password reset email" disabled={!!busy || loading} onPress={() => { void run('Password reset', async () => {
          if (currentAccount.current !== accountId) throw new Error('Account changed');
          const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: getPasswordResetRedirectUrl() }); if (error) throw error;
          return 'Password reset requested. Check your email for the recovery link.';
        }); }} /> : null}
        <UtilityRow title="Sign out other sessions" disabled={!!busy} onPress={() => signOut('others')} />
        <UtilityRow title="Request account deletion" onPress={() => router.push({ pathname: '/help', params: { request: 'deletion', screen: 'Settings' } })} />
      </> : <UtilityRow title={loading ? 'Checking account…' : 'Login or recover access'} disabled={loading} onPress={() => router.push('/login')} />}
    </UtilityGroup>
    <UtilityGroup title="Collection">
      <UtilityRow title="Binders and card languages" detail="Choose the language, finish, order and defaults in each binder." onPress={() => router.push('/(tabs)/binder')} />
      <UtilityRow title="Guide-price currency" detail="GBP (£). Original quote source and currency stay attached to the price." />
    </UtilityGroup>
    <UtilityGroup title="Appearance & accessibility">
      <UtilityRow title="Touch feedback" detail="Haptics for Stackr actions on this device." trailing={<Switch trackColor={{ true: theme.colors.primary }} accessibilityLabel="Touch feedback" value={haptics} disabled={!!busy || !hapticsLoaded} onValueChange={value => { void run('Save touch feedback', async () => { await saveStackrHapticsEnabled(value); setHaptics(value); }); }} />} />
      <UtilityRow title="Reduce card motion" detail="Turn off card tilt and lighting. Your device’s Reduce Motion setting is always respected." trailing={<Switch trackColor={{ true: theme.colors.primary }} accessibilityLabel="Reduce card motion" value={motion.reduced} disabled={!!busy || (!motion.loaded && !motion.error)} onValueChange={value => { void run('Save card motion', () => cardMotionPreference.save(value)); }} />} />
      {motion.error ? <UtilityRow title="Card motion preference could not load" detail="Motion is paused. Change the switch to save a choice or reopen Settings to retry." /> : null}
      <UtilityRow title="Text size" detail="Stackr follows your device’s text size. Change it in your device’s accessibility settings." />
    </UtilityGroup>
    <UtilityGroup title="Permissions & notifications">
      <UtilityRow title="Camera" detail={permissions.camera} onPress={openDeviceSettings} />
      <UtilityRow title="Photo library" detail={permissions.photos} onPress={openDeviceSettings} />
      <UtilityRow title="Notifications" detail={permissions.notifications} onPress={openDeviceSettings} />
      <UtilityRow title="In-app notifications" onPress={() => router.push('/notifications')} />
    </UtilityGroup>
    {user ? <CollectionDataControls /> : null}
    <UtilityGroup title="Your data & storage">
      <UtilityRow title="Clear downloaded images" detail="Images will download again. Keeps original photos, binder entries and pending work." disabled={!!busy} onPress={() => Alert.alert('Clear downloaded images?', 'Offline image previews may be unavailable until they download again. Original photos and pending work stay on this device.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Clear images', onPress: () => { void run('Clear downloaded images', async () => {
          if (Platform.OS === 'web') return 'Your browser manages downloaded images. This action has not removed any app data.';
          const memory = await CachedImage.clearMemoryCache(); const disk = await CachedImage.clearDiskCache();
          if (!memory || !disk) throw new Error('Image cache unavailable');
          return 'Downloaded image copies cleared. Your binder entries, original photos and pending work were kept.';
        }); } },
      ])} />
      <UtilityRow title="Personal data request" detail="Ask about access, correction or deletion." onPress={() => router.push({ pathname: '/help', params: { request: 'data', screen: 'Settings' } })} />
    </UtilityGroup>
    {user ? <UtilityGroup title="Minty personalisation"><View style={{ paddingHorizontal: 16 }}><MintyPreferenceControls userId={accountId} /></View></UtilityGroup> : null}
    <UtilityGroup title="Help & information">
      <UtilityRow title="Help & troubleshooting" onPress={() => router.push('/help')} />
      <UtilityRow title="Legal & privacy" onPress={() => router.push('/legal')} />
      <UtilityRow title="About & app updates" onPress={() => router.push('/about')} />
    </UtilityGroup>
    {user ? <UtilityGroup title="This device"><UtilityRow title="Log out" destructive disabled={!!busy} onPress={() => signOut('local')} /></UtilityGroup> : null}
    {busy || message ? <Text accessibilityLiveRegion="polite" style={{ lineHeight: 21, marginBottom: 20 }}>{busy ? `${busy}…` : message}</Text> : null}
  </UtilityScreen>;
}
