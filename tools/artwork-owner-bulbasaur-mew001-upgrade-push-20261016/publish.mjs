import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { resolveServerKey } from '../queue1-publish-20260927/credentials.mjs';
import { PROJECTS, BUCKET, createPublicationJournal, createTransferPolicy, readPublicObject, validateBytes, safePath } from '../artwork3303-publish-20260928/publish.mjs';
import { loadFrozen, validatePlan, PLAN_SHA, CH, same } from './frozen.mjs';
import { readState, classify, writeMetadata } from './metadata.mjs';
import { rollbackReceipt, rollbackSql } from './rollback.mjs';
export const CONFIRMATION = 'PUBLISH OWNER BULBASAUR MEW001 UPGRADE';
export function assertConfig(e) { check(e.GITHUB_ACTIONS === 'true' && e.GITHUB_EVENT_NAME === 'workflow_dispatch' && e.GITHUB_REF === 'refs/heads/main', 'PROTECTED_MANUAL_MAIN_REQUIRED'); check(/^[a-f0-9]{40}$/.test(e.GITHUB_SHA ?? '') && e.GITHUB_SHA === e.STACKR_EXPECTED_MAIN_SHA, 'EXACT_MAIN_REQUIRED'); same(e.STACKR_OWNER_BULBASAUR_CONFIRMATION, CONFIRMATION, 'EXACT_CONFIRMATION_REQUIRED'); for (const env of ['staging', 'production']) {
    const raw = e[env === 'staging' ? 'SUPABASE_STAGING_DB_URL' : 'SUPABASE_DB_URL'];
    check(typeof raw === 'string', 'DB_URL_REQUIRED');
    let u;
    try {
        u = new URL(raw);
    }
    catch {
        throw Error('DB_URL_INVALID');
    }
    check(['postgres:', 'postgresql:'].includes(u.protocol) && !u.search && !u.hash, 'DB_URL_INVALID');
    check(u.hostname === 'db.' + PROJECTS[env] + '.supabase.co' || (u.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(u.username) === 'postgres.' + PROJECTS[env]), 'WRONG_DB_PROJECT');
} check(e.STACKR_OWNER_BULBASAUR_PACKAGES && e.STACKR_OWNER_BULBASAUR_OUTPUT, 'OUTPUT_AND_PACKAGE_REQUIRED'); }
export const safeError = () => 'PUBLICATION_OPERATION_FAILED';
export const safeSQLState = e => typeof e?.code==='string' && /^[0-9A-Z]{5}$/.test(e.code) ? e.code : null;
const PHASES = new Set(['preflight','local_files','staging_connect','staging_rehearsal','production_connect','production_rehearsal','storage_policy','storage_presence','object_reuse_verify','production_publish','production_commit','postcommit_state','postcommit_public_bytes','complete']);
const QUERY_PHASES = new Set(['transaction_begin','transaction_settings','transaction_lock','scope_snapshot','published_bindings','view_contract','manifest_candidates','manifest_visible','scope_lock','source_insert','asset_insert','link_insert','old_hide','rollback_fingerprint','transaction_rollback','transaction_commit']);
const EVIDENCE_LABELS = new Set(['read-scope','rehearsal-before','rehearsal-rollback','write-before','write-locked','write-after','rollback','postcommit']);
export async function rehearse(db,p,queries,env,hooks={}) {
    const phase=hooks.phase??(async()=>{}),capture=hooks.capture??(async()=>{});let before,result,failure;
    await phase('transaction_begin');await db.query('begin isolation level serializable');
    try {
        await phase('transaction_settings');await db.query("set local statement_timeout='45s'");await db.query("set local lock_timeout='5s'");
        await phase('transaction_lock');await db.query("select pg_advisory_xact_lock(hashtext('stackr-artwork3303-publication'))");
        before=await readState(db,queries,p,env,hooks);const mode=classify(before,p,env).mode;
        if(env==='staging')same(mode,'fresh','PERSISTENT_STAGE_MUTATION');await capture('rehearsal-before',before);
        result=await writeMetadata(db,p,queries,env,hooks);
    } catch(e) { failure=e;throw e; }
    finally { if(failure)await db.query('rollback').catch(()=>{});else {await phase('transaction_rollback');await db.query('rollback');} }
    const after=await readState(db,queries,p,env,hooks);classify(after,p,env);same(after,before,'EXACT_TRANSACTION_ROLLBACK_FAILED');await capture('rehearsal-rollback',after);
    return {status:'passed_and_exactly_rolled_back',environment:env,mode:result.mode,before_rows:before.snapshot.length,temporary_rows:result.afterRows,after_rollback_rows:after.snapshot.length,before_sha256:CH(before.snapshot),after_rollback_sha256:CH(after.snapshot),source_changes:0,variant_changes:0,old_reverse_changes:0,old_link_changes:0};
}
function publicResult(r, p) { return { environment: r.environment, mode: r.mode, before_rows: r.beforeRows, after_rows: r.afterRows, after_snapshot_sha256: r.afterSnapshotHash, assets: [{ id: r.asset.id, printing_id: r.asset.printing_id, variant_id: r.asset.variant_id, source_variant_id: r.asset.variant_id, sha256: r.asset.content_sha256, created: r.mode === 'fresh' }], links: [{ catalogue_version_id: r.link.catalogue_version_id, asset_id: r.asset.id, printing_id: r.link.printing_id, variant_id: r.link.variant_id, created: r.mode === 'fresh' }], supersession: { old_asset_id: p.identity.oldNormalAssetId, old_before_updated_at: r.oldBeforeUpdatedAt, old_after_updated_at: r.oldAfterUpdatedAt, old_public_flag: [true, false], allowed_fields: ['publicly_servable', 'updated_at'], old_immutable_sha256: r.oldImmutableSHA }, source_changes: 0, variant_changes: 0, old_reverse_changes: 0, old_link_changes: 0, quality_upgrade_count: 1, missing_artwork_count_delta: 0 }; }
export async function publishUpgrade({ plan, queries, root, output, env = process.env, deps = {} }) {
    assertConfig(env);
    validatePlan(plan);
    check(root && output, 'OUTPUT_AND_PACKAGE_REQUIRED');
    await mkdir(output, { recursive: true });
    const policy = deps.transferPolicy ?? createTransferPolicy(), journal = createPublicationJournal({ cohort_sha256: PLAN_SHA }, policy);
    journal.revision = env.GITHUB_SHA;
    journal.work_type = 'QUALITY_UPGRADE';
    journal.missing_artwork_count_delta = 0;
    const save = () => writeFile(path.join(output, 'receipt.json'), JSON.stringify(journal, null, 2) + '\n');
    journal.phase = 'preflight'; journal.query_phase = null; journal.evidence = [];
    await save();
    const phase = async label => { check(PHASES.has(label), 'UNSAFE_PHASE'); journal.phase=label; journal.query_phase=null; await save(); };
    const hooksFor = context => ({ phase: async label => { check(QUERY_PHASES.has(label), 'UNSAFE_QUERY_PHASE'); journal.query_phase=label; await save(); }, capture: async (label, value) => { check(PHASES.has(context)&&EVIDENCE_LABELS.has(label), 'UNSAFE_EVIDENCE_LABEL'); const name='evidence/'+String(journal.evidence.length+1).padStart(3,'0')+'-'+context+'-'+label+'.json', bytes=Buffer.from(JSON.stringify(value,null,2)+'\n'); await mkdir(path.join(output,'evidence'),{recursive:true});await writeFile(path.join(output,name),bytes,{flag:'wx'});journal.evidence.push({file:name,bytes:bytes.length,sha256:digest(bytes)});await save(); } });
    let db, connected = false, committed = false, commitAttempted = false;
    const source = deps.readLocal ?? (o => readFile(safePath(root, String(plan.archive.id) + '/' + o.file)));
    try {
        const require = createRequire(new URL('../../backend/package.json', import.meta.url)), sharp = deps.sharp ?? require('sharp');
        sharp.concurrency(2);
        const validate = deps.validateBytes ?? ((b, o) => validateBytes(sharp, b, o));
        await phase('local_files');
        for (const o of plan.objects)
            await validate(await source(o), o);
        journal.local_files_verified = 4;
        await save();
        let createDb = deps.createDb;
        if (!createDb) {
            const m = await import('../../scripts/deploy/verified-supabase-postgres.mjs');
            createDb = (connection, name) => m.createVerifiedSupabasePostgresClient(connection, name, { connectionTimeoutMillis: 15000 });
        }
        await phase('staging_connect');
        db = createDb(env.SUPABASE_STAGING_DB_URL, 'stackr-owner-bulbasaur-staging');
        await db.connect();
        connected = true;
        await phase('staging_rehearsal');
        journal.staging_rehearsal = await rehearse(db, plan, queries, 'staging', hooksFor('staging_rehearsal'));
        await save();
        await db.end();
        connected = false;
        await phase('production_connect');
        db = createDb(env.SUPABASE_DB_URL, 'stackr-owner-bulbasaur-production');
        await db.connect();
        connected = true;
        await phase('production_rehearsal');
        journal.production_rehearsal = await rehearse(db, plan, queries, 'production', hooksFor('production_rehearsal'));
        await save();
        let client = deps.storageClient;
        if (!client) {
            const secret = await resolveServerKey({ project: PROJECTS.production, configuredKey: env.SUPABASE_PRODUCTION_SECRET_KEY, accessToken: env.SUPABASE_ACCESS_TOKEN, mask: k => { if (env.GITHUB_ACTIONS === 'true')
                    process.stdout.write('::add-mask::' + k + '\n'); } });
            client = require('@supabase/supabase-js').createClient('https://' + PROJECTS.production + '.supabase.co', secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(60000), redirect: 'error' }) } });
        }
        await phase('storage_policy');
        const bucket = await client.storage.getBucket(BUCKET);
        check(!bucket.error && bucket.data?.public === true, 'PUBLIC_BUCKET_POLICY');
        await phase('storage_presence');
        const existingRows = (await db.query('select name from storage.objects where bucket_id=$1 and name=any($2::text[])', [BUCKET, plan.objects.map(o => o.storage_key)])).rows;
        const existing=new Set(existingRows.map(r=>r.name));
        check(existingRows.length===existing.size && [...existing].every(k=>plan.objects.some(o=>o.storage_key===k)), 'IMMUTABLE_OBJECT_SET_CONFLICT');
        check(plan.objects.every(o=>existing.has(o.storage_key)), 'IMMUTABLE_OBJECT_MISSING_REACQUIRE_FORBIDDEN');
        const read = deps.readPublic ?? ((url) => readPublicObject(url, { transferPolicy: policy }));
        const url = o => 'https://' + PROJECTS.production + '.supabase.co/storage/v1/object/public/' + BUCKET + '/' + o.storage_key;
        await phase('object_reuse_verify');
        const outcomes = await Promise.allSettled(plan.objects.map(async o => { const record={key:o.storage_key,sha256:o.sha256,created:false,reused:true,verified:false};journal.objects.push(record);await validate(await read(url(o)),o);record.verified=true; }));
        await save();
        const failed = outcomes.find(r => r.status === 'rejected');
        if (failed)
            throw failed.reason;
        await phase('production_publish');const productionHooks=hooksFor('production_publish');
        await productionHooks.phase('transaction_begin');
        await db.query('begin isolation level serializable');
        await productionHooks.phase('transaction_settings');
        await db.query("set local statement_timeout='45s'");
        await db.query("set local lock_timeout='5s'");
        await productionHooks.phase('transaction_lock');
        await db.query("select pg_advisory_xact_lock(hashtext('stackr-artwork3303-publication'))");
        const result = await writeMetadata(db, plan, queries, 'production', productionHooks);
        const rollback = rollbackReceipt(result, plan);
        await productionHooks.capture('rollback',rollback);
        await writeFile(path.join(output, 'rollback-receipt.json'), JSON.stringify(rollback, null, 2) + '\n');
        await writeFile(path.join(output, 'rollback.sql'), rollbackSql(rollback));
        Object.assign(journal, publicResult(result, plan));
        journal.status = 'commit_intent';
        await save();
        await phase('production_commit');await productionHooks.phase('transaction_commit');
        commitAttempted = true;
        await db.query('commit');
        committed = true;
        journal.status = 'published';
        await save();
        await phase('postcommit_state');const afterHooks=hooksFor('postcommit_state');
        const after = await readState(db, queries, plan, 'production', afterHooks);
        same(classify(after, plan, 'production').mode, 'published', 'POSTCOMMIT_STATE_CONFLICT');
        await afterHooks.capture('postcommit',after);
        await phase('postcommit_public_bytes');
        for (const o of plan.objects)
            await validate(await read(url(o)), o);
        journal.postcommit_public_objects_verified = 4;
        journal.status = 'published_manifest_and_public_bytes_verified';
        journal.fronts = 1;
        journal.derivatives = 3;
        journal.verified_at = new Date().toISOString();
        await phase('complete');
        await save();
        return journal;
    }
    catch (e) {
        if (connected && !committed)
            await db.query('rollback').catch(() => { });
        journal.status = committed ? 'published_verification_failed' : commitAttempted ? 'commit_outcome_unknown' : 'failed_before_publication';
        journal.error = safeError(e);
        journal.failure_phase=journal.phase; journal.failure_query_phase=journal.query_phase; journal.sqlstate=safeSQLState(e);
        await save();
        throw Error(journal.error);
    }
    finally {
        if (connected)
            await db.end();
    }
}
async function main() { check(process.argv.includes('--execute'), 'EXPLICIT_EXECUTE_REQUIRED'); assertConfig(process.env); const { plan, queries } = await loadFrozen(); await publishUpgrade({ plan, queries, root: process.env.STACKR_OWNER_BULBASAUR_PACKAGES, output: process.env.STACKR_OWNER_BULBASAUR_OUTPUT }); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    main().catch(e => { console.error(safeError(e)); process.exitCode = 1; });
