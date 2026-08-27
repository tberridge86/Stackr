import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { isSellerTrialModeEnabled } from '../lib/sellerTrial';

type AuthContextType = {
  user: any;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

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

async function registerPushToken(userId: string) {
  if (isSellerTrialModeEnabled()) return;

  try {
    const { Notifications, Device } = await getNotificationModules();
    if (!Device.isDevice) return; // won't work on simulator

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied');
      return;
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    // Save token to Supabase profile
    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);

    if (error) {
      throw error;
    }

    console.log('Push notifications registered.');
  } catch {
    console.log('Push notifications are unavailable for this build.');
  }
}

function isStaleAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /invalid refresh token|refresh token.*used|auth session missing/i.test(message);
}

async function clearStoredSupabaseSession() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const authKeys = keys.filter((key) =>
      key.startsWith('sb-') || key.toLowerCase().includes('supabase')
    );
    if (authKeys.length) {
      await AsyncStorage.multiRemove(authKeys);
    }
  } catch (error) {
    console.log('Failed to clear stale auth storage:', error);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const currentUser = data.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          void registerPushToken(currentUser.id);
        }
      } catch (error) {
        if (isStaleAuthError(error)) {
          await clearStoredSupabaseSession();
          setUser(null);
        } else {
          console.log('Failed to load auth user:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    loadUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          void registerPushToken(currentUser.id);
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
