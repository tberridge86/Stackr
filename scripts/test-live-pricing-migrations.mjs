import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const REHEARSAL_DATABASE = 'stackr_live_pricing_test';
const TARGET_MIGRATIONS = [
  '20260903120000_deduplicate_pending_price_refreshes.sql',
  '20260903210000_verified_sold_provenance.sql',
  '20260904123000_poketrace_sold_evidence_provider.sql',
  '20260904130000_market_price_snapshot_history_buckets.sql',
  '20260904131000_exact_variant_price_refresh_queue.sql',
  '20260906063316_personal_pricing_privacy_boundary.sql',
];

function fail(message) {
  throw new Error(`Live-pricing migration rehearsal: ${message}`);
}

function readDbUrl(argv) {
  const index = argv.indexOf('--db-url');
  if (index < 0 || !argv[index + 1]) fail(`pass --db-url for a local ${REHEARSAL_DATABASE} database`);
  if (argv.some((value, position) => value === '--db-url' && position !== index)) fail('pass --db-url only once');
  let url;
  try {
    url = new URL(argv[index + 1]);
  } catch {
    fail('provide a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) fail('only PostgreSQL URLs are supported');
  if ([...url.searchParams.keys()].length) fail('connection-string query parameters are not allowed');
  if (!['localhost', '127.0.0.1'].includes(url.hostname.toLowerCase())) fail('refusing a non-local database host');
  if (decodeURIComponent(url.pathname).replace(/^\//, '') !== REHEARSAL_DATABASE) {
    fail(`database name must be exactly ${REHEARSAL_DATABASE}`);
  }
  return url.toString();
}

async function queryOne(client, text, values = []) {
  const result = await client.query(text, values);
  return result.rows[0] ?? null;
}

async function execute(client, text, values = []) {
  if (!values.length && typeof client.exec === 'function') return client.exec(text);
  return client.query(text, values);
}

async function expectRejected(action, expectedMessage) {
  await assert.rejects(action, (error) => {
    assert.match(String(error.message), expectedMessage);
    return true;
  });
}

async function preflightBaseline(client, expectedDatabase = REHEARSAL_DATABASE) {
  const database = await queryOne(client, 'select current_database() as name');
  assert.equal(database?.name, expectedDatabase, 'connected database changed after URL validation');
  const requiredRelations = [
    'public.price_refresh_queue',
    'public.market_price_snapshots',
    'market.sold_observations',
    'market.source_providers',
    'market.price_estimate_versions',
    'ingest.sources',
    'ingest.raw_source_records',
  ];
  const relationCheck = await queryOne(client, 'select array_agg(name order by name) filter (where present) as present from unnest($1::text[]) as names(name) cross join lateral (select to_regclass(name) is not null as present) checked', [requiredRelations]);
  const present = new Set(relationCheck?.present ?? []);
  const missing = requiredRelations.filter((name) => !present.has(name));
  if (missing.length) fail(`baseline schema is missing ${missing.join(', ')}; provision prior Stackr migrations before this rehearsal`);

  const roles = await client.query("select rolname from pg_roles where rolname = any(array['anon', 'authenticated', 'service_role'])");
  const availableRoles = new Set(roles.rows.map((row) => row.rolname));
  const missingRoles = ['anon', 'authenticated', 'service_role'].filter((role) => !availableRoles.has(role));
  if (missingRoles.length) fail(`baseline is missing Supabase roles: ${missingRoles.join(', ')}`);
}

async function applyFixture(client, root) {
  const fixture = path.join(root, 'supabase', 'tests', 'fixtures', 'live_pricing_rehearsal_baseline.sql');
  if (!existsSync(fixture)) fail('the local rehearsal fixture is missing');
  await execute(client, await readFile(fixture, 'utf8'));
}

async function migrationFiles(root) {
  const migrationsDir = path.join(root, 'supabase', 'migrations');
  const files = [];
  for (const name of TARGET_MIGRATIONS) {
    const file = path.join(migrationsDir, name);
    if (!existsSync(file)) fail(`required migration is missing: ${name}`);
    files.push(file);
  }
  return files;
}

async function applyMigration(client, file) {
  const sql = await readFile(file, 'utf8');
  if (!sql.trim()) fail(`migration is empty: ${path.basename(file)}`);
  await execute(client, 'begin');
  try {
    await execute(client, sql);
    await execute(client, 'commit');
  } catch (error) {
    await execute(client, 'rollback').catch(() => undefined);
    error.message = `${path.basename(file)}: ${error.message}`;
    throw error;
  }
}

async function applyMigrations(client, files) {
  for (const file of files) await applyMigration(client, file);
  // The first migration temporarily installs a printing/language unique index.
  // Reapplying it after the exact-variant upgrade would reject valid sibling
  // finishes, so only the migrations designed to remain idempotent are replayed.
  for (const file of files.filter((file) => path.basename(file) !== TARGET_MIGRATIONS[0])) {
    await applyMigration(client, file);
  }
}

async function assertProviderDisabledAndPrivate(client) {
  const provider = await queryOne(client, `
    select source.active as source_active, source.licence_status,
      provider.active as provider_active, provider.data_licence_status,
      provider.automated_refresh_allowed, provider.health_status
    from ingest.sources source
    join market.source_providers provider on provider.code = source.code
    where source.code = 'poketrace_sold'
  `);
  assert.deepEqual(provider, {
    source_active: false,
    licence_status: 'under_review',
    provider_active: false,
    data_licence_status: 'unreviewed',
    automated_refresh_allowed: false,
    health_status: 'disabled',
  }, 'the PokeTrace provider must remain disabled without an approval record');

  const grants = await queryOne(client, `
    select
      has_function_privilege('anon', 'api.is_poketrace_data_use_authorised()', 'execute') as anon_rights,
      has_function_privilege('authenticated', 'api.ingest_poketrace_sold_evidence_batch(jsonb)', 'execute') as authenticated_ingest,
      has_function_privilege('service_role', 'api.ingest_poketrace_sold_evidence_batch(jsonb)', 'execute') as service_ingest,
      has_table_privilege('anon', 'market.sold_observations', 'select') as anon_sold_select,
      has_table_privilege('authenticated', 'market.sold_observations', 'select') as authenticated_sold_select
  `);
  assert.equal(grants.anon_rights, false);
  assert.equal(grants.authenticated_ingest, false);
  assert.equal(grants.service_ingest, true);
  assert.equal(grants.anon_sold_select, false);
  assert.equal(grants.authenticated_sold_select, false);

  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await expectRejected(
      () => client.query("update ingest.sources set active = true where code = 'poketrace_sold'"),
      /permission denied/i,
    );
  } finally {
    await client.query('rollback');
  }
}

async function assertQueueUniqueness(client) {
  const cardId = `migration-rehearsal-${randomUUID()}`;
  const variantOne = randomUUID();
  const variantTwo = randomUUID();
  await client.query('begin');
  try {
    const insert = (variantId) => client.query(`
      insert into public.price_refresh_queue (card_id, language, reason, metadata)
      values ($1, 'en', 'manual_snapshot_refresh', jsonb_build_object('canonicalVariantId', $2::text))
    `, [cardId, variantId]);
    await insert(variantOne);
    await client.query('savepoint duplicate_queue_probe');
    try {
      await insert(variantOne);
      assert.fail('duplicate queue row was accepted');
    } catch (error) {
      assert.match(String(error.message), /duplicate key|unique/i);
      await client.query('rollback to savepoint duplicate_queue_probe');
    }
    await insert(variantTwo);
  } finally {
    await client.query('rollback');
  }
}

async function assertFalseLastSoldIsRejected(client) {
  const cardId = `migration-rehearsal-${randomUUID()}`;
  await client.query('begin');
  try {
    const inserted = await queryOne(client, `
      insert into public.market_price_snapshots (card_id, canonical_identity_key, price_type, proven_last_sold)
      values ($1, $2, 'market_estimate', false)
      returning id
    `, [cardId, `raw_card|en|rehearsal|${cardId}`]);
    await expectRejected(
      () => client.query('update public.market_price_snapshots set proven_last_sold = true where id = $1', [inserted.id]),
      /proven last-sold snapshot must use recent_sold_value/i,
    );
  } finally {
    await client.query('rollback');
  }
}

async function assertApprovedManualEvidenceCanPublish(client) {
  const suffix = randomUUID();
  const variantId = randomUUID();
  const sourceCode = `manual_rehearsal_${suffix.replaceAll('-', '')}`;
  const evidenceHashes = ['a', 'b', 'c'].map((character) => character.repeat(64));
  await execute(client, 'begin');
  try {
    const source = await queryOne(client, `
      insert into ingest.sources (code, display_name, source_type, licence_status, active)
      values ($1, 'Approved manual rehearsal source', 'manual', 'approved', true)
      returning id
    `, [sourceCode]);
    await client.query(`
      insert into market.source_providers (
        code, display_name, provider_kind, active, supports_sold_observations,
        data_licence_status, automated_refresh_allowed, health_status
      ) values ($1, 'Approved manual rehearsal source', 'manual_import', true, true, 'approved', false, 'ok')
    `, [sourceCode]);
    await client.query("insert into market.conditions (code, product_kind, active) values ('raw_near_mint', 'raw_card', true) on conflict (code) do update set active = true");
    await client.query("insert into market.currencies (code, active) values ('GBP', true) on conflict (code) do update set active = true");
    const identity = await queryOne(client, `
      insert into market.market_identities (identity_key, product_kind, language_code, variant_id, condition_code)
      values ($1, 'raw_card', 'en', $2, 'raw_near_mint')
      returning id
    `, [`manual-rehearsal|${suffix}`, variantId]);
    const version = await queryOne(client, "insert into market.price_estimate_versions (status) values ('active') returning id");
    const observationIds = [];
    for (const [index, evidenceHash] of evidenceHashes.entries()) {
      const sourceItemId = `manual-item-${suffix}-${index}`;
      const sourceUrl = `https://example.invalid/manual/${suffix}/${index}`;
      const raw = await queryOne(client, `
        insert into ingest.raw_source_records (
          source_id, record_type, provider_record_id, external_id, source_url,
          payload_hash, licence_status, validation_status
        ) values ($1, 'price', $2, $2, $3, $4, 'approved', 'valid')
        returning id
      `, [source.id, sourceItemId, sourceUrl, evidenceHash]);
      const observation = await queryOne(client, `
        insert into market.sold_observations (
          market_identity_id, variant_id, provider_code, source_item_id, sold_price,
          currency_code, sale_type, condition_code, observed_at, sold_at, source_url,
          raw_title, parsed_match_confidence, raw_record_id, evidence_sha256,
          sale_verification_state, final_price_confirmed, canonical_match_verified,
          transaction_status, provenance_version
        ) values (
          $1, $2, $3, $4, 100, 'GBP', 'manual_verified_sale', 'raw_near_mint',
          now(), now() - interval '1 day', $5, 'Manual exact card', 0.99, $6, $7,
          'confirmed', true, true, 'completed', 'manual-rehearsal-v1'
        ) returning id
      `, [identity.id, variantId, sourceCode, sourceItemId, sourceUrl, raw.id, evidenceHash]);
      observationIds.push(observation.id);
    }
    await execute(client, 'set local role service_role');
    const published = await queryOne(client, `
      select api.apply_canonical_price_estimate_batch($1::uuid, $2::jsonb) as result
    `, [version.id, JSON.stringify([{
      market_identity_id: identity.id,
      product_kind: 'raw_card',
      variant_id: variantId,
      sealed_product_variant_id: null,
      condition_code: 'raw_near_mint',
      grader_code: null,
      grade_id: null,
      display_currency_code: 'GBP',
      evidence_status: 'recent_sold_value',
      sample_count: 3,
      sold_sample_count: 3,
      active_listing_count: 0,
      source_count: 1,
      date_range_start: '2026-09-01T00:00:00.000Z',
      date_range_end: '2026-09-05T00:00:00.000Z',
      low_estimate: 95,
      central_estimate: 100,
      high_estimate: 105,
      confidence_score: 90,
      confidence_label: 'high',
      freshness: 'fresh',
      recency_weight: 1,
      source_breakdown: [{ sourceCode, observationsUsed: 3 }],
      outlier_summary: {},
      calculated_at: '2026-09-05T00:00:00.000Z',
      stale_after: '2026-09-12T00:00:00.000Z',
      included_sold_observation_ids: observationIds,
    }])]);
    assert.equal(published.result.status, 'applied');
    assert.equal(published.result.writtenCount, 1);
  } finally {
    await execute(client, 'rollback');
  }
}

async function assertApprovedPokeTraceEvidenceIngests(client) {
  // This turns on a synthetic provider and a complete review record only inside
  // this transaction. The rollback is intentional: it tests the fail-closed
  // ingestion boundary without representing a production approval or calling a
  // provider.
  const suffix = randomUUID();
  const variantId = randomUUID();
  const setId = randomUUID();
  const printingId = randomUUID();
  const searchId = randomUUID();
  const sourceItemIds = ['123456789012', '123456789013', '123456789014'];
  const observedAt = '2026-09-05T12:00:00.000Z';
  const soldAt = '2026-09-04T12:00:00.000Z';
  const reviewDetails = Object.fromEntries([
    'dataAsset', 'source', 'ownerOrLicensor', 'permittedPurpose', 'territory', 'term',
    'transformationRights', 'storageRights', 'deletionRequirements', 'attribution',
    'downstreamDeliveryRights', 'approvingPerson',
  ].map((key) => [key, `synthetic-${key}`]));
  const makeRow = (sourceItemId, position, cardName = 'Pikachu') => {
    const sourceUrl = `https://www.ebay.co.uk/itm/${sourceItemId}`;
    return {
      variantId,
      productKind: 'raw_card',
      conditionCode: 'raw_near_mint',
      graderCode: null,
      gradeValue: null,
      sourceItemId,
      soldPrice: 12.34 + position,
      shippingPrice: 1.5,
      currencyCode: 'GBP',
      soldAt,
      observedAt,
      sourceUrl,
      rawTitle: `${cardName} 25/102`,
      matchConfidence: 0.99,
      providerSearchId: searchId,
      providerResultPosition: position,
      rawPayload: {
        provider: 'poketrace',
        apiVersion: '1.7.0',
        listing: {
          listingUrl: sourceUrl,
          sourceItemId,
          title: `${cardName} 25/102`,
          price: 12.34 + position,
          currency: 'GBP',
          soldAt,
          condition: 'near mint',
          anomalyFlag: false,
        },
        providerCard: {
          id: searchId,
          name: cardName,
          cardNumber: '25/102',
          variant: 'normal',
          game: 'pokemon',
          market: 'US',
          productType: 'single',
          productFamily: 'card',
          set: { code: 'rehearsal-base' },
        },
      },
    };
  };

  await execute(client, 'begin');
  try {
    const adminRights = await queryOne(client, `
      select current_user as role,
        has_table_privilege(current_user, 'audit.provider_data_rights_approvals', 'insert') as can_write_rights
    `);
    assert.equal(adminRights.can_write_rights, true, `fixture administrator cannot seed synthetic review as ${adminRights.role}`);
    await client.query(`
      update ingest.sources
      set active = true, licence_status = 'approved'
      where code = 'poketrace_sold'
    `);
    await client.query(`
      update market.source_providers
      set active = true, data_licence_status = 'approved',
        automated_refresh_allowed = true, health_status = 'ok'
      where code = 'poketrace_sold'
    `);
    await client.query(`
      insert into audit.provider_data_rights_approvals (
        provider_code, usage_scope, evidence_reference, approval_status,
        approved_by, approved_at, review_details
      ) values (
        'poketrace_sold',
        'commercial_card_identity_price_history_and_sold_listing_use',
        'synthetic-local-rehearsal-only', 'approved', 'test-only', now(), $1::jsonb
      )
    `, [JSON.stringify(reviewDetails)]);
    await client.query("insert into market.conditions (code, product_kind, active) values ('raw_near_mint', 'raw_card', true) on conflict (code) do update set active = true");
    await client.query("insert into market.currencies (code, active) values ('GBP', true) on conflict (code) do update set active = true");
    await client.query("insert into catalog.languages (code, english_name, native_name) values ('en', 'English', 'English') on conflict (code) do nothing");
    await client.query(`
      insert into catalog.sets (id, game_code, language_code, set_code, provider_set_code, native_name, english_display_name)
      values ($1, 'pokemon', 'en', 'rehearsal-base', 'rehearsal-base', 'Rehearsal Base', 'Rehearsal Base')
    `, [setId]);
    await client.query(`
      insert into catalog.card_printings (id, set_id, language_code, collector_number, game_code, native_name, english_display_name)
      values ($1, $2, 'en', '25/102', 'pokemon', 'Pikachu', 'Pikachu')
    `, [printingId, setId]);
    await client.query(`
      insert into catalog.card_variants (id, printing_id, set_id, canonical_key, game_code, language_code, collector_number, variant_code)
      values ($1, $2, $3, $4, 'pokemon', 'en', '25/102', 'normal')
    `, [variantId, printingId, setId, `pokemon|${suffix}`]);

    await execute(client, 'set local role service_role');
    const serviceRights = await queryOne(client, `
      select current_user as role,
        has_table_privilege(current_user, 'audit.provider_data_rights_approvals', 'select') as can_read_rights,
        (select rolbypassrls from pg_roles where rolname = current_user) as bypasses_rls
    `);
    assert.deepEqual(serviceRights, { role: 'service_role', can_read_rights: true, bypasses_rls: true });
    const rows = sourceItemIds.map((sourceItemId, index) => makeRow(sourceItemId, index));
    const ingested = await queryOne(client, 'select api.ingest_poketrace_sold_evidence_batch($1::jsonb) as result', [JSON.stringify(rows)]);
    assert.equal(ingested.result.status, 'applied');
    assert.equal(ingested.result.writtenCount, 3);
    assert.equal(ingested.result.observations.length, 3);

    const repeated = await queryOne(client, 'select api.ingest_poketrace_sold_evidence_batch($1::jsonb) as result', [JSON.stringify(rows)]);
    assert.deepEqual(
      repeated.result.observations.map((observation) => observation.observationId),
      ingested.result.observations.map((observation) => observation.observationId),
      'the same provider listing evidence must be idempotent',
    );

    const mismatchedCard = makeRow('123456789015', 4, 'Raichu');
    await client.query('savepoint mismatched_card_probe');
    await expectRejected(
      () => client.query('select api.ingest_poketrace_sold_evidence_batch($1::jsonb)', [JSON.stringify([mismatchedCard])]),
      /does not exactly match the active canonical card/i,
    );
    await client.query('rollback to savepoint mismatched_card_probe');

    const mismatchedFinish = makeRow('123456789016', 5);
    mismatchedFinish.rawPayload.providerCard.variant = 'holofoil';
    await client.query('savepoint mismatched_finish_probe');
    await expectRejected(
      () => client.query('select api.ingest_poketrace_sold_evidence_batch($1::jsonb)', [JSON.stringify([mismatchedFinish])]),
      /does not exactly match the active canonical card/i,
    );
    await client.query('rollback to savepoint mismatched_finish_probe');

    const unknownPrice = makeRow('123456789017', 6);
    unknownPrice.rawPayload.listing.price = 'unknown';
    await client.query('savepoint unknown_price_probe');
    await expectRejected(
      () => client.query('select api.ingest_poketrace_sold_evidence_batch($1::jsonb)', [JSON.stringify([unknownPrice])]),
      /does not match one complete, non-anomalous provider listing/i,
    );
    await client.query('rollback to savepoint unknown_price_probe');

    const observationId = ingested.result.observations[0].observationId;
    const beforeTamper = await queryOne(client, 'select market.is_proven_sold_observation($1::uuid) as proven', [observationId]);
    assert.equal(beforeTamper.proven, true);
    await client.query(`
      update ingest.raw_source_records
      set raw_payload = jsonb_set(raw_payload, '{listing,title}', '"Tampered title"'::jsonb)
      where id = $1::uuid
    `, [ingested.result.observations[0].rawRecordId]);
    const afterTamper = await queryOne(client, 'select market.is_proven_sold_observation($1::uuid) as proven', [observationId]);
    assert.equal(afterTamper.proven, false, 'altered retained PokeTrace payload must lose proven-sale status');
  } finally {
    await execute(client, 'rollback');
  }
}

async function assertPersonalPricingPrivacy(client) {
  const ownerId = randomUUID();
  const otherUserId = randomUUID();
  const cardId = `privacy-rehearsal-${randomUUID()}`;
  const observationId = randomUUID();
  const sharedSnapshotId = randomUUID();
  const personalSnapshotId = randomUUID();
  await execute(client, 'begin');
  try {
    await client.query(`
      insert into public.price_observations (id, card_id, source, source_type, raw_payload)
      values ($1, $2, 'poketrace_sold', 'sold_transaction', '{"listing":{"sourceItemId":"private-evidence"}}'::jsonb)
    `, [observationId, cardId]);
    await client.query(`
      insert into public.market_price_snapshots (id, user_id, card_id, language, market_price_gbp)
      values ($1, null, $3, 'en', 100), ($2, $4::uuid, $3, 'en', 101)
    `, [sharedSnapshotId, personalSnapshotId, cardId, ownerId]);

    await client.query('savepoint anonymous_snapshot_probe');
    await execute(client, 'set local role anon');
    await expectRejected(
      () => client.query('select id from public.market_price_snapshots where id = $1', [sharedSnapshotId]),
      /permission denied/i,
    );
    await client.query('rollback to savepoint anonymous_snapshot_probe');

    await execute(client, 'set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [otherUserId]);
    const otherRows = await client.query(`
      select id from public.market_price_snapshots
      where id in ($1, $2) order by id
    `, [sharedSnapshotId, personalSnapshotId]);
    assert.equal(otherRows.rows.length, 0, 'another user must not read shared or owner pricing snapshots');
    for (const [label, userId] of [
      ['shared', null],
      ['another owner', ownerId],
    ]) {
      await client.query(`savepoint ${label === 'shared' ? 'shared_insert_probe' : 'cross_owner_insert_probe'}`);
      await expectRejected(
        () => client.query(`
          insert into public.market_price_snapshots (id, user_id, card_id, language, market_price_gbp)
          values ($1, $2::uuid, $3, 'en', 102)
        `, [randomUUID(), userId, cardId]),
        /row-level security|permission denied/i,
      );
      await client.query(`rollback to savepoint ${label === 'shared' ? 'shared_insert_probe' : 'cross_owner_insert_probe'}`);
    }
    await client.query('savepoint raw_evidence_probe');
    await expectRejected(
      () => client.query('select raw_payload from public.price_observations where id = $1', [observationId]),
      /permission denied/i,
    );
    await client.query('rollback to savepoint raw_evidence_probe');

    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerId]);
    const ownerRows = await client.query('select id from public.market_price_snapshots where id = $1', [personalSnapshotId]);
    assert.deepEqual(ownerRows.rows.map((row) => row.id), [personalSnapshotId], 'the matching owner keeps personal snapshot access');
    const writtenSnapshotId = randomUUID();
    await client.query(`
      insert into public.market_price_snapshots (id, user_id, card_id, language, market_price_gbp)
      values ($1, $2::uuid, $3, 'en', 102)
    `, [writtenSnapshotId, ownerId, cardId]);
    const updated = await queryOne(client, `
      update public.market_price_snapshots set market_price_gbp = 103
      where id = $1 returning market_price_gbp
    `, [writtenSnapshotId]);
    assert.equal(Number(updated.market_price_gbp), 103, 'existing owner snapshot writes must remain available');
    await client.query('savepoint owner_reassignment_probe');
    await expectRejected(
      () => client.query('update public.market_price_snapshots set user_id = $2::uuid where id = $1', [writtenSnapshotId, otherUserId]),
      /row-level security|permission denied/i,
    );
    await client.query('rollback to savepoint owner_reassignment_probe');

    await execute(client, 'set local role service_role');
    const retained = await queryOne(client, 'select raw_payload from public.price_observations where id = $1', [observationId]);
    assert.equal(retained.raw_payload.listing.sourceItemId, 'private-evidence');
    const shared = await queryOne(client, 'select id from public.market_price_snapshots where id = $1', [sharedSnapshotId]);
    assert.equal(shared.id, sharedSnapshotId, 'service role retains shared snapshot processing access');
  } finally {
    await execute(client, 'rollback');
  }
}

async function runRehearsal(client, options = {}) {
  const root = options.root ?? process.cwd();
  const expectedDatabase = options.expectedDatabase ?? REHEARSAL_DATABASE;
  if (options.fixture) await applyFixture(client, root);
  await preflightBaseline(client, expectedDatabase);
  const files = await migrationFiles(root);
  await applyMigrations(client, files);
  for (const [name, check] of [
    ['provider boundary', assertProviderDisabledAndPrivate],
    ['queue uniqueness', assertQueueUniqueness],
    ['false last sold', assertFalseLastSoldIsRejected],
    ['manual evidence publication', assertApprovedManualEvidenceCanPublish],
    ['PokeTrace synthetic ingest', assertApprovedPokeTraceEvidenceIngests],
    ['personal pricing privacy', assertPersonalPricingPrivacy],
  ]) {
    try {
      await check(client);
    } catch (error) {
      error.message = `${name}: ${error.message}`;
      throw error;
    }
  }
  return { migrations: files.map((file) => path.basename(file)) };
}

async function main() {
  const args = process.argv.slice(2);
  const dbUrl = readDbUrl(args);
  const root = process.cwd();
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const rehearsal = await runRehearsal(client, { root, fixture: args.includes('--fixture') });
    console.log(JSON.stringify({
      status: 'passed',
      database: REHEARSAL_DATABASE,
      migrations: rehearsal.migrations,
      note: 'No provider request was made; this rehearsal only applied local SQL and rolled back its probe rows.',
    }));
  } finally {
    await client.end();
  }
}

export {
  REHEARSAL_DATABASE,
  applyFixture,
  applyMigrations,
  assertApprovedManualEvidenceCanPublish,
  assertApprovedPokeTraceEvidenceIngests,
  assertPersonalPricingPrivacy,
  migrationFiles,
  preflightBaseline,
  readDbUrl,
  runRehearsal,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
