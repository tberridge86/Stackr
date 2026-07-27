// @ts-nocheck
import 'dotenv/config';
import fs from 'node:fs/promises';
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

function pct(value: number, total: number) {
  return total ? Number(((value / total) * 100).toFixed(2)) : 0;
}

function normalizeLanguage(value?: string | null) {
  const cleaned = String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/_/g, '-');
  if (['ja', 'jp', 'jpn', 'ja-jp', 'japanese', 'japan'].includes(cleaned)) return 'ja';
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
    return { rows: await fetchAll(supabase, table, select), error: null };
  } catch (error: any) {
    return { rows: [], error: error?.message ?? String(error) };
  }
}

function hasUsableLegacyPrice(row: any) {
  return [
    row.ebay_average,
    row.tcgdex_price,
    row.tcg_mid,
    row.tcg_low,
    row.cardmarket_trend,
  ].some((value) => typeof value === 'number' && Number.isFinite(value));
}

function hasUsableV2Price(row: any) {
  return typeof row.market_price_gbp === 'number' && Number.isFinite(row.market_price_gbp);
}

async function run() {
  const output = getArg('output', 'docs/pricing-v2-baseline-report.md');
  const language = getArg('language');
  const supabase = createClient(
    resolveSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv('SUPABASE_SECRET_KEY')
  );

  const pokemonCardsResult = await fetchAllOptional(supabase, 'pokemon_cards', 'id, language, set_id, raw_data');
  if (pokemonCardsResult.error) throw new Error(`Could not read pokemon_cards: ${pokemonCardsResult.error}`);
  const tcgCardsResult = await fetchAllOptional(
    supabase,
    'tcg_cards',
    'id, language, set_id, canonical_name, local_name, english_display_name, collector_number, raw_payload'
  );
  const cards = [
    ...pokemonCardsResult.rows.map((row: any) => normaliseCardRow(row, 'pokemon_cards')),
    ...tcgCardsResult.rows.map((row: any) => normaliseCardRow(row, 'tcg_cards')),
  ];
  const seenCards = new Map<string, any>();
  for (const card of cards) {
    const key = `${card.language}:${card.set_id ?? ''}:${card.id}`;
    if (!seenCards.has(key)) seenCards.set(key, card);
  }
  const uniqueCards = [...seenCards.values()];
  const scopedCards = language
    ? uniqueCards.filter((card) => card.language === normalizeLanguage(language))
    : uniqueCards;
  const cardIds = new Set(scopedCards.map((card) => card.id));
  const snapshots = (await fetchAll(
    supabase,
    'market_price_snapshots',
    'id, card_id, language, snapshot_at, calculated_at, ebay_average, tcgdex_price, tcg_mid, tcg_low, cardmarket_trend, market_price_gbp, methodology_version, canonical_identity_key, price_type, confidence_label'
  )).filter((row) => cardIds.has(row.card_id));
  const observations = await fetchAll(
    supabase,
    'price_observations',
    'id, stackr_card_id, card_id, language, source_type, verified_sale, excluded, raw_condition, grader, grading_company, grade, canonical_identity_key, match_score'
  ).catch(() => []);

  const latestLegacy = new Map<string, any>();
  const latestV2 = new Map<string, any>();
  for (const row of snapshots.sort((a, b) => String(b.calculated_at ?? b.snapshot_at).localeCompare(String(a.calculated_at ?? a.snapshot_at)))) {
    const key = `${row.card_id}:${String(row.language ?? 'en').toLowerCase()}`;
    if (!latestLegacy.has(key) && hasUsableLegacyPrice(row)) latestLegacy.set(key, row);
    if (row.methodology_version === 'pricing-v2.0.0' && !latestV2.has(key)) latestV2.set(key, row);
  }

  const now = Date.now();
  const olderThan = (row: any, days: number) => {
    const value = row?.calculated_at ?? row?.snapshot_at;
    if (!value) return false;
    return now - new Date(value).getTime() > days * 86_400_000;
  };

  const languageDistribution = uniqueCards.reduce((counts: Record<string, number>, card: any) => {
    counts[card.language] = (counts[card.language] ?? 0) + 1;
    return counts;
  }, {});
  const sourceDistribution = cards.reduce((counts: Record<string, number>, card: any) => {
    counts[card.sourceTable] = (counts[card.sourceTable] ?? 0) + 1;
    return counts;
  }, {});
  const duplicateCardRecords = cards.length - uniqueCards.length;
  const rawPricedFromGraded = observations.filter((row: any) =>
    ['sold_listing', 'sold_transaction', 'market_price', 'market_estimate'].includes(String(row.source_type ?? ''))
    && (row.grader || row.grading_company || row.grade)
    && !String(row.canonical_identity_key ?? '').includes('graded_card')
  ).length;
  const gradedPricedFromRaw = observations.filter((row: any) =>
    String(row.canonical_identity_key ?? '').includes('graded_card')
    && !row.grader
    && !row.grading_company
    && !row.grade
  ).length;

  const total = scopedCards.length;
  const legacyPriced = [...latestLegacy.keys()].length;
  const v2Priced = [...latestV2.values()].filter(hasUsableV2Price).length;
  const legacyUnavailable = total - legacyPriced;
  const v2Unavailable = total - v2Priced;
  const legacyRows = [...latestLegacy.values()];

  const report = {
    generatedAt: new Date().toISOString(),
    scope: { language: language || 'all', cards: total },
    catalogue: {
      sourceDistribution,
      languageDistribution,
      skippedTables: {
        tcg_cards: tcgCardsResult.error,
      },
    },
    legacy: {
      usablePriceCards: legacyPriced,
      usablePricePercent: pct(legacyPriced, total),
      unavailableCards: legacyUnavailable,
      unavailablePercent: pct(legacyUnavailable, total),
      olderThan7Days: legacyRows.filter((row) => olderThan(row, 7)).length,
      olderThan30Days: legacyRows.filter((row) => olderThan(row, 30)).length,
      olderThan90Days: legacyRows.filter((row) => olderThan(row, 90)).length,
    },
    pricingV2: {
      usablePriceCards: v2Priced,
      usablePricePercent: pct(v2Priced, total),
      unavailableCards: v2Unavailable,
      unavailablePercent: pct(v2Unavailable, total),
    },
    integrity: {
      duplicateCardRecords,
      mismatchedLanguageObservationCount: observations.filter((row: any) => row.language && !['en', 'ja', 'zh-tw', 'zh-cn', 'ko'].includes(String(row.language).toLowerCase())).length,
      rawPricedFromGraded,
      gradedPricedFromRaw,
    },
  };

  const markdown = `# Pricing V2 Baseline Report

Generated: ${report.generatedAt}

Scope: ${report.scope.language} (${report.scope.cards} cards)

| Metric | Legacy | Pricing V2 |
| --- | ---: | ---: |
| Cards with usable price | ${report.legacy.usablePriceCards} (${report.legacy.usablePricePercent}%) | ${report.pricingV2.usablePriceCards} (${report.pricingV2.usablePricePercent}%) |
| Price unavailable | ${report.legacy.unavailableCards} (${report.legacy.unavailablePercent}%) | ${report.pricingV2.unavailableCards} (${report.pricingV2.unavailablePercent}%) |
| Prices older than 7 days | ${report.legacy.olderThan7Days} | n/a until V2 backfill runs |
| Prices older than 30 days | ${report.legacy.olderThan30Days} | n/a until V2 backfill runs |
| Prices older than 90 days | ${report.legacy.olderThan90Days} | n/a until V2 backfill runs |

## Integrity Signals

- Duplicate card-record keys: ${report.integrity.duplicateCardRecords}
- Mismatched language observations: ${report.integrity.mismatchedLanguageObservationCount}
- Raw identities with graded evidence: ${report.integrity.rawPricedFromGraded}
- Graded identities with raw evidence: ${report.integrity.gradedPricedFromRaw}

## Catalogue Visibility

- Source rows visible: ${Object.entries(report.catalogue.sourceDistribution).map(([key, value]) => `${key}: ${value}`).join(', ') || 'none'}
- Languages visible: ${Object.entries(report.catalogue.languageDistribution).map(([key, value]) => `${key}: ${value}`).join(', ') || 'none'}
- Optional catalogue table issues: ${Object.entries(report.catalogue.skippedTables).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join('; ') || 'none'}

\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`
`;

  await fs.mkdir(output.split('/').slice(0, -1).join('/') || '.', { recursive: true });
  await fs.writeFile(output, markdown, 'utf8');
  console.log(markdown);
}

run().catch((error) => {
  console.error('Pricing baseline failed:', error);
  process.exit(1);
});
