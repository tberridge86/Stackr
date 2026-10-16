import{createHash as __createHash}from'node:crypto';const __digest=b=>__createHash('sha256').update(b).digest('hex');
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadFrozen, validatePlan, IDS, CH, ordered, withoutMutable, dependencyBytesMatch } from './frozen.mjs';
import { payload, classify, writeMetadata, pgImmutableSQL } from './metadata.mjs';
import { assertConfig, publishUpgrade, rehearse, safeError } from './publish.mjs';
import { rollbackReceipt, rollbackSql, validateRollback, assertRollbackState } from './rollback.mjs';
const frozen = await loadFrozen(), clone = structuredClone, OLD = '2026-08-12T18:14:40.182+00:00', NOW = '2026-10-16T19:00:00.123456+00:00';
function fixture(env) { const p = clone(frozen.plan), b = p.baselines[env], sourceRows = b.sourceRows, rows = []; for (const k of Object.keys(b.rowHashes)) {
    const at = k.indexOf(':'), scope = k.slice(0, at), id = k.slice(at + 1);
    let a = { id };
    if (scope === 'assets') {
        a = Object.fromEntries(b.assetColumns.map(k => [k, null]));
        Object.assign(a, { id, asset_id: id, asset_type: 'set_logo', set_id: IDS.set, publicly_servable: true, retention_status: 'active', created_at: OLD, updated_at: OLD });
        if (id === IDS.old || id === IDS.oldReverse)
            Object.assign(a, { asset_type: 'card_image', set_id: null, variant_id: id === IDS.old ? IDS.normal : IDS.reverse, content_sha256: 'c49ce59dce0335285c23f446678e3956060d529ad0064fc3b290bb88ef6f547c', retention_status: id === IDS.old ? 'active' : 'unavailable', publicly_servable: id === IDS.old || env === 'staging', unavailable_reason: id === IDS.old ? null : 'duplicate_content:' + IDS.old });
    }
    if (scope === 'sources') {
        const code = sourceRows.find(r => r.id === id).code;
        a = { id, code, active: !['pricecharting', 'scrydex', 'pokellector', 'tcgcollector'].includes(code), base_url: 'https://' + code + '.example.invalid', terms_url: null, created_at: OLD, updated_at: OLD, source_type: 'image', display_name: code, deprecated_at: null, robots_policy: null, internal_notes: 'Harmless synthetic unit-test source fixture', licence_status: code === 'pricecharting' ? 'under_review' : 'approved', deprecated_reason: null, rate_limit_config: {}, source_updated_at: null, attribution_required: true };
    }
    if (scope === 'links') {
        const [v, asset] = id.split(':');
        a = { catalogue_version_id: v, asset_id: asset, language_code: 'en', set_id: null, printing_id: null, variant_id: asset === IDS.old ? IDS.normal : null, asset_type: asset === IDS.old ? 'card_image' : 'set_logo', created_at: OLD };
    }
    if (scope === 'variants')
        Object.assign(a, { printing_id: IDS.printing, variant_code: id === IDS.normal ? 'normal' : 'reverse_holo', finish_code: id === IDS.normal ? 'normal' : 'reverse_holo', is_default: id === IDS.normal, native_image_status: id === IDS.reverse && env === 'production' ? 'same_artwork_reference' : 'available', same_artwork_as_variant_id: id === IDS.reverse && env === 'production' ? IDS.normal : null });
    if (scope === 'versions')
        Object.assign(a, { language_code: 'en', status: id === b.publishedVersionId ? 'published' : 'deprecated' });
    rows.push({ scope, identity: id, payload: a });
} const snapshot = ordered(rows), bindings = snapshot.filter(r => r.scope === 'variants').map(r => r.payload), views = { unitFixture: true, env }, state = { snapshot, bindings, views, manifest: [{ asset_id: IDS.old, unitFixture: true }] }; b.rowHashes = Object.fromEntries(snapshot.map(r => [r.scope + ':' + r.identity, CH(r.payload)])); b.snapshotHash = CH(snapshot); b.bindingsHash = CH(bindings); b.viewsHash = CH(views); b.manifestHash = CH(state.manifest); b.oldNormalImmutableHash = CH(withoutMutable(snapshot.find(r => r.identity === IDS.old).payload)); b.oldNormalBeforeUpdatedAt = OLD; return { p, state }; }
class DB {
    constructor(f, env, options = {}) { this.plan = f.p; this.state = clone(f.state); this.env = env; this.options = options; this.calls = []; this.backup = null; this.seq = env === 'production' ? '00000000-0000-4000-8000-000000000111' : '00000000-0000-4000-8000-000000000112'; }
    async connect() { if (this.options.connectFail)
        throw Error('CONNECT_REJECTED'); }
    async end() { }
    row(id) { return this.state.snapshot.find(r => r.scope === 'assets' && r.identity === id).payload; }
    async query(sql, params = []) { this.calls.push(sql); if (sql.startsWith('begin')) {
        assert(!this.backup);
        this.backup = clone(this.state);
        return { rows: [] };
    } if (sql === 'rollback') {
        if (this.backup)
            this.state = this.backup;
        this.backup = null;
        return { rows: [] };
    } if (sql === 'commit') {
        if (this.options.unknownCommit) {
            this.backup = null;
            this.options.unknownCommit = false;
            throw Error('COMMIT_RESPONSE_LOST');
        }
        this.backup = null;
        return { rows: [] };
    } if (sql.startsWith('set local') || sql.includes('pg_advisory_xact_lock') || sql.includes('bulba:lock') || sql.includes('bulba:links-lock'))
        return { rows: [] }; if (sql === frozen.queries['before-query.sql'])
        return { rows: clone(ordered(this.state.snapshot)) }; if (sql === frozen.queries['bindings-query.sql'])
        return { rows: [{ snapshot: { cards: clone(this.state.bindings) } }] }; if (sql === frozen.queries['views-query.sql'])
        return { rows: [{ snapshot: clone(this.state.views) }] }; if (sql === frozen.queries['manifest-query.sql'])
        return { rows: this.state.manifest.map(payload => ({ payload: clone(payload) })) }; if (sql === pgImmutableSQL)
        return { rows: [{ immutable_sha256: CH(withoutMutable(this.row(params[0]))) }] }; if (sql.startsWith('select name from storage.objects'))
        return { rows: (this.storageKeys ?? []).map(name => ({ name })) }; if (sql.includes('bulba:source-insert')) {
        const a = { id: '00000000-0000-4000-8000-000000000113', terms_url: null, created_at: NOW, updated_at: NOW, deprecated_at: null, robots_policy: null, deprecated_reason: null, rate_limit_config: {}, source_updated_at: null, ...JSON.parse(params[0]) };
        this.state.snapshot.push({ scope: 'sources', identity: a.id, payload: a });
        return { rows: [{ payload: clone(a) }] };
    } if (sql.includes('bulba:asset-insert')) {
        if (this.options.insertFail)
            throw Error('ASSET_INSERT_REJECTED');
        const a = { ...JSON.parse(params[0]), id: this.seq, created_at: NOW, updated_at: NOW };
        this.state.snapshot.push({ scope: 'assets', identity: a.id, payload: a });
        return { rows: [{ payload: clone(a) }] };
    } if (sql.includes('bulba:link-insert')) {
        const a = { ...JSON.parse(params[0]), created_at: NOW };
        this.state.snapshot.push({ scope: 'links', identity: a.catalogue_version_id + ':' + a.asset_id, payload: a });
        return { rows: [{ payload: clone(a) }] };
    } if (sql.includes('bulba:old-hide')) {
        const a = this.row(IDS.old);
        if (this.options.oldHideConflict)
            return { rows: [] };
        assert.deepEqual(a, JSON.parse(params[1]));
        assert.equal(a.publicly_servable, true);
        a.publicly_servable = false;
        a.updated_at = NOW;
        const replacement = this.row(this.seq), m = { ...clone(replacement), asset_row_id: replacement.id, catalogue_version_id: this.plan.baselines[this.env].publishedVersionId };
        this.state.manifest = [m];
        return { rows: [{ payload: clone(a) }] };
    } throw Error('UNEXPECTED_TEST_SQL'); }
}
const validEnv = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_OWNER_BULBASAUR_CONFIRMATION: 'PUBLISH OWNER BULBASAUR MEW001 UPGRADE', SUPABASE_DB_URL: 'postgresql://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres', SUPABASE_STAGING_DB_URL: 'postgresql://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', STACKR_OWNER_BULBASAUR_PACKAGES: 'unit-package', STACKR_OWNER_BULBASAUR_OUTPUT: 'unit-output' };
test('actual frozen scope and protected config', () => { validatePlan(frozen.plan); assertConfig(validEnv); });
for (const [k, v] of Object.entries({ GITHUB_ACTIONS: 'false', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/other', GITHUB_SHA: 'b'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'bad', STACKR_OWNER_BULBASAUR_CONFIRMATION: 'YES', SUPABASE_DB_URL: 'postgresql://postgres@db.other.supabase.co/postgres', SUPABASE_STAGING_DB_URL: 'https://example.invalid', STACKR_OWNER_BULBASAUR_PACKAGES: '' }))
    test('config rejects ' + k, () => assert.throws(() => assertConfig({ ...validEnv, [k]: v })));
for (const [name, change] of [['null source variant', p => p.identity.newSourceVariantId = null], ['reverse asset', p => p.identity.newAssetVariantId = IDS.reverse], ['wrong language', p => p.identity.languageCode = 'ja'], ['invent source approval', p => p.sourceAuthorFlags.selection = true], ['wrong card', p => p.witness.actual_printed_name = 'Charmander'], ['wrong printed collector', p => p.printedSignature.collectorFraction = '1b/165'], ['wrong source URL', p => p.sourceImageURL += '?fake'], ['upscale', p => p.objects[3].width = 720], ['HD claim', p => p.quality.HDOriginalCertified = true], ['missing count', p => p.accounting.fixedMissingLiveCountDelta = 1]])
    test('frozen scope rejects ' + name, () => { const p = clone(frozen.plan); change(p); assert.throws(() => validatePlan(p)); });
for (const env of ['production', 'staging']) {
    test(env + ' inserts one exact normal asset/link, hides only old normal and preserves full baseline', async () => { const f = fixture(env), db = new DB(f, env); assert.equal(classify(clone(f.state), f.p, env).mode, 'fresh'); const r = await writeMetadata(db, f.p, frozen.queries, env); assert.equal(r.mode, 'fresh'); assert.equal(r.asset.variant_id, IDS.normal); assert.equal(db.state.snapshot.length, env === 'production' ? 30 : 26); assert.equal(db.row(IDS.old).publicly_servable, false); assert.equal(db.row(IDS.oldReverse).publicly_servable, env === 'staging'); const repeated = await writeMetadata(db, f.p, frozen.queries, env); assert.equal(repeated.mode, 'published'); assert.equal(db.calls.filter(s => s.includes('bulba:asset-insert')).length, 1); });
    test(env + ' rehearsal restores exact trigger timestamp, source17 and prior links', async () => { const f = fixture(env), db = new DB(f, env), initial = clone(db.state); const r = await rehearse(db, f.p, frozen.queries, env); assert.deepEqual(db.state, initial); assert.equal(db.row(IDS.old).updated_at, OLD); assert.equal(r.after_rollback_rows, env === 'production' ? 28 : 23); });
    for (const [name, change] of [['printing', s => s.snapshot.find(r => r.scope === 'printings').payload.extra = 'wrong'], ['source17 microseconds', s => s.snapshot.find(r => r.scope === 'sources').payload.updated_at += '0'], ['old reverse public flag', s => s.snapshot.find(r => r.identity === IDS.oldReverse).payload.publicly_servable = !s.snapshot.find(r => r.identity === IDS.oldReverse).payload.publicly_servable], ['variant pointer', s => s.snapshot.find(r => r.scope === 'variants' && r.identity === IDS.reverse).payload.same_artwork_as_variant_id = 'wrong'], ['old public flag without batch', s => s.snapshot.find(r => r.identity === IDS.old).payload.publicly_servable = false], ['old source', s => s.snapshot.find(r => r.identity === IDS.old).payload.source_id = 'wrong'], ['old retention', s => s.snapshot.find(r => r.identity === IDS.old).payload.retention_status = 'superseded'], ['missing link', s => s.snapshot.splice(s.snapshot.findIndex(r => r.scope === 'links'), 1)], ['duplicate', s => s.snapshot.push(clone(s.snapshot[0]))], ['bindings', s => s.bindings[0].extra = 'wrong'], ['audit trigger', s => s.views.extra = 'wrong'], ['visible asset', s => s.manifest.push({ asset_id: 'wrong' })]])
        test(env + ' rejects before drift: ' + name, () => { const f = fixture(env); change(f.state); assert.throws(() => classify(f.state, f.p, env)); });
    for (const [name, change] of [['new rejected rights', s => s.snapshot.find(r => r.scope === 'assets' && r.identity.startsWith('00000000')).payload.rights_status = 'rejected'], ['new null variant', s => s.snapshot.find(r => r.scope === 'assets' && r.identity.startsWith('00000000')).payload.variant_id = null], ['new wrong SHA', s => s.snapshot.find(r => r.scope === 'assets' && r.identity.startsWith('00000000')).payload.content_sha256 = 'f'.repeat(64)], ['new wrong provenance', s => s.snapshot.find(r => r.scope === 'assets' && r.identity.startsWith('00000000')).payload.source_id = 'wrong'], ['new changed row', s => s.snapshot.find(r => r.scope === 'assets' && r.identity.startsWith('00000000')).payload.updated_at = OLD], ['new modified notes', s => s.snapshot.find(r => r.scope === 'assets' && r.identity.startsWith('00000000')).payload.licensing_review_notes = '{}'], ['new missing link', s => s.snapshot.splice(s.snapshot.findIndex(r => r.scope === 'links' && r.payload.asset_id.startsWith('00000000')), 1)], ['old still visible', s => s.snapshot.find(r => r.identity === IDS.old).payload.publicly_servable = true], ['old extra field', s => s.snapshot.find(r => r.identity === IDS.old).payload.extra = 'wrong'], ['new wrong manifest', s => s.manifest[0].variant_id = IDS.reverse]])
        test(env + ' rejects unknown/incomplete recovery: ' + name, async () => { const f = fixture(env), db = new DB(f, env); await writeMetadata(db, f.p, frozen.queries, env); change(db.state); assert.throws(() => classify(db.state, f.p, env)); });
    test(env + ' old exact-row UPDATE conflict is rejected inside rollback', async () => { const f = fixture(env), db = new DB(f, env, { oldHideConflict: true }), initial = clone(db.state); await assert.rejects(rehearse(db, f.p, frozen.queries, env)); assert.deepEqual(db.state, initial); });
}
test('staging activated temporary provenance is rejected', async () => { const f = fixture('staging'), db = new DB(f, 'staging'); await writeMetadata(db, f.p, frozen.queries, 'staging'); db.state.snapshot.find(r => r.scope === 'sources' && r.payload.code === 'pricecharting').payload.active = true; assert.throws(() => classify(db.state, f.p, 'staging')); });
test('rollback receipts reject altered hashes, IDs, timestamps and changed live rows', async () => { const f = fixture('production'), db = new DB(f, 'production'), result = await writeMetadata(db, f.p, frozen.queries, 'production'), r = rollbackReceipt(result, f.p), old = db.row(IDS.old), a = db.row(db.seq), fps = { old: r.old_immutable_pg_sha256, replacement: r.new_immutable_pg_sha256 }; assertRollbackState(old, a, fps, r); assert.match(rollbackSql(r), /FOR UPDATE/); assert.match(rollbackSql(r), /sha256\(convert_to/); assert.match(rollbackSql(r), /COMMIT/); assert.doesNotMatch(rollbackSql(r), /internal_notes|source_payload|postgres:/); for (const change of [x => x.new_asset_id = IDS.old, x => x.source_sha256 = 'f'.repeat(64), x => x.old_after_updated_at = "bad';DELETE", x => x.old_immutable_pg_sha256 = 'bad']) {
    const bad = clone(r);
    change(bad);
    assert.throws(() => validateRollback(bad));
} assert.throws(() => assertRollbackState({ ...old, updated_at: OLD }, a, fps, r)); assert.throws(() => assertRollbackState(old, { ...a, publicly_servable: false }, fps, r)); assert.throws(() => assertRollbackState(old, a, { ...fps, old: 'f'.repeat(64) }, r)); });
async function runHarness(options = {}) { const prod = fixture('production'), stage = fixture('staging'); prod.p.baselines.staging = stage.p.baselines.staging; stage.p = prod.p; const dbs = { production: new DB(prod, 'production', options.prodDB ?? {}), staging: new DB(stage, 'staging', options.stageDB ?? {}) }, out = await mkdtemp(path.join(os.tmpdir(), 'bulba-publisher-')), data = o => Buffer.from('synthetic-transport-fixture:' + o.role), stored = new Map(options.emptyStorage ? [] : prod.p.objects.map(o => [o.storage_key, data(o)])); dbs.production.storageKeys = [...stored.keys()]; let publicReads = 0, uploads = 0; const deps = { sharp: { concurrency() { } }, readLocal: async (o) => data(o), validateBytes: async (b, o) => { assert.deepEqual(b, data(o)); if (options.localFail)
        throw Error('OBJECT_BYTES_CHANGED'); }, createDb: (_url, name) => dbs[name.endsWith('staging') ? 'staging' : 'production'], transferPolicy: { receipt: { concurrency: 2, min_interval_ms: 700 }, run: async (f) => f() }, wait: async () => { }, storageClient: { storage: { getBucket: async () => ({ data: { public: true } }), from: () => ({ upload: async (k, b, opts) => { uploads++; assert.equal(opts.upsert, false); stored.set(k, b); return { data: {} }; } }) } }, readPublic: async (url) => { publicReads++; if (options.publicFail || (options.publicFailAfterCommit && publicReads > 4))
        throw Object.assign(Error('PUBLIC_READ_REJECTED'), { status: 403 }); const o = prod.p.objects.find(o => url.endsWith(o.storage_key)); assert(o); return options.publicWrongBytes ? Buffer.from('wrong-immutable-bytes') : stored.get(o.storage_key); } }; if (options.seedPublished) {
    await writeMetadata(dbs.production, prod.p, frozen.queries, 'production');
    dbs.production.calls = [];
} try {
    const result = await publishUpgrade({ plan: prod.p, queries: frozen.queries, root: 'synthetic-unit-transport', output: out, env: validEnv, deps });
    return { result, dbs, publicReads, uploads, receipt: JSON.parse(await readFile(path.join(out, 'receipt.json'), 'utf8')) };
}
catch (error) {
    return { error, dbs, publicReads, uploads, receipt: JSON.parse(await readFile(path.join(out, 'receipt.json'), 'utf8')) };
}
finally {
    assert(path.resolve(out).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await rm(out, { recursive: true, force: true });
} }
test('complete orchestrator reuses identical objects and verifies four public objects before and after commit', async () => { const r = await runHarness(); assert.ifError(r.error); assert.equal(r.uploads, 0); assert.equal(r.publicReads, 8); assert.equal(r.receipt.objects.length, 4); assert(r.receipt.objects.every(o => o.verified && !o.created)); assert.equal(r.receipt.status, 'published_manifest_and_public_bytes_verified'); assert.equal(r.receipt.staging_rehearsal.after_rollback_rows, 23); assert.equal(r.receipt.missing_artwork_count_delta, 0); });
test('immutable new object writes use upsert:false and bounded transfer', async () => { const r = await runHarness({ emptyStorage: true }); assert.ifError(r.error); assert.equal(r.uploads, 4); assert(r.receipt.objects.every(o => o.created && o.verified)); });
test('local bytes fail before any DB/storage mutation and initialized receipt persists', async () => { const r = await runHarness({ localFail: true }); assert.equal(r.receipt.status, 'failed_before_publication'); assert.equal(r.publicReads, 0); assert.equal(r.dbs.production.calls.length, 0); });
test('guarded DB setup failure retains journal', async () => { const r = await runHarness({ stageDB: { connectFail: true } }); assert.equal(r.receipt.status, 'failed_before_publication'); assert.equal(r.receipt.local_files_verified, 4); assert.equal(r.uploads, 0); });
test('public byte failure prevents metadata commit', async () => { const r = await runHarness({ publicFail: true }); assert.equal(r.receipt.status, 'failed_before_publication'); assert.equal(r.dbs.production.state.snapshot.length, 28); assert.equal(r.dbs.production.row(IDS.old).publicly_servable, true); });
test('uncertain committed response preserves commit-intent receipt and exact state is recoverable', async () => { const r = await runHarness({ prodDB: { unknownCommit: true } }); assert.equal(r.receipt.status, 'commit_outcome_unknown'); assert.equal(r.dbs.production.state.snapshot.length, 30); assert.equal(classify(r.dbs.production.state, r.dbs.production.plan, 'production').mode, 'published'); });
test('untrusted error messages cannot expose credentials in receipts', () => { assert.equal(safeError(Error('postgresql://private-secret@example.invalid')), 'PUBLICATION_OPERATION_FAILED'); });
test('known committed cohort is reused without inserting or changing the old normal again', async () => { const r = await runHarness({ seedPublished: true }); assert.ifError(r.error); assert.equal(r.receipt.mode, 'published'); assert.equal(r.receipt.assets[0].created, false); assert.equal(r.receipt.links[0].created, false); assert(!r.dbs.production.calls.some(s => s.includes('bulba:asset-insert') || s.includes('bulba:old-hide'))); });
test('incorrect public object bytes are rejected before metadata commit', async () => { const r = await runHarness({ publicWrongBytes: true }); assert.equal(r.receipt.status, 'failed_before_publication'); assert.equal(r.dbs.production.state.snapshot.length, 28); });
test('postcommit public read failure is explicit and never silently rolls back committed data', async () => { const r = await runHarness({ publicFailAfterCommit: true }); assert.equal(r.receipt.status, 'published_verification_failed'); assert.equal(r.dbs.production.state.snapshot.length, 30); assert.equal(r.dbs.production.row(IDS.old).publicly_servable, false); });

test('dependency byte guard allows only the two separately pinned exact line-ending forms',()=>{const git=Buffer.from('verified\ntext\n'),windows=Buffer.from('verified\r\ntext\r\n');const sha=b=>__digest(b);const p={bytes:git.length,sha256:sha(git),checkoutBytes:windows.length,checkoutSha256:sha(windows)};assert(dependencyBytesMatch(git,p));assert(dependencyBytesMatch(windows,p));assert(!dependencyBytesMatch(Buffer.from('changed\ntext\n'),p));assert(!dependencyBytesMatch(Buffer.from('verified\rtext\n'),p));});

const reviewedPackagePin = { file: 'package.json', bytes: 37633, sha256: '3ade21dfefd7b39399e9d62d07dd90261dd1ef4c9dc79af6e66f3053b1110f2f', checkoutBytes: 37949, checkoutSha256: '6ae940f7b60904598072d20e58db9932523bbcbb603ab45913017072ecc6919a', checkoutDifference: 'Verified CRLF/LF only; both exact byte forms pinned' };
async function reviewedPackageForms() { const actual = await readFile(new URL('../../package.json', import.meta.url)); const raw = Buffer.from(actual.toString('utf8').replaceAll('\r\n', '\n')); assert.equal(__digest(raw), reviewedPackagePin.sha256); const checkout = Buffer.from(raw.toString('utf8').replaceAll('\n', '\r\n')); assert.equal(__digest(checkout), reviewedPackagePin.checkoutSha256); return { actual, raw, checkout }; }
test('merged main root package pin contains exactly the reviewed Git and checkout fingerprints', async () => { const pins = JSON.parse(await readFile(new URL('freeze-inputs.json', import.meta.url))); assert.deepEqual(pins.additionalDependencyFiles.find(p => p.file === 'package.json'), reviewedPackagePin); assert.equal(pins.proof.mergedMainSHA, '9c70b88040f88c82c1b4e92eb2551fa142183593'); });
test('merged main package accepts both separately proven exact byte forms and actual checkout', async () => { const {actual, raw, checkout} = await reviewedPackageForms(); assert.equal(raw.length, reviewedPackagePin.bytes); assert.equal(checkout.length, reviewedPackagePin.checkoutBytes); for (const b of [actual, raw, checkout]) assert(dependencyBytesMatch(b, reviewedPackagePin)); assert.equal(JSON.parse(raw).scripts['test:traditional-chinese-hires-logos'], 'node --import tsx scripts/test-traditional-chinese-hires-logos.ts && node --import tsx scripts/test-traditional-chinese-set-logo-review.ts'); });
test('package repin rejects both prior-main byte forms', async () => { const {raw} = await reviewedPackageForms(); const old = Buffer.from(raw.toString('utf8').split('\n').filter(line => !line.startsWith('    "test:traditional-chinese-hires-logos":')).join('\n')); const oldCheckout = Buffer.from(old.toString('utf8').replaceAll('\n', '\r\n')); assert.equal(old.length, 37447); assert.equal(__digest(old), 'e57c701d03c27e62a8f69170365ea76f6f3462abc391952c3c502ba464568966'); assert.equal(__digest(oldCheckout), '76b92aa3f772104921b15218a5597b750b1004dc69adf31eee1e18f0a0f5d02c'); assert(!dependencyBytesMatch(old, reviewedPackagePin)); assert(!dependencyBytesMatch(oldCheckout, reviewedPackagePin)); });
test('package repin rejects same-length unexpected content in either line-ending form', async () => { const {raw, checkout} = await reviewedPackageForms(); for (const b of [raw, checkout]) { const altered = Buffer.from(b); const at = altered.indexOf(Buffer.from('test:traditional-chinese-hires-logos')); assert(at > 0); altered[at] = 'x'.charCodeAt(0); assert.equal(altered.length, b.length); assert(!dependencyBytesMatch(altered, reviewedPackagePin)); } });
test('package repin rejects unpinned EOL, BOM and trailing-byte variants', async () => { const {raw, checkout} = await reviewedPackageForms(); for (const altered of [Buffer.from(raw.toString('utf8').replace('\n', '\r\n')), Buffer.from(checkout.toString('utf8').replace('\r\n', '\n')), Buffer.concat([Buffer.from([239,187,191]),raw]), Buffer.concat([raw,Buffer.from('\n')]), Buffer.from(raw.toString('utf8').replaceAll('\n','\r'))]) assert(!dependencyBytesMatch(altered, reviewedPackagePin)); });
