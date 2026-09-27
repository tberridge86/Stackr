import test from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveServerKey } from './credentials.mjs';
import { validateEvidence, assertConfig, withCatalogueReaders, bind, assertPrivateAsset, publicPayload, assertExistingAsset, STAGING, PRODUCTION, APPROVAL_PATH } from './publish.mjs';
const cohort = readFileSync(new URL('./cohort.json', import.meta.url));
const approval = readFileSync(new URL('../../' + APPROVAL_PATH, import.meta.url));
const rows = validateEvidence(cohort, approval);
const modernKey = 'sb_secret_test_fixture';
test('modern configured server key needs no management request', async () => {
  assert.equal(await resolveServerKey({ project: STAGING, configuredKey: modernKey, fetchImpl: () => assert.fail('unexpected request') }), modernKey);
});
test('legacy credential is replaced only by an existing modern server key from the exact project', async () => {
  let masked;
  const actual = await resolveServerKey({ project: STAGING, configuredKey: 'legacy-test-fixture', accessToken: 'test-management-token', mask: key => { masked = key; }, fetchImpl: async (url, options) => {
    assert.equal(url, `https://api.supabase.com/v1/projects/${STAGING}/api-keys?reveal=true`);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer test-management-token');
    return { ok: true, json: async () => [{ type: 'legacy', api_key: 'old' }, { type: 'publishable', api_key: 'sb_publishable_fixture' }, { name: 'default', type: 'secret', api_key: modernKey + 'other' }, { name: 'stackr_catalogue_operator', type: 'secret', api_key: modernKey }] };
  } });
  assert.equal(actual, modernKey); assert.equal(masked, modernKey);
});
test('key lookup rejects unrelated projects and missing management credentials before requesting', async () => {
  const fetchImpl = () => assert.fail('unexpected request');
  await assert.rejects(resolveServerKey({ project: 'other', configuredKey: modernKey, fetchImpl }));
  await assert.rejects(resolveServerKey({ project: PRODUCTION, configuredKey: 'legacy', fetchImpl }));
});
test('production selects its existing default server key among multiple keys', async () => {
  const keys = [{ name: 'railway_backend_2026_08_rotation', type: 'secret', api_key: modernKey + 'other' }, { name: 'default', type: 'secret', api_key: modernKey }];
  assert.equal(await resolveServerKey({ project: PRODUCTION, accessToken: 'fixture', fetchImpl: async () => ({ ok: true, json: async () => keys }) }), modernKey);
});
test('key lookup rejects missing, ambiguous, malformed and restricted-role named server keys', async () => {
  const name = 'stackr_catalogue_operator';
  for (const keys of [[], {}, [{ name: 'wrong', type: 'secret', api_key: modernKey }], [{ name, type: 'legacy', api_key: modernKey }], [{ name, type: 'secret', api_key: 'masked' }], [{ name, type: 'secret', api_key: modernKey, secret_jwt_template: { role: 'anon' } }], [{ name, type: 'secret', api_key: modernKey }, { name, type: 'secret', api_key: modernKey + '2' }]]) {
    await assert.rejects(resolveServerKey({ project: STAGING, accessToken: 'fixture', fetchImpl: async () => ({ ok: true, json: async () => keys }) }));
  }
});
test('key lookup errors never expose credentials or remote response contents', async () => {
  for (const fetchImpl of [async () => { throw new Error('sensitive detail'); }, async () => ({ ok: false, status: 403, json: () => assert.fail('must not read error body') }), async () => ({ ok: true, json: () => { throw new Error('sensitive detail'); } })]) {
    await assert.rejects(resolveServerKey({ project: PRODUCTION, accessToken: 'fixture', fetchImpl }), error => !error.message.includes('sensitive'));
  }
});
const env = { GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_QUEUE1_CONFIRMATION: 'PUBLISH QUEUE1', SUPABASE_STAGING_URL: 'https://' + STAGING + '.supabase.co', SUPABASE_PRODUCTION_URL: 'https://' + PRODUCTION + '.supabase.co', SUPABASE_DB_URL: 'postgresql://postgres.' + PRODUCTION + ':test@aws-0-eu-west-2.pooler.supabase.com:5432/postgres' };
env.SUPABASE_STAGING_DB_URL = 'postgresql://postgres.' + STAGING + ':test@aws-0-eu-west-2.pooler.supabase.com:5432/postgres';
test('reject swapped or missing private staging database connection', () => {
  assert.throws(() => assertConfig({ ...env, SUPABASE_STAGING_DB_URL: env.SUPABASE_DB_URL }, true));
  assert.throws(() => assertConfig({ ...env, SUPABASE_STAGING_DB_URL: undefined }, true));
});
test('metadata connections are read-only and close after successful or failed preflight', async () => {
  for (const fail of [false, true]) {
    const clients = [];
    const createClient = (url, name, options) => {
      const db = { url, name, options, commands: [], connect: async () => {}, query: async sql => { db.commands.push(sql); }, end: async () => { db.closed = true; } };
      clients.push(db); return db;
    };
    const pending = withCatalogueReaders(createClient, env, async ({ sourceDb, targetDb }) => {
      assert.equal(sourceDb.url, env.SUPABASE_STAGING_DB_URL); assert.equal(targetDb.url, env.SUPABASE_DB_URL);
      for (const db of [sourceDb, targetDb]) assert.equal(db.commands[0], 'begin read only');
      if (fail) throw new Error('fixture failure');
      return 348;
    });
    if (fail) await assert.rejects(pending, /fixture failure/); else assert.equal(await pending, 348);
    assert.ok(clients.every(db => db.closed && db.commands.at(-1) === 'rollback'));
  }
});
const cards = rows.map(r => ({ game_code: 'pokemon', language_code: 'en', set_code: r.set_code, collector_number: r.collector_number, card_english_display_name: r.card_name, variant_code: r.variant_code, finish_code: r.finish_code, set_id: r.staging_set_id, printing_id: r.staging_printing_id, variant_id: r.staging_variant_id, same_artwork_as_variant_id: null, catalogue_version_id: 'version' }));
const makePrivate = r => ({ id: r.staging_asset_id, set_id: r.staging_set_id, printing_id: r.staging_printing_id, variant_id: null, source_id: 'source', content_sha256: r.image_sha256, storage_bucket: 'stackr-catalogue-review', storage_provider: 'supabase_storage', storage_key: r.objects[0].key, publicly_servable: false, permission_status: 'under_review', rights_status: 'under_review', retention_status: 'active', derivative_list: r.objects.slice(1).map(o => ({ role: o.role, storageBucket: 'stackr-catalogue-review', storageKey: o.key, sha256: o.sha256, width: o.width, height: o.height })) });
test('frozen approval binds exactly 348 unique images and 1392 objects', () => { assert.equal(rows.length, 348); assert.equal(rows.flatMap(r => r.objects).length, 1392); });
test('altered approval and cohort bytes fail closed', () => { assert.throws(() => validateEvidence(Buffer.concat([cohort, Buffer.from(' ')]), approval)); assert.throws(() => validateEvidence(cohort, Buffer.concat([approval, Buffer.from(' ')]))); });
test('accept exact protected production context', () => assert.doesNotThrow(() => assertConfig(env, true)));
for (const [field, value] of Object.entries({ GITHUB_REF: 'refs/heads/feature', STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40), STACKR_QUEUE1_CONFIRMATION: 'STAGE QUEUE1', SUPABASE_PRODUCTION_URL: 'https://' + STAGING + '.supabase.co', SUPABASE_STAGING_URL: 'https://' + PRODUCTION + '.supabase.co', SUPABASE_DB_URL: 'postgresql://postgres.' + STAGING + ':test@aws-0-eu-west-2.pooler.supabase.com:5432/postgres' })) {
  test('reject wrong environment: ' + field, () => assert.throws(() => assertConfig({ ...env, [field]: value }, true)));
}
test('reject implicit execution and connection overrides', () => { assert.throws(() => assertConfig(env, false)); assert.throws(() => assertConfig({ ...env, SUPABASE_DB_URL: env.SUPABASE_DB_URL + '?host=evil.test' }, true)); });
test('bind all canonical identities without dropping collector prefixes', () => { assert.equal(bind(rows, cards, true).length, 348); assert.ok(rows.some(r => r.collector_number === 'SV001')); assert.ok(rows.some(r => r.collector_number === 'GG01')); });
for (const [field, value] of Object.entries({ language_code: 'ja', finish_code: 'reverse_holo', card_english_display_name: 'Wrong card', same_artwork_as_variant_id: 'another-variant', printing_id: 'another-printing' })) {
  test('reject identity drift: ' + field, () => { const changed = structuredClone(cards); changed[0][field] = value; assert.throws(() => bind(rows, changed, true)); });
}
test('reject missing and duplicate matching card bindings', () => { assert.throws(() => bind(rows, cards.slice(1))); assert.throws(() => bind(rows, [...cards, cards[0]])); });
test('private receipts bind to the actual asset and all derivatives', () => { for (const r of rows) assertPrivateAsset(makePrivate(r), r, 'source'); });
for (const [field, value] of Object.entries({ source_id: 'other', printing_id: 'other', storage_bucket: 'stackr-catalogue-public', content_sha256: 'f'.repeat(64), publicly_servable: true, rights_status: 'denied', deleted_at: '2026-09-27' })) {
  test('reject staging drift: ' + field, () => assert.throws(() => assertPrivateAsset({ ...makePrivate(rows[0]), [field]: value }, rows[0], 'source')));
}
test('reject missing or remapped derivative', () => { const a = makePrivate(rows[0]); a.derivative_list[0].storageKey = 'wrong'; assert.throws(() => assertPrivateAsset(a, rows[0], 'source')); });
test('publication uses independently bound production IDs and printing-front scope', () => {
  const r = { ...rows[0], target: { set_id: 'production-set', printing_id: 'production-printing' } };
  assert.throws(() => publicPayload(r, 'production-source', r.objects));
  const payload = publicPayload(r, 'production-source', r.objects.map(o => ({ ...o, key: o.key.replace('private-review/', 'public/') })));
  assert.equal(payload.printing_id, 'production-printing'); assert.equal(payload.variant_id, null); assert.equal(payload.source_id, 'production-source');
  assert.equal(payload.recognition_reference_eligible, false); assert.equal(JSON.parse(payload.licensing_review_notes).exact_finish_verified, false);
  assert.equal(payload.derivative_list.length, 3); assert.doesNotThrow(() => assertExistingAsset(payload, payload));
  assert.throws(() => assertExistingAsset({ ...payload, printing_id: 'wrong' }, payload));
});
test('workflow keeps Queue 1 inside production protection and out of broad promotion', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');
  const job = workflow.split('  queue1_artwork:')[1].split('\n  deploy:')[0];
  assert.match(job, /environment: production/); assert.match(job, /test "\$EXPECTED_SHA" = "\$GITHUB_SHA"/); assert.match(workflow, /group: stackr-production-deployment/);
  assert.match(workflow, /inputs\.release_scope != 'backend_only' && inputs\.release_scope != 'queue1_artwork'/);
  assert.doesNotMatch(job, /rehearse-staging-catalogue-transfer|promote-catalogue-storage|continue-on-error/);
});
