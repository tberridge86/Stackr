import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { createMetadataGuard as createBaseGuard, readSnapshot } from '../artwork-trainer-kit-push-20261013/metadata-guard.mjs';
import { snapshotHash } from '../artwork-followup-push-20261013/metadata-guard.mjs';

export const FIXTURE_SHA = 'd04e674be1d85787e3e7ca36b944e48a531c3ba4e9b660c7b46e2d2015158ab0';
const fixtureBytes = await readFile(new URL('./staging-existing-artwork-fixture.json', import.meta.url));
check(digest(fixtureBytes) === FIXTURE_SHA, 'Frozen staging fixture changed');
export const FIXTURE = JSON.parse(fixtureBytes);
const dateFields = ['created_at', 'updated_at', 'deleted_at', 'deprecated_at', 'last_verified_at', 'retention_until', 'source_updated_at'];
const ordered = value => value && typeof value === 'object'
  ? (Array.isArray(value) ? value.map(ordered) : Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])))
  : value;
const rowKey = row => `${row.scope}:${row.identity}`;

// Match the driver's timestamp/bigint representation to the retained JSONB read.
export function normalizedAsset(payload) {
  const result = JSON.parse(JSON.stringify(payload));
  for (const key of dateFields) if (result[key] != null) {
    const date = new Date(result[key]);
    check(Number.isFinite(date.getTime()), 'Invalid existing artwork timestamp');
    result[key] = date.toISOString();
  }
  if (result.byte_size != null) {
    result.byte_size = Number(result.byte_size);
    check(Number.isSafeInteger(result.byte_size) && result.byte_size > 0, 'Invalid existing artwork size');
  }
  return ordered(result);
}

export function assertFixtureScope(rows, fixture = FIXTURE) {
  check(fixture.schemaVersion === 1 && fixture.environment === 'staging' && fixture.queue_id === 'STACKR-EN-FRONTS-20261013-ALT002'
    && fixture.production_fixture_allowed === false && fixture.persistent_stage_publication === false && fixture.assets.length === 2, 'Wrong rollback-only staging fixture');
  check(rows.length === 2 && new Set(rows.map(row => row.printing_id)).size === 2, 'Wrong two-card fixture scope');
  check(new Set(fixture.assets.map(pin => pin.expected.id)).size === 2, 'Duplicate staging fixture asset');
  for (const pin of fixture.assets) {
    const expected = pin.expected;
    const row = rows.find(card => card.printing_id === expected.printing_id);
    check(row && row.set_id === expected.set_id && row.language_code === 'en' && row.set_code === 'xya'
      && row.variant_ids.length === 1 && row.variant_ids[0] === expected.variant_id, 'Staging fixture printing or variant changed');
    check(expected.asset_type === 'card_image' && expected.game_code === 'pokemon' && expected.width === 320 && expected.height === 446
      && expected.publicly_servable === true && expected.asset_visibility === 'public_catalogue'
      && expected.deleted_at === null && expected.deprecated_at === null && expected.unavailable_reason === null
      && expected.asset_id === expected.id && /^[a-f0-9]{64}$/u.test(pin.normalized_full_row_sha256), 'Unbounded existing staging artwork');
  }
}

export function assertFixtureBefore(snapshot, rows, fixture = FIXTURE) {
  assertFixtureScope(rows, fixture);
  check(new Set(snapshot.map(rowKey)).size === snapshot.length, 'Duplicate fixture snapshot identity');
  const images = snapshot.filter(row => row.scope === 'assets' && row.payload.asset_type === 'card_image');
  check(images.length === 2, 'Unexpected existing staging image count');
  for (const pin of fixture.assets) {
    const row = images.find(image => image.identity === pin.expected.id);
    check(row && row.payload.id === pin.expected.id, 'Pinned existing staging asset missing');
    const normalized = normalizedAsset(row.payload);
    for (const [key, value] of Object.entries(pin.expected)) check(isDeepStrictEqual(normalized[key], value), `Pinned staging asset changed: ${key}`);
    check(digest(Buffer.from(JSON.stringify(normalized))) === pin.normalized_full_row_sha256, 'Existing staging artwork row changed');
  }
}

