import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oakdbbzdqwurpjnoqhmu.supabase.co';
const supabaseAnonKey = 'sb_publishable_utiXk-8YPG57MWlrYdWgvg_7xaufYYt';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);