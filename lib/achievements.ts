import { supabase } from './supabase';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'rainbow';

export type AchievementDefinition = {
  id: string;
  title: string;
  description: string;
  accolade: string;
  tier: AchievementTier;
  icon: string;
  coinReward: number;
};

export type AchievementUnlock = AchievementDefinition & {
  unlockedAt: string;
};

export type AchievementEvent =
  | 'binder_created'
  | 'card_owned'
  | 'card_scanned'
  | 'master_set_enabled'
  | 'binder_progress_updated'
  | 'binder_complete'
  | 'master_set_complete';

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_binder',
    title: 'First Binder',
    description: 'Create your first binder.',
    accolade: 'Binder Builder',
    tier: 'bronze',
    icon: 'book',
    coinReward: 25,
  },
  {
    id: 'binder_builder_3',
    title: 'Binder Builder',
    description: 'Create 3 binders.',
    accolade: 'Shelf Starter',
    tier: 'silver',
    icon: 'albums',
    coinReward: 75,
  },
  {
    id: 'first_card',
    title: 'First Card',
    description: 'Mark your first card as owned.',
    accolade: 'Card Keeper',
    tier: 'bronze',
    icon: 'checkbox',
    coinReward: 25,
  },
  {
    id: 'ten_cards',
    title: 'Card Stack',
    description: 'Own 10 cards.',
    accolade: 'Card Stacker',
    tier: 'bronze',
    icon: 'layers',
    coinReward: 50,
  },
  {
    id: 'hundred_cards',
    title: 'Card Vault',
    description: 'Own 100 cards.',
    accolade: 'Vault Keeper',
    tier: 'gold',
    icon: 'archive',
    coinReward: 150,
  },
  {
    id: 'first_scan',
    title: 'First Scan',
    description: 'Successfully scan your first card.',
    accolade: 'Scanner Rookie',
    tier: 'bronze',
    icon: 'scan',
    coinReward: 25,
  },
  {
    id: 'scanner_25',
    title: 'Scanner Trainer',
    description: 'Scan 25 cards.',
    accolade: 'Scanner Trainer',
    tier: 'silver',
    icon: 'camera',
    coinReward: 100,
  },
  {
    id: 'first_public_binder',
    title: 'Public Binder',
    description: 'Make a binder public.',
    accolade: 'Showcase Starter',
    tier: 'bronze',
    icon: 'eye',
    coinReward: 50,
  },
  {
    id: 'master_mode',
    title: 'Master Mode',
    description: 'Turn on Master Set mode.',
    accolade: 'Variant Hunter',
    tier: 'silver',
    icon: 'sparkles',
    coinReward: 75,
  },
  {
    id: 'quarter_binder',
    title: 'Quarter Binder',
    description: 'Reach 25% completion in a binder.',
    accolade: 'Binder Climber',
    tier: 'bronze',
    icon: 'analytics',
    coinReward: 50,
  },
  {
    id: 'half_binder',
    title: 'Half Binder',
    description: 'Reach 50% completion in a binder.',
    accolade: 'Halfway Hero',
    tier: 'silver',
    icon: 'pie-chart',
    coinReward: 75,
  },
  {
    id: 'almost_complete',
    title: 'Almost There',
    description: 'Reach 75% completion in a binder.',
    accolade: 'Set Chaser',
    tier: 'gold',
    icon: 'trending-up',
    coinReward: 125,
  },
  {
    id: 'binder_complete',
    title: 'Binder Complete',
    description: 'Complete any binder.',
    accolade: 'Set Finisher',
    tier: 'gold',
    icon: 'ribbon',
    coinReward: 200,
  },
  {
    id: 'master_set_complete',
    title: 'Master Set Complete',
    description: 'Complete a master set.',
    accolade: 'Completionist',
    tier: 'rainbow',
    icon: 'diamond',
    coinReward: 500,
  },
  {
    id: 'five_complete',
    title: 'Five Complete',
    description: 'Complete 5 binders.',
    accolade: 'Archive Master',
    tier: 'rainbow',
    icon: 'trophy',
    coinReward: 750,
  },
];

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

let notifyUnlocks: ((unlocks: AchievementUnlock[]) => void) | null = null;

export function setAchievementUnlockNotifier(callback: ((unlocks: AchievementUnlock[]) => void) | null) {
  notifyUnlocks = callback;
}

export async function fetchUserAchievementUnlocks(userId: string): Promise<AchievementUnlock[]> {
  const { data, error } = await supabase
    .from('user_achievements')
    .select('achievement_id, unlocked_at')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });

  if (error) {
    console.log('Failed to load achievements:', error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => {
      const definition = ACHIEVEMENT_BY_ID.get(row.achievement_id);
      if (!definition) return null;
      return { ...definition, unlockedAt: row.unlocked_at };
    })
    .filter(Boolean) as AchievementUnlock[];
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.log('Achievement auth lookup failed:', error.message);
    return null;
  }
  return data.user?.id ?? null;
}

export async function fetchUserCoinBalance(userId?: string): Promise<number> {
  const resolvedUserId = userId ?? (await getCurrentUserId());
  if (!resolvedUserId) return 0;

  const { data, error } = await supabase
    .from('user_coin_ledger')
    .select('amount')
    .eq('user_id', resolvedUserId);

  if (error) {
    if (error.code !== 'PGRST204' && error.code !== '42P01') {
      console.log('Coin balance load failed:', error.message);
    }
    return 0;
  }

  return (data ?? []).reduce((total, row) => total + Number(row.amount ?? 0), 0);
}

