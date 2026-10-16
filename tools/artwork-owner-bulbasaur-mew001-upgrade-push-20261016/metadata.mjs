import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { IDS, PLAN_SHA, APPROVAL_SHA, CH, same, key, ordered, withoutMutable } from './frozen.mjs';
export const STAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/;
export const VISIBLE_MANIFEST_SQL = 'SELECT to_jsonb(m) AS payload FROM api.asset_manifest m WHERE asset_row_id=ANY($1::uuid[]) AND catalogue_version_id=ANY($2::uuid[]) ORDER BY catalogue_version_id,asset_row_id LIMIT 21';
const unique = values => [...new Set(values)].sort();
const sortedLinks = links => [...links].sort((a,b) => (a.catalogue_version_id+':'+a.asset_id).localeCompare(b.catalogue_version_id+':'+b.asset_id));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function expectedManifestScope(snapshot, bindings) {
    const variants = snapshot.filter(r=>r.scope==='variants' && (r.payload.printing_id===IDS.printing || [IDS.normal,IDS.reverse].includes(r.identity))).map(r=>r.identity);
    const relevant = a => a.printing_id===IDS.printing || variants.includes(a.variant_id);
    const assets = snapshot.filter(r=>r.scope==='assets' && (relevant(r.payload) || [IDS.old,IDS.oldReverse].includes(r.identity))).map(r=>r.identity);
    const links = sortedLinks(snapshot.filter(r=>r.scope==='links' && (assets.includes(r.payload.asset_id)||relevant(r.payload))).map(r=>({asset_id:r.payload.asset_id,catalogue_version_id:r.payload.catalogue_version_id})));
    const bindingVersions = bindings.map(c=>c.catalogue_version_id).filter(Boolean);
    const publishedVersions = snapshot.filter(r=>r.scope==='versions' && r.payload.language_code==='en' && r.payload.status==='published').map(r=>r.identity);
    return completeManifestScope({variant_ids:unique(variants),base_asset_ids:unique(assets),link_rows:links}, [...bindingVersions,...publishedVersions]);
}
export function completeManifestScope(raw, bindingVersions=[]) {
    same(Object.keys(raw).sort(),['base_asset_ids','link_rows','variant_ids']);
    check(Array.isArray(raw.variant_ids)&&raw.variant_ids.length<5,'MANIFEST_VARIANT_SCOPE_OVERFLOW');
    check(Array.isArray(raw.base_asset_ids)&&raw.base_asset_ids.length<21,'MANIFEST_ASSET_SCOPE_OVERFLOW');
    check(Array.isArray(raw.link_rows)&&raw.link_rows.length<41,'MANIFEST_LINK_SCOPE_OVERFLOW');
    for(const a of [raw.variant_ids,raw.base_asset_ids]) { check(a.every(id=>typeof id==='string'&&UUID.test(id)),'MANIFEST_SCOPE_UUID'); same(a,unique(a),'MANIFEST_SCOPE_ID_DUPLICATE_OR_ORDER'); }
    for(const l of raw.link_rows) { same(Object.keys(l).sort(),['asset_id','catalogue_version_id']); check(UUID.test(l.asset_id)&&UUID.test(l.catalogue_version_id),'MANIFEST_LINK_UUID'); }
    same(raw.link_rows,sortedLinks(raw.link_rows),'MANIFEST_LINK_ORDER');
    same(new Set(raw.link_rows.map(l=>l.catalogue_version_id+':'+l.asset_id)).size,raw.link_rows.length,'MANIFEST_LINK_DUPLICATE');
    check(bindingVersions.every(v=>typeof v==='string'&&UUID.test(v)),'MANIFEST_VERSION_UUID');
    const asset_ids=unique([...raw.base_asset_ids,...raw.link_rows.map(l=>l.asset_id)]),version_ids=unique([...bindingVersions,...raw.link_rows.map(l=>l.catalogue_version_id)]);
    check(asset_ids.length>0&&asset_ids.length<=60&&version_ids.length>0&&version_ids.length<=42,'MANIFEST_SCOPE_BOUNDS');
    return {...raw,asset_ids,version_ids};
}
export const originalManifestPredicate = m => m.printing_id===IDS.printing || [IDS.normal,IDS.reverse].includes(m.variant_id) || [IDS.old,IDS.oldReverse].includes(m.asset_row_id);
export async function readState(db, queries, p, env, hooks={}) {
    const phase=hooks.phase??(async()=>{}),capture=hooks.capture??(async()=>{});
    await phase('scope_snapshot'); const snapshot=(await db.query(queries['before-query.sql'])).rows;
    await phase('published_bindings'); const bindings=(await db.query(queries['bindings-query.sql'])).rows;
    await phase('view_contract'); const views=(await db.query(queries['views-query.sql'])).rows;
    same(bindings.length,1,'BINDING_WRAPPER');same(views.length,1,'VIEW_WRAPPER');
    same(CH(bindings[0].snapshot.cards),p.baselines[env].bindingsHash,'FULL_PUBLISHED_BINDINGS_DRIFT');same(CH(views[0].snapshot),p.baselines[env].viewsHash,'LIVE_VIEW_OR_AUDIT_TRIGGER_DRIFT');
    const expected=expectedManifestScope(snapshot,bindings[0].snapshot.cards);
    await phase('manifest_candidates');const raw=(await db.query(queries['manifest-query.sql'],[[IDS.printing],[IDS.normal,IDS.reverse],[IDS.old,IDS.oldReverse]])).rows;
    same(raw.length,1,'MANIFEST_SCOPE_WRAPPER');const scope=completeManifestScope(raw[0].scope,expected.version_ids);same(scope,expected,'MANIFEST_CANDIDATE_COMPLETENESS');
    await capture('read-scope',{snapshot:ordered(snapshot),bindings:bindings[0].snapshot.cards,views:views[0].snapshot,manifestScope:scope});
    await phase('manifest_visible');const rows=(await db.query(VISIBLE_MANIFEST_SQL,[scope.asset_ids,scope.version_ids])).rows;
    check(rows.length<21,'MANIFEST_VISIBLE_OVERFLOW');const visible=rows.map(r=>r.payload);same(new Set(visible.map(m=>m.catalogue_version_id+':'+m.asset_row_id)).size,visible.length,'MANIFEST_VISIBLE_DUPLICATE');
    for(const m of visible)check(scope.asset_ids.includes(m.asset_row_id)&&scope.version_ids.includes(m.catalogue_version_id),'MANIFEST_VISIBLE_OUT_OF_SCOPE');
    // This is exactly the old SQL OR predicate, applied after the proven complete, bounded ID lookup.
    const manifest=visible.filter(originalManifestPredicate);
    return {snapshot:ordered(snapshot),bindings:bindings[0].snapshot.cards,views:views[0].snapshot,manifest,manifestScope:scope};
}
export function payload(p, sourceId, env) { const o = p.objects[0], url = 'https://' + (env === 'production' ? 'oakdbbzdqwurpjnoqhmu' : 'lmwfhvexfcoyeuoyrlco') + '.supabase.co/storage/v1/object/public/stackr-catalogue-public/' + o.storage_key; return { asset_id: p.newAssetPublicId, asset_type: 'card_image', game_code: 'pokemon', set_id: IDS.set, printing_id: IDS.printing, variant_id: IDS.normal, source_id: sourceId, url, storage_path: o.storage_key, mime_type: 'image/jpeg', width: 655, height: 914, sha256: IDS.sha, rights_status: 'approved', publicly_servable: true, attribution_text: 'Pokémon card artwork; PriceCharting main image; finite owner-attested use.', licensing_review_notes: JSON.stringify({ cohort_sha256: PLAN_SHA, approval_sha256: APPROVAL_SHA, root_finite_decision_sha256: p.proof.rootFiniteDecisionSHA, root_reference_qualification_sha256: p.proof.rootReferenceQualificationSHA, private_handoff_sha256: p.proof.privateHandoffSHA, independent_private_review_sha256: p.proof.independentPrivateReviewSHA, source_manifest_sha256: p.proof.sourceManifestSHA, artwork_scope: 'variant_front', asset_variant_id: IDS.normal, source_variant_id: IDS.normal, source_page_url: p.sourcePageURL, original_source_url: p.sourceImageURL, source_photo_id: p.sourcePhotoId, source_author_flags: p.sourceAuthorFlags, owner_attested_finite_permission: true, vendor_licence_verified: false, source_wide_approval: false, physical_finish_verified: false, physical_edition_verified: false, HD_original_certified: false, missing_artwork_count_delta: 0 }), source_updated_at: null, deprecated_at: null, deprecated_reason: null, asset_visibility: 'public_catalogue', storage_provider: 'supabase_storage', storage_bucket: 'stackr-catalogue-public', storage_key: o.storage_key, original_source_url: p.sourceImageURL, original_source_identifier: 'pricecharting-image-url-sha256:' + digest(Buffer.from(p.sourceImageURL)), source_attribution: 'PriceCharting main-image original; finite owner-attested normal-front clarity upgrade', permission_status: 'approved', content_sha256: IDS.sha, perceptual_hash: null, byte_size: o.byte_size, derivative_list: p.objects.slice(1).map(d => ({ role: d.role, storageProvider: 'supabase_storage', storageBucket: 'stackr-catalogue-public', storageKey: d.storage_key, mimeType: d.mime_type, width: d.width, height: d.height, byteSize: d.byte_size, sha256: d.sha256 })), cache_control: 'public, max-age=31536000, immutable', archival_storage_key: o.storage_key, externally_referenced: false, unavailable_reason: null, last_verified_at: null, retention_status: 'active', retention_until: null, deleted_at: null, deletion_reason: null, acquisition_source: 'provider_url', recognition_reference_eligible: false }; }
export function assertAsset(a, p, sourceId, env) { const wanted = payload(p, sourceId, env); for (const [k, v] of Object.entries(wanted))
    same(a[k], v, 'NEW_ASSET_FIELD_' + k); same(Object.keys(a).sort(), p.baselines[env].assetColumns.slice().sort(), 'ASSET_SCHEMA_DRIFT'); check(typeof a.id === 'string' && STAMP.test(a.created_at) && STAMP.test(a.updated_at), 'NEW_ASSET_TIMESTAMPS'); same(a.created_at, a.updated_at, 'NEW_ASSET_WAS_MODIFIED'); }
