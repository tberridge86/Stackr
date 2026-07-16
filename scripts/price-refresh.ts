import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

type RefreshLane = 'market-listings' | 'chase' | 'high-value' | 'owned' | 'queued';
type PriceSource = 'tcgdex' | 'ebay';

type Candidate = {
  cardId: string;
  setId: string | null;
  language: string;
  reason: string;
  priority: number;
  name?: string | null;
  setName?: string | null;
  number?: string | null;
  setTotal?: string | number | null;
  rarity?: string | null;
  force?: boolean;
  queueId?: string | null;
};

type LaneConfig = {
  lane: RefreshLane;
  label: string;
  freshnessHours: number;
  defaultLimit: number;
  sources: PriceSource[];
};

const PRICE_API_URL =
  process.env.PRICE_API_URL ||
  process.env.EXPO_PUBLIC_PRICE_API_URL ||
  '';

const HIGH_VALUE_THRESHOLD_GBP = Number(process.env.HIGH_VALUE_REFRESH_THRESHOLD_GBP || 100);
const REQUEST_DELAY_MS = Number(process.env.PRICE_REFRESH_DELAY_MS || 750);
const API_TIMEOUT_MS = Number(process.env.PRICE_REFRESH_API_TIMEOUT_MS || 12_000);

const LANE_CONFIG: Record<RefreshLane, LaneConfig> = {
  'market-listings': {
    lane: 'market-listings',
    label: 'Market listings',
    freshnessHours: Number(process.env.MARKET_LISTINGS_PRICE_FRESHNESS_HOURS || 0.75),
    defaultLimit: Number(process.env.MARKET_LISTINGS_PRICE_REFRESH_LIMIT || 120),
    sources: ['tcgdex', 'ebay'],
  },
  chase: {
    lane: 'chase',
    label: 'Chase/watchlist cards',
    freshnessHours: Number(process.env.CHASE_PRICE_FRESHNESS_HOURS || 2),
    defaultLimit: Number(process.env.CHASE_PRICE_REFRESH_LIMIT || 180),
    sources: ['tcgdex', 'ebay'],
  },
  'high-value': {
    lane: 'high-value',
    label: 'High-value owned cards',
    freshnessHours: Number(process.env.HIGH_VALUE_PRICE_FRESHNESS_HOURS || 6),
    defaultLimit: Number(process.env.HIGH_VALUE_PRICE_REFRESH_LIMIT || 160),
    sources: ['tcgdex', 'ebay'],
  },
  owned: {
    lane: 'owned',
    label: 'Normal owned cards',
    freshnessHours: Number(process.env.OWNED_PRICE_FRESHNESS_HOURS || 18),
    defaultLimit: Number(process.env.OWNED_PRICE_REFRESH_LIMIT || 400),
    sources: ['tcgdex'],
  },
  queued: {
    lane: 'queued',
    label: 'Queued priority refreshes',
    freshnessHours: 0,
    defaultLimit: Number(process.env.QUEUED_PRICE_REFRESH_LIMIT || 200),
    sources: ['tcgdex', 'ebay'],
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getArg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function normalizeLanguage(value?: string | null) {
  const cleaned = String(value || 'en').trim().toLowerCase();
  return ['ja', 'jp', 'jpn', 'japanese', 'japan'].includes(cleaned) ? 'ja' : 'en';
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getPreferredSnapshotValue(row: any): number | null {
  return (
    toNumber(row?.ebay_average) ??
    toNumber(row?.tcgdex_price) ??
    toNumber(row?.tcg_mid) ??
    toNumber(row?.tcg_low) ??
    toNumber(row?.cardmarket_trend)
  );
}

function candidateKey(candidate: Candidate) {
  return `${candidate.cardId}:${candidate.setId ?? ''}:${normalizeLanguage(candidate.language)}`;
}

function dedupeCandidates(candidates: Candidate[]) {
  const byKey = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (!candidate.cardId) continue;
    const key = candidateKey(candidate);
    const existing = byKey.get(key);
    if (!existing || candidate.priority > existing.priority) {
      byKey.set(key, {
        ...candidate,
        language: normalizeLanguage(candidate.language),
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.priority - a.priority);
}

async function createRun(lane: RefreshLane) {
  const { data, error } = await supabase
    .from('price_refresh_runs')
    .insert({ lane, status: 'started' })
    .select('id')
    .maybeSingle();

  if (error) {
    console.log('Could not create price refresh run log:', error.message);
    return null;
  }
  return data?.id ?? null;
}

async function finishRun(
  runId: string | null,
  status: 'success' | 'failed',
  stats: Record<string, unknown>
) {
  if (!runId) return;
  const { error } = await supabase
    .from('price_refresh_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      cards_considered: stats.considered ?? 0,
      cards_refreshed: stats.refreshed ?? 0,
      cards_skipped_fresh: stats.skippedFresh ?? 0,
      errors: stats.errors ?? 0,
      details: stats,
    })
    .eq('id', runId);

  if (error) console.log('Could not update price refresh run log:', error.message);
}

async function fetchQueuedCandidates(limit: number): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from('price_refresh_queue')
    .select('id, card_id, set_id, language, reason, priority, metadata')
    .is('processed_at', null)
    .lte('run_after', new Date().toISOString())
    .order('priority', { ascending: false })
    .order('requested_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    cardId: row.card_id,
    setId: row.set_id ?? null,
    language: row.language ?? 'en',
    reason: row.reason ?? 'queued',
    priority: Number(row.priority ?? 90),
    name: row.metadata?.name ?? null,
    setName: row.metadata?.setName ?? null,
    number: row.metadata?.number ?? null,
    force: true,
    queueId: row.id,
  }));
}

async function fetchMarketListingCandidates(limit: number): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from('user_card_flags')
    .select('card_id, set_id, language, updated_at, created_at')
    .eq('flag_type', 'trade')
    .or('listing_status.eq.active,listing_status.is.null')
    .order('updated_at', { ascending: false })
    .limit(limit * 2);

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    cardId: row.card_id,
    setId: row.set_id ?? null,
    language: row.language ?? 'en',
    reason: 'market-listing',
    priority: 95,
  }));
}

