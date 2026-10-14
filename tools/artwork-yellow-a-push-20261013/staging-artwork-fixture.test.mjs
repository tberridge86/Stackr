import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digest } from '../queue1-publish-20260927/publish.mjs';
import { FIXTURE, FIXTURE_SHA, FIXTURE_UPDATE, normalizedAsset, assertFixtureScope, assertFixtureBefore, assertFixtureDelta, createMetadataGuard } from './staging-artwork-fixture.mjs';

const plan = JSON.parse(await readFile(new URL('./plan.json', import.meta.url)));
const clone = value => structuredClone(value);
function synthetic() {
  const fixture = clone(FIXTURE);
  const snapshot = fixture.assets.map(pin => {
    const payload = { ...pin.expected, created_at: '2026-10-10T18:20:38.240556+00:00', updated_at: '2026-10-10T18:20:38.240556+00:00', derivative_list: [], test_note: 'synthetic unit-test record' };
    pin.normalized_full_row_sha256 = digest(Buffer.from(JSON.stringify(normalizedAsset(payload))));
    return { scope: 'assets', identity: payload.id, payload };
  });
  snapshot.push({ scope: 'names', identity: 'unchanged-name', payload: { value: 'Preserve me' } });
  return { fixture, snapshot };
}
const toggled = snapshot => snapshot.map(row => row.scope === 'assets'
  ? { ...clone(row), payload: { ...clone(row.payload), publicly_servable: false, updated_at: '2026-10-14T06:20:00.000Z' } }
  : clone(row));

test('staging fixture bytes and exact two-card scope are frozen', async () => {
  assert.equal(digest(await readFile(new URL('./staging-existing-artwork-fixture.json', import.meta.url))), FIXTURE_SHA);
  assertFixtureScope(plan.rows);
  assert.throws(() => assertFixtureScope(plan.rows.slice(1)), /two-card/);
  const changed = clone(plan.rows); changed[0].variant_ids[0] = '00000000-0000-4000-8000-000000000000';
  assert.throws(() => assertFixtureScope(changed), /variant/);
});

test('fixture fingerprints normalise retained JSONB and driver dates and bigints', () => {
  const { fixture, snapshot } = synthetic();
  assertFixtureBefore(snapshot, plan.rows, fixture);
  const driver = clone(snapshot);
  for (const row of driver.filter(r => r.scope === 'assets')) {
    row.payload.created_at = new Date(row.payload.created_at);
    row.payload.updated_at = new Date(row.payload.updated_at);
    row.payload.byte_size = String(row.payload.byte_size);
  }
  assertFixtureBefore(driver, plan.rows, fixture);
});

for (const [field, badValue] of [
  ['id', '00000000-0000-4000-8000-000000000001'],
  ['variant_id', '00000000-0000-4000-8000-000000000002'],
  ['content_sha256', '0'.repeat(64)],
  ['width', 321],
  ['publicly_servable', false],
  ['original_source_identifier', 'unexpected source'],
]) test(`fixture rejects existing staging ${field} drift`, () => {
  const { fixture, snapshot } = synthetic(); snapshot[0].payload[field] = badValue;
  assert.throws(() => assertFixtureBefore(snapshot, plan.rows, fixture), /Pinned|changed|missing/);
});

test('fixture rejects a missing, third or duplicate scoped picture', () => {
  const { fixture, snapshot } = synthetic();
  assert.throws(() => assertFixtureBefore(snapshot.slice(1), plan.rows, fixture), /count/);
  const third = clone(snapshot[0]); third.identity = third.payload.id = '00000000-0000-4000-8000-000000000003';
  assert.throws(() => assertFixtureBefore([...snapshot, third], plan.rows, fixture), /count/);
  assert.throws(() => assertFixtureBefore([...snapshot, clone(snapshot[0])], plan.rows, fixture), /Duplicate/);
});

test('fixture permits only the two visibility flags and their update timestamps', () => {
  const { fixture, snapshot } = synthetic();
  const changes = assertFixtureDelta(snapshot, toggled(snapshot), fixture);
  assert.equal(changes.length, 2);
  assert.deepEqual(changes.map(r => r.changed_fields), [['publicly_servable', 'updated_at'], ['publicly_servable', 'updated_at']]);
  const sameTimestamp = toggled(snapshot);
  for (let i = 0; i < 2; i++) sameTimestamp[i].payload.updated_at = snapshot[i].payload.updated_at;
  assert.deepEqual(assertFixtureDelta(snapshot, sameTimestamp, fixture).map(r => r.changed_fields), [['publicly_servable'], ['publicly_servable']]);
});

