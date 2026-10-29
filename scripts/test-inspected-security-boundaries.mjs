import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const input = readFileSync(new URL('./test-fixtures/production-security-20261026.json', import.meta.url), 'utf8');
const fixture = JSON.parse(input);
const db = new PGlite();
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const passed = [];
async function asRole(role, owner, action) {
  await db.exec('begin; set local role ' + role);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner ?? '']);
  try { await action(); } finally { await db.exec('rollback'); }
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key, raw_app_meta_data jsonb, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.profiles(id uuid primary key, role text, email text, stripe_account_id text,
      created_at timestamptz, collector_name text);
    create table public.binders(id uuid primary key, name text, type text, is_public boolean, user_id uuid, created_at timestamptz);
    create table public.user_card_flags(id uuid primary key);
    alter table public.profiles enable row level security;
    create policy own_profile on public.profiles to authenticated using(id=auth.uid()) with check(id=auth.uid());
    grant usage on schema auth,private,public to authenticated,anon;
    grant select,insert,update on public.profiles to authenticated;
  `);
  // These are the actual inspected production definitions, not copies rewritten
  // for the fixture. Tables/roles are minimal local dependencies; this is not an
  // authenticated client or a complete production-schema reproduction.
  for (const name of ['private.stackr_is_trusted_admin','public.stackr_protect_profile_authority',
    'public.admin_binder_directory','public.marketplace_review_listing','public.marketplace_review_queue']) {
    await db.exec(fixture.definitions.find((row) => row.name === name).definition);
  }
  await db.exec(`
    create trigger stackr_protect_profile_authority before insert or update on public.profiles
      for each row execute function public.stackr_protect_profile_authority();
    revoke all on function public.admin_binder_directory(), public.marketplace_review_listing(uuid,text,text,text),
      public.marketplace_review_queue(integer) from public,anon;
    grant execute on function public.admin_binder_directory(), public.marketplace_review_listing(uuid,text,text,text),
      public.marketplace_review_queue(integer) to authenticated;
  `);
  for (const owner of [a,b]) {
    await db.query('insert into auth.users values($1,$2,$3)',[owner,{stackr_admin:false},{stackr_admin:true}]);
    await db.query("insert into public.profiles(id,role,collector_name) values($1,'user','Synthetic')",[owner]);
    await db.query("insert into public.binders(id,name,type,is_public,user_id) values($1,'Synthetic private','custom',false,$1)",[owner]);
  }
  const adminCalls = ['select * from public.admin_binder_directory()',
    "select * from public.marketplace_review_listing(null,'approve')",
    'select * from public.marketplace_review_queue(1)'];
  for (const owner of [a,b]) {
    for (const call of adminCalls) {
      await asRole('authenticated',owner,async()=>assert.rejects(db.query(call),(error)=>error.code==='42501'));
      passed.push('non-admin denied: ' + call.split('public.')[1].split('(')[0]);
    }
    await asRole('authenticated',owner,async()=>assert.rejects(
      db.query("update public.profiles set role='admin' where id=$1",[owner]),(error)=>error.code==='42501'));
    passed.push('profile role escalation denied');
    await asRole('authenticated',owner,async()=>assert.rejects(
      db.query("update auth.users set raw_app_meta_data='{\"stackr_admin\":true}' where id=$1",[owner]),(error)=>error.code==='42501'));
    passed.push('Auth authority write denied');
    await asRole('authenticated',owner,async()=>assert.deepEqual((await db.query('select private.stackr_is_trusted_admin() as allowed')).rows,[{allowed:false}]));
    passed.push('user-controlled metadata does not grant admin');
  }
  for (const call of adminCalls) {
    await asRole('anon',null,async()=>assert.rejects(db.query(call),(error)=>error.code==='42501'));
    passed.push('anonymous execute denied');
  }
  await db.query("update auth.users set raw_app_meta_data='{\"stackr_admin\":true}' where id=$1",[b]);
  await asRole('authenticated',b,async()=>assert.equal((await db.query('select * from public.admin_binder_directory()')).rows.length,2));
  passed.push('trusted server claim admits intended admin');
  await asRole('authenticated',a,async()=>assert.rejects(db.query('select * from public.admin_binder_directory()'),(error)=>error.code==='42501'));
  passed.push('other account remains denied');
  assert.deepEqual((await db.query('select distinct role from public.profiles')).rows,[{role:'user'}]);
  console.log(JSON.stringify({ok:true,checks:passed.length,passed,
    definitionSha256:createHash('sha256').update(input).digest('hex'),
    environment:'local PGlite, captured production function bodies with synthetic tables and roles',
    hostedNegativeExecution:false, installedPhone:false},null,2));
} finally { await db.close(); }