async function fetchAchievementStats(userId: string) {
  const bindersForUser = await supabase
    .from('binders')
    .select('id')
    .eq('user_id', userId);
  const binderIds = (bindersForUser.data ?? []).map((binder) => binder.id).filter(Boolean);

  const [
    bindersResult,
    ownedCardsResult,
    publicBindersResult,
    scanEventsResult,
    completeBindersResult,
    masterCompleteBindersResult,
  ] = await Promise.all([
    supabase.from('binders').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    binderIds.length
      ? supabase.from('binder_cards').select('id', { count: 'exact', head: true }).eq('owned', true).in('binder_id', binderIds)
      : Promise.resolve({ count: 0, error: null }),
    supabase.from('binders').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_public', true),
    supabase.from('user_achievement_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('event_type', 'card_scanned'),
    supabase.from('user_achievement_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('event_type', 'binder_complete'),
    supabase.from('user_achievement_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('event_type', 'master_set_complete'),
  ]);

  const logError = (label: string, error: any) => {
    if (error) console.log(`Achievement ${label} stat failed:`, error.message);
  };

  logError('binder', bindersResult.error);
  logError('owned card', ownedCardsResult.error);
  logError('public binder', publicBindersResult.error);
  logError('scan', scanEventsResult.error);
  logError('complete binder', completeBindersResult.error);
  logError('master complete', masterCompleteBindersResult.error);

  return {
    binderCount: bindersResult.count ?? 0,
    ownedCardCount: ownedCardsResult.count ?? 0,
    publicBinderCount: publicBindersResult.count ?? 0,
    scanCount: scanEventsResult.count ?? 0,
    completeBinderCount: completeBindersResult.count ?? 0,
    masterCompleteBinderCount: masterCompleteBindersResult.count ?? 0,
  };
}

function evaluateAchievements(stats: Awaited<ReturnType<typeof fetchAchievementStats>>) {
  const ids: string[] = [];

  if (stats.binderCount >= 1) ids.push('first_binder');
  if (stats.binderCount >= 3) ids.push('binder_builder_3');
  if (stats.ownedCardCount >= 1) ids.push('first_card');
  if (stats.ownedCardCount >= 10) ids.push('ten_cards');
  if (stats.ownedCardCount >= 100) ids.push('hundred_cards');
  if (stats.scanCount >= 1) ids.push('first_scan');
  if (stats.scanCount >= 25) ids.push('scanner_25');
  if (stats.publicBinderCount >= 1) ids.push('first_public_binder');
  if (stats.completeBinderCount >= 1) ids.push('binder_complete');
  if (stats.completeBinderCount >= 5) ids.push('five_complete');
  if (stats.masterCompleteBinderCount >= 1) ids.push('master_set_complete');

  return ids;
}

export async function recordAchievementEvent(
  eventType: AchievementEvent,
  metadata: Record<string, unknown> = {}
) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { error } = await supabase.from('user_achievement_events').insert({
    user_id: userId,
    event_type: eventType,
    metadata,
  });

  if (error && error.code !== 'PGRST204' && error.code !== '42P01') {
    console.log('Achievement event save failed:', error.message);
  }

  return checkAchievements(metadata);
}

export async function checkAchievements(context: Record<string, unknown> = {}) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const stats = await fetchAchievementStats(userId);
  const achievementIds = new Set(evaluateAchievements(stats));
  const binderCompletion = Number(context.binderCompletion ?? 0);

  if (context.masterSetEnabled === true) achievementIds.add('master_mode');
  if (binderCompletion >= 25) achievementIds.add('quarter_binder');
  if (binderCompletion >= 50) achievementIds.add('half_binder');
  if (binderCompletion >= 75) achievementIds.add('almost_complete');
  if (binderCompletion >= 100) achievementIds.add(context.masterSetEnabled ? 'master_set_complete' : 'binder_complete');

  const ids = [...achievementIds];
  if (!ids.length) return [];

  const { data: existing, error: existingError } = await supabase
    .from('user_achievements')
    .select('achievement_id')
    .eq('user_id', userId)
    .in('achievement_id', ids);

  if (existingError) {
    if (existingError.code !== 'PGRST204' && existingError.code !== '42P01') {
      console.log('Achievement existing lookup failed:', existingError.message);
    }
    return [];
  }

  const existingIds = new Set((existing ?? []).map((row) => row.achievement_id));
  const newIds = ids.filter((id) => !existingIds.has(id));
  if (!newIds.length) return [];

  const rows = newIds.map((achievementId) => ({
    user_id: userId,
    achievement_id: achievementId,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('user_achievements')
    .insert(rows)
    .select('achievement_id, unlocked_at');

  if (insertError) {
    if (insertError.code !== 'PGRST204' && insertError.code !== '42P01') {
      console.log('Achievement insert failed:', insertError.message);
    }
    return [];
  }

  const unlocks = (inserted ?? [])
    .map((row) => {
      const definition = ACHIEVEMENT_BY_ID.get(row.achievement_id);
      if (!definition) return null;
      return { ...definition, unlockedAt: row.unlocked_at };
    })
    .filter(Boolean) as AchievementUnlock[];

  if (unlocks.length) {
    notifyUnlocks?.(unlocks);
  }
  return unlocks;
}