export function assertFixture(s, p) { const fields = ['id', 'code', 'active', 'base_url', 'terms_url', 'created_at', 'updated_at', 'source_type', 'display_name', 'deprecated_at', 'robots_policy', 'internal_notes', 'licence_status', 'deprecated_reason', 'rate_limit_config', 'source_updated_at', 'attribution_required'].sort(); same(Object.keys(s).sort(), fields, 'SOURCE_FULL17_SCHEMA'); for (const [k, v] of Object.entries(p.stagingSourceFixture))
    same(s[k], v, 'SOURCE_FIXTURE_POLICY'); same([s.terms_url, s.robots_policy, s.source_updated_at, s.deprecated_reason, s.deprecated_at], [null, null, null, null, null]); same(s.rate_limit_config, {}); check(STAMP.test(s.created_at) && s.created_at === s.updated_at && typeof s.id === 'string', 'SOURCE_GENERATED_DEFAULTS'); }
export function assertManifest(s, a, p) { same(s.manifest.length, 1, 'EXACT_ONE_VISIBLE_NORMAL_ASSET'); const m = s.manifest[0]; for (const k of ['asset_type', 'game_code', 'set_id', 'printing_id', 'variant_id', 'storage_provider', 'storage_bucket', 'storage_key', 'permission_status', 'rights_status', 'content_sha256', 'mime_type', 'width', 'height', 'byte_size', 'derivative_list', 'cache_control', 'externally_referenced', 'unavailable_reason'])
    same(m[k], a[k], 'MANIFEST_FIELD_' + k); same(m.asset_row_id, a.id); same(m.asset_id, a.asset_id); same(m.catalogue_version_id, p.baselines[s.environment].publishedVersionId); }
