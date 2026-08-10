// @ts-nocheck
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { refreshPricingForCard } from '../backend/lib/pricingV2/engine.js';
import { PRICING_METHODOLOGY_VERSION } from '../backend/lib/pricingV2/config.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getArg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function resolveSupabaseUrl() {
  const explicit = process.env.SUPABASE_URL;
  if (explicit) return explicit;
  const projectRef = process.env.SUPABASE_PROJECT_REF || 'oakdbbzdqwurpjnoqhmu';
  return `https://${projectRef}.supabase.co`;
}

const supabase = createClient(
  resolveSupabaseUrl(),
  process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv('SUPABASE_SECRET_KEY')
);

function normalizeLanguage(value?: string | null) {
  const cleaned = String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/_/g, '-');
  if (['ja', 'jp', 'jpn', 'ja-jp', 'japanese', 'japan'].includes(cleaned)) return 'ja';
  if (['zh', 'zh-tw', 'zhtw', 'zh-hant', 'traditional chinese', 'chinese traditional', 'chinese', 'taiwan', 'tw'].includes(cleaned)) return 'zh-tw';
  if (['zh-cn', 'zhcn', 'zh-hans', 'simplified chinese', 'chinese simplified', 'mainland chinese', 'cn'].includes(cleaned)) return 'zh-cn';
  if (['ko', 'kr', 'kor', 'korean'].includes(cleaned)) return 'ko';
  if (['en', 'eng', 'english', 'uk', 'us'].includes(cleaned)) return 'en';
  return cleaned || 'en';
}

function getLanguageAliases(language?: string | null) {
  const normalized = normalizeLanguage(language);
  if (normalized === 'ja') return ['ja', 'JA', 'jp', 'JP', 'jpn', 'JPN', 'ja-jp', 'ja_JP', 'japanese', 'Japanese', 'JAPANESE', 'japan', 'Japan'];
  if (normalized === 'zh-tw') return ['zh-tw', 'zh-TW', 'ZH-TW', 'zh_tw', 'zh_TW', 'zhtw', 'ZHTW', 'zh', 'ZH', 'chinese', 'Chinese', 'CHINESE', 'traditional chinese', 'Traditional Chinese', 'tw', 'TW', 'taiwan', 'Taiwan'];
  if (normalized === 'zh-cn') return ['zh-cn', 'zh-CN', 'ZH-CN', 'zh_cn', 'zh_CN', 'zhcn', 'ZHCN', 'zh-hans', 'zh_Hans', 'simplified chinese', 'Simplified Chinese', 'cn', 'CN'];
  if (normalized === 'ko') return ['ko', 'KO', 'kr', 'KR', 'kor', 'KOR', 'korean', 'Korean'];
  return [normalized];
}

function getRowLanguage(row: any) {
  return normalizeLanguage(row?.language ?? row?.raw_data?.language ?? row?.raw_payload?.language);
}

function normaliseCandidate(row: any, productType: string, sourceTable: string) {
  return {
    id: row.id,
    set_id: row.set_id ?? row.raw_data?.set?.id ?? row.raw_payload?.set_id ?? null,
    language: getRowLanguage(row),
    name: row.name ?? row.canonical_name ?? row.english_display_name ?? row.local_name ?? null,
    productType,
    sourceTable,
  };
}

