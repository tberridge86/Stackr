import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './auth-context';
import { supabase } from '../lib/supabase';

let notificationHandlerConfigured = false;

async function getNotificationModules() {
  const [Notifications, Device] = await Promise.all([
    import('expo-notifications'),
    import('expo-device'),
  ]);

  if (!notificationHandlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerConfigured = true;
  }

  return { Notifications, Device };
}

async function registerPushToken(userId: string, isCurrent: () => boolean): Promise<'done' | 'retry' | 'cancelled'> {
  try {
    const { Notifications, Device } = await getNotificationModules();
    if (!isCurrent()) return 'cancelled';
    if (!Device.isDevice) return 'done'; // won't work on simulator

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (!isCurrent()) return 'cancelled';
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (!isCurrent()) return 'cancelled';
    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied');
      return 'done';
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;

    if (!isCurrent()) return 'cancelled';
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (!isCurrent()) return 'cancelled';
    // Save only while this verified account is still current.
    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);
    if (error) throw error;
    return 'done';

  } catch (err) {
    console.log('Failed to register push token:', err);
    return isCurrent() ? 'retry' : 'cancelled';
  }
}

/** Mounted once after the opening overlay has left and initial interactions settle. */
export default function DeferredStartupServices() {
  const { user, loading, error } = useAuth();
  const accountId = !loading && !error ? user?.id ?? null : null;
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const isCurrent = () => !cancelled && currentAccount.current === accountId;
    // Keep permissions/SDK setup out of the first useful screen's frame.
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        if (!isCurrent()) return;
        attempts += 1;
        void registerPushToken(accountId, isCurrent).then(result => {
          // Transient offline/token/profile failures get two bounded retries;
          // successful/denied registration and stale accounts never repeat.
          if (result === 'retry' && attempts < 3 && isCurrent()) schedule(5000 * attempts);
        });
      }, delay);
    };
    schedule(1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [accountId]);
  return null;
}
