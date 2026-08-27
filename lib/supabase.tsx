import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import { MOBILE_RUNTIME_CONFIG } from './mobileRuntimeConfig';

const isStaticWebRender = Platform.OS === 'web' && typeof window === 'undefined';
const staticRenderStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const supabase = createClient(
  MOBILE_RUNTIME_CONFIG.supabaseUrl,
  MOBILE_RUNTIME_CONFIG.supabasePublishableKey,
  {
    auth: {
      storage: isStaticWebRender ? staticRenderStorage : AsyncStorage,
      autoRefreshToken: !isStaticWebRender,
      persistSession: !isStaticWebRender,
      detectSessionInUrl: false,
    },
  },
);
