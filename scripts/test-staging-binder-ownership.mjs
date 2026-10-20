import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261011100654_reconcile_staging_binder_ownership.sql', import.meta.url), 'utf8');
const hardening = await readFile(new URL('../supabase/migrations/20261011100927_revoke_public_guard_function_execute.sql', import.meta.url), 'utf8');
const db = new PGlite();
const exec = (sql) => db.exec(sql);

// Deliberately minimal disposable prerequisite fixture. It executes the shipped
// migration verbatim and supplies the same JWT claim setting that Supabase's
// auth.uid() reads. Nothing here reaches a remote database.
await exec(`create schema auth; create schema if not exists public;
create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.binders(id uuid primary key,user_id uuid,name text,color text,cover_key text,type text,source_set_id text,source_set_logo_url text,source_set_symbol_url text,source_set_cover_url text,source_set_display_name text,source_set_local_name text,source_set_english_display_name text,language text,edition text,default_condition text,card_mode text,created_at timestamptz default now());
create table public.user_card_variants(id uuid primary key,user_id uuid,card_id text,set_id text,variant text,condition text,grade_company text,grade text,quantity integer,updated_at timestamptz default now());
create table public.binder_cards(id uuid primary key,binder_id uuid,card_id text,set_id text,language text,card_name text,card_number text,image_url text,set_name text,slot_order integer,owned boolean,owned_quantity integer,condition text,grade_company text,grade text,notes text,owned_card_variant_id uuid);
create table public.seller_inventory_items(id text primary key,user_id uuid,card_id text,set_id text,condition text,card_snapshot jsonb,quantity integer,updated_at timestamptz default now());
create table public.user_card_flags(id uuid primary key);
create role anon; create role authenticated; create role service_role;`);

// A partially-present marketplace safeguard layer must abort before lifecycle
// schema is added; the realistic staging start has none of these four tables.
await exec('create table public.marketplace_listing_review_events(id uuid primary key)');
await assert.rejects(() => exec(migration), /marketplace safeguard foundation is partially installed/);
await exec('rollback');
await exec('drop table public.marketplace_listing_review_events');
await exec(migration);
await exec(hardening);
await exec(`insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222')`);
let result = await db.query(`select to_regclass('public.binder_ownership_mutation_requests') as request_table, to_regprocedure('public.apply_binder_ownership_mutation_v1(uuid,text,text,jsonb,text)') as apply_fn`);
assert.equal(result.rows[0].request_table, 'binder_ownership_mutation_requests');
assert.ok(result.rows[0].apply_fn);
result = await db.query(`select count(*)::int as total from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('marketplace_listing_publication_requests','marketplace_inventory_reservations','marketplace_listing_transaction_events','marketplace_listing_review_events') and c.relrowsecurity and c.relforcerowsecurity`);
assert.equal(result.rows[0].total, 4);
result = await db.query(`select count(*)::int as total from pg_constraint c join pg_class r on r.oid=c.conrelid where (r.relname,c.conname) in (
  ('marketplace_listing_publication_requests','marketplace_listing_publication_state_valid'),
  ('marketplace_inventory_reservations','marketplace_inventory_reservation_source_valid'),
  ('marketplace_inventory_reservations','marketplace_inventory_reservation_quantity_valid'),
  ('marketplace_inventory_reservations','marketplace_inventory_reservation_status_valid'),
  ('marketplace_listing_transaction_events','marketplace_listing_event_kind_valid'),
  ('marketplace_listing_review_events','marketplace_listing_review_events_decision_valid'),
  ('marketplace_listing_review_events','marketplace_listing_review_events_notes_length'),
  ('marketplace_listing_review_events','marketplace_listing_review_events_seller_message_length'))`);
assert.equal(result.rows[0].total, 8);
result = await db.query(`select
  bool_and(not has_function_privilege('anon', procedure_name, 'execute')) as anon_denied,
  bool_and(not has_function_privilege('authenticated', procedure_name, 'execute')) as authenticated_denied,
  bool_and(has_function_privilege('service_role', procedure_name, 'execute')) as service_role_allowed
  from (values
    ('public.guard_reserved_binder_delete()'),
    ('public.guard_reserved_binder_membership_mutation()'),
    ('public.guard_reserved_owned_variant_mutation()'),
    ('public.guard_reserved_seller_inventory_mutation()')
  ) guards(procedure_name)`);
assert.deepEqual(result.rows[0], { anon_denied: true, authenticated_denied: true, service_role_allowed: true });
const owner = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const binder = '33333333-3333-3333-3333-333333333333';
const request = '44444444-4444-4444-4444-444444444444';
const key = `binder:${'a'.repeat(64)}`, digest = 'b'.repeat(64);
const payload = JSON.stringify({ binderId: binder, name: 'Fixture binder', type: 'custom' }).replaceAll("'", "''");
await assert.rejects(() => db.query(`select public.apply_binder_ownership_mutation_v1('${request}','${key}','create_binder','${payload}'::jsonb,'${digest}')`), /Sign in/);
const asUser = async (userId, action) => {
  await exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userId}',true)`);
  try {
    const value = await action();
    await exec('commit');
    return value;
  } catch (error) {
    await exec('rollback');
    throw error;
  }
};
const invoke = (requestId, requestKey, operation, json, hash) =>
  db.query(`select public.apply_binder_ownership_mutation_v1('${requestId}','${requestKey}','${operation}','${JSON.stringify(json).replaceAll("'", "''")}'::jsonb,'${hash}') as result`);
