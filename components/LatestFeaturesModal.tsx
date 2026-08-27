import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth-context';
import { FeatureTipModal } from './FeatureTipModal';

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
    title: 'Pokedex collecting',
    body: 'Browse the Pokedex collection view to track cards by Pokemon.',
  },
  {
    icon: 'camera-outline',
    title: 'Scanner updates',
    body: 'The scan flow now has clearer feedback and improved variant handling.',
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
    <FeatureTipModal
      visible={visible}
      title="Latest StackR updates"
      subtitle={`Fresh changes in StackR ${CURRENT_VERSION}.`}
      items={BETA_FEATURES}
      ctaLabel="Got it"
      showDontShowAgain={false}
      onClose={close}
    />
  );
}
