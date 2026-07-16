import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://oakdbbzdqwurpjnoqhmu.supabase.co';
const supabaseAnonKey = 'sb_publishable_utiXk-8YPG57MWlrYdWgvg_7xaufYYt';
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
