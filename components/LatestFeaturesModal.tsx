import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from './Text';
import { useAuth } from './auth-context';
import { useTheme } from './theme-context';

type FeatureItem = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
};

const BETA_FEATURES: FeatureItem[] = [
  {
    icon: 'trophy-outline',
    title: 'Achievements and coins',
    body: 'Unlock accomplishments as you build binders, scan cards, and complete collections.',
  },
  {
    icon: 'albums-outline',
    title: 'Binder improvements',
    body: 'Master set variants, ownership ticks, default condition handling, and value fixes have been tightened up.',
  },
  {
    icon: 'search-outline',
    title: 'Pokédex collecting',
    body: 'A new Pokédex collection view is in progress so you can track cards by Pokémon.',
  },
  {
    icon: 'camera-outline',
    title: 'Scanner updates',
    body: 'The scan flow now has clearer feedback, better debug logging, and improved variant handling.',
  },
  {
    icon: 'pricetag-outline',
    title: 'Market value work',
    body: 'Raw and graded eBay pricing searches are being refined for more accurate results.',
  },
];

const CURRENT_VERSION =
  Constants.expoConfig?.version ??
  Constants.manifest2?.extra?.expoClient?.version ??
  '1.0.0';

function getStorageKey(userId: string) {
  return `stackr:latest-features-seen:${userId}:${CURRENT_VERSION}`;
}

export function LatestFeaturesModal() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  const shouldCheck = useMemo(() => {
    if (loading || !user?.id) return false;
    if (pathname.startsWith('/(auth)')) return false;
    if (pathname.startsWith('/auth')) return false;
    if (pathname.includes('callback') || pathname.includes('reset-password')) return false;
    return true;
  }, [loading, pathname, user?.id]);

  useEffect(() => {
    let mounted = true;

    const checkSeen = async () => {
      if (!shouldCheck || !user?.id) return;

      try {
        const seen = await AsyncStorage.getItem(getStorageKey(user.id));
        if (mounted && seen !== 'true') {
          setVisible(true);
        }
      } catch (error) {
        console.log('Latest features modal check failed:', error);
      }
    };

    checkSeen();

    return () => {
      mounted = false;
    };
  }, [shouldCheck, user?.id]);

  const close = async () => {
    setVisible(false);
    if (!user?.id) return;

    try {
      await AsyncStorage.setItem(getStorageKey(user.id), 'true');
    } catch (error) {
      console.log('Latest features modal dismiss failed:', error);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(8,10,20,0.52)', justifyContent: 'center', padding: 18 }}>
        <Pressable style={{ position: 'absolute', inset: 0 }} onPress={close} />

        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 18,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            maxHeight: '82%',
            shadowColor: '#000',
            shadowOpacity: theme.dark ? 0.28 : 0.14,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 8,
          }}
        >
          <TouchableOpacity
            onPress={close}
            activeOpacity={0.75}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: theme.colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <Ionicons name="close" size={20} color={theme.colors.textSoft} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center', paddingHorizontal: 28, marginBottom: 14 }}>
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 17,
                backgroundColor: `${theme.colors.primary}18`,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <Ionicons name="sparkles" size={26} color={theme.colors.primary} />
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 21, fontWeight: '900', textAlign: 'center' }}>
              Thanks for testing Beta
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 6, lineHeight: 17 }}>
              Here are the latest changes in Stackr {CURRENT_VERSION}.
            </Text>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 9 }} showsVerticalScrollIndicator={false}>
            {BETA_FEATURES.map((item) => (
              <View
                key={item.title}
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 11,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 11,
                    backgroundColor: theme.colors.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Ionicons name={item.icon} size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>{item.title}</Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, marginTop: 2 }}>{item.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            onPress={close}
            activeOpacity={0.85}
            style={{ marginTop: 14, backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
