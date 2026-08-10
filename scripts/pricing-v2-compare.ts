// @ts-nocheck
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function getArg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
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

function normalizeLanguage(value?: string | null) {
  const cleaned = String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/_/g, '-');
  if (['ja', 'jp', 'jpn', 'japanese', 'japan', 'ja-jp'].includes(cleaned)) return 'ja';
  if (['zh', 'zh-tw', 'zhtw', 'zh-hant', 'traditional chinese', 'chinese', 'taiwan', 'tw'].includes(cleaned)) return 'zh-tw';
  if (['zh-cn', 'zhcn', 'zh-hans', 'simplified chinese', 'chinese simplified', 'cn'].includes(cleaned)) return 'zh-cn';
  if (['ko', 'kr', 'kor', 'korean'].includes(cleaned)) return 'ko';
  if (['en', 'eng', 'english', 'uk', 'us'].includes(cleaned)) return 'en';
  return cleaned || 'en';
}

function getRowLanguage(row: any) {
  return normalizeLanguage(row?.language ?? row?.raw_data?.language ?? row?.raw_payload?.language);
}

function normaliseCardRow(row: any, sourceTable: string) {
  return {
    id: row.id,
    name: row.name ?? row.canonical_name ?? row.english_display_name ?? row.local_name,
    set_id: row.set_id ?? row.raw_data?.set?.id ?? row.raw_payload?.set_id ?? null,
    language: getRowLanguage(row),
    sourceTable,
  };
}

async function fetchAll(supabase: any, table: string, select: string, pageSize = 1000) {
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchAllOptional(supabase: any, table: string, select: string) {
  try {
    return await fetchAll(supabase, table, select);
  } catch {
    return [];
  }
}

function preferredLegacyPrice(row: any) {
  return row?.ebay_average ?? row?.tcgdex_price ?? row?.tcg_mid ?? row?.tcg_low ?? row?.cardmarket_trend ?? null;
}

function percentDiff(oldValue: number | null, newValue: number | null) {
  if (oldValue == null || newValue == null || oldValue === 0) return null;
  return Number((((newValue - oldValue) / oldValue) * 100).toFixed(2));
}

async function run() {
  const language = getArg('language');
  const limit = Math.min(Math.max(Number(getArg('limit', '200')), 1), 2000);
  const supabase = createClient(
    resolveSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv('SUPABASE_SECRET_KEY')
  );

  const allCards = [
    ...(await fetchAllOptional(supabase, 'pokemon_cards', 'id, name, set_id, language, raw_data'))
      .map((row: any) => normaliseCardRow(row, 'pokemon_cards')),
    ...(await fetchAllOptional(
      supabase,
      'tcg_cards',
      'id, language, set_id, canonical_name, local_name, english_display_name, collector_number, raw_payload'
    )).map((row: any) => normaliseCardRow(row, 'tcg_cards')),
  ];
  const seenCards = new Map<string, any>();
  for (const card of allCards) {
    const key = `${card.language}:${card.set_id ?? ''}:${card.id}`;
    if (!seenCards.has(key)) seenCards.set(key, card);
  }
  const cards = [...seenCards.values()]
    .filter((card) => !language || card.language === normalizeLanguage(language))
    .slice(0, limit);

  const rows = [];
  for (const card of cards) {
    const { data: snapshots } = await supabase
      .from('market_price_snapshots')
      .select('*')
      .eq('card_id', card.id)
      .order('calculated_at', { ascending: false })
      .order('snapshot_at', { ascending: false })
      .limit(20);

    const legacy = (snapshots ?? []).find((row) => preferredLegacyPrice(row) != null && row.methodology_version !== 'pricing-v2.0.0') ?? null;
    const v2 = (snapshots ?? []).find((row) => row.methodology_version === 'pricing-v2.0.0') ?? null;
    const oldPrice = preferredLegacyPrice(legacy);
    const newPrice = v2?.market_price_gbp ?? null;
    const diff = percentDiff(oldPrice, newPrice);
    rows.push({
      cardId: card.id,
      name: card.name,
      language: card.language,
      oldPrice,
      newPrice,
      differencePercent: diff,
      newEvidenceCount: v2?.comp_count ?? 0,
      confidence: v2?.confidence_label ?? 'unavailable',
      suspectedOldMismatch: legacy?.ebay_average != null && v2?.sold_comp_count === 0 ? 'legacy_eBay_not_verified_sold' : '',
      suspectedNewMismatch: v2?.calculation_summary?.disagreementReason ?? '',
    });
  }

  const flagged = rows.filter((row) => row.differencePercent != null && Math.abs(row.differencePercent) > 25);
  console.log('| Card | Language | Old | New | Diff | Evidence | Confidence | Notes |');
  console.log('| --- | --- | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of flagged.length ? flagged : rows.slice(0, 50)) {
    console.log(`| ${row.name ?? row.cardId} | ${row.language ?? ''} | ${row.oldPrice ?? 'n/a'} | ${row.newPrice ?? 'n/a'} | ${row.differencePercent ?? 'n/a'} | ${row.newEvidenceCount} | ${row.confidence} | ${[row.suspectedOldMismatch, row.suspectedNewMismatch].filter(Boolean).join('; ')} |`);
  }
  console.log(`\nCompared ${rows.length} cards. Differences >25%: ${flagged.length}.`);
}

run().catch((error) => {
  console.error('Pricing V2 compare failed:', error);
  process.exit(1);
});