async function fetchChaseCandidates(limit: number): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  const { data: watchRows, error: watchError } = await supabase
    .from('market_watchlist')
    .select('card_id, set_id, language, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (watchError) throw watchError;
  candidates.push(...(watchRows ?? []).map((row: any) => ({
    cardId: row.card_id,
    setId: row.set_id ?? null,
    language: row.language ?? 'en',
    reason: 'market-watchlist',
    priority: 88,
  })));

  const { data: wishlistRows, error: wishlistError } = await supabase
    .from('user_card_flags')
    .select('card_id, set_id, language, created_at')
    .eq('flag_type', 'wishlist')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!wishlistError) {
    candidates.push(...(wishlistRows ?? []).map((row: any) => ({
      cardId: row.card_id,
      setId: row.set_id ?? null,
      language: row.language ?? 'en',
      reason: 'wishlist',
      priority: 86,
    })));
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('chase_card_id, chase_set_id')
    .not('chase_card_id', 'is', null)
    .limit(limit);
  if (!profileError) {
    candidates.push(...(profiles ?? []).map((row: any) => ({
      cardId: row.chase_card_id,
      setId: row.chase_set_id ?? null,
      language: 'en',
      reason: 'profile-chase-card',
      priority: 84,
    })));
  }

  return candidates;
}

async function fetchOwnedCandidates(limit: number): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from('binder_cards')
    .select('card_id, set_id, language, card_name, card_number, set_name, set_total, owned_quantity')
    .eq('owned', true)
    .order('created_at', { ascending: false })
    .limit(limit * 3);

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    cardId: row.card_id,
    setId: row.set_id ?? null,
    language: row.language ?? 'en',
    reason: 'owned-card',
    priority: 50 + Math.min(Number(row.owned_quantity ?? 1), 10),
    name: row.card_name ?? null,
    setName: row.set_name ?? null,
    number: row.card_number ?? null,
    setTotal: row.set_total ?? null,
  }));
}

