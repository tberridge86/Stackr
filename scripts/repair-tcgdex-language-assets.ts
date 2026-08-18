import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { CatalogueIngestionRunner } from './catalogue-ingestion/pipeline';
import {
  TcgdexSourceAdapter,
  tcgdexAdapterInternals,
} from './catalogue-ingestion/tcgdexAdapter';
import {
  cleanText,
  normaliseLanguageCode,
  type FetchScope,
  type ProviderRecord,
  type SourceAdapter,
} from './catalogue-ingestion/sourceAdapter';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';
const ALLOWED_REPAIR_LANGUAGES = new Set(['en', 'ja']);

function arg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function printHelp() {
  console.log(`Repair approved TCGdex card fronts, set logos and set symbols in StackR staging.

Usage:
  npx tsx scripts/repair-tcgdex-language-assets.ts --language=en --writeConcurrency=8
  npx tsx scripts/repair-tcgdex-language-assets.ts --language=ja --writeConcurrency=8

Only English and Japanese are accepted by this controlled repair worker.
The worker is staging-only and marks imported TCGdex assets approved based on
StackR's recorded access authorisation.`);
}

async function collectRecords(
  records: AsyncIterable<ProviderRecord> | Promise<ProviderRecord[]>,
): Promise<ProviderRecord[]> {
  const resolved = await records;
  if (Array.isArray(resolved)) return resolved;
  const collected: ProviderRecord[] = [];
  for await (const record of resolved) collected.push(record);
  return collected;
}

export function buildSetAssetRecords(
  sets: ProviderRecord[],
  languageCode: string,
): ProviderRecord[] {
  return sets.flatMap((setRecord) => {
    const setPayload = setRecord.payload;
    const setId = cleanText(setPayload.id ?? setPayload.code ?? setRecord.providerRecordId);
    if (!setId) return [];

    return tcgdexAdapterInternals.setAssetCandidates(setPayload).map(({ assetType, imageUrl }) => ({
      provider: 'tcgdex',
      providerRecordId: `${setId}:${assetType}:image`,
      recordType: 'asset' as const,
      languageCode,
      sourceUrl: imageUrl,
      sourceEndpoint: setRecord.sourceEndpoint ?? setRecord.sourceUrl ?? imageUrl,
      providerUpdatedAt: setRecord.providerUpdatedAt ?? null,
      licenceStatus: 'approved' as const,
      attributionText: 'TCGdex',
      httpMetadata: setRecord.httpMetadata ?? {},
      payload: {
        ...setPayload,
        set: setPayload,
        image_url: imageUrl,
        image_language_code: languageCode,
        asset_type: assetType,
      },
    }));
  });
}

export function createApprovedTcgdexRepairAdapter(languageCode: string): SourceAdapter {
  const base = new TcgdexSourceAdapter({
    language: languageCode,
    licenceStatus: 'approved',
    assetLicenceStatus: 'approved',
  });

  return {
    identifySource: () => base.identifySource(),
    healthCheck: (scope?: FetchScope) => base.healthCheck(scope),
    fetchSets: (scope?: FetchScope) => base.fetchSets(scope),
    fetchCards: (scope?: FetchScope) => base.fetchCards(scope),
    fetchVariants: (scope?: FetchScope) => base.fetchVariants(scope),
    fetchAssets: async (scope: FetchScope = {}) => {
      const providerAssets = await collectRecords(base.fetchAssets(scope));
      if (scope.setId) return providerAssets;

      // TCGdex's language-wide /sets response already contains the logo and
      // symbol bases. The core adapter only emits set art for run-set, so add
      // the language-wide set assets here without hundreds of per-set runs.
      const sets = await collectRecords(base.fetchSets(scope));
      const setAssets = buildSetAssetRecords(sets, languageCode);
      return [...setAssets, ...providerAssets];
    },
    normaliseRecord: (record) => base.normaliseRecord(record),
    validateRecord: (record) => base.validateRecord(record),
  };
}

function stagingClient() {
  const url = process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

  if (!url || !key) {
    throw new Error('SUPABASE_URL and backend-only service credentials are required.');
  }
  if (!url.includes(STAGING_SUPABASE_REF)) {
    throw new Error(`Asset repair must use StackR staging project ${STAGING_SUPABASE_REF}.`);
  }
  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(`Refusing asset repair against production project ${PRODUCTION_SUPABASE_REF}.`);
  }

  return createClient(url, key);
}

async function main() {
  if (hasFlag('help')) {
    printHelp();
    return;
  }

  const languageCode = normaliseLanguageCode(arg('language'));
  if (!ALLOWED_REPAIR_LANGUAGES.has(languageCode)) {
    throw new Error('This repair worker accepts only --language=en or --language=ja.');
  }

  const writeConcurrency = Number(arg('writeConcurrency', '8'));
  if (!Number.isInteger(writeConcurrency) || writeConcurrency < 1 || writeConcurrency > 16) {
    throw new Error('--writeConcurrency must be an integer from 1 to 16.');
  }

  const runIdentity = [
    process.env.GITHUB_RUN_ID ?? new Date().toISOString(),
    process.env.GITHUB_RUN_ATTEMPT ?? '1',
  ].join(':');
  const runKey = `repair-en-ja-assets:${languageCode}:${runIdentity}`;
  const requestId = process.env.GITHUB_RUN_ID
    ? `github-actions:${process.env.GITHUB_RUN_ID}:${languageCode}`
    : `manual:${runIdentity}:${languageCode}`;

  const runner = new CatalogueIngestionRunner(
    stagingClient(),
    createApprovedTcgdexRepairAdapter(languageCode),
  );
  const result = await runner.run({
    command: 'run_language',
    importType: 'repair',
    language: languageCode,
    runKey,
    requestId,
    allowImageAssets: true,
    approvedOnlyAssets: true,
    writeConcurrency,
  });

  console.log(JSON.stringify({
    ok: true,
    repair: 'tcgdex-language-assets',
    language: languageCode,
    approval: 'approved',
    includes: ['card_image', 'set_logo', 'set_symbol'],
    result,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    repair: 'tcgdex-language-assets',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
