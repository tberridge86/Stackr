import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

export const schema = JSON.parse(readFileSync(new URL('./search-pagination-schema.json', import.meta.url), 'utf8'));
export const proposal = readFileSync(new URL('../../docs/releases/evidence/search-pagination-20261026/search-identity-page-proposal.sql', import.meta.url), 'utf8');
export const identityQuery = proposal.split('as $search$')[1].split('$search$;')[0].trim();
export const id = n => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
export const languages = ['en', 'ja', 'zh-cn', 'zh-tw', 'ko'];
const stamp = '2026-10-26T00:00:00Z';
const collectorIndexFunction = readFileSync(new URL('../../supabase/migrations/20260909133445_indexed_tolerant_collector_search.sql', import.meta.url), 'utf8').split('create index')[0];
function defaultValue(type) {
  if (type.endsWith('[]')) return [];
  if (type === 'uuid') return id(999999);
  if (/json/.test(type)) return {};
  if (type === 'boolean') return false;
  if (/timestamp|date/.test(type)) return stamp;
  if (/int|numeric|real|double/.test(type)) return 0;
  return '';
}
export async function createSearchDatabase(database) {
  const db = database ?? new PGlite({ extensions: { pg_trgm } });
  await db.exec("create extension if not exists pg_trgm; create schema catalog; create schema api; do $roles$ begin create role anon; exception when duplicate_object then null; end $roles$; do $roles$ begin create role authenticated; exception when duplicate_object then null; end $roles$; do $roles$ begin create role service_role bypassrls; exception when duplicate_object then null; end $roles$; grant usage on schema catalog,api to service_role,anon,authenticated; set timezone='UTC';");
  const role = (await db.query("select rolbypassrls from pg_roles where rolname='service_role'")).rows[0];
  if (role?.rolbypassrls !== true) throw new Error('fixture_service_role_must_bypass_rls');
  for (const table of [...new Set(schema.columns.map(c => c.table))]) {
    const columns = schema.columns.filter(c => c.table === table);
    await db.exec('create table catalog.' + table + ' (' + columns.map(c => '"' + c.column + '" ' + c.type + (c.notNull ? ' not null' : '')).join(',') + ');');
    await db.exec('alter table catalog.' + table + ' enable row level security; grant select on catalog.' + table + ' to service_role;');
  }
  await db.exec(schema.collectorFunction);
  await db.exec(collectorIndexFunction);
  for (const index of schema.indexes) await db.exec(index.definition);
  for (const view of schema.views) {
    await db.exec('create view api.' + view.name + ' with (security_invoker=true) as ' + view.definition);
    await db.exec('grant select on api.' + view.name + ' to service_role;');
  }
  await db.exec(proposal);
  async function insert(table, rows) {
    if (!rows.length) return;
    const columns = schema.columns.filter(c => c.table === table);
    const names = columns.map(c => '"' + c.column + '"').join(',');
    const complete = rows.map(row => Object.fromEntries(columns.map(c => [c.column,
      row[c.column] ?? (c.notNull ? defaultValue(c.type) : null)])));
    await db.query('insert into catalog.' + table + '(' + names + ') select ' + names
      + ' from jsonb_to_recordset($1::jsonb) t(' + columns.map(c => '"' + c.column + '" ' + c.type).join(',') + ')', [JSON.stringify(complete)]);
  }
  async function seed({ count = 137, multilingual = false, finishes = 1, aliases = 2, nativeName = 'Fixturemon', englishName = 'Fixturemon', translationOnly = false, unrelatedCount = 0 } = {}) {
    await db.exec('reset role; truncate ' + [...new Set(schema.columns.map(c => 'catalog.' + c.table))].join(',') + ';');
    await insert('languages', languages.map((code, i) => ({ code, bcp47_code: code, english_name: code, native_name: code, sort_order: i })));
    await insert('variant_taxonomy', ['normal', 'reverse_holo'].map((code, i) => ({ id: id(10 + i), code, english_label: code })));
    await insert('finishes', ['normal', 'reverse_holo'].map((code, i) => ({ id: id(10 + i), code, english_label: code })));
    await insert('sets', languages.map((language, i) => ({ id: id(100 + i), game_code: 'pokemon', language_code: language,
      set_code: 'fixture1', native_name: 'Fixture ' + language, printed_total: count, total: count, updated_at: stamp })));
    await insert('catalogue_versions', languages.map((language, i) => ({ id: id(200 + i), language_code: language,
      version_key: 'fixture-' + language, version_label: 'Synthetic fixture', status: 'published', published_at: stamp,
      updated_at: stamp, min_change_sequence: 0, max_change_sequence: 0 })));
    await insert('catalogue_version_sets', languages.map((language, i) => ({ catalogue_version_id: id(200 + i), language_code: language, set_id: id(100 + i), set_code: 'fixture1' })));
    const printings = [], variants = [], names = [], members = [], printingMembers = [], externals = [];
    for (let i = 0; i < count + unrelatedCount; i++) {
      const langIndex = multilingual ? i % languages.length : 0;
      const language = languages[langIndex], printing = id(1000 + i);
      const native = i >= count ? 'Unrelatedmon' : translationOnly && language !== 'en' ? nativeName : englishName;
      printings.push({ id: printing, game_code: 'pokemon', language_code: language, set_id: id(100 + langIndex),
        collector_number: String(Math.floor(i / (multilingual ? languages.length : 1)) + 1).padStart(3, '0'),
        native_name: native, english_display_name: language === 'en' ? englishName : null, updated_at: stamp,
        supertype: 'Pokémon', subtypes: [], artist: 'Synthetic fixture' });
      printingMembers.push({ catalogue_version_id: id(200 + langIndex), printing_id: printing, language_code: language, set_id: id(100 + langIndex) });
      for (let finish = 0; finish < finishes; finish++) {
        const variant = id(100000 + i * 2 + finish), code = finish ? 'reverse_holo' : 'normal';
        variants.push({ id: variant, printing_id: printing, set_id: id(100 + langIndex), collector_number: printings.at(-1).collector_number, game_code: 'pokemon', language_code: language,
          variant_code: code, finish_code: code, canonical_key: 'pokemon:' + language + ':fixture1:' + i + ':' + code, updated_at: stamp });
        members.push({ catalogue_version_id: id(200 + langIndex), variant_id: variant, language_code: language, printing_id: printing, set_id: id(100 + langIndex) });
        externals.push({ catalogue_version_id: id(200 + langIndex), source_entity_type: 'card_variant', external_id: 'fixture:' + i + ':' + code,
          language_code: language, printing_id: printing, variant_id: variant, set_id: id(100 + langIndex), confidence: 1 });
        names.push({ id: id(500000 + i * 20 + finish), language_code: language, name_type: 'alias', name: 'Finishmon ' + code,
          normalized_name: 'finishmon ' + code.replaceAll('_', ' '), printing_id: null, variant_id: variant, source_confidence: 1, updated_at: stamp });
        for (let alias = 0; alias < aliases; alias++) names.push({ id: id(9000000 + i * 20 + finish * 5 + alias),
          language_code: language, name_type: 'alias', name: 'Finishmon ' + code, normalized_name: 'finishmon ' + code.replaceAll('_', ' '),
          printing_id: null, variant_id: variant, source_confidence: 1, updated_at: stamp });
      }
      for (let alias = 0; alias <= aliases; alias++) names.push({ id: id(500000 + i * 20 + 3 + alias),
        language_code: language, printing_id: printing, variant_id: null,
        name_type: alias ? 'alias' : 'native', name: native, normalized_name: native.toLowerCase(), source_confidence: 1, updated_at: stamp });
    }
    await insert('card_printings', printings);
    await insert('card_variants', variants);
    await insert('card_names', names);
    await insert('catalogue_version_printings', printingMembers);
    await insert('catalogue_version_variants', members);
    await insert('catalogue_version_external_identifiers', externals);
    for (const table of ['card_names', 'card_variants', 'card_printings', 'catalogue_versions', 'catalogue_version_variants', 'catalogue_version_printings', 'catalogue_version_external_identifiers']) await db.exec('analyze catalog.' + table);
    await db.exec('set role service_role');
    return { printings, variants, names, members, externals };
  }
  return { db, seed, insert,
    async page(selector, after = null, limit = 50, revision = null, exclude = null) {
      return (await db.query('select api.catalogue_search_identity_page_v1($1::jsonb,$2::jsonb,$3,$4,$5::jsonb) body',
        [JSON.stringify(selector), after ? JSON.stringify(after) : null, limit, revision, exclude ? JSON.stringify(exclude) : null])).rows[0].body;
    } };
}
