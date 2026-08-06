import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { masterCatalogueInternals } from './catalogue-master';
import { PikaQianApiSourceAdapter } from './catalogue-ingestion/pikaqianAdapter';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const masterScript = readFileSync('scripts/catalogue-master.ts', 'utf8');
const pipeline = readFileSync('scripts/catalogue-ingestion/pipeline.ts', 'utf8');
const adapters = readFileSync('scripts/catalogue-ingestion/adapters.ts', 'utf8');
const pikaqianAdapter = readFileSync('scripts/catalogue-ingestion/pikaqianAdapter.ts', 'utf8');
const imageLeftoverMigration = readFileSync('supabase/migrations/20260801103000_catalogue_image_leftover_workflow.sql', 'utf8');
const publicationSnapshotMigration = readFileSync('supabase/migrations/20260801120000_language_catalogue_publication_snapshots.sql', 'utf8');
const targetedQualityReportMigration = readFileSync(
  'supabase/migrations/20260806170501_make_catalogue_quality_report_targeted.sql',
  'utf8',
);
const stackrApiService = readFileSync('backend/lib/stackrApiV1.js', 'utf8');

function assertRequiredCommandsExist() {
  for (const command of ['discover', 'apply', 'report', 'validate', 'missing', 'publish']) {
    assert.equal(
      packageJson.scripts[`catalogue:${command}`],
      `tsx scripts/catalogue-master.ts ${command} --target=staging`,
      `catalogue:${command} must route through the master importer`,
    );
  }
}

