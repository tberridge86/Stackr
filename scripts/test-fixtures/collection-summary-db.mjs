import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const userA = '00000000-0000-4000-8000-000000000001';
export const userB = '00000000-0000-4000-8000-000000000002';
export const id = (n) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const declarations = {
  binders: 'id uuid,user_id uuid,type text,source_set_id text,card_mode text,edition text,default_condition text,master_set_enabled boolean,language text,created_at timestamptz,is_public boolean,sort_order integer',
  binder_cards: 'id uuid,binder_id uuid,card_id text,set_id text,language text,owned boolean,owned_quantity integer,condition text,grade_company text,grade text,slot_order integer,tcg_price numeric',
  user_card_variants: 'id uuid,user_id uuid,card_id text,set_id text,variant text,quantity integer,condition text,grade_company text,grade text',
  pokemon_cards: 'id text,set_id text,language text,raw_data jsonb',
  pokemon_sets: 'id text,printed_total integer,total integer',
};
export const binder = (n, extra = {}) => ({ id: id(n), user_id: userA, type: 'official', source_set_id: 'base3',
  card_mode: 'raw', edition: null, default_condition: 'Near Mint', master_set_enabled: false,
  language: 'en', created_at: '2026-10-25T00:00:00Z', is_public: false, sort_order: 0, ...extra });
export const owned = (n, card, extra = {}) => ({ id: id(n), user_id: userA, card_id: card, set_id: 'base3',
  variant: 'normal', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '', ...extra });
export const saved = (n, binderId, card, extra = {}) => ({ id: id(n), binder_id: binderId, card_id: card, set_id: 'base3',
  language: 'en', owned: true, owned_quantity: 1, condition: 'Near Mint',
  grade_company: '', grade: '', slot_order: n, tcg_price: null, ...extra });
export const card = (key, prices = { normal: { market: 10 } }, extra = {}) => ({ id: key, set_id: 'base3', language: 'en',
  raw_data: { tcgplayer: { prices } }, ...extra });

export async function createCollectionSummaryDatabase() {
  const db = new PGlite();
async function add(table, rows) {
  if (!rows.length) return;
  const columns = declarations[table].split(',').map((entry) => entry.split(' ')[0]).join(',');
  await db.query('insert into public.' + table + '(' + columns + ') select ' + columns
    + ' from jsonb_to_recordset($1::jsonb) as t(' + declarations[table] + ')', [JSON.stringify(rows)]);
}
async function asUser(user = userA) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec('set role authenticated');
}
async function clear() {
  await db.exec('reset role; truncate public.binder_cards,public.user_card_variants,public.binders,public.pokemon_cards,public.pokemon_sets');
}
  await db.exec(`
    create schema auth;
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create table public.binders(
      id uuid primary key,user_id uuid not null,type text,source_set_id text,card_mode text,edition text,
      default_condition text,master_set_enabled boolean,language text,created_at timestamptz,is_public boolean,sort_order integer);
    create table public.binder_cards(
      id uuid primary key,binder_id uuid not null references public.binders(id),card_id text,set_id text,
      language text,owned boolean,owned_quantity integer,condition text,grade_company text,grade text,slot_order integer,tcg_price numeric);
    create table public.user_card_variants(
      id uuid primary key,user_id uuid not null,card_id text,set_id text,variant text,quantity integer,
      condition text,grade_company text,grade text);
    create table public.pokemon_cards(id text primary key,set_id text,language text,raw_data jsonb);
    create table public.pokemon_sets(id text primary key,printed_total integer,total integer);
    create index on public.binders(user_id);
    create index on public.binder_cards(binder_id,owned,card_id,set_id);
    create index on public.user_card_variants(user_id,set_id,card_id);
    create index on public.pokemon_cards(set_id);
    alter table public.binders enable row level security;
    alter table public.binder_cards enable row level security;
    alter table public.user_card_variants enable row level security;
    alter table public.pokemon_cards enable row level security;
    alter table public.pokemon_sets enable row level security;
    create policy visible_binders on public.binders for select to authenticated using(user_id=auth.uid() or is_public);
    create policy visible_saved on public.binder_cards for select to authenticated using(exists(
      select 1 from public.binders b where b.id=binder_id and (b.user_id=auth.uid() or b.is_public)));
    create policy owner_variants on public.user_card_variants for select to authenticated using(user_id=auth.uid());
    create policy public_cards on public.pokemon_cards for select to authenticated using(true);
    create policy public_sets on public.pokemon_sets for select to authenticated using(true);
    grant select on public.binders,public.binder_cards,public.user_card_variants,public.pokemon_cards,public.pokemon_sets to authenticated;
  `);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261025154000_collection_summary_v1.sql', import.meta.url), 'utf8'));
  return { db, userA, userB, id, binder, owned, saved, card, add, asUser, clear };
}

/** Explain the exact aggregate statement with caller RLS; never connect to a hosted database. */
export async function explainCollectionSummary(db, userId, overrides = []) {
  const migration = readFileSync(new URL('../../supabase/migrations/20261025154000_collection_summary_v1.sql', import.meta.url), 'utf8');
  const query = migration.slice(migration.indexOf('  with binders as materialized'), migration.indexOf(';\n  return result'))
    .replace(') into result from totals', ') from totals').replaceAll('owner_id', '$1::uuid').replaceAll('p_master_binder_ids', '$2::uuid[]');
  return (await db.query('explain (analyze, buffers, format json) ' + query, [userId, overrides])).rows[0]['QUERY PLAN'][0];
}
