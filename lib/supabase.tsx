import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://oakdbbzdqwurpjnoqhmu.supabase.co';
const supabaseAnonKey = 'sb_publishable_utiXk-8YPG57MWlrYdWgvg_7xaufYYt';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});