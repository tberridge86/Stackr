import React, { useRef, useState } from 'react';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Alert, Platform } from 'react-native';
import { UtilityGroup, UtilityRow, UtilityScreen } from '../components/UtilityScreen';
import { Text } from '../components/Text';

export default function AboutScreen() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const canCheckForUpdates = Platform.OS !== 'web' && Updates.isEnabled;
  const checkForUpdate = async () => {
    if (busyRef.current || !canCheckForUpdates) return;
    busyRef.current = true; setBusy(true);
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable && !check.isRollBackToEmbedded) { setMessage('You have the latest compatible app update. New app versions are installed from TestFlight or the App Store.'); return; }
      setMessage('Downloading the app update…');
      const download = await Updates.fetchUpdateAsync();
      if (!download.isNew && !download.isRollBackToEmbedded) { setMessage('No newer update was downloaded. Try again later.'); return; }
      setMessage('Update downloaded. Restart Stackr to apply it.');
      Alert.alert('Update ready', 'Finish any unsaved work before restarting Stackr.', [
        { text: 'Later', style: 'cancel' }, { text: 'Restart now', onPress: () => { void Updates.reloadAsync().catch(() => setMessage('Close and reopen Stackr to apply the update.')); } },
      ]);
    } catch { setMessage('Could not check for an update. Check your connection and try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <UtilityScreen title="About Stackr">
    <UtilityGroup title="Installed version">
      <UtilityRow title={`Stackr ${Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'development'}`} detail={`Build ${Constants.nativeBuildVersion ?? 'preview'}`} />
      <UtilityRow title="App update" detail={Updates.isEmbeddedLaunch ? 'Included with this build' : Updates.createdAt?.toLocaleString() ?? 'Development preview'} />
      {canCheckForUpdates ? <UtilityRow title={busy ? 'Checking…' : 'Check for updates'} disabled={busy} onPress={() => { void checkForUpdate(); }} /> : null}
    </UtilityGroup>
    {Updates.updateId ? <Text selectable style={{ marginBottom: 16 }}>Support reference: {Updates.updateId}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={{ lineHeight: 22 }}>{message}</Text> : null}
  </UtilityScreen>;
}