export function classify(s, p, env) {
    s.environment = env;
    const b = p.baselines[env];
    same(CH(s.bindings), b.bindingsHash, 'FULL_PUBLISHED_BINDINGS_DRIFT');
    same(CH(s.views), b.viewsHash, 'LIVE_VIEW_OR_AUDIT_TRIGGER_DRIFT');
    const rows = s.snapshot, map = new Map(rows.map(r => [key(r), r]));
    same(map.size, rows.length, 'DUPLICATE_SCOPE_ROW');
    const old = map.get('assets:' + IDS.old)?.payload;
    check(old, 'OLD_NORMAL_MISSING');
    const added = rows.filter(r => !Object.hasOwn(b.rowHashes, key(r)));
    if (!added.length) {
        same(rows.length, b.rows, 'FRESH_COUNT_DRIFT');
        for (const r of rows)
            same(CH(r.payload), b.rowHashes[key(r)], 'FRESH_FULL_ROW_DRIFT');
        same(CH(s.manifest), b.manifestHash, 'FRESH_VISIBLE_ASSET_DRIFT');
        return { mode: 'fresh', old };
    }
    const assets = added.filter(r => r.scope === 'assets'), links = added.filter(r => r.scope === 'links'), sources = added.filter(r => r.scope === 'sources');
    same(assets.length, 1, 'UNEXPECTED_NEW_ASSETS');
    same(links.length, 1, 'UNEXPECTED_NEW_LINKS');
    same(sources.length, env === 'staging' ? 1 : 0, 'UNAPPROVED_SOURCE_CREATION');
    same(added.length, 2 + sources.length, 'UNAPPROVED_SCOPE_INSERTION');
    same(rows.length, b.rows + added.length, 'AFTER_COUNT_DRIFT');
    for (const [k, h] of Object.entries(b.rowHashes)) {
        const r = map.get(k);
        check(r, 'EXISTING_ROW_DELETED');
        if (k === 'assets:' + IDS.old) {
            same(CH(withoutMutable(r.payload)), b.oldNormalImmutableHash, 'OLD_IMMUTABLE_FIELDS_DRIFT');
            same(Object.keys(r.payload).sort(), b.assetColumns.slice().sort());
            same(r.payload.publicly_servable, false, 'OLD_VISIBILITY_NOT_SUPERSEDED');
            check(STAMP.test(r.payload.updated_at) && r.payload.updated_at !== b.oldNormalBeforeUpdatedAt, 'OLD_TRIGGER_TIMESTAMP_MISSING');
        }
        else
            same(CH(r.payload), h, 'EXISTING_FULL_ROW_DRIFT');
    }
    const source = env === 'production' ? p.identity.sourceIdProduction : sources[0].payload.id;
    if (env === 'staging')
        assertFixture(sources[0].payload, p);
    const a = assets[0].payload, l = links[0].payload;
    assertAsset(a, p, source, env);
    same(assets[0].identity, a.id);
    const expected = { catalogue_version_id: b.publishedVersionId, language_code: 'en', set_id: IDS.set, printing_id: IDS.printing, variant_id: IDS.normal, asset_id: a.id, asset_type: 'card_image' };
    for (const [k, v] of Object.entries(expected))
        same(l[k], v, 'NEW_LINK_FIELD_' + k);
    same(Object.keys(l).sort(), [...Object.keys(expected), 'created_at'].sort());
    check(STAMP.test(l.created_at), 'LINK_TIMESTAMP');
    same(links[0].identity, l.catalogue_version_id + ':' + l.asset_id);
    assertManifest(s, a, p);
    return { mode: 'published', old, asset: a, link: l, fixture: sources[0]?.payload };
}
export async function lockScope(db, s) { for (const scope of ['printings', 'variants', 'names', 'sets', 'assets', 'versions', 'sources']) {
    const table = { printings: 'card_printings', variants: 'card_variants', names: 'card_names', sets: 'sets', assets: 'assets', versions: 'catalogue_versions', sources: 'sources' }[scope], schema = scope === 'sources' ? 'ingest' : 'catalog';
    const ids = s.snapshot.filter(r => r.scope === scope).map(r => r.identity);
    if (ids.length)
        await db.query('/* bulba:lock */ select id from ' + schema + '.' + table + ' where id=any($1::uuid[]) ' + (scope === 'assets' ? 'for update' : 'for share'), [ids]);
} await db.query('/* bulba:links-lock */ select asset_id,catalogue_version_id from catalog.catalogue_version_assets where asset_id=any($1::uuid[]) for share', [s.snapshot.filter(r => r.scope === 'assets').map(r => r.identity)]); }
export const pgImmutableSQL = "select encode(sha256(convert_to((to_jsonb(a)-'publicly_servable'-'updated_at')::text,'UTF8')),'hex') as immutable_sha256 from catalog.assets a where id=$1::uuid";
export async function writeMetadata(db, p, queries, env, hooks={}) {
    const phase=hooks.phase??(async()=>{}),capture=hooks.capture??(async()=>{});
    let state = await readState(db, queries, p, env, hooks), classified = classify(state, p, env);
    await capture('write-before',state);
    await phase('scope_lock');await lockScope(db, state);
    state = await readState(db, queries, p, env, hooks);
    classified = classify(state, p, env);
    await capture('write-locked',state);
    const beforeMode = classified.mode, oldBefore = classified.old;
    let a = classified.asset, link = classified.link, sourceId = p.identity.sourceIdProduction;
    if (beforeMode === 'fresh') {
        if (env === 'staging') {
            const source = p.stagingSourceFixture, cols = Object.keys(source);
            await phase('source_insert');
            const inserted = (await db.query('/* bulba:source-insert */ insert into ingest.sources as inserted(' + cols.join(',') + ') select ' + cols.map(k => 'x.' + k).join(',') + ' from jsonb_populate_record(null::ingest.sources,$1::jsonb) x returning to_jsonb(inserted) as payload', [JSON.stringify(source)])).rows;
            same(inserted.length, 1, 'SOURCE_INSERT_COUNT');
            assertFixture(inserted[0].payload, p);
            sourceId = inserted[0].payload.id;
        }
        const value = payload(p, sourceId, env), cols = Object.keys(value);
        check(cols.every(k => /^[a-z_][a-z0-9_]*$/.test(k)), 'UNSAFE_ASSET_COLUMNS');
        await phase('asset_insert');
        const inserted = (await db.query('/* bulba:asset-insert */ insert into catalog.assets as inserted(' + cols.join(',') + ') select ' + cols.map(k => 'x.' + k).join(',') + ' from jsonb_populate_record(null::catalog.assets,$1::jsonb) x returning to_jsonb(inserted) as payload', [JSON.stringify(value)])).rows;
        same(inserted.length, 1, 'ASSET_INSERT_COUNT');
        a = inserted[0].payload;
        assertAsset(a, p, sourceId, env);
        const l = { catalogue_version_id: p.baselines[env].publishedVersionId, language_code: 'en', set_id: IDS.set, printing_id: IDS.printing, variant_id: IDS.normal, asset_id: a.id, asset_type: 'card_image' }, lcols = Object.keys(l);
        await phase('link_insert');
        const links = (await db.query('/* bulba:link-insert */ insert into catalog.catalogue_version_assets as inserted(' + lcols.join(',') + ') select ' + lcols.map(k => 'x.' + k).join(',') + ' from jsonb_populate_record(null::catalog.catalogue_version_assets,$1::jsonb) x returning to_jsonb(inserted) as payload', [JSON.stringify(l)])).rows;
        same(links.length, 1, 'LINK_INSERT_COUNT');
        link = links[0].payload;
        await phase('old_hide');
        const updated = (await db.query('/* bulba:old-hide */ update catalog.assets a set publicly_servable=false where a.id=$1::uuid and a.publicly_servable=true and to_jsonb(a)=$2::jsonb returning to_jsonb(a) as payload', [IDS.old, JSON.stringify(oldBefore)])).rows;
        same(updated.length, 1, 'OLD_EXACT_UPDATE_CONFLICT');
    }
    const after = await readState(db, queries, p, env, hooks), verified = classify(after, p, env);
    same(verified.mode, 'published', 'ATOMIC_SUPERSESSION_INCOMPLETE');
    await capture('write-after',after);
    await phase('rollback_fingerprint');
    const pgOld = (await db.query(pgImmutableSQL, [IDS.old])).rows, pgNew = (await db.query(pgImmutableSQL, [verified.asset.id])).rows;
    check(pgOld.length === 1 && pgNew.length === 1 && /^[a-f0-9]{64}$/.test(pgOld[0].immutable_sha256) && /^[a-f0-9]{64}$/.test(pgNew[0].immutable_sha256), 'ROLLBACK_FINGERPRINT_REQUIRED');
    return { environment: env, mode: beforeMode, asset: verified.asset, link: verified.link, oldBeforeUpdatedAt: p.baselines[env].oldNormalBeforeUpdatedAt, oldAfterUpdatedAt: verified.old.updated_at, oldImmutableSHA: p.baselines[env].oldNormalImmutableHash, pgOldImmutableSHA: pgOld[0].immutable_sha256, pgNewImmutableSHA: pgNew[0].immutable_sha256, afterSnapshotHash: CH(after.snapshot), beforeRows: p.baselines[env].rows, afterRows: after.snapshot.length, existingSourceChanges: 0, variantChanges: 0, oldReverseChanges: 0, oldLinkChanges: 0 };
}
