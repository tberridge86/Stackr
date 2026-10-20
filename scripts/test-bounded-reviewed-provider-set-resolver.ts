import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = readFileSync('supabase/migrations/20261004162804_bounded_reviewed_provider_set_resolver.sql', 'utf8');
const db = new PGlite();

async function resolve(category: number, group: number, language: string, name = '', abbreviation = '') {
  return (await db.query<{ value: any }>(
    'select api.resolve_catalogue_bulk_set($1,$2,$3,$4,$5) as value',
    [category, group, language, name, abbreviation],
  )).rows[0].value;
}

async function main() {
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema api; create schema catalog; create schema market;
      create table catalog.languages(code text primary key);
      create table catalog.sets(id uuid primary key, language_code text not null, set_code text, native_name text, english_display_name text, deprecated_at timestamptz);
      create table catalog.catalogue_versions(id uuid primary key, status text not null, deprecated_at timestamptz);
      create table catalog.catalogue_version_sets(catalogue_version_id uuid not null, set_id uuid not null, primary key(catalogue_version_id, set_id));
      create table market.catalogue_provider_sets(category_id integer not null, group_id bigint not null, language_code text not null, set_id uuid not null, method text not null, note text, verified_at timestamptz not null default now(), primary key(category_id, group_id));
      create table market.catalogue_provider_set_members(category_id integer not null, group_id bigint not null, set_id uuid not null, language_code text not null, method text not null, note text, verified_at timestamptz not null default now(), primary key(category_id, group_id, set_id));
      create table market.catalogue_price_repairs(repair_key text primary key, category_id integer, group_id bigint, reason text not null, detail jsonb not null default '{}'::jsonb, status text not null default 'open', last_seen_at timestamptz not null default now());
      create table market.catalogue_bulk_feeds(feed_key text primary key, payload jsonb not null);
      create table market.japanese_quarantines(group_id bigint primary key);
      create or replace view api.catalogue_sets with (security_invoker=true) as
        select s.id as set_id, s.language_code, s.set_code, s.native_name, s.english_display_name
        from catalog.catalogue_version_sets cvs
        join catalog.catalogue_versions cv on cv.id=cvs.catalogue_version_id
        join catalog.sets s on s.id=cvs.set_id
        join catalog.languages l on l.code=s.language_code
        where cv.status='published' and cv.deprecated_at is null and s.deprecated_at is null;
      create function api.catalogue_provider_name(value text) returns text
        language sql immutable strict as $$ select lower(regexp_replace(trim(value), '[[:space:][:punct:]]', '', 'g')) $$;
      create function api.quarantine_japanese_exact_code_group(p_group bigint) returns void
        language sql security invoker set search_path='' as $$ insert into market.japanese_quarantines values(p_group) on conflict do nothing $$;
      -- This is the preceding Japanese code wrapper from
      -- 20261003232812_japanese_exact_price_identities.sql. The quarantine
      -- function is a spy only; its actual destructive quote/outcome effects
      -- are outside this resolver regression fixture.
      create function api.resolve_catalogue_bulk_set_by_name(p_category integer,p_group bigint,p_language text,p_name text,p_abbreviation text) returns jsonb
        language plpgsql security invoker set search_path='' as $$ begin return jsonb_build_object('status','unmapped'); end $$;
      create function api.resolve_catalogue_bulk_set_by_code_or_name(p_category integer,p_group bigint,p_language text,p_name text,p_abbreviation text) returns jsonb
        language plpgsql security invoker set search_path='' as $wrapper$
        declare code text; ids uuid[]; provider_count integer; exact_group boolean; previous_method text; previous_set uuid;
        begin
          if p_category=85 and p_language='ja' and p_group>0 then
            select method,set_id into previous_method,previous_set from market.catalogue_provider_sets where category_id=85 and group_id=p_group;
            if previous_method is null or previous_method='exact_set_code' then
              code=lower(normalize(trim(coalesce(p_abbreviation,'')),NFKC));
              if code ~ '^[a-z0-9-]{1,32}$' then
                select count(distinct (g->>'groupId')::bigint),bool_or(g->>'groupId'=p_group::text) into provider_count,exact_group
                from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') g
                where f.feed_key='tcgplayer/85/groups' and lower(normalize(trim(coalesce(g->>'abbreviation','')),NFKC))=code;
                select array_agg(distinct s.set_id) into ids from api.catalogue_sets s where s.language_code='ja'
                  and lower(normalize(trim(s.set_code),NFKC))=code;
                if provider_count=1 and exact_group is true and coalesce(array_length(ids,1),0)=1 and (previous_set is null or previous_set=ids[1]) then
                  insert into market.catalogue_provider_sets values(85,p_group,'ja',ids[1],'exact_set_code','Unique exact provider abbreviation / published native set code',now())
                    on conflict(category_id,group_id) do update set set_id=excluded.set_id,method=excluded.method,note=excluded.note,verified_at=now()
                    where market.catalogue_provider_sets.method='exact_set_code';
                  insert into market.catalogue_provider_set_members values(85,p_group,ids[1],'ja','exact_set_code','Unique exact provider abbreviation / published native set code',now())
                    on conflict(category_id,group_id,set_id) do update set verified_at=now();
                  update market.catalogue_price_repairs set status='resolved',last_seen_at=now() where repair_key='set:85:'||p_group or repair_key='catalogue-set:'||ids[1];
                  return jsonb_build_object('status','mapped','setId',ids[1],'source','exact_set_code');
                end if;
                if provider_count>1 or coalesce(array_length(ids,1),0)>1 or previous_method='exact_set_code' then
                  if previous_method='exact_set_code' then perform api.quarantine_japanese_exact_code_group(p_group); end if;
                  insert into market.catalogue_price_repairs(repair_key,category_id,group_id,reason,detail)
                    values('set:85:'||p_group,85,p_group,'ambiguous_provider_set',jsonb_build_object('code',code,'providerGroups',provider_count,'candidateSetIds',ids))
                    on conflict(repair_key) do update set reason=excluded.reason,detail=excluded.detail,status='open',last_seen_at=now();
                  return jsonb_build_object('status','ambiguous');
                end if;
              elsif previous_method='exact_set_code' then
                perform api.quarantine_japanese_exact_code_group(p_group);
                return jsonb_build_object('status','unmapped');
              end if;
            end if;
          end if;
          return api.resolve_catalogue_bulk_set_by_name(p_category,p_group,p_language,p_name,p_abbreviation);
        end;
        $wrapper$;
      create function api.resolve_catalogue_bulk_set(p_category integer,p_group bigint,p_language text,p_name text,p_abbreviation text) returns jsonb
        language sql security invoker set search_path='' as $$ select api.resolve_catalogue_bulk_set_by_code_or_name($1,$2,$3,$4,$5) $$;
      grant usage on schema api, catalog, market to service_role;
      grant select, insert, update, delete on all tables in schema api, catalog, market to service_role;
      grant execute on all functions in schema api to service_role;
    `);

    const wrapperBefore = (await db.query<{ definition: string }>(
      "select pg_get_functiondef('api.resolve_catalogue_bulk_set_by_code_or_name(integer,bigint,text,text,text)'::regprocedure) as definition",
    )).rows[0].definition;
    await db.exec(`begin; ${migration} commit;`);
    const wrapperAfter = (await db.query<{ definition: string }>(
      "select pg_get_functiondef('api.resolve_catalogue_bulk_set_by_code_or_name(integer,bigint,text,text,text)'::regprocedure) as definition",
    )).rows[0].definition;
    assert.equal(wrapperAfter, wrapperBefore, 'migration leaves the Japanese code/ambiguity quarantine wrapper byte-for-byte unchanged');
    await db.exec('set role service_role');

    const en = id(1); const enSecond = id(2); const enMismatch = id(3); const ja = id(4); const jaDuplicate = id(5);
    const published = id(10); const publishedAgain = id(11); const draft = id(12); const deprecatedVersion = id(13);
    await db.query('insert into catalog.languages(code) values($1),($2)', ['en', 'ja']);
    await db.query(
      'insert into catalog.catalogue_versions(id,status,deprecated_at) values($1,$2,null),($3,$2,null),($4,$5,null),($6,$2,now())',
      [published, 'published', publishedAgain, draft, 'draft', deprecatedVersion],
    );
    await db.query(
      `insert into catalog.sets(id,language_code,set_code,native_name,english_display_name,deprecated_at) values
        ($1,'en','UND','Undaunted','Undaunted',null),($2,'en','UND2','Undaunted Bonus','Undaunted Bonus',null),
        ($3,'ja','MISMATCH','Mismatch','Mismatch',null),($4,'ja','JSET','Japanese Set','Japanese Set',null),
        ($5,'ja','JSET','Japanese Duplicate','Japanese Duplicate',null)`,
      [en, enSecond, enMismatch, ja, jaDuplicate],
    );
    await db.query('insert into catalog.catalogue_version_sets values($1,$2),($3,$2),($1,$4),($5,$6),($1,$7),($1,$8)',
      [published, en, publishedAgain, enSecond, draft, enMismatch, published, ja]);
    await db.query(
      "insert into market.catalogue_provider_sets(category_id,group_id,language_code,set_id,method,note) values(3,1403,'en',$1,'reviewed','Undaunted reviewed')",
      [en],
    );
    await db.query(
      "insert into market.catalogue_provider_set_members(category_id,group_id,set_id,language_code,method,note) values(3,1403,$1,'en','reviewed','primary'),(3,1403,$2,'en','reviewed','same set wrong member language'),(3,1403,$3,'ja','reviewed','other language')",
      [en, enMismatch, ja],
    );

    const current = await resolve(3, 1403, 'en');
    assert.equal(current.status, 'mapped', 'reviewed map is reusable through physical published membership');
    assert.equal(current.setId, en, 'durable reviewed primary set is retained');
    assert.deepEqual(current.setIds, [en, en, ja].sort(), 'all current members, including duplicate published memberships and other languages, preserve the old aggregation');

    await db.query('delete from catalog.catalogue_version_sets where catalogue_version_id=$1 and set_id=$2', [published, en]);
    await db.query('delete from catalog.catalogue_version_sets where catalogue_version_id=$1 and set_id=$2', [publishedAgain, en]);
    const languageMismatch = await resolve(3, 1403, 'en');
    assert.equal(languageMismatch.status, 'unmapped', 'a current member in another language cannot validate an English reviewed map');
    await db.query('insert into catalog.catalogue_version_sets values($1,$2)', [published, en]);

    await db.query('update catalog.catalogue_versions set deprecated_at=now() where id=$1', [published]);
    const deprecatedCv = await resolve(3, 1403, 'en');
    assert.equal(deprecatedCv.status, 'unmapped', 'deprecated catalogue versions cannot validate reviewed mappings');
    await db.query('update catalog.catalogue_versions set deprecated_at=null where id=$1', [published]);

    await db.query("delete from catalog.languages where code='en'");
    const missingLanguage = await resolve(3, 1403, 'en');
    assert.equal(missingLanguage.status, 'unmapped', 'missing catalogue language cannot validate reviewed mappings');
    await db.query("insert into catalog.languages(code) values('en')");

    await db.query(
      "insert into market.catalogue_bulk_feeds values('tcgplayer/85/groups',$1::jsonb)",
      [JSON.stringify({ results: [{ groupId: '8501', abbreviation: 'JSET' }] })],
    );
    const uniqueJa = await resolve(85, 8501, 'ja', '', 'JSET');
    assert.equal(uniqueJa.source, 'exact_set_code', 'unchanged Japanese wrapper still resolves a unique published exact code');
    await db.query('insert into catalog.catalogue_version_sets values($1,$2)', [published, jaDuplicate]);
    await db.query(
      "update market.catalogue_bulk_feeds set payload=$1::jsonb where feed_key='tcgplayer/85/groups'",
      [JSON.stringify({ results: [{ groupId: '8501', abbreviation: 'JSET' }, { groupId: '8502', abbreviation: 'JSET' }] })],
    );
    const ambiguousJa = await resolve(85, 8501, 'ja', '', 'JSET');
    assert.equal(ambiguousJa.status, 'ambiguous', 'unchanged Japanese wrapper still blocks ambiguous codes');
    const quarantineCount = await db.query<{ count: number }>('select count(*)::integer as count from market.japanese_quarantines where group_id=8501');
    assert.equal(quarantineCount.rows[0].count, 1,
      'unchanged Japanese wrapper still quarantines an ambiguous code group');

    const fallbackSet = id(20);
    await db.query("insert into catalog.sets(id,language_code,set_code,native_name,english_display_name) values($1,'en','FALL','Fallback Set','Fallback Set')", [fallbackSet]);
    await db.query('insert into catalog.catalogue_version_sets values($1,$2)', [published, fallbackSet]);
    const fallback = await resolve(3, 9001, 'en', 'Fallback Set');
    assert.equal(fallback.source, 'exact_set_name', 'unreviewed groups retain the existing exact-name fallback');

    await db.exec('reset role; set role anon');
    await assert.rejects(resolve(3, 1403, 'en'), /permission denied/, 'base resolver remains service-only');
    console.log('Bounded reviewed provider-set resolver passed: base-only replacement, exact prior JA wrapper preservation, physical publication semantics, and service-only access.');
  } finally {
    await db.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
