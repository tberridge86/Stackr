import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Run the real CLI with a local fake Postgres boundary; never connect to a database.
const fixture = mkdtempSync(join(tmpdir(), 'stackr-ledger-report-'));
try {
  writeFileSync(join(fixture, 'verify.mjs'),
    readFileSync('scripts/deploy/verify-staging-migration-ledger.mjs', 'utf8'));
  writeFileSync(join(fixture, 'staging-migration-ledger.mjs'), `
    export const DEFAULT_STAGING_LEDGER_MANIFEST = 'unused';
    const applied = { version: '20260101000000', name: 'baseline' };
    const pending = { version: '20260102000000', name: 'gate0' };
    export const orderedVersionNameMd5 = rows => rows.map(r => r.version+'|'+r.name).join(',');
    export const orderedRemoteStatementLedgerSha256 = rows => rows.map(r => r.remoteStatementsSha256).join(',');
    export const loadStagingMigrationLedger = () => ({
      appliedEntries: [applied], pendingEntries: [pending], entries: [applied,pending],
      manifest: { projectRef:'test-project', expectedAppliedRemoteStatementLedgerSha256:'baseline-hash',
        gate0MigrationVersion:pending.version, expectedGate0RemoteStatementsSha256:'gate-hash' }
    });
    export const verifyGate0RemoteStatementContract = row =>
      row.remoteStatementsSha256 === 'gate-hash' ? [] : ['staging_gate0_remote_statement_array_hash_drift'];
  `);
  writeFileSync(join(fixture, 'verified-supabase-postgres.mjs'), `
    import assert from 'node:assert/strict';
    const mode = process.env.TEST_MODE;
    const fail = () => { throw Object.assign(new Error('private connection detail'), {code:'TEST_ERROR'}); };
    export const createVerifiedSupabasePostgresClient = () => ({
      async connect() { if(mode==='connect') fail(); },
      async query(sql) {
        if(sql==='begin read only') return {};
        if(sql==='rollback') { if(mode==='rollback') fail(); return {}; }
        assert.match(sql, /from supabase_migrations.schema_migrations/);
        assert.doesNotMatch(sql, /insert|update|delete|alter|drop/i);
        if(mode==='query') fail();
        const rows=[{ version:'20260101000000', name:mode==='key'?'wrong':'baseline',
          statement_count:mode==='empty-statements'?0:1,
          remoteStatementsSha256:mode==='hash'?'wrong':'baseline-hash' }];
        if(['applied','bad-gate','require-pending'].includes(mode)) rows.push({
          version:'20260102000000',name:'gate0',statement_count:1,
          remoteStatementsSha256:mode==='bad-gate'?'wrong':'gate-hash'
        });
        return {rows};
      },
      async end() { if(mode==='cleanup') fail(); }
    });
  `);
  const cases = [
    ['pending',false],['applied',false],['key',true],['hash',true],
    ['empty-statements',true],['bad-gate',true],['require-pending',true],
    ['project',true],['credential',true],['connect',true],['query',true],
    ['rollback',true],['cleanup',true]
  ];
  let unsafe = 0;
  for (const [mode, failed] of cases) {
    const args=[join(fixture,'verify.mjs'),'--phase=pre-apply'];
    if(mode==='require-pending') args.push('--require-pending');
    const run=spawnSync(process.execPath,args,{encoding:'utf8',timeout:5000,env:{
      TEST_MODE:mode, SUPABASE_PROJECT_REF:mode==='project'?'wrong':'test-project',
      ...(mode==='credential'?{}:{STACKR_SOURCE_DB_URL:'fixture-only'})
    }});
    assert.equal(run.status,failed?1:0,mode+': '+run.stderr);
    const report=JSON.parse(run.stdout);
    assert.equal(report.ok,!failed,mode);
    assert.ok(!run.stdout.includes('private connection detail'));
    if(failed) {
      if(report.applyRequired === true || ['gate0-pending','gate0-applied'].includes(report.remoteState)) unsafe++;
      assert.equal(report.applyRequired,false,mode);
      assert.equal(report.remoteState,'unverified',mode);
      assert.ok(report.errors.length>0,mode);
    } else {
      assert.equal(report.remoteState,mode==='pending'?'gate0-pending':'gate0-applied');
      assert.equal(report.applyRequired,mode==='pending');
    }
  }
  console.log(JSON.stringify({cases:cases.length,failureCases:11,unsafeFailureReports:unsafe}));
} finally { rmSync(fixture,{recursive:true,force:true}); }