export function assertFixtureDelta(before, after, fixture = FIXTURE) {
  const old = new Map(before.map(row => [rowKey(row), row]));
  const next = new Map(after.map(row => [rowKey(row), row]));
  check(old.size === before.length && next.size === after.length && old.size === next.size, 'Fixture changed scoped row identities');
  const pins = new Set(fixture.assets.map(pin => pin.expected.id));
  const changes = [];
  for (const [key, row] of old) {
    const found = next.get(key);
    check(found && found.scope === row.scope && found.identity === row.identity, 'Fixture changed scoped row identity');
    if (row.scope !== 'assets' || !pins.has(row.identity)) {
      check(isDeepStrictEqual(row, found), `Fixture changed unrelated scoped row: ${row.scope}`);
      continue;
    }
    check(row.payload.publicly_servable === true && found.payload.publicly_servable === false, 'Staging visibility fixture did not apply');
    check(found.payload.updated_at != null && Number.isFinite(new Date(found.payload.updated_at).getTime()), 'Invalid fixture update timestamp');
    const restored = { ...found.payload, publicly_servable: true, updated_at: row.payload.updated_at };
    check(isDeepStrictEqual(row.payload, restored), 'Fixture changed another existing artwork field');
    changes.push({ asset_row_id: row.identity, changed_fields: ['publicly_servable', ...(!isDeepStrictEqual(row.payload.updated_at, found.payload.updated_at) ? ['updated_at'] : [])] });
  }
  check(changes.length === 2, 'Wrong staging visibility fixture count');
  return changes;
}

export const FIXTURE_UPDATE = `update catalog.assets a set publicly_servable=false
from jsonb_to_recordset($1::jsonb) as e(id uuid,printing_id uuid,variant_id uuid,asset_id text,content_sha256 text,sha256 text,set_id uuid,storage_key text,width integer,height integer)
where a.id=e.id and a.printing_id=e.printing_id and a.variant_id=e.variant_id and a.asset_id=e.asset_id
and a.content_sha256=e.content_sha256 and a.sha256=e.sha256 and a.set_id=e.set_id and a.storage_key=e.storage_key
and a.width=e.width and a.height=e.height and a.asset_type='card_image' and a.game_code='pokemon'
and a.publicly_servable=true and a.asset_visibility='public_catalogue' and a.deleted_at is null and a.deprecated_at is null and a.unavailable_reason is null
returning a.id`;

export function createMetadataGuard(plan, { privateOutput = null } = {}) {
  check(plan.queue_id === FIXTURE.queue_id, 'Staging fixture belongs only to the frozen Yellow A cohort');
  assertFixtureScope(plan.rows);
  const base = createBaseGuard(plan, { privateOutput });
  const save = async (sequence, phase, snapshot) => {
    if (!privateOutput) return;
    await mkdir(privateOutput, { recursive: true });
    await writeFile(path.join(privateOutput, `staging-${sequence}-fixture-${phase}.json`), JSON.stringify(snapshot, null, 2));
  };
  return {
    async before(db, rows, environment) {
      check(['production', 'staging'].includes(environment), 'Unexpected fixture environment');
      const before = await base.before(db, rows, environment);
      if (environment === 'production') return before;
      const isolation = (await db.query("select current_setting('transaction_isolation') as isolation")).rows;
      check(isolation.length === 1 && isolation[0].isolation === 'serializable', 'Staging fixture requires the rollback rehearsal transaction');
      assertFixtureBefore(before.snapshot, rows);
      const updated = (await db.query(FIXTURE_UPDATE, [JSON.stringify(FIXTURE.assets.map(pin => pin.expected))])).rows;
      const expectedIds = FIXTURE.assets.map(pin => pin.expected.id).sort();
      check(updated.length === 2 && isDeepStrictEqual(updated.map(row => row.id).sort(), expectedIds), 'Exact staging visibility update failed');
      // Use a fresh database read, never a fabricated post-update baseline.
      const afterFixture = await readSnapshot(db, rows, plan.scope_counts.staging);
      const changes = assertFixtureDelta(before.snapshot, afterFixture);
      await save(before.sequence, 'before', before.snapshot);
      await save(before.sequence, 'after', afterFixture);
      return { ...before, snapshot: afterFixture, originalSnapshot: before.snapshot, stagingFixture: {
        fixture_sha256: FIXTURE_SHA, environment: 'staging', temporary_only: true, rolled_back_with_rehearsal: true,
        existing_asset_count: 2, changes, immutable_objects_changed: false, existing_links_changed: false,
        production_fixture_applied: false,
      } };
    },
    async after(db, rows, environment, before, journal) {
      check(environment === 'staging' || !before.stagingFixture, 'Staging fixture cannot apply to production');
      const result = await base.after(db, rows, environment, before, journal);
      if (!before.stagingFixture) return result;
      return { ...result, status: 'existing_scope_preserved_after_two_explicit_rollback_only_staging_visibility_fixtures',
        original_before_sha256: snapshotHash(before.originalSnapshot), staging_existing_artwork_fixture: before.stagingFixture };
    },
  };
}