async function fetchLatestSnapshots(candidates: Candidate[]) {
  const cardIds = [...new Set(candidates.map((candidate) => candidate.cardId).filter(Boolean))];
  const latest = new Map<string, any>();
  if (!cardIds.length) return latest;

  for (let index = 0; index < cardIds.length; index += 500) {
    const batch = cardIds.slice(index, index + 500);
    const { data, error } = await supabase
      .from('market_price_snapshots')
      .select('card_id, language, ebay_average, tcgdex_price, tcg_mid, tcg_low, cardmarket_trend, snapshot_at')
      .in('card_id', batch)
      .order('snapshot_at', { ascending: false });

    if (error) throw error;
    for (const row of data ?? []) {
      const key = `${row.card_id}:${normalizeLanguage(row.language)}`;
      if (!latest.has(key)) latest.set(key, row);
    }
  }

  return latest;
}

async function fetchHighValueCandidates(limit: number): Promise<Candidate[]> {
  const owned = dedupeCandidates(await fetchOwnedCandidates(Math.max(limit * 3, 500)));
  const latest = await fetchLatestSnapshots(owned);
  return owned
    .map((candidate) => {
      const snapshot = latest.get(`${candidate.cardId}:${normalizeLanguage(candidate.language)}`);
      const value = getPreferredSnapshotValue(snapshot);
      return {
        ...candidate,
        reason: 'high-value-owned',
        priority: value == null ? 65 : Math.min(100, 70 + Math.floor(value / 25)),
        force: false,
        metadataValue: value,
      };
    })
    .filter((candidate: any) => (candidate.metadataValue ?? 0) >= HIGH_VALUE_THRESHOLD_GBP)
    .slice(0, limit);
}

async function hydrateCandidates(candidates: Candidate[]) {
  const missing = candidates.filter((candidate) => !candidate.name || !candidate.setName || !candidate.number);
  if (!missing.length) return candidates;

  const cardIds = [...new Set(missing.map((candidate) => candidate.cardId))];
  const cardMap = new Map<string, any>();

  for (let index = 0; index < cardIds.length; index += 500) {
    const batch = cardIds.slice(index, index + 500);
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select('id, name, number, rarity, set_id, language, raw_data')
      .in('id', batch);

    if (error) throw error;
    for (const card of data ?? []) cardMap.set(card.id, card);
  }

  return candidates.map((candidate) => {
    const card = cardMap.get(candidate.cardId);
    if (!card) return candidate;
    const raw = card.raw_data ?? {};
    return {
      ...candidate,
      setId: candidate.setId ?? card.set_id ?? raw?.set?.id ?? null,
      language: normalizeLanguage(candidate.language ?? card.language ?? raw.language),
      name: candidate.name ?? card.name ?? raw.name ?? null,
      setName: candidate.setName ?? raw?.set?.name ?? null,
      number: candidate.number ?? card.number ?? raw.number ?? raw.localId ?? null,
      setTotal: candidate.setTotal ?? raw?.set?.printedTotal ?? raw?.set?.total ?? null,
      rarity: candidate.rarity ?? card.rarity ?? raw.rarity ?? null,
    };
  });
}