test('fixture rejects another artwork field, unrelated metadata or a new row', () => {
  const { fixture, snapshot } = synthetic();
  const anotherField = toggled(snapshot); anotherField[0].payload.permission_status = 'under_review';
  assert.throws(() => assertFixtureDelta(snapshot, anotherField, fixture), /another existing artwork field/);
  const changedName = toggled(snapshot); changedName[2].payload.value = 'Changed';
  assert.throws(() => assertFixtureDelta(snapshot, changedName, fixture), /unrelated scoped row/);
  assert.throws(() => assertFixtureDelta(snapshot, [...toggled(snapshot), { scope: 'links', identity: 'extra', payload: {} }], fixture), /identities/);
});

test('fixture rejects an unhidden asset or invalid trigger timestamp', () => {
  const { fixture, snapshot } = synthetic();
  const notHidden = toggled(snapshot); notHidden[0].payload.publicly_servable = true;
  assert.throws(() => assertFixtureDelta(snapshot, notHidden, fixture), /did not apply/);
  const badTime = toggled(snapshot); badTime[0].payload.updated_at = 'invalid';
  assert.throws(() => assertFixtureDelta(snapshot, badTime, fixture), /timestamp/);
});

test('fixture SQL is a two-pin parameterised visibility update without deletes or links', () => {
  assert.match(FIXTURE_UPDATE, /publicly_servable=false/u);
  for (const field of ['id', 'printing_id', 'variant_id', 'asset_id', 'content_sha256', 'sha256', 'set_id', 'storage_key', 'width', 'height']) assert.match(FIXTURE_UPDATE, new RegExp(`a\\.${field}=e\\.${field}`, 'u'));
  assert.match(FIXTURE_UPDATE, /jsonb_to_recordset\(\$1::jsonb\)/u);
  assert.doesNotMatch(FIXTURE_UPDATE, /\bdelete\b|\btruncate\b|catalogue_version_assets|permission_status\s*=/iu);
});

function productionDb() {
  const cards = clone(plan.binding_expectations.production);
  const tables = {
    'catalog.card_printings': cards.map(c => ({ id: c.printing_id, native_name: c.card_native_name })),
    'catalog.card_variants': cards.map(c => ({ id: c.variant_id, printing_id: c.printing_id })),
    'catalog.card_names': cards.flatMap((c, i) => [{ id: `name-${i}-native`, printing_id: c.printing_id }, { id: `name-${i}-en`, printing_id: c.printing_id }]),
    'catalog.sets': [{ id: cards[0].set_id }],
    'catalog.assets': [], 'catalog.catalogue_version_assets': [],
    'ingest.sources': plan.source_policies.production.map((s, i) => ({ ...s, id: `source-${i}` })),
  };
  const calls = [];
  return { calls, query: async sql => {
    calls.push(sql);
    assert.doesNotMatch(sql, /^\s*(?:update|insert|delete|alter)/iu);
    if (sql.includes('from api.catalogue_cards')) return { rows: clone(cards) };
    for (const [table, values] of Object.entries(tables)) if (sql.includes(`from ${table} `)) return { rows: clone(values) };
    throw new Error(`Unexpected production fixture query: ${sql}`);
  } };
}

test('production uses the unchanged metadata guard and never applies a fixture update', async () => {
  const db = productionDb(); const guard = createMetadataGuard(plan);
  const before = await guard.before(db, plan.rows, 'production');
  assert.equal(before.stagingFixture, undefined);
  const result = await guard.after(db, plan.rows, 'production', before, { assets: [], links: [], metadata_changes: 0 });
  assert.equal(result.status, 'all_existing_scoped_rows_preserved');
  assert.equal(result.staging_existing_artwork_fixture, undefined);
  assert.equal(db.calls.some(sql => /^\s*update/iu.test(sql)), false);
});

test('production rejects a fixture state and unknown environments before writes', async () => {
  const db = productionDb(); const guard = createMetadataGuard(plan);
  await assert.rejects(guard.after(db, plan.rows, 'production', { stagingFixture: {} }, {}), /cannot apply to production/);
  await assert.rejects(guard.before(db, plan.rows, 'other'), /Unexpected fixture environment/);
  assert.equal(db.calls.length, 0);
});
