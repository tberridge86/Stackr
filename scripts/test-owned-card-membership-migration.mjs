import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const databaseUrl = process.argv.find((value) => value.startsWith('--db-url='))?.slice(9);
if (!databaseUrl) throw new Error('database_url_required');

const historicalMigration = readFileSync(
  'supabase/migrations/20260702120000_owned_card_membership_model.sql',
  'utf8',
);
const forwardRepairMigration = readFileSync(
  'supabase/migrations/20260811165000_repair_owned_card_membership_legacy_identity.sql',
  'utf8',
);
const legacyColumns = "array['card_id', 'set_id', 'user_id', 'variant']::text[]";
const ownedIdentityColumns = "array['card_id', 'condition', 'grade', 'grade_company', 'set_id', 'user_id', 'variant']::text[]";

function columnIdentitySql(relationAlias, keyExpression) {
  return `(
    select array_agg(attribute.attname::text order by attribute.attname)
    from unnest(${keyExpression}) with ordinality as column_key(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = ${relationAlias}.oid
      and attribute.attnum = column_key.attnum
  )`;
}

async function resetFixture(client, { includeMembershipColumns = false } = {}) {
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    create schema public;
    create schema auth;
    create extension if not exists pgcrypto;
    do $$
    begin
      create role authenticated;
    exception when duplicate_object then
      null;
    end $$;
    do $$
    begin
      create role service_role;
    exception when duplicate_object then
      null;
    end $$;
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$ select null::uuid $$;

    create table auth.users (
      id uuid primary key
    );

    create table public.binders (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id)
    );

    create table public.binder_cards (
      id uuid primary key default gen_random_uuid(),
      binder_id uuid not null references public.binders(id),
      card_id text not null,
      set_id text not null,
      owned boolean not null default false,
      condition text,
      grade_company text,
      grade text,
      owned_quantity integer not null default 1 check (owned_quantity >= 1)
    );

    create table public.user_card_variants (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id),
      card_id text not null,
      set_id text not null,
      variant text not null default 'normal',
      quantity integer not null default 1 check (quantity >= 1)${includeMembershipColumns ? `,
      condition text not null default 'Near Mint',
      grade_company text not null default '',
      grade text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()` : ''}
    );
  `);
}

async function addLegacyFourColumnIdentity(client) {
  await client.query(`
    alter table public.user_card_variants
      add constraint arbitrary_legacy_identity_constraint
      unique (user_id, card_id, set_id, variant);
    create unique index arbitrary_legacy_identity_index
      on public.user_card_variants(user_id, card_id, set_id, variant);
  `);
}

async function legacyIdentityObjects(client) {
  const constraints = columnIdentitySql('table_relation', 'constraint_record.conkey');
  const indexes = columnIdentitySql('table_relation', 'index_definition.indkey');
  const result = await client.query(`
    select 'constraint'::text as kind, constraint_record.conname as name
    from pg_constraint constraint_record
    join pg_class table_relation on table_relation.oid = constraint_record.conrelid
    where table_relation.oid = 'public.user_card_variants'::regclass
      and constraint_record.contype = 'u'
      and ${constraints} = ${legacyColumns}
    union all
    select 'index'::text as kind, index_relation.relname as name
    from pg_index index_definition
    join pg_class table_relation on table_relation.oid = index_definition.indrelid
    join pg_class index_relation on index_relation.oid = index_definition.indexrelid
    where table_relation.oid = 'public.user_card_variants'::regclass
      and index_definition.indisunique
      and not index_definition.indisprimary
      and not exists (
        select 1
        from pg_constraint attached_constraint
        where attached_constraint.conindid = index_definition.indexrelid
      )
      and ${indexes} = ${legacyColumns}
    order by kind, name;
  `);
  return result.rows;
}

async function ownedIdentityIndexCount(client) {
  const columns = columnIdentitySql('table_relation', 'index_definition.indkey');
  const result = await client.query(`
    select count(*)::int as count
    from pg_index index_definition
    join pg_class table_relation on table_relation.oid = index_definition.indrelid
    where table_relation.oid = 'public.user_card_variants'::regclass
      and index_definition.indisunique
      and ${columns} = ${ownedIdentityColumns};
  `);
  return result.rows[0].count;
}

async function testHistoricalMigration(client) {
  await resetFixture(client);
  await client.query(`
    insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001');
    insert into public.binders (id, user_id) values
      ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001'),
      ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001');
    insert into public.user_card_variants (id, user_id, card_id, set_id, variant, quantity)
    values (
      '00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000001',
      'test-card',
      'test-set',
      'normal',
      1
    );
  `);
  await addLegacyFourColumnIdentity(client);
  await client.query(`
    insert into public.binder_cards (binder_id, card_id, set_id, owned, condition, grade_company, grade, owned_quantity)
    values
      ('00000000-0000-0000-0000-000000000011', 'test-card', 'test-set', true, 'Near Mint', null, null, 2),
      ('00000000-0000-0000-0000-000000000012', 'test-card', 'test-set', true, 'Played', 'PSA', '1', 1);
  `);

  await client.query(historicalMigration);

  assert.deepEqual(await legacyIdentityObjects(client), []);
  assert.ok(await ownedIdentityIndexCount(client) >= 1, 'seven-column owned identity index exists');
  const variants = await client.query(`
    select condition, grade_company, grade, quantity
    from public.user_card_variants
    where user_id = '00000000-0000-0000-0000-000000000001'
      and card_id = 'test-card'
      and set_id = 'test-set'
    order by condition, grade_company, grade;
  `);
  assert.deepEqual(variants.rows, [
    { condition: 'Near Mint', grade_company: '', grade: '', quantity: 2 },
    { condition: 'Played', grade_company: 'PSA', grade: '1', quantity: 1 },
  ]);
  const linked = await client.query(`
    select count(*)::int as count
    from public.binder_cards
    where owned and owned_card_variant_id is not null;
  `);
  assert.equal(linked.rows[0].count, 2);
  await assert.rejects(
    client.query(`
      insert into public.user_card_variants (
        user_id, card_id, set_id, variant, condition, grade_company, grade, quantity
      ) values (
        '00000000-0000-0000-0000-000000000001',
        'test-card',
        'test-set',
        'normal',
        'Played',
        'PSA',
        '1',
        1
      );
    `),
    (error) => error?.code === '23505',
  );
}

async function testForwardRepairMigration(client) {
  await resetFixture(client, { includeMembershipColumns: true });
  await client.query(`
    insert into auth.users (id) values ('00000000-0000-0000-0000-000000000101');
    insert into public.user_card_variants (
      id, user_id, card_id, set_id, variant, condition, grade_company, grade, quantity
    ) values (
      '00000000-0000-0000-0000-000000000121',
      '00000000-0000-0000-0000-000000000101',
      'repair-card',
      'repair-set',
      'normal',
      'Near Mint',
      '',
      '',
      1
    );
  `);
  await addLegacyFourColumnIdentity(client);

  await client.query(forwardRepairMigration);

  assert.deepEqual(await legacyIdentityObjects(client), []);
  assert.ok(await ownedIdentityIndexCount(client) >= 1, 'forward repair preserves seven-column identity');
  await client.query(`
    insert into public.user_card_variants (
      user_id, card_id, set_id, variant, condition, grade_company, grade, quantity
    ) values (
      '00000000-0000-0000-0000-000000000101',
      'repair-card',
      'repair-set',
      'normal',
      'Played',
      'PSA',
      '1',
      1
    );
  `);
  await assert.rejects(
    client.query(`
      insert into public.user_card_variants (
        user_id, card_id, set_id, variant, condition, grade_company, grade, quantity
      ) values (
        '00000000-0000-0000-0000-000000000101',
        'repair-card',
        'repair-set',
        'normal',
        'Played',
        'PSA',
        '1',
        1
      );
    `),
    (error) => error?.code === '23505',
  );
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await testHistoricalMigration(client);
  await testForwardRepairMigration(client);
  console.log('Owned-card membership migration compatibility tests passed.');
} finally {
  await client.end();
}
