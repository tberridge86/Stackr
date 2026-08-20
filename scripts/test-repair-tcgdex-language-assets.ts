import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildSetAssetRecords,
  createApprovedTcgdexRepairAdapter,
} from './repair-tcgdex-language-assets';
import type { ProviderRecord } from './catalogue-ingestion/sourceAdapter';

function setRecord(payload: Record<string, unknown>): ProviderRecord {
  return {
    provider: 'tcgdex',
    providerRecordId: String(payload.id ?? 'unknown'),
    recordType: 'set',
    languageCode: 'ja',
    sourceUrl: 'https://api.tcgdex.net/v2/ja/sets',
    sourceEndpoint: 'https://api.tcgdex.net/v2/ja/sets',
    providerUpdatedAt: null,
    licenceStatus: 'approved',
    attributionText: 'TCGdex',
    httpMetadata: { status: 200 },
    payload,
  };
}

async function main() {
  const assets = buildSetAssetRecords([
    setRecord({
      id: 'sv2a',
      name: 'Pokémon Card 151',
      logo: 'https://assets.tcgdex.net/ja/sv/sv2a/logo',
      symbol: 'https://assets.tcgdex.net/ja/sv/sv2a/symbol',
    }),
    setRecord({ id: 'missing-art', name: 'No art supplied' }),
  ], 'ja');

  assert.equal(assets.length, 2, 'one logo and one symbol should be emitted');
  assert.deepEqual(
    assets.map((asset) => asset.payload.asset_type).sort(),
    ['set_logo', 'set_symbol'],
  );
  assert.ok(assets.every((asset) => asset.recordType === 'asset'));
  assert.ok(assets.every((asset) => asset.languageCode === 'ja'));
  assert.ok(assets.every((asset) => asset.licenceStatus === 'approved'));
  assert.ok(assets.every((asset) => String(asset.payload.image_url).endsWith('.webp')));
  assert.ok(assets.every((asset) => asset.payload.image_language_code === 'ja'));
  assert.ok(assets.some((asset) => asset.providerRecordId === 'sv2a:set_logo:image'));
  assert.ok(assets.some((asset) => asset.providerRecordId === 'sv2a:set_symbol:image'));

  const englishAdapter = createApprovedTcgdexRepairAdapter('en');
  const identity = englishAdapter.identifySource();
  assert.equal(identity.code, 'tcgdex');
  assert.equal(identity.licenceStatus, 'approved');
  assert.equal(typeof englishAdapter.healthCheck, 'function');
  assert.equal(typeof englishAdapter.fetchAssets, 'function');

  const source = await readFile('scripts/repair-tcgdex-language-assets.ts', 'utf8');
  assert.match(source, /ALLOWED_REPAIR_LANGUAGES = new Set\(\['en', 'ja'\]\)/);
  assert.match(source, /url\.includes\(STAGING_SUPABASE_REF\)/);
  assert.match(source, /Refusing asset repair against production project/);
  assert.match(source, /allowImageAssets:\s*true/);
  assert.match(source, /approvedOnlyAssets:\s*true/);
  assert.match(source, /cursor:\s*\{ offset \}/);
  assert.match(source, /const sets = await collectRecords\(base\.fetchSets\(\)\)/);
  assert.match(source, /if \(isDirectExecution\)/, 'importing the worker must not start a live ingestion');

  console.log('TCGdex English/Japanese repair worker tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
