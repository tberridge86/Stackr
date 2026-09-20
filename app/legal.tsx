import React from 'react';
import { Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { UtilityGroup, UtilityRow, UtilityScreen } from '../components/UtilityScreen';
import { PRIVACY_URL } from '../lib/supportHelp';

export default function LegalScreen() {
  const router = useRouter();
  return <UtilityScreen title="Legal">
    <UtilityGroup title="Privacy">
      <UtilityRow title="Privacy notice" detail="Open the current public notice in your browser." onPress={() => { void Linking.openURL(PRIVACY_URL).catch(() => Alert.alert('Could not open the privacy notice', 'Please check your connection and try again.')); }} />
      <UtilityRow title="Contact about your data" onPress={() => router.push({ pathname: '/help', params: { request: 'data', screen: 'Legal' } })} />
      <UtilityRow title="Permissions and practical controls" onPress={() => router.push('/settings')} />
    </UtilityGroup>
  </UtilityScreen>;
}
