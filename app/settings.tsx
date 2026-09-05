import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { StackrBackButton } from '../components/StackrBackButton';
import { StackrPageTitle } from '../components/StackrScreen';
import { Text } from '../components/Text';
import { useAppMode } from '../components/app-mode-context';
import { useTheme } from '../components/theme-context';
import { supabase } from '../lib/supabase';
import { OWNER_PRIVATE_RECOGNITION_ENABLED } from '../lib/ownerRecognitionCore';

const SETTINGS_ICONS = {
  account: require('../assets/rev2/03-ui-illustrations/hero-icons/profile.png'),
  appearance: require('../assets/rev2/03-ui-illustrations/hero-icons/hub.png'),
  notifications: require('../assets/rev2/03-ui-illustrations/hero-icons/notifications.png'),
  market: require('../assets/rev2/03-ui-illustrations/hero-icons/marketplace.png'),
  seller: require('../assets/rev2/03-ui-illustrations/hero-icons/seller-mode.png'),
  privacy: require('../assets/rev2/03-ui-illustrations/hero-icons/protect.png'),
  support: require('../assets/rev2/03-ui-illustrations/hero-icons/info.png'),
} as const;

type SettingsIconKey = keyof typeof SETTINGS_ICONS;

const settingsSections: {
  title: string;
  body: string;
  icon: SettingsIconKey;
  items: string[];
  sellerOnly?: boolean;
}[] = [
  { title: 'General', icon: 'account', body: 'Account identity and app defaults.', items: ['Email and password', 'Authentication and sessions', 'Profile visibility', 'Account deletion'] },
  { title: 'Appearance', icon: 'appearance', body: 'Display preferences and accessibility.', items: ['Dynamic text', 'Reduced motion', 'Camera and photo permissions'] },
  { title: 'Notifications', icon: 'notifications', body: 'Choose the alerts Stackr can send.', items: ['The Market alerts', 'Trade and offer updates', 'Community updates', 'Price movement alerts'] },
  { title: 'Marketplace', icon: 'market', body: 'Listing, offer and trade preferences.', items: ['The Market preferences', 'Trade preferences', 'Saved listing preferences'] },
  { title: 'Seller', icon: 'seller', body: 'Operational settings for card inventory.', items: ['Inventory defaults', 'Scan In and Scan Out defaults', 'CSV import and export'], sellerOnly: true },
  { title: 'Privacy', icon: 'privacy', body: 'Control visibility, data and community safety.', items: ['Binder visibility defaults', 'Blocked users', 'Data export', 'Community safety controls'] },
  { title: 'Legal & Support', icon: 'support', body: 'Help, release notes and legal information.', items: ['Help and support', 'Report a problem', 'Legal information', 'App version'] },
];

function SettingsIcon({ source }: { source: ImageSourcePropType }) {
  return (
    <Image
      source={source}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      style={{ width: 34, height: 34 }}
    />
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { hydrated, premiumSellerAccess } = useAppMode();
  const [loggingOut, setLoggingOut] = useState(false);
  const showSellerSettings = hydrated && premiumSellerAccess.allowed;

  const handleLogout = useCallback(async () => {
    try {
      setLoggingOut(true);
      const { error } = await supabase.auth.signOut();
      if (error) {
        Alert.alert('Logout failed', error.message);
        return;
      }
      router.replace('/login');
    } catch {
      Alert.alert('Logout failed', 'Something went wrong. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  }, [router]);

  const confirmLogout = useCallback(() => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: handleLogout },
    ]);
  }, [handleLogout]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StackrBackdrop />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 72 }} showsVerticalScrollIndicator={false}>
        {OWNER_PRIVATE_RECOGNITION_ENABLED && <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/scan/owner')}
          style={{ padding: 16, marginBottom: 14, backgroundColor: theme.colors.card, borderRadius: 16 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Private recognition &amp; my capture dataset</Text>
          <Text style={{ color: theme.colors.textSoft, marginTop: 4 }}>Owner account only · SigLIP · manual review</Text>
        </TouchableOpacity>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <StackrPageTitle title="Settings" accentText="ings" />
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 2 }}>
              Account, privacy and collector preferences.
            </Text>
          </View>
        </View>

        <View
          style={{
            borderRadius: 22,
            backgroundColor: 'rgba(255,255,255,0.88)',
            borderWidth: 1,
            borderColor: '#E8E1FF',
            padding: 14,
            marginBottom: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 17, backgroundColor: '#F7F3FF', borderWidth: 1, borderColor: '#E8E1FF', alignItems: 'center', justifyContent: 'center' }}>
            <SettingsIcon source={SETTINGS_ICONS.support} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900' }}>
              Settings are separated from Profile
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 3 }}>
              {showSellerSettings
                ? 'Account, marketplace, seller inventory and privacy controls are kept in one place.'
                : 'Account, marketplace and privacy controls are kept in one place.'}
            </Text>
          </View>
        </View>

        {settingsSections.filter((section) => !section.sellerOnly || showSellerSettings).map((section) => (
          <View
            key={section.title}
            style={{
              borderRadius: 22,
              backgroundColor: 'rgba(255,255,255,0.88)',
              borderWidth: 1,
              borderColor: '#E8E1FF',
              padding: 14,
              marginBottom: 12,
              shadowColor: '#6136F5',
              shadowOpacity: 0.07,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 5 },
              elevation: 1,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <View style={{ width: 48, height: 48, borderRadius: 17, backgroundColor: '#F7F3FF', borderWidth: 1, borderColor: '#E8E1FF', alignItems: 'center', justifyContent: 'center' }}>
                <SettingsIcon source={SETTINGS_ICONS[section.icon]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' }}>{section.title}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 }}>{section.body}</Text>
              </View>
            </View>
            <View style={{ marginTop: 11, gap: 7 }}>
              {section.items.map((item) => (
                <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: theme.colors.primary }} />
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700' }}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity
          onPress={confirmLogout}
          disabled={loggingOut}
          accessibilityRole="button"
          accessibilityLabel="Log out"
          activeOpacity={0.84}
          style={{
            minHeight: 52,
            borderRadius: 19,
            backgroundColor: '#FFECEC',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: loggingOut ? 0.68 : 1,
          }}
        >
          {loggingOut ? (
            <ActivityIndicator color="#D92D20" />
          ) : (
            <Text style={{ color: '#D92D20', fontSize: 14, lineHeight: 17, fontWeight: '900' }}>
              Log out
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
