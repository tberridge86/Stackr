import { supabase } from './supabase';

export type CosmeticType = 'banner' | 'border';

export type CosmeticItem = {
  id: string;
  name: string;
  description: string;
  type: CosmeticType;
  price: number;
  color: string;
  accentColor: string;
};

export const COSMETIC_ITEMS: CosmeticItem[] = [
  {
    id: 'banner_purple_pulse',
    name: 'Purple Pulse',
    description: 'A clean Stackr profile banner.',
    type: 'banner',
    price: 150,
    color: '#6D5DF6',
    accentColor: '#C4B5FD',
  },
  {
    id: 'banner_gold_pull',
    name: 'Gold Pull',
    description: 'A warmer banner for big hits.',
    type: 'banner',
    price: 300,
    color: '#F6C453',
    accentColor: '#7C4A03',
  },
  {
    id: 'border_master_set',
    name: 'Master Set Frame',
    description: 'A profile border for completionists.',
    type: 'border',
    price: 500,
    color: '#8B5CF6',
    accentColor: '#FDE68A',
  },
  {
    id: 'border_trade_ready',
    name: 'Trade Ready Frame',
    description: 'A bold border for active traders.',
    type: 'border',
    price: 250,
    color: '#14B8A6',
    accentColor: '#CCFBF1',
  },
];

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.log('Cosmetic auth lookup failed:', error.message);
    return null;
  }
  return data.user?.id ?? null;
}

export async function fetchOwnedCosmeticIds(userId?: string): Promise<Set<string>> {
  const resolvedUserId = userId ?? (await getCurrentUserId());
  if (!resolvedUserId) return new Set();

  const { data, error } = await supabase
    .from('user_cosmetics')
    .select('cosmetic_id')
    .eq('user_id', resolvedUserId);

  if (error) {
    if (error.code !== 'PGRST204' && error.code !== '42P01') {
      console.log('Owned cosmetics load failed:', error.message);
    }
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.cosmetic_id));
}

export async function purchaseCosmetic(cosmeticId: string) {
  const item = COSMETIC_ITEMS.find((cosmetic) => cosmetic.id === cosmeticId);
  if (!item) return { ok: false, message: 'This cosmetic is not available.' };

  const { data, error } = await supabase.rpc('purchase_cosmetic', {
    p_cosmetic_id: cosmeticId,
  });

  if (error) return { ok: false, message: error.message };

  const result = data as { ok?: boolean; message?: string } | null;
  return {
    ok: result?.ok === true,
    message: result?.message ?? `${item.name} unlocked.`,
  };
}

export async function equipCosmetic(cosmeticId: string) {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, message: 'You need to be logged in.' };

  const item = COSMETIC_ITEMS.find((cosmetic) => cosmetic.id === cosmeticId);
  if (!item) return { ok: false, message: 'This cosmetic is not available.' };

  const owned = await fetchOwnedCosmeticIds(userId);
  if (!owned.has(cosmeticId)) return { ok: false, message: 'Unlock this cosmetic first.' };

  const updates =
    item.type === 'banner'
      ? { profile_banner_cosmetic_id: cosmeticId }
      : { profile_border_cosmetic_id: cosmeticId };

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `${item.name} equipped.` };
}