let call = await asUser(owner, () => invoke(request, key, 'create_binder', JSON.parse(payload), digest));
assert.equal(call.rows[0].result.state, 'applied');
call = await asUser(owner, () => invoke(request, key, 'create_binder', JSON.parse(payload), digest));
assert.equal(call.rows[0].result.replayed, true);
await assert.rejects(() => asUser(other, () => invoke(request, key, 'create_binder', JSON.parse(payload), digest)), /identity changed/i);
await assert.rejects(() => asUser(owner, () => invoke(request, key, 'create_binder', JSON.parse(payload), 'c'.repeat(64))), /identity changed/i);
const ownRequests = await asUser(owner, () => db.query(`select count(*)::int as total from public.binder_ownership_mutation_requests`));
assert.equal(ownRequests.rows[0].total, 1);
const otherRequests = await asUser(other, () => db.query(`select count(*)::int as total from public.binder_ownership_mutation_requests`));
assert.equal(otherRequests.rows[0].total, 0);

// A client which opts into version checking must receive a recorded conflict,
// rather than overwriting the owner’s newer binder state.
const conflictRequest = '55555555-5555-5555-5555-555555555555';
const conflict = await asUser(owner, () => invoke(
  conflictRequest,
  `binder:${'d'.repeat(64)}`,
  'update_binder',
  {
    binderId: binder,
    name: 'Attempted stale rename',
    preconditionSchemaVersion: '1',
    expected: { binderVersion: 0, binderName: 'Fixture binder', name: 'Fixture binder' },
  },
  'e'.repeat(64),
));
assert.equal(conflict.rows[0].result.state, 'conflict');
assert.equal(conflict.rows[0].result.errorCode, 'BINDER_CONFLICT');

// The trigger must prevent a request wrapper from removing a binder membership
// that backs an active marketplace reservation.
const variant = '66666666-6666-6666-6666-666666666666';
const binderCard = '77777777-7777-7777-7777-777777777777';
const listingRequest = '88888888-8888-8888-8888-888888888888';
await exec(`insert into public.user_card_variants(id,user_id,card_id,set_id,variant,condition,quantity)
  values ('${variant}','${owner}','fixture-card','fixture-set','normal','Near Mint',1);
  insert into public.binder_cards(id,binder_id,card_id,set_id,language,owned,owned_quantity,owned_card_variant_id)
  values ('${binderCard}','${binder}','fixture-card','fixture-set','en',true,1,'${variant}');
  insert into public.marketplace_listing_publication_requests(request_id,request_key,seller_user_id,manifest_hash,state,approval_snapshot,inventory_snapshot,pricing_snapshot)
  values ('${listingRequest}','fixture-listing-request','${owner}','${'1'.repeat(64)}','published','{}'::jsonb,jsonb_build_object('binderId','${binder}'),'{}'::jsonb);
  insert into public.marketplace_inventory_reservations(request_id,seller_user_id,inventory_source_type,inventory_source_id,quantity,identity_fingerprint,status)
  values ('${listingRequest}','${owner}','owned_variant','${variant}',1,'fixture-fingerprint','published');`);
const blocked = await asUser(owner, () => invoke(
  '99999999-9999-9999-9999-999999999999',
  `binder:${'f'.repeat(64)}`,
  'remove_card',
  { binderId: binder, binderCardId: binderCard },
  '0'.repeat(64),
));
assert.equal(blocked.rows[0].result.state, 'reservation_blocked');
assert.equal(blocked.rows[0].result.errorCode, 'BINDER_RESERVATION_BLOCKED');
const retained = await db.query(`select count(*)::int as total from public.binder_cards where id = '${binderCard}'`);
assert.equal(retained.rows[0].total, 1);
await exec(migration); // production-compatible rerun must be a no-op
// Four present tables with a same-name but weakened contract are unsafe: do
// not treat them as a compatible replay state.
await exec(`begin;
  alter table public.marketplace_inventory_reservations drop constraint marketplace_inventory_reservation_status_valid;
  alter table public.marketplace_inventory_reservations add constraint marketplace_inventory_reservation_status_valid check (true)`);
await assert.rejects(() => exec(migration), /marketplace safeguard foundation is installed but not production-compatible/);
await exec('rollback');
// A policy with the production name but a broad predicate must not pass the
// full-state no-op gate.
await exec(`drop policy "Users can read own binder mutation requests" on public.binder_ownership_mutation_requests;
  create policy "Users can read own binder mutation requests" on public.binder_ownership_mutation_requests for select to authenticated using (true);`);
await assert.rejects(() => exec(migration), /not production-compatible/);
await exec('rollback');
await exec(`drop function public.binder_ownership_lifecycle_readiness_v1()`);
await assert.rejects(() => exec(migration), /partially installed/);
await exec('rollback');
await db.close();
console.log('staging binder ownership migration: marketplace foundation install/partial guard, lifecycle replay/partial and malicious-policy guards, JWT actor isolation, idempotency, stale-version conflict, and marketplace reservation lock passed');
