import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20260920130134_optimise_published_price_catalogue_revision.sql', import.meta.url), 'utf8');

async function database({ languageDrift = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create schema api;
    create schema catalog;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table catalog.languages(code text primary key);
    create table catalog.catalogue_versions(id uuid primary key, language_code text, status text not null, deprecated_at timestamptz);
    create unique index catalogue_versions_one_published_per_language_uidx
      on catalog.catalogue_versions(language_code)
      where status = 'published' and deprecated_at is null and language_code is not null;
    create table catalog.catalogue_version_variants(catalogue_version_id uuid not null, variant_id uuid not null, primary key(catalogue_version_id, variant_id));
    create table catalog.card_variants(id uuid primary key, printing_id uuid not null, language_code text not null, deprecated_at timestamptz);
    create table catalog.card_printings(id uuid primary key, set_id uuid not null, deprecated_at timestamptz);
    create table catalog.sets(id uuid primary key, deprecated_at timestamptz);
    insert into catalog.languages values ('en'), ('ja'), ('ko'), ('zh-tw');
    insert into catalog.catalogue_versions values
      ('00000000-0000-4000-8000-000000000001', 'en', 'published', null),
      ('00000000-0000-4000-8000-000000000002', 'ja', 'published', null),
      ('00000000-0000-4000-8000-000000000003', 'ko', 'published', now()),
      ('00000000-0000-4000-8000-000000000004', 'zh-tw', 'published', null);
    insert into catalog.sets values
      ('10000000-0000-4000-8000-000000000001', null),
      ('10000000-0000-4000-8000-000000000002', null);
    insert into catalog.card_printings values
      ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null),
      ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', null);
    insert into catalog.card_variants values
      ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '${languageDrift ? 'ja' : 'en'}', null),
      ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'zh-tw', now());
    insert into catalog.catalogue_version_variants values
      ('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000002');
    create view api.catalogue_cards with (security_invoker = true) as
      select v.language_code, cv.id as catalogue_version_id
      from catalog.catalogue_version_variants cvv
      join catalog.catalogue_versions cv on cv.id = cvv.catalogue_version_id
      join catalog.card_variants v on v.id = cvv.variant_id
      join catalog.card_printings cp on cp.id = v.printing_id
      join catalog.sets s on s.id = cp.set_id
      join catalog.languages l on l.code = v.language_code
      where cv.status = 'published'
        and cv.deprecated_at is null
        and v.deprecated_at is null
        and cp.deprecated_at is null
        and s.deprecated_at is null;
    create function api.published_price_catalogue_revision() returns jsonb
      language sql stable security invoker set search_path = '' as $$
        select coalesce(jsonb_object_agg(language_code, catalogue_version_id), '{}'::jsonb)
        from (select distinct language_code, catalogue_version_id from api.catalogue_cards) revisions;
      $$;
    revoke all on function api.published_price_catalogue_revision() from public, anon, authenticated;
    grant execute on function api.published_price_catalogue_revision() to service_role;
  `);
  return db;
}

const good = await database();
const before = (await good.query('select api.published_price_catalogue_revision() as revision')).rows[0].revision;
assert.deepEqual(before, { en: '00000000-0000-4000-8000-000000000001' }, 'old projection excludes empty, deprecated and invisible memberships');
await good.exec(migration);
const after = (await good.query('select api.published_price_catalogue_revision() as revision')).rows[0].revision;
assert.deepEqual(after, before, 'metadata revision is exactly equal to the old visible-card revision');
assert.equal((await good.query("select has_function_privilege('anon', 'api.published_price_catalogue_revision()', 'EXECUTE') as allowed")).rows[0].allowed, false);
assert.equal((await good.query("select has_function_privilege('authenticated', 'api.published_price_catalogue_revision()', 'EXECUTE') as allowed")).rows[0].allowed, false);
assert.equal((await good.query("select has_function_privilege('service_role', 'api.published_price_catalogue_revision()', 'EXECUTE') as allowed")).rows[0].allowed, true);
await good.close();

const rehearsal = await database();
const rehearsalBefore = (await rehearsal.query('select api.published_price_catalogue_revision() as revision')).rows[0].revision;
await rehearsal.exec('begin');
await rehearsal.exec(migration);
await rehearsal.exec('rollback');
assert.deepEqual((await rehearsal.query('select api.published_price_catalogue_revision() as revision')).rows[0].revision, rehearsalBefore,
  'transaction rollback leaves the existing revision function intact');
await rehearsal.close();

const drift = await database({ languageDrift: true });
await assert.rejects(drift.exec(migration), /published_price_catalogue_revision_preflight_(language_drift|mismatch)/, 'migration rejects a language-membership mismatch instead of changing revision semantics');
await drift.close();

console.log('Published price catalogue revision: bounded metadata equivalence, visibility, permissions and drift preflight passed.');
