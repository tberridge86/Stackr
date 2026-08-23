import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const appVariant = process.env.EXPO_PUBLIC_APP_VARIANT ?? process.env.APP_VARIANT ?? 'production';
const isStagingApp = appVariant === 'staging';
const productionSupabaseUrl = 'https://oakdbbzdqwurpjnoqhmu.supabase.co';
const productionSupabaseAnonKey = 'sb_publishable_utiXk-8YPG57MWlrYdWgvg_7xaufYYt';
const supabaseUrl = (
  process.env.EXPO_PUBLIC_SUPABASE_URL
  ?? (isStagingApp ? '' : productionSupabaseUrl)
).trim();
const supabaseAnonKey = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ?? (isStagingApp ? '' : productionSupabaseAnonKey)
).trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(`Missing public Supabase configuration for ${appVariant} app build.`);
}

if (isStagingApp && supabaseUrl.includes('oakdbbzdqwurpjnoqhmu')) {
  throw new Error('Staging app build is configured with the production Supabase project.');
}
const isStaticWebRender = Platform.OS === 'web' && typeof window === 'undefined';
const staticRenderStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isStaticWebRender ? staticRenderStorage : AsyncStorage,
    autoRefreshToken: !isStaticWebRender,
    persistSession: !isStaticWebRender,
    detectSessionInUrl: false,
  },
});
