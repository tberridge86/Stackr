import assert from 'node:assert/strict';
import { createNativePostgresFixture, nativeFixtureEnabled } from './test-fixtures/native-postgres-fixture.mjs';
assert.equal(nativeFixtureEnabled({}),false);
for (const env of [{STACKR_NATIVE_POSTGRES_FIXTURE:'1'}, {CI:'true',STACKR_NATIVE_POSTGRES_FIXTURE:'1'},
  {CI:'true',GITHUB_ACTIONS:'true',STACKR_NATIVE_POSTGRES_FIXTURE:'true'},
  {CI:'true',GITHUB_ACTIONS:'true',GITHUB_JOB:'other-job',STACKR_NATIVE_POSTGRES_FIXTURE:'1'}]) {
  assert.throws(()=>nativeFixtureEnabled(env),/explicit_ci_mode/);
}
const env={CI:'true',GITHUB_ACTIONS:'true',GITHUB_JOB:'prepared-valuation-postgres17',STACKR_NATIVE_POSTGRES_FIXTURE:'1',
  SUPABASE_DB_URL:'postgresql://secret@production.invalid/postgres',PGHOST:'production.invalid',PGPORT:'9999'};
const commands=[];const configs=[];
let failCreate=false;let failConnect=false;let version=170006;
class FakeClient {
  constructor(config) { this.config=config;configs.push(config); }
  async connect() { if(failConnect&&this.config.database!=='postgres')throw new Error('fixture connect failed'); }
  async query(sql) {
    commands.push(sql);
    if(sql.startsWith('select current_setting'))return {rows:[{version}]};
    if(failCreate&&sql.startsWith('create database'))throw new Error('exists');
    return {rows:[]};
  }
  async end() { commands.push('end '+this.config.database); }
}
const opts={env,Client:FakeClient,nonce:()=> '00000000-0000-4000-8000-000000000001'};
const db=await createNativePostgresFixture(opts);
assert.ok(configs.every(x=>x.host==='127.0.0.1'&&x.port===5432&&x.user==='postgres'&&x.password==='postgres'));
await db.query('select 1');await db.exec('select 2');await db.close();await db.close();
assert.equal(commands.filter(x=>x.startsWith('drop database')).length,1);
assert.ok(commands.includes('drop database "stackr_fixture_00000000000040008000000000000001"'));
commands.length=0;failCreate=true;
await assert.rejects(createNativePostgresFixture(opts),/exists/);
assert.ok(!commands.some(x=>x.startsWith('drop database')));
commands.length=0;failCreate=false;failConnect=true;
await assert.rejects(createNativePostgresFixture(opts),/fixture connect failed/);
assert.equal(commands.filter(x=>x.startsWith('drop database')).length,1);
commands.length=0;failConnect=false;version=180003;
await assert.rejects(createNativePostgresFixture(opts),/requires_postgres_17/);
assert.ok(!commands.some(x=>/^(create|drop) database/.test(x)));
await assert.rejects(createNativePostgresFixture({...opts,nonce:()=> 'other";drop database postgres;--'}),/invalid_fixture_database_nonce/);
assert.equal(await createNativePostgresFixture({env:{},Client:class{constructor(){throw new Error('must not connect')}}}),undefined);
console.log('Native PostgreSQL fixture: CI opt-in, fixed local target, PG17 check, unique ownership and cleanup guards passed (mocked transport; no database connection).');