async function filterFreshCandidates(
  candidates: Candidate[],
  config: LaneConfig,
  force: boolean
) {
  if (force || config.freshnessHours <= 0) {
    return { due: candidates, skippedFresh: 0 };
  }

  const latest = await fetchLatestSnapshots(candidates);
  const cutoff = Date.now() - config.freshnessHours * 60 * 60 * 1000;
  const due: Candidate[] = [];
  let skippedFresh = 0;

  for (const candidate of candidates) {
    if (candidate.force) {
      due.push(candidate);
      continue;
    }
    const snapshot = latest.get(`${candidate.cardId}:${normalizeLanguage(candidate.language)}`);
    const snapshotTime = snapshot?.snapshot_at ? new Date(snapshot.snapshot_at).getTime() : 0;
    if (snapshotTime && snapshotTime > cutoff) {
      skippedFresh += 1;
    } else {
      due.push(candidate);
    }
  }

  return { due, skippedFresh };
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { ok: response.ok, status: response.status, json };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPriceParams(candidate: Candidate, config: LaneConfig) {
  const params = new URLSearchParams();
  params.set('cardId', candidate.cardId);
  if (candidate.setId) params.set('setId', candidate.setId);
  if (candidate.name) params.set('name', candidate.name);
  if (candidate.setName) params.set('setName', candidate.setName);
  if (candidate.number) params.set('number', String(candidate.number));
  if (candidate.setTotal != null) params.set('setTotal', String(candidate.setTotal));
  if (candidate.rarity) params.set('rarity', candidate.rarity);
  params.set('language', normalizeLanguage(candidate.language));
  params.set('refreshLane', config.lane);
  params.set('refreshReason', candidate.reason);
  return params;
}

async function refreshCandidate(candidate: Candidate, config: LaneConfig) {
  if (!PRICE_API_URL) throw new Error('Missing PRICE_API_URL or EXPO_PUBLIC_PRICE_API_URL');
  const baseUrl = PRICE_API_URL.replace(/\/$/, '');
  const params = buildPriceParams(candidate, config);
  const errors: string[] = [];
  let success = false;

  for (const source of config.sources) {
    const path = source === 'tcgdex' ? '/api/price/tcgdex' : '/api/price/ebay';
    const result = await fetchWithTimeout(`${baseUrl}${path}?${params.toString()}`);
    if (result.ok && (result.json?.price != null || result.json?.average != null || result.json?.tcg_mid != null || result.json?.cardmarket_trend != null)) {
      success = true;
      continue;
    }
    errors.push(`${source}:${result.status}:${result.json?.error ?? result.json?.detail ?? 'no price'}`);
  }

  if (!success) throw new Error(errors.join('; ') || 'No price source returned a value');
}

async function markQueueItem(candidate: Candidate, error?: string) {
  if (!candidate.queueId) return;
  const patch = error
    ? { attempts: 1, last_error: error.slice(0, 500) }
    : { processed_at: new Date().toISOString(), last_error: null };
  const { error: updateError } = await supabase
    .from('price_refresh_queue')
    .update(patch)
    .eq('id', candidate.queueId);
  if (updateError) console.log('Could not mark queue item:', updateError.message);
}

async function fetchCandidates(lane: RefreshLane, limit: number) {
  switch (lane) {
    case 'queued':
      return fetchQueuedCandidates(limit);
    case 'market-listings':
      return fetchMarketListingCandidates(limit);
    case 'chase':
      return fetchChaseCandidates(limit);
    case 'high-value':
      return fetchHighValueCandidates(limit);
    case 'owned':
      return fetchOwnedCandidates(limit);
    default:
      return [];
  }
}

async function run() {
  const laneArg = getArg('lane', 'queued') as RefreshLane;
  const config = LANE_CONFIG[laneArg];
  if (!config) {
    throw new Error(`Unknown lane "${laneArg}". Use one of: ${Object.keys(LANE_CONFIG).join(', ')}`);
  }

  const limit = Number(getArg('limit', String(config.defaultLimit)));
  const force = hasFlag('force');
  const dryRun = hasFlag('dry-run');
  const runId = dryRun ? null : await createRun(config.lane);

  const rawCandidates = dedupeCandidates(await fetchCandidates(config.lane, limit));
  const hydrated = dedupeCandidates(await hydrateCandidates(rawCandidates));
  const { due, skippedFresh } = await filterFreshCandidates(hydrated, config, force);
  const selected = due.slice(0, limit);

  console.log(`${config.label}: considered=${hydrated.length} due=${selected.length} skippedFresh=${skippedFresh}`);

  let refreshed = 0;
  let errors = 0;

  if (!dryRun) {
    for (let index = 0; index < selected.length; index += 1) {
      const candidate = selected[index];
      try {
        console.log(`[${index + 1}/${selected.length}] ${candidate.name ?? candidate.cardId} (${candidate.language})`);
        await refreshCandidate(candidate, config);
        await markQueueItem(candidate);
        refreshed += 1;
      } catch (error: any) {
        const message = error?.message ?? String(error);
        console.log(`Price refresh failed for ${candidate.cardId}: ${message}`);
        await markQueueItem(candidate, message);
        errors += 1;
      }
      if (index + 1 < selected.length) await delay(REQUEST_DELAY_MS);
    }
  }

  const stats = {
    lane: config.lane,
    considered: hydrated.length,
    due: selected.length,
    refreshed,
    skippedFresh,
    errors,
    freshnessHours: config.freshnessHours,
    limit,
    dryRun,
  };

  await finishRun(runId, errors > 0 ? 'failed' : 'success', stats);

  if (errors > 0) process.exitCode = 1;
  console.log(JSON.stringify(stats, null, 2));
}

run().catch(async (error) => {
  console.error('Price refresh runner failed:', error);
  process.exit(1);
});