function assertCanonicalStagingSourceGuard() {
  assert.match(masterScript, /STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco'/);
  assert.match(masterScript, /PRODUCTION_SUPABASE_REFS = new Set\(\['oakdbbzdqwurpjnoqhmu'\]\)/);
  assert.match(masterScript, /staging_supabase_url_not_configured/);
  assert.match(masterScript, /https:\/\/\$\{STAGING_SUPABASE_REF\}\.supabase\.co/);
}

function assertDryRunApplyRules() {
  const parsed = masterCatalogueInternals.parseArgv(['apply', '--target=staging']);
  assert.equal(parsed.apply, false, 'apply command must still be dry-run unless --apply is passed');
  const applied = masterCatalogueInternals.parseArgv(['apply', '--target=staging', '--apply']);
  assert.equal(applied.apply, true);
  const plan = masterCatalogueInternals.buildMasterPlan({
    ...applied,
    includeImages: true,
    setId: 'SV4a',
    languages: ['ja', 'zh-cn'],
  });
  const firstImageIndex = plan.findIndex((stage) => stage.phase === 'images');
  assert.ok(firstImageIndex > 0, 'image stages must exist only after metadata stages');
  assert.ok(
    plan.slice(0, firstImageIndex).every((stage) => stage.phase !== 'images'),
    'metadata and recognition stages must precede images',
  );
  assert.ok(
    plan.filter((stage) => stage.phase === 'images').every((stage) => stage.allowImageAssets),
    'image stages must explicitly opt into native image assets',
  );
  assert.ok(
    plan.every((stage) => stage.provider !== 'ximilar_residual_scans' || !stage.allowImageAssets),
    'Ximilar must not be a bulk image source',
  );
  const filtered = masterCatalogueInternals.parseArgv([
    'discover',
    '--target=staging',
    '--provider=pikaqian',
    '--language=zh-cn',
    '--dry-run',
  ]);
  assert.equal(filtered.provider, 'pikaqian');
  assert.equal(filtered.apply, false);
  const offset = masterCatalogueInternals.parseArgv([
    'apply',
    '--target=staging',
    '--provider=tcgdex',
    '--language=en',
    '--set-offset=1',
    '--maxSets=1',
    '--writeConcurrency=8',
    '--apply',
  ]);
  assert.equal(offset.setOffset, 1);
  assert.equal(offset.writeConcurrency, 8);
  assert.throws(
    () => masterCatalogueInternals.parseArgv(['apply', '--writeConcurrency=17']),
    /integer from 1 to 16/,
  );
  const offsetPlan = masterCatalogueInternals.buildSetScopedStages(offset, [
    { provider: 'tcgdex', language: 'en', setId: 'first' },
    { provider: 'tcgdex', language: 'en', setId: 'second' },
  ]);
  assert.deepEqual(offsetPlan.map((stage) => stage.setId), ['second']);
  const providerPlan = masterCatalogueInternals.buildMasterPlan(filtered, ['csv6c']);
  assert.ok(providerPlan.length > 0, 'PikaQian provider filter must keep PikaQian stages');
  assert.ok(providerPlan.every((stage) => stage.provider === 'pikaqian'), 'provider filter must not schedule TCGdex or Ximilar stages');

  const assetArgs = masterCatalogueInternals.parseArgv([
    'apply',
    '--target=staging',
    '--provider=pikaqian',
    '--language=zh-cn',
    '--assets',
    '--approved-only',
    '--apply',
  ]);
  assert.equal(assetArgs.assetsOnly, true);
  assert.equal(assetArgs.approvedOnly, true);
  const assetPlan = masterCatalogueInternals.buildMasterPlan({
    ...assetArgs,
    pikaqianApiConfigured: true,
    setId: 'csv6c',
  }, ['csv6c']);
  assert.ok(assetPlan.length > 0);
  assert.ok(assetPlan.every((stage) => stage.phase === 'images' && stage.provider === 'pikaqian'));
  assert.ok(assetPlan.every((stage) => stage.assetsOnly && stage.approvedOnly));

  const apiPlan = masterCatalogueInternals.buildSetScopedStages({
    ...applied,
    includeImages: true,
    approvedOnly: true,
    languages: ['en', 'zh-cn'],
    setId: null,
    pikaqianApiConfigured: true,
  }, [
    { provider: 'pikaqian', language: 'zh-cn', setId: 'csv6c' },
    { provider: 'tcgdex', language: 'en', setId: 'sv1' },
  ]);
  const pikaqianCardIndex = apiPlan.findIndex((stage) => stage.id === 'pikaqian:zh-cn:csv6c:cards');
  const pikaqianImageIndex = apiPlan.findIndex((stage) => stage.id === 'pikaqian:zh-cn:csv6c:images');
  assert.ok(pikaqianCardIndex >= 0, 'PikaQian API metadata stage must exist for zh-cn set scopes');
  assert.equal(pikaqianImageIndex, -1, 'PikaQian must not spend quota on a duplicate image pass');
  assert.equal(apiPlan[pikaqianCardIndex].allowImageAssets, true);
  assert.equal(apiPlan[pikaqianCardIndex].approvedOnly, true);
  assert.ok(apiPlan.some((stage) => stage.id === 'tcgdex:en:sv1:cards'));
  assert.ok(!apiPlan.some((stage) => stage.id === 'tcgdex:zh-cn:csv6c:cards'), 'PikaQian set IDs must never be sent to TCGdex');

  const scopes = masterCatalogueInternals.deriveProviderSetScopes(
    { languages: ['en', 'zh-cn'], provider: null },
    [
      { id: 'set-me5', language_code: 'en' },
      { id: 'set-sv1', language_code: 'en' },
      { id: 'set-csv6c', language_code: 'zh-cn' },
    ],
    [
      { id: 'source-pokemon', code: 'pokemon_tcg_api' },
      { id: 'source-tcgdex', code: 'tcgdex' },
      { id: 'source-pikaqian', code: 'pikaqian' },
    ],
    [
      { source_id: 'source-pokemon', source_entity_type: 'set', external_id: 'me5', language_code: 'en', set_id: 'set-me5', is_current: true, deprecated_at: null },
      { source_id: 'source-tcgdex', source_entity_type: 'set', external_id: 'sv1', language_code: 'en', set_id: 'set-sv1', is_current: true, deprecated_at: null },
      { source_id: 'source-pikaqian', source_entity_type: 'set', external_id: 'csv6c', language_code: 'zh-cn', set_id: 'set-csv6c', is_current: true, deprecated_at: null },
    ],
  );
  assert.deepEqual(scopes, [
    { provider: 'pikaqian', language: 'zh-cn', setId: 'csv6c' },
    { provider: 'tcgdex', language: 'en', setId: 'sv1' },
  ], 'set scopes must come from exact provider identifiers, not a generic provider_set_code');
  assert.equal(masterCatalogueInternals.providerUnavailable({
    ok: false,
    result: { health: { status: 'unavailable' } },
  }), true);
  assert.equal(masterCatalogueInternals.providerUnavailable({
    ok: false,
    result: { health: { status: 'ok' } },
  }), false);
}

function assertProviderRules() {
  assert.match(adapters, /PikaQianApiSourceAdapter/, 'PikaQian API provider adapter must be registered');
  assert.match(adapters, /PikaQianSourceAdapter/, 'PikaQian provider adapter must be registered');
  assert.match(adapters, /XimilarResidualScanSourceAdapter/, 'Ximilar residual scan adapter must be registered');
  assert.match(masterScript, /PIKAQIAN_API_KEY/, 'PikaQian API keys must be read from the environment');
  assert.match(masterScript, /pikaqianFile/, 'PikaQian reviewed files must remain supported for controlled gap filling');
  assert.match(masterScript, /ximilarScanFile/, 'Ximilar must use supplied scan files only');
  assert.match(masterScript, /Skipped until PIKAQIAN_API_KEY or --pikaqianFile is supplied/, 'PikaQian must not run without an explicit API key or reviewed file');
  assert.match(masterScript, /Ximilar bulk image download is forbidden/, 'Ximilar image harvesting must be forbidden');
  assert.match(pikaqianAdapter, /https:\/\/api\.pikaqian\.com\/v1/, 'PikaQian API base URL must match the public v1 API');
  assert.match(pikaqianAdapter, /X-API-Key/, 'PikaQian API requests must use the X-API-Key header');
  assert.match(pikaqianAdapter, /\/sets/, 'PikaQian API adapter must fetch sets');
  assert.match(pikaqianAdapter, /\/cards/, 'PikaQian API adapter must fetch cards');
}

async function assertPikaQianApiAdapter() {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; apiKey: string | null }> = [];
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    const parsed = new URL(url);
    const headers = new Headers(init?.headers);
    requests.push({ url, apiKey: headers.get('X-API-Key') });

    if (parsed.pathname.endsWith('/sets')) {
      return new Response(JSON.stringify({
        data: [{
          id: 'csv6c',
          name: 'Mask of Change',
          local_name: '假面の化身',
          series: 'ScarletViolet',
          release_date: '2024-03-22',
          card_count: { actual: 106 },
          pack_image_url: 'https://images.pikaqian.invalid/sets/packs/csv6c.webp',
        }],
        pagination: { next_cursor: null, page_size: 50 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (parsed.pathname.endsWith('/cards')) {
      assert.equal(parsed.searchParams.get('set_id'), 'csv6c');
      return new Response(JSON.stringify({
        data: [{
          id: '8c1f0000-0000-0000-0000-000000000000',
          set_id: 'csv6c',
          name: 'Pikachu',
          local_name: '皮卡丘',
          card_number: '001/165',
          variant: 'standard',
          finish: 'standard',
          image_url: 'https://images.pikaqian.invalid/cards/csv6c/001.webp',
        }],
        pagination: { next_cursor: null, page_size: 50 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (parsed.pathname.endsWith('/cards/8c1f0000-0000-0000-0000-000000000000')) {
      return new Response(JSON.stringify({
        id: '8c1f0000-0000-0000-0000-000000000000',
        set_id: 'csv6c',
        name: 'Pikachu',
        local_name: '皮卡丘',
        card_number: '001/165',
        variant: 'standard',
        finish: 'standard',
        image_url: 'https://images.pikaqian.invalid/cards/csv6c/001.webp',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
  };

  try {
    const adapter = new PikaQianApiSourceAdapter({
      apiKey: 'pk_live_test',
      baseUrl: 'https://api.pikaqian.invalid/v1',
      licenceStatus: 'approved',
    });
    const health = await adapter.healthCheck();
    assert.equal(health.status, 'ok');
    const sets = await adapter.fetchSets({ limit: 1 });
    assert.equal(sets[0].languageCode, 'zh-cn');
    const normalisedSet = adapter.normaliseRecord(sets[0]);
    assert.equal(normalisedSet.languageCode, 'zh-cn');
    assert.equal(normalisedSet.total, 106);

    const cards = await adapter.fetchCards({ setId: 'csv6c', limit: 1 });
    assert.equal(cards[0].languageCode, 'zh-cn');
    const normalisedCard = adapter.normaliseRecord(cards[0]);
    assert.equal(normalisedCard.languageCode, 'zh-cn');
    assert.equal(normalisedCard.collectorNumber, '001/165');
    assert.equal(normalisedCard.variantCode, 'normal');
    assert.equal(normalisedCard.finishCode, 'normal');
    assert.notEqual(normalisedCard.languageCode, 'ja');

    const assets = await adapter.fetchAssets({ setId: 'csv6c', limit: 1 });
    assert.equal(assets.length, 1);
    const normalisedAsset = adapter.normaliseRecord(assets[0]);
    assert.equal(normalisedAsset.languageCode, 'zh-cn');
    assert.equal(normalisedAsset.imageLanguageCode, 'zh-cn');
    assert.equal(normalisedAsset.imageUrl, 'https://images.pikaqian.invalid/cards/csv6c/001.webp');
    assert.ok(requests.every((request) => request.apiKey === 'pk_live_test'), 'every PikaQian API request must carry X-API-Key');
    assert.ok(requests.some((request) => request.url.includes('/sets')), 'sets endpoint must be requested');
    assert.ok(requests.some((request) => request.url.includes('/cards?')), 'cards list endpoint must be requested');
    assert.equal(
      requests.filter((request) => new URL(request.url).pathname.endsWith('/cards')).length,
      1,
      'card list response must be reused for metadata and image references',
    );
    assert.ok(
      !requests.some((request) => request.url.includes('/cards/8c1f0000')),
      'one-time snapshots must not spend one API request per card image',
    );
  } finally {
    (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = originalFetch;
  }
}

function assertIdentityAndReportRules() {
  assert.match(masterScript, /const activeSets = sets\.filter\(\(set\) => set\.deprecated_at == null\)/);
  assert.match(masterScript, /const activePrintings = printings\.filter\(\(printing\) => printing\.deprecated_at == null\)/);
  assert.match(masterScript, /const activeVariants = variants\.filter\(\(variant\) => variant\.deprecated_at == null\)/);
  assert.match(masterScript, /const activeRawRecords = rawRecords\.filter\(\(row\) => row\.deprecated_at == null\)/);
  const expected = masterCatalogueInternals.expectedFromRaw({
    id: 'raw-1',
    source_id: 'source-1',
    record_type: 'variant',
    external_id: 'pikaqian:csv4a:001-master',
    language_code: 'zh-cn',
    source_url: 'https://provider.invalid/card',
    licence_status: 'under_review',
    raw_payload: {
      set_code: 'CSV4a',
      collector_number: '001/165',
      variant: 'master_ball',
      finish: 'holo',
      provider: 'pikaqian',
    },
  });
  assert.ok(expected);
  assert.equal(expected.language, 'zh-cn');
  assert.equal(expected.collectorNumber, '001/165', 'collector numbers must preserve leading zeroes');
  assert.equal(expected.variant, 'master_ball');
  assert.equal(expected.finish, 'holo');
  assert.equal(expected.canonicalKey, 'zh-cn:csv4a:001/165:master_ball:holo');

  const files = masterCatalogueInternals.reportFiles('reports/catalogue');
  for (const file of [
    'master-coverage.csv',
    'missing-card-records.csv',
    'missing-card-images.csv',
    'missing-set-art.csv',
    'conflicts.csv',
    'summary.json',
    'pikaqian-coverage.csv',
    'rights-blocked.csv',
    'image-leftovers.csv',
    'same-artwork-references.csv',
    'scan-acquisition-queue.csv',
  ]) {
    assert.ok(Object.values(files).some((value) => value.endsWith(file)), `${file} must be generated`);
  }
}

function assertSetCompletionStatusRules() {
  const completeGates = {
    missingCardRecords: 0,
    missingRequiredVariants: 0,
    missingExactNativeImages: 0,
    missingLogo: 0,
    missingSymbol: 0,
    unresolvedIdentityConflicts: 0,
    unvalidatedImages: 0,
  };
  assert.equal(masterCatalogueInternals.deriveSetCompletionStatus(completeGates), 'Complete');
  assert.equal(
    masterCatalogueInternals.deriveSetCompletionStatus({ ...completeGates, missingCardRecords: 1 }),
    'Metadata incomplete',
  );
  assert.equal(
    masterCatalogueInternals.deriveSetCompletionStatus({ ...completeGates, missingRequiredVariants: 1 }),
    'Metadata incomplete',
  );
  assert.equal(
    masterCatalogueInternals.deriveSetCompletionStatus({ ...completeGates, missingExactNativeImages: 1 }),
    'Images incomplete',
  );
  assert.equal(
    masterCatalogueInternals.deriveSetCompletionStatus({ ...completeGates, missingLogo: 1 }),
    'Set art incomplete',
  );
  assert.equal(
    masterCatalogueInternals.deriveSetCompletionStatus({ ...completeGates, missingSymbol: 1 }),
    'Set art incomplete',
  );
  assert.equal(
    masterCatalogueInternals.deriveSetCompletionStatus({ ...completeGates, unresolvedIdentityConflicts: 1 }),
    'Under review',
  );
  assert.equal(
    masterCatalogueInternals.deriveSetCompletionStatus({ ...completeGates, unvalidatedImages: 1 }),
    'Under review',
  );
  assert.equal(masterCatalogueInternals.percentComplete(73, 100), 73);
  for (const requiredColumn of [
    'set_status',
    'missing_required_variants',
    'missing_exact_native_images',
    'missing_logo',
    'missing_symbol',
    'unresolved_identity_conflicts',
    'unvalidated_images',
    'checklist_completion_percentage',
    'image_completion_percentage',
    'set_art_completion_percentage',
  ]) {
    assert.match(masterScript, new RegExp(requiredColumn), `${requiredColumn} must be reported`);
  }
}

async function assertSetArtRules() {
  const parsed = masterCatalogueInternals.parseArgv([
    'missing',
    '--target=staging',
    '--asset-kind=set-art',
  ]);
  assert.equal(parsed.assetKind, 'set-art');
  assert.equal(parsed.includeImages, false, 'set art must be separate from card image import stages');
  assert.equal(parsed.setArtRoot, 'catalogue');

  const setCode = masterCatalogueInternals.setArtFolderCode({
    id: 'set-id',
    set_code: 'SV2a',
    provider_set_code: 'translated-name-must-not-win',
  });
  assert.equal(setCode, 'SV2a', 'set art folders must use set_code ahead of provider names or translated names');
  assert.equal(
    masterCatalogueInternals.setArtExpectedPath('ja', 'SV2a', 'logo'),
    'catalogue/ja/SV2a/logo.webp',
  );
  assert.equal(
    masterCatalogueInternals.setArtExpectedPath('ko', 'SV2a', 'symbol'),
    'catalogue/ko/SV2a/symbol.webp',
  );

  const dryRunPlan = masterCatalogueInternals.buildSetArtPlan(parsed);
  assert.equal(dryRunPlan[0].phase, 'set_art');
  assert.equal(dryRunPlan[0].writes, false, 'set-art plan must be dry-run unless --apply is passed');
  assert.match(String(dryRunPlan[0].reason), /catalogue\/<language>\/<set_code>/);

  const applyWithoutApproval = masterCatalogueInternals.parseArgv([
    'apply',
    '--target=staging',
    '--asset-kind=set-art',
    '--apply',
  ]);
  const blocked = await masterCatalogueInternals.validateMaster(applyWithoutApproval);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.blockers.includes('set_art_import_requires_approved_only'));

  const root = mkdtempSync(join(tmpdir(), 'stackr-set-art-'));
  try {
    mkdirSync(join(root, 'zh-cn', 'csv6c'), { recursive: true });
    writeFileSync(join(root, 'zh-cn', 'csv6c', 'logo.webp'), 'fake-logo');
    writeFileSync(join(root, 'zh-cn', 'csv6c', 'symbol.webp'), 'fake-symbol');
    const files = masterCatalogueInternals.discoverSetArtFiles(root, ['zh-cn']);
    assert.equal(files.length, 2);
    assert.deepEqual(files.map((file) => file.assetType).sort(), ['set_logo', 'set_symbol']);
    assert.ok(files.every((file) => file.language === 'zh-cn'));
    assert.ok(files.every((file) => file.setCode === 'csv6c'));
    assert.ok(files.every((file) => file.relativePath.includes('/zh-cn/csv6c/')));
    assert.ok(files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)), 'set-art files must be tracked by SHA-256');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  assert.match(masterScript, /english_display_name/, 'set-art reports must include English display name');
  assert.match(masterScript, /release_date/, 'set-art reports must include release date');
  assert.match(masterScript, /expected_path/, 'missing-set-art report must list exact expected logo/symbol path');
  assert.match(masterScript, /stackr_set_art/, 'set-art import must use a distinct ingest source');
  assert.match(masterScript, /set_art_file_has_no_exact_language_set_code_match/, 'unmatched set art must become a conflict');
}

function assertImageLeftoverClassification() {
  const result = masterCatalogueInternals.classifyImageLeftovers({
    sets: [
      {
        id: 'set-ja',
        language_code: 'ja',
        set_code: 'SV4a',
        provider_set_code: 'SV4a',
        native_name: 'Japanese Set',
        english_display_name: null,
        release_date: '2024-01-26',
        total: null,
      },
      {
        id: 'set-en',
        language_code: 'en',
        set_code: 'SV4a',
        provider_set_code: 'SV4a',
        native_name: 'English Set',
        english_display_name: null,
        release_date: '2024-03-22',
        total: null,
      },
      {
        id: 'set-ko',
        language_code: 'ko',
        set_code: 'SV4a',
        provider_set_code: 'SV4a',
        native_name: 'Korean Set',
        english_display_name: null,
        release_date: '2024-03-22',
        total: null,
      },
    ],
    variants: [
      {
        id: 'v-ja-exact',
        printing_id: 'p-ja-exact',
        set_id: 'set-ja',
        language_code: 'ja',
        collector_number: '001/190',
        variant_code: 'normal',
        finish_code: 'normal',
        canonical_key: 'legacy',
        artwork_key: 'art-exact',
      },
      {
        id: 'v-ja-same-art',
        printing_id: 'p-ja-same-art',
        set_id: 'set-ja',
        language_code: 'ja',
        collector_number: '002/190',
        variant_code: 'normal',
        finish_code: 'normal',
        canonical_key: 'legacy',
        artwork_key: 'art-shared',
      },
      {
        id: 'v-en-same-art',
        printing_id: 'p-en-same-art',
        set_id: 'set-en',
        language_code: 'en',
        collector_number: '002/190',
        variant_code: 'normal',
        finish_code: 'normal',
        canonical_key: 'legacy',
        artwork_key: 'art-shared',
      },
      {
        id: 'v-ko-scan',
        printing_id: 'p-ko-scan',
        set_id: 'set-ko',
        language_code: 'ko',
        collector_number: '003/190',
        variant_code: 'normal',
        finish_code: 'normal',
        canonical_key: 'legacy',
        artwork_key: 'art-scan-only',
      },
      {
        id: 'v-ja-exact-conflict',
        printing_id: 'p-ja-exact-conflict',
        set_id: 'set-ja',
        language_code: 'ja',
        collector_number: '004/190',
        variant_code: 'normal',
        finish_code: 'normal',
        canonical_key: 'legacy',
        artwork_key: 'art-exact-conflict',
      },
      {
        id: 'v-ja-same-art-conflict',
        printing_id: 'p-ja-same-art-conflict',
        set_id: 'set-ja',
        language_code: 'ja',
        collector_number: '005/190',
        variant_code: 'normal',
        finish_code: 'normal',
        canonical_key: 'legacy',
        artwork_key: 'art-shared-conflict',
      },
      {
        id: 'v-en-same-art-conflict',
        printing_id: 'p-en-same-art-conflict',
        set_id: 'set-en',
        language_code: 'en',
        collector_number: '005/190',
        variant_code: 'normal',
        finish_code: 'normal',
        canonical_key: 'legacy',
        artwork_key: 'art-shared-conflict',
      },
      {
        id: 'v-ko-same-art-conflict',
        printing_id: 'p-ko-same-art-conflict',
        set_id: 'set-ko',
        language_code: 'ko',
        collector_number: '005/190',
        variant_code: 'normal',
        finish_code: 'normal',
        canonical_key: 'legacy',
        artwork_key: 'art-shared-conflict',
      },
    ],
    assets: [
      {
        id: 'asset-en',
        set_id: null,
        printing_id: null,
        variant_id: 'v-en-same-art',
        asset_type: 'card_image',
        url: 'https://assets.stackr.invalid/en/002.png',
        rights_status: 'approved',
        permission_status: 'approved',
        publicly_servable: true,
        original_source_url: 'https://assets.stackr.invalid/en/002.png',
        original_source_identifier: 'asset-en-original',
        source_attribution: 'Stackr',
        storage_provider: 'external_reference',
        deprecated_at: null,
      },
      {
        id: 'asset-en-conflict',
        set_id: null,
        printing_id: null,
        variant_id: 'v-en-same-art-conflict',
        asset_type: 'card_image',
        url: 'https://assets.stackr.invalid/en/005.png',
        rights_status: 'approved',
        permission_status: 'approved',
        publicly_servable: true,
        original_source_url: 'https://assets.stackr.invalid/en/005.png',
        original_source_identifier: 'asset-en-conflict-original',
        source_attribution: 'Stackr',
        storage_provider: 'external_reference',
        deprecated_at: null,
      },
      {
        id: 'asset-ko-conflict',
        set_id: null,
        printing_id: null,
        variant_id: 'v-ko-same-art-conflict',
        asset_type: 'card_image',
        url: 'https://assets.stackr.invalid/ko/005.png',
        rights_status: 'approved',
        permission_status: 'approved',
        publicly_servable: true,
        original_source_url: 'https://assets.stackr.invalid/ko/005.png',
        original_source_identifier: 'asset-ko-conflict-original',
        source_attribution: 'Stackr',
        storage_provider: 'external_reference',
        deprecated_at: null,
      },
    ],
    rawRecords: [
      {
        id: 'raw-ja-image',
        source_id: 'source-tcgdex',
        record_type: 'asset',
        external_id: 'tcgdex-ja-001-image',
        language_code: 'ja',
        source_url: 'https://api.tcgdex.invalid/ja/cards/001',
        licence_status: 'approved',
        raw_payload: {
          provider: 'tcgdex',
          language_code: 'ja',
          set_code: 'SV4a',
          collector_number: '001/190',
          variant: 'normal',
          finish: 'normal',
          image_url: 'https://images.tcgdex.invalid/ja/sv4a/001.png',
        },
      },
      {
        id: 'raw-ko-incomplete-image',
        source_id: 'source-tcgdex',
        record_type: 'asset',
        external_id: 'tcgdex-ko-003-image',
        language_code: 'ko',
        source_url: 'https://api.tcgdex.invalid/ko/cards/003',
        licence_status: 'approved',
        raw_payload: {
          provider: 'tcgdex',
          language_code: 'ko',
          set_code: 'SV4a',
          collector_number: '003/190',
          image_url: 'https://images.tcgdex.invalid/ko/sv4a/003.png',
        },
      },
      {
        id: 'raw-ja-conflict-image-a',
        source_id: 'source-tcgdex',
        record_type: 'asset',
        external_id: 'tcgdex-ja-004-normal-normal-image',
        language_code: 'ja',
        source_url: 'https://api.tcgdex.invalid/ja/cards/004',
        licence_status: 'approved',
        raw_payload: {
          provider: 'tcgdex',
          language_code: 'ja',
          set_code: 'SV4a',
          collector_number: '004/190',
          variant: 'normal',
          finish: 'normal',
          image_url: 'https://images.tcgdex.invalid/ja/sv4a/004.png',
        },
      },
      {
        id: 'raw-ja-conflict-image-b',
        source_id: 'source-commercial',
        record_type: 'asset',
        external_id: 'licensed-provider-ja-004-normal-normal-image',
        language_code: 'ja',
        source_url: 'https://licensed-provider.invalid/ja/cards/004',
        licence_status: 'approved',
        raw_payload: {
          provider: 'licensed_provider',
          language_code: 'ja',
          set_code: 'SV4a',
          collector_number: '004/190',
          variant: 'normal',
          finish: 'normal',
          image_url: 'https://licensed-provider.invalid/ja/sv4a/004.png',
        },
      },
    ],
  });

  assert.equal(result.groupA.length, 2, 'exact approved provider candidates must be Group A');
  const exactCandidate = result.groupA.find((row) => row.status === 'exact_approved_candidate_found');
  assert.equal(exactCandidate?.candidate_provider, 'tcgdex');
  const exactConflict = result.groupA.find((row) => row.status === 'exact_approved_candidate_conflict');
  assert.equal(exactConflict?.conflict_required, true, 'multiple exact candidates must not pick a winner');
  assert.equal(result.groupB.length, 2, 'other-language artwork must be Group B');
  const sameArtwork = result.groupB.find((row) => row.status === 'other_language_artwork_only');
  assert.equal(sameArtwork?.native_image_status, 'missing');
  assert.equal(sameArtwork?.same_artwork_as_variant_id, 'v-en-same-art');
  assert.equal(sameArtwork?.scan_queue_required, false);
  const sameArtworkConflict = result.groupB.find((row) => row.status === 'same_artwork_reference_conflict');
  assert.equal(sameArtworkConflict?.same_artwork_as_variant_id, '', 'ambiguous same-artwork references must not guess');
  assert.equal(sameArtworkConflict?.native_image_status, 'missing');
  assert.equal(result.groupC.length, 1, 'no approved online image must become Group C');
  assert.match(String(result.groupC[0].process), /ximilar_identify/);
  assert.equal(result.conflicts.length, 2, 'ambiguous image leftovers must appear in conflicts.csv');
  assert.ok(result.conflicts.some((row) => row.conflict_type === 'image_candidate_conflict'));
  assert.ok(result.conflicts.some((row) => row.conflict_type === 'same_artwork_reference_conflict'));
}

function assertImagePipelineRules() {
  assert.match(pipeline, /asset_language_mismatch/, 'image language mismatch must be quarantined');
  assert.match(pipeline, /content_sha256/, 'duplicate images must be skipped by SHA-256 when provided');
  assert.match(pipeline, /perceptual_hash/, 'duplicate images must be skipped by perceptual hash when provided');
  assert.match(pipeline, /healthyExactLanguageImage/, 'healthy exact-language images must not be overwritten');
  assert.match(
    pipeline,
    /linkVariantAssetExternalId\(healthyExactLanguageImage\[0\]\.id as string\)/,
    'existing healthy images must retain their provider asset identifier',
  );
  assert.match(pipeline, /acquisition_source/, 'assets must record their acquisition source');
  assert.match(imageLeftoverMigration, /native_image_status/, 'variants must track native image status');
  assert.match(imageLeftoverMigration, /same_artwork_as_variant_id/, 'same-artwork references must be stored separately from native images');
  assert.match(imageLeftoverMigration, /scan_acquisition/, 'scan acquisition must have a durable queue');
  assert.match(imageLeftoverMigration, /own_scan/, 'own scans must be a first-class acquisition source');
  assert.match(imageLeftoverMigration, /user_licensed/, 'user-licensed scans must be a first-class acquisition source');
  assert.doesNotMatch(
    pipeline,
    /from\(name\)\.insert\(\{[\s\S]*payload_hash[\s\S]*\}\)/,
    'catalogue assets must not use the raw-source payload_hash column',
  );
}

function assertQualityReportRules() {
  assert.match(targetedQualityReportMigration, /with \(security_invoker = true\)/);
  assert.match(targetedQualityReportMigration, /raw_source_records_active_set_ref_idx/);
  assert.match(targetedQualityReportMigration, /data_conflicts_open_set_ref_idx/);
  assert.match(targetedQualityReportMigration, /left join lateral/);
  assert.doesNotMatch(
    targetedQualityReportMigration,
    /join raw_record_quality rrq[\s\S]*rrq\.set_ref in/,
    'quality reports must not rebuild the previous high-cardinality OR join',
  );
}

function assertPublishRules() {
  assert.deepEqual(masterCatalogueInternals.LANGUAGE_PUBLISH_ORDER, ['en', 'ja', 'zh-tw', 'zh-cn', 'ko']);
  assert.deepEqual(masterCatalogueInternals.previousPublishLanguages('en'), []);
  assert.deepEqual(masterCatalogueInternals.previousPublishLanguages('zh-cn'), ['en', 'ja', 'zh-tw']);
  assert.equal(masterCatalogueInternals.publicationVersionKey('ja', '2026-08-01'), 'ja:2026-08-01');

  const publishArgs = masterCatalogueInternals.parseArgv([
    'publish',
    '--target=staging',
    '--language=ja',
    '--version=2026-08-01',
  ]);
  assert.equal(publishArgs.command, 'publish');
  assert.equal(publishArgs.apply, true, 'publish should write after validation unless --dry-run is passed');
  assert.equal(publishArgs.dryRun, false);
  assert.deepEqual(publishArgs.languages, ['ja']);
  assert.equal(publishArgs.version, '2026-08-01');
  assert.equal(publishArgs.controlledStaging, false);

  const controlledPublishArgs = masterCatalogueInternals.parseArgv([
    'publish',
    '--target=staging',
    '--language=zh-cn',
    '--setId=151c',
    '--version=staging-151c-20260806',
    '--controlled-staging',
    '--dry-run',
  ]);
  assert.equal(controlledPublishArgs.controlledStaging, true);
  assert.equal(controlledPublishArgs.setId, '151c');

  const dryRunPublishArgs = masterCatalogueInternals.parseArgv([
    'publish',
    '--target=staging',
    '--language=ja',
    '--version=2026-08-01',
    '--dry-run',
  ]);
  assert.equal(dryRunPublishArgs.apply, false);
  assert.equal(dryRunPublishArgs.dryRun, true);

  const plan = masterCatalogueInternals.buildPublishPlan(publishArgs);
  assert.equal(plan.versionKey, 'ja:2026-08-01');
  assert.deepEqual(plan.previousLanguagesRequired, ['en']);
  assert.equal(plan.writes, true);
  assert.match(plan.reason, /published snapshots only/);

  const controlledPlan = masterCatalogueInternals.buildPublishPlan(controlledPublishArgs);
  assert.equal(controlledPlan.releaseEligible, false);
  assert.equal(controlledPlan.publishOrderEnforced, false);
  assert.equal(controlledPlan.setRef, '151c');
  assert.match(controlledPlan.reason, /never production-release eligible/);

  const completeSummary = {
    byLanguage: [{
      language: 'ja',
      sets: 2,
      setStatuses: { Complete: 2 },
      missingCardRecords: 0,
      missingRequiredVariants: 0,
      missingExactNativeImages: 0,
      missingLogos: 0,
      missingSymbols: 0,
      unresolvedIdentityConflicts: 0,
      unvalidatedImages: 0,
    }],
  };
  assert.equal(masterCatalogueInternals.publishReadinessFromSummary(completeSummary, 'ja').ok, true);

  const incompleteSummary = {
    byLanguage: [{
      ...completeSummary.byLanguage[0],
      setStatuses: { Complete: 1, 'Images incomplete': 1 },
      missingExactNativeImages: 1,
    }],
  };
  const readiness = masterCatalogueInternals.publishReadinessFromSummary(incompleteSummary, 'ja');
  assert.equal(readiness.ok, false);
  assert.ok(readiness.blockers.includes('language_has_incomplete_sets'));
  assert.ok(readiness.blockers.includes('missing_exact_native_images'));

  const controlledReadiness = masterCatalogueInternals.controlledStagingReadinessFromSummary({
    coverageRows: [{
      language: 'zh-cn',
      set_id: '8e3da79a-1d8d-40ae-9f09-0150728cfbd6',
      set_code: '151c',
      stored_card_records: 54,
      stored_required_variants: 54,
      exact_native_images: 6,
      unresolved_identity_conflicts: 0,
      unvalidated_images: 0,
      missing_card_records: 289,
      missing_exact_native_images: 48,
    }],
  }, 'zh-cn', '151c');
  assert.equal(controlledReadiness.ok, true, 'a reviewed partial set can be exposed only by controlled staging publication');
  assert.equal(controlledReadiness.setCoverage.set_code, '151c');
  assert.equal(
    masterCatalogueInternals.controlledStagingReadinessFromSummary({ coverageRows: [] }, 'zh-cn', '151c').ok,
    false,
  );

  assert.match(masterScript, /requirePreviousLanguagesPublished/, 'publish must enforce language release order');
  assert.match(masterScript, /snapshotPublishedLanguage/, 'publish must create a language snapshot');
  assert.match(masterScript, /includedSetIds/, 'controlled staging publication must limit snapshot membership to the reviewed set');
  assert.match(masterScript, /schema\('catalog'\)[\s\S]*rpc\('activate_catalogue_version'/, 'activation must call the catalog-scoped RPC');
  assert.match(masterScript, /catalogue_version_external_identifiers/, 'publish must snapshot provider identifiers');
}

function assertAppReadsPublishedSnapshots() {
  assert.match(publicationSnapshotMigration, /create table if not exists catalog\.catalogue_version_external_identifiers/);
  assert.match(publicationSnapshotMigration, /from catalog\.catalogue_version_external_identifiers cvei/);
  const externalIdentifierViewStart = publicationSnapshotMigration.indexOf('create or replace view api.catalogue_external_identifiers');
  const deltaViewStart = publicationSnapshotMigration.indexOf('create or replace view api.catalogue_delta_changes');
  assert.ok(externalIdentifierViewStart >= 0 && deltaViewStart > externalIdentifierViewStart);
  const externalIdentifierView = publicationSnapshotMigration.slice(externalIdentifierViewStart, deltaViewStart);
  assert.doesNotMatch(
    externalIdentifierView,
    /from ingest\.external_identifiers/i,
    'app-facing external ID view must read the published snapshot, not live ingest',
  );
  assert.match(stackrApiService, /table\(supabase, 'api', 'published_catalogue_versions'\)/);
  assert.match(stackrApiService, /table\(supabase, 'api', 'catalogue_languages'\)/);
  assert.match(stackrApiService, /table\(supabase, 'api', 'catalogue_series'\)/);
  assert.match(stackrApiService, /table\(supabase, 'api', 'catalogue_external_identifiers'\)/);
  assert.doesNotMatch(
    stackrApiService,
    /table\(supabase, 'ingest', 'external_identifiers'\)/,
    'backend API search must not read unfinished ingest identifiers',
  );
}

function assertValidationBlocksProduction() {
  const parsed = masterCatalogueInternals.parseArgv(['validate']);
  return masterCatalogueInternals.validateMaster(parsed).then((result) => {
    assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('target_not_staging'));
  }).then(async () => {
    const parsed = masterCatalogueInternals.parseArgv([
      'validate',
      '--target=staging',
      '--provider=pikaqian',
      '--language=zh-cn',
      '--assets',
    ]);
    const result = await masterCatalogueInternals.validateMaster(parsed);
    assert.equal(result.ok, false);
    assert.ok(result.blockers.includes('staging_supabase_url_not_configured'));
    assert.ok(result.blockers.includes('pikaqian_asset_import_requires_approved_only'));
  }).then(async () => {
    const parsed = masterCatalogueInternals.parseArgv([
      'publish',
      '--target=staging',
      '--version=2026-08-01',
      '--languages=en,ja',
    ]);
    const result = await masterCatalogueInternals.validateMaster(parsed);
    assert.equal(result.ok, false);
    assert.ok(result.blockers.includes('publish_requires_single_language'));
  }).then(async () => {
    const parsed = masterCatalogueInternals.parseArgv([
      'publish',
      '--target=staging',
      '--language=en',
    ]);
    const result = await masterCatalogueInternals.validateMaster(parsed);
    assert.equal(result.ok, false);
    assert.ok(result.blockers.includes('publish_version_required'));
  }).then(async () => {
    const parsed = masterCatalogueInternals.parseArgv([
      'publish',
      '--target=staging',
      '--language=zh-cn',
      '--setId=151c',
      '--version=2026-08-06',
      '--controlled-staging',
    ]);
    const result = await masterCatalogueInternals.validateMaster(parsed);
    assert.equal(result.ok, false);
    assert.ok(result.blockers.includes('controlled_staging_version_prefix_required'));
  }).then(async () => {
    const parsed = masterCatalogueInternals.parseArgv([
      'publish',
      '--target=staging',
      '--language=zh-cn',
      '--setId=151c',
      '--version=staging-151c-20260806',
    ]);
    const result = await masterCatalogueInternals.validateMaster(parsed);
    assert.equal(result.ok, false);
    assert.ok(result.blockers.includes('publish_set_scope_requires_controlled_staging'));
  });
}

async function main() {
  assertRequiredCommandsExist();
  assertCanonicalStagingSourceGuard();
  assertDryRunApplyRules();
  assertProviderRules();
  await assertPikaQianApiAdapter();
  assertIdentityAndReportRules();
  assertSetCompletionStatusRules();
  await assertSetArtRules();
  assertImageLeftoverClassification();
  assertImagePipelineRules();
  assertQualityReportRules();
  assertPublishRules();
  assertAppReadsPublishedSnapshots();
  await assertValidationBlocksProduction();
  console.log('Master catalogue importer tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
