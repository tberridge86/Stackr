import test from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEvidence, assertConfig, bind, assertPrivateAsset, publicPayload, assertExistingAsset, STAGING, PRODUCTION, APPROVAL_PATH } from './publish.mjs';
const cohort = readFileSync(new URL('./cohort.json', import.meta.url));
const approval = readFileSync(new URL('../../' + APPROVAL_PATH, import.meta.url));
const rows = validateEvidence(cohort, approval);
const env = { GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_QUEUE1_CONFIRMATION: 'PUBLISH QUEUE1', SUPABASE_STAGING_URL: 'https://' + STAGING + '.supabase.co', SUPABASE_PRODUCTION_URL: 'https://' + PRODUCTION + '.supabase.co', SUPABASE_DB_URL: 'postgresql://postgres.' + PRODUCTION + ':test@aws-0-eu-west-2.pooler.supabase.com:5432/postgres' };
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
