import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSearchDatabase, languages } from './test-fixtures/search-pagination-db.mjs';

const fixture = await createSearchDatabase();
const { db } = fixture;
const metadata = async () => (await db.query(`select prosrc, proacl::text as acl, prosecdef,
  provolatile, proowner, proconfig from pg_proc
  where oid='api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb)'::regprocedure`)).rows[0];
const withoutRevision = ({ revision, ...page }) => page;
const key = entry => entry ? { entityType: entry.entityType, entityId: entry.entityId } : null;
try {
  const seeded = await fixture.seed({ count: 137, multilingual: true, finishes: 2 });
  const selectors = languages.map(language => ({ kind: 'name', normalized: 'fixturemon',
    nameTypes: ['native', 'alias'], language, setIds: [] }));
  selectors.push({ kind: 'fuzzyName', patterns: ['%fixture%'], language: 'ja', setIds: [] },
    { kind: 'external', reference: 'fixture:1:normal', setIds: [] },
    { kind: 'canonical', reference: seeded.variants[0].canonical_key, setIds: [] },
    { kind: 'collector', collectorNumber: String(Number(seeded.printings[0].collector_number)), setIds: [seeded.printings[0].set_id] },
    { kind: 'nativeTranslation', nativeNames: [{ language: 'ja', nativeName: 'Fixturemon' }], language: 'ja', setIds: [] });
  const before = await metadata();
  const baseline = [];
  for (const selector of selectors) {
    const first = await fixture.page(selector, null, 10);
    const second = first.hasMore ? await fixture.page(selector, key(first.entries.at(-1)), 10, first.revision) : null;
    baseline.push({ first, second });
  }
  assert.ok(baseline.every(page => page.first.entries.length > 0), 'Each selector fixture exercises actual catalogue identities: '
    + JSON.stringify(selectors.map((selector, index) => ({ kind: selector.kind, language: selector.language, entries: baseline[index].first.entries.length }))));
  assert.ok(baseline.slice(0, 5).every(page => page.second?.entries.length > 0), 'Every published language exercises continuation');

  await db.exec('reset role');
  await db.exec(readFileSync('supabase/migrations/20261102160729_catalogue_search_custom_plans.sql', 'utf8'));
  const after = await metadata();
  const { proconfig: oldConfig, ...oldContract } = before;
  const { proconfig: newConfig, ...newContract } = after;
  assert.deepEqual(newContract, oldContract, 'The function body, owner, invoker security, volatility and grants are preserved');
  assert.deepEqual([...newConfig].sort(), [...oldConfig, 'plan_cache_mode=force_custom_plan'].sort());
  assert.equal((await db.query("select current_setting('plan_cache_mode') mode")).rows[0].mode, 'auto', 'The migration does not change the session/database default');
  await db.exec("set role service_role; set plan_cache_mode='force_generic_plan'");
  for (const [index, selector] of selectors.entries()) {
    const first = await fixture.page(selector, null, 10);
    assert.deepEqual(withoutRevision(first), withoutRevision(baseline[index].first));
    assert.notEqual(first.revision, baseline[index].first.revision, 'A changed function definition invalidates the old cursor revision');
    if (baseline[index].second) {
      const second = await fixture.page(selector, key(first.entries.at(-1)), 10, first.revision);
      assert.deepEqual(withoutRevision(second), withoutRevision(baseline[index].second));
    }
  }
  assert.equal((await db.query("select current_setting('plan_cache_mode') mode")).rows[0].mode, 'force_generic_plan', 'The function restores the caller planning setting');
  await db.exec('reset role');
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role);
    await assert.rejects(fixture.page(selectors[0]), /permission denied/);
    await db.exec('reset role');
  }
  console.log('PASS Search planning migration: unchanged SQL/grants, 10 selectors, five languages and continuation pages, revision invalidation and caller-setting restoration');
} finally {
  await db.close();
}