function dedupeCandidates(rows: any[]) {
  const byKey = new Map<string, any>();
  for (const row of rows) {
    if (!row?.id) continue;
    const key = `${row.productType}:${row.language}:${row.id}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

async function fetchRowsFromTable({
  table,
  select,
  productType,
  setId,
  language,
  limit,
}: {
  table: string;
  select: string;
  productType: string;
  setId: string;
  language: string;
  limit: number;
}) {
  const aliases = language ? getLanguageAliases(language) : [];
  const rows: any[] = [];
  const pageSize = 1000;

  for (let from = 0; rows.length < limit; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (setId) query = query.eq('set_id', setId);
    if (aliases.length) query = query.in('language', aliases);

    const { data, error } = await query;
    if (error) {
      console.log(`Skipping ${table}: ${error.message}`);
      return [];
    }

    rows.push(...(data ?? []).map((row: any) => normaliseCandidate(row, productType, table)));
    if (!data || data.length < pageSize) break;
  }

  return language
    ? rows.filter((row) => row.language === normalizeLanguage(language)).slice(0, limit)
    : rows.slice(0, limit);
}

async function fetchRowsByClientSideLanguage({
  table,
  select,
  productType,
  setId,
  language,
  limit,
}: {
  table: string;
  select: string;
  productType: string;
  setId: string;
  language: string;
  limit: number;
}) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; rows.length < limit; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (setId) query = query.eq('set_id', setId);
    const { data, error } = await query;
    if (error) return [];
    const page = (data ?? [])
      .map((row: any) => normaliseCandidate(row, productType, table))
      .filter((row) => !language || row.language === normalizeLanguage(language));
    rows.push(...page);
    if (!data || data.length < pageSize) break;
  }
  return rows.slice(0, limit);
}

async function fetchExistingV2SnapshotKeys(candidates: any[], productType: string, language?: string | null) {
  const existingKeys = new Set<string>();
  const ids = [...new Set(candidates.map((candidate) => candidate.id).filter(Boolean))];
  const chunkSize = 500;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    let query = supabase
      .from('market_price_snapshots')
      .select('card_id, language, canonical_identity_key')
      .in('card_id', chunk)
      .eq('methodology_version', PRICING_METHODOLOGY_VERSION)
      .like('canonical_identity_key', `${productType}|%`);
    if (language) query = query.eq('language', normalizeLanguage(language));

    const { data, error } = await query;
    if (error) throw new Error(`Could not check existing V2 snapshots: ${error.message}`);
    for (const row of data ?? []) {
      existingKeys.add(`${normalizeLanguage(row.language)}:${row.card_id}`);
    }
  }

  return existingKeys;
}

async function filterAlreadyBackfilled(candidates: any[], productType: string, language?: string | null) {
  if (hasFlag('refresh-existing') || candidates.length === 0) return candidates;
  const existingKeys = await fetchExistingV2SnapshotKeys(candidates, productType, language);
  return candidates.filter((candidate) => !existingKeys.has(`${candidate.language}:${candidate.id}`));
}

async function fetchCandidates() {
  const cardId = getArg('cardId');
  const setId = getArg('set');
  const language = getArg('language');
  const productType = getArg('productType', 'raw_card');
  const limit = Math.min(Math.max(Number(getArg('limit', '100')), 1), 50000);
  const scanLimit = hasFlag('refresh-existing')
    ? limit
    : Math.min(Math.max(limit * 5, limit), 50000);

  if (cardId) return [{ id: cardId, productType, language: normalizeLanguage(language), sourceTable: 'manual' }];

  const tablePlans = productType === 'sealed_product'
    ? [
        { table: 'market_products', select: 'id, set_id, language, name, product_type' },
      ]
    : [
        { table: 'pokemon_cards', select: 'id, set_id, language, name, raw_data' },
        { table: 'tcg_cards', select: 'id, set_id, language, canonical_name, local_name, english_display_name, collector_number, raw_payload' },
      ];

  const candidates: any[] = [];
  for (const plan of tablePlans) {
    const direct = await fetchRowsFromTable({
      table: plan.table,
      select: plan.select,
      productType,
      setId,
      language,
      limit: scanLimit,
    });
    candidates.push(...direct);

    if (language && direct.length < scanLimit) {
      candidates.push(...await fetchRowsByClientSideLanguage({
        table: plan.table,
        select: plan.select,
        productType,
        setId,
        language,
        limit: scanLimit,
      }));
    }
  }

  const unpricedCandidates = await filterAlreadyBackfilled(dedupeCandidates(candidates), productType, language);
  return unpricedCandidates.slice(0, limit);
}

async function fetchCatalogueDiagnostics() {
  const setId = getArg('set');
  const productType = getArg('productType', 'raw_card');
  const plans = productType === 'sealed_product'
    ? [
        { table: 'market_products', select: 'id, set_id, language, name, product_type' },
      ]
    : [
        { table: 'pokemon_cards', select: 'id, set_id, language, name, raw_data' },
        { table: 'tcg_cards', select: 'id, set_id, language, canonical_name, local_name, english_display_name, collector_number, raw_payload' },
      ];

  const diagnostics: Record<string, any> = {};
  const pageSize = 1000;
  for (const plan of plans) {
    const byLanguage: Record<string, number> = {};
    const examples: Record<string, any[]> = {};
    let scanned = 0;
    let errorMessage = '';

    for (let from = 0; ; from += pageSize) {
      let query = supabase.from(plan.table).select(plan.select).range(from, from + pageSize - 1);
      if (setId) query = query.eq('set_id', setId);
      const { data, error } = await query;
      if (error) {
        errorMessage = error.message;
        break;
      }

      for (const row of data ?? []) {
        const candidate = normaliseCandidate(row, productType, plan.table);
        scanned += 1;
        byLanguage[candidate.language] = (byLanguage[candidate.language] ?? 0) + 1;
        if (!examples[candidate.language]) examples[candidate.language] = [];
        if (examples[candidate.language].length < 3) {
          examples[candidate.language].push({
            id: candidate.id,
            name: candidate.name,
            set_id: candidate.set_id,
          });
        }
      }

      if (!data || data.length < pageSize) break;
    }

    diagnostics[plan.table] = {
      scanned,
      byLanguage,
      examples,
      error: errorMessage || null,
    };
  }

  return diagnostics;
}

async function run() {
  const dryRun = hasFlag('dry-run');
  const ignoreFeatureFlag = hasFlag('ignore-feature-flag');
  const retryDelayMs = Number(getArg('delayMs', process.env.PRICING_V2_BACKFILL_DELAY_MS ?? '700'));
  const candidates = await fetchCandidates();

  const stats = {
    totalQueued: candidates.length,
    completed: 0,
    failed: 0,
    noExactMatch: 0,
    priceFound: 0,
    priceStillUnavailable: 0,
    averageSourceResponseTimeMs: 0,
    sourceFailures: {} as Record<string, number>,
    dryRun,
  };

  console.log(`Pricing V2 backfill: ${candidates.length} candidate(s), dryRun=${dryRun}`);

  if (dryRun) {
    const diagnostics = candidates.length === 0 ? await fetchCatalogueDiagnostics() : undefined;
    console.log(JSON.stringify({ candidates: candidates.slice(0, 20), stats, diagnostics }, null, 2));
    return;
  }

  let totalMs = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const started = Date.now();
    try {
      const result = await refreshPricingForCard(supabase, candidate.id, {
        productType: candidate.productType,
        language: candidate.language,
        setId: candidate.set_id,
        ignoreFeatureFlag,
      });
      const elapsed = Date.now() - started;
      totalMs += elapsed;
      stats.completed += 1;
      if (result.marketPrice != null) stats.priceFound += 1;
      else stats.priceStillUnavailable += 1;
      if (result.state === 'insufficient_exact_market_evidence') stats.noExactMatch += 1;
      for (const limitation of result.accessLimitations ?? []) {
        stats.sourceFailures[limitation.source] = (stats.sourceFailures[limitation.source] ?? 0) + 1;
      }
      stats.averageSourceResponseTimeMs = Math.round(totalMs / Math.max(stats.completed, 1));
      console.log(`[${index + 1}/${candidates.length}] ${candidate.id}: ${result.state} ${result.marketPrice ?? 'no price'}`);
    } catch (error: any) {
      stats.failed += 1;
      console.log(`[${index + 1}/${candidates.length}] ${candidate.id}: failed - ${error?.message ?? error}`);
    }
    if (index + 1 < candidates.length) await delay(retryDelayMs);
  }

  console.log(JSON.stringify(stats, null, 2));
  if (stats.failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error('Pricing V2 backfill failed:', error);
  process.exit(1);
});
