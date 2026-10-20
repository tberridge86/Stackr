import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, validateIdentityTable, validateSavedTargets, indexObjects, FRONTS, COHORT_SHA, PRODUCTION_JA, ARCHIVE_ID } from './frozen.mjs';
import { assertConfig, createSourceResolver, rollbackReceipt, rollbackSql } from './publish.mjs';
import { assertSourcePolicies, compareSnapshots, createMetadataGuard, readSnapshot } from './metadata-guard.mjs';
import { assetId, writeMetadata, rehearse, bind, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
import { canonicalHash, publicProjection, publicationBody, validatePublishedWitness } from './source-proof.mjs';
const { plan, rows, approval, receipt, table, saved } = await loadFrozen();
const clone = value => structuredClone(value);
const journal = () => ({ assets: [], links: [], metadata_changes: 0 });
const rowFor = key => rows.find(row => `${row.set_code}/${row.collector_number}` === key);
function mutateEvidence(alias, mutate) {
  const changed = clone(plan), changedTable = clone(table), row = changed.rows.find(row => `${row.set_code}/${row.collector_number}` === alias);
  mutate(row);
  const expected = changedTable.find(entry => entry.printing_id === row.printing_id);
  expected.body_sha256 = digest(Buffer.from(JSON.stringify(row.evidence.source_body)));
  expected.evidence_sha256 = digest(Buffer.from(JSON.stringify(row.evidence)));
  expected.original_sha256 = row.objects[0].sha256;
  assert.throws(() => validateRows(changed, changedTable));
}

const oldSources = [
  {
    "id": "9aacaaee-8915-42aa-9e91-fceaa8422d03",
    "code": "pokellector",
    "active": false,
    "base_url": "https://jp.pokellector.com",
    "terms_url": null,
    "created_at": "2026-10-15T16:04:18.931823+00:00",
    "updated_at": "2026-10-15T16:04:18.931823+00:00",
    "source_type": "image",
    "display_name": "Pokellector (owner supplied Japanese card fronts)",
    "deprecated_at": null,
    "robots_policy": null,
    "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly2 Neo2 Ruin Wall reference fronts in STACKR-JA-LEGACY-TRAINER-FRONTS-20261015-008; owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval or independently verified vendor licence.",
    "licence_status": "under_review",
    "deprecated_reason": null,
    "rate_limit_config": {},
    "source_updated_at": null,
    "attribution_required": true
  },
  {
    "id": "a6215bb2-738a-4fb5-ace2-18baf3adfe0c",
    "code": "tcgcollector",
    "active": false,
    "base_url": "https://www.tcgcollector.com",
    "terms_url": null,
    "created_at": "2026-10-15T20:03:02.485064+00:00",
    "updated_at": "2026-10-15T20:03:02.485064+00:00",
    "source_type": "image",
    "display_name": "TCGCollector (owner supplied Japanese card fronts)",
    "deprecated_at": null,
    "robots_policy": null,
    "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly3 independently accepted Leaders Stadium fronts019/081/096. Bind the final finite preparation/publication decision and exact source selection in the publisher plan. Owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval, independently verified vendor licence or physical finish/edition certification. Finite decision SHA256 68f1af735d5e481ed26d1aabbe94e493d520575d9d4191413508f9ec90cf68ff.",
    "licence_status": "under_review",
    "deprecated_reason": null,
    "rate_limit_config": {},
    "source_updated_at": null,
    "attribution_required": true
  },
  {
    "id": "cbcafdd8-f3df-4543-b4e3-b5e8fc6847ab",
    "code": "scrydex",
    "active": false,
    "base_url": "https://scrydex.com",
    "terms_url": null,
    "created_at": "2026-09-27T14:42:49.489402+00:00",
    "updated_at": "2026-09-27T14:42:49.489402+00:00",
    "source_type": "image",
    "display_name": "Scrydex",
    "deprecated_at": null,
    "robots_policy": null,
    "internal_notes": "Provenance only; automated acquisition inactive. Exactly 89 English MEP fronts approved by owner; catalogue/rights-evidence/mep89-scrydex-owner-confirmation.2026-09-27.json; 8c68bf3499de1e1e340b00fc03e5f1b469de7b65d259b5fba5a8b4cd31119ca9. No source-wide approval.",
    "licence_status": "under_review",
    "deprecated_reason": null,
    "rate_limit_config": {},
    "source_updated_at": null,
    "attribution_required": true
  }
];
const oldSource=oldSources.find(row=>row.code==='scrydex');
const baselineAssets = {
  "production": [
    {
      "set_id": "46c7cd20-9ca5-4128-a244-9a04f9a4c9f7",
      "asset_type": "set_logo"
    },
    {
      "set_id": "46c7cd20-9ca5-4128-a244-9a04f9a4c9f7",
      "asset_type": "set_logo"
    },
    {
      "set_id": "46c7cd20-9ca5-4128-a244-9a04f9a4c9f7",
      "asset_type": "set_logo"
    }
  ],
  "staging": [
    {
      "set_id": "46c7cd20-9ca5-4128-a244-9a04f9a4c9f7",
      "asset_type": "set_logo"
    }
  ]
};


test('exact100 frozen bytes, descriptor and twenty LF files reject drift',async()=>{
 for(const[file,verify]of[['plan.json',b=>validatePlan(b,table)],['approval.json',validateApproval],['saved-targets.json',validateSavedTargets],['identity-table.json',b=>validateIdentityTable(b,saved)]]){const bytes=await readFile(new URL('./'+file,import.meta.url));verify(bytes);assert.throws(()=>verify(Buffer.concat([bytes,Buffer.from('\n')])));}
 assert.equal(rows.length,100);assert.equal(indexObjects(rows).size,400);assert.equal(plan.archive.file_count,404);assert.equal(ARCHIVE_ID,645021107);
 const files=(await readdir(new URL('./',import.meta.url),{withFileTypes:true})).filter(e=>e.isFile()).map(e=>new URL('./'+e.name,import.meta.url));files.push(new URL('../../.github/workflows/artwork-expansion-base-fronts-push-20261015.yml',import.meta.url));assert.equal(files.length,20);for(const file of files)assert.ok(!(await readFile(file)).includes(13));
 const descriptor=await readFile(new URL('./freeze-inputs.json',import.meta.url));assert.ok((await readFile(new URL('./freeze-local.mjs',import.meta.url),'utf8')).includes("digest(descriptor) === '"+digest(descriptor)+"'"));
});
test('closed100 singleton categories,86normal14holo and whole057058 holds preserve per-env tuples',()=>{
 assert.deepEqual(plan.source_counts,{pokellector:100});assert.deepEqual(plan.delivery_scope.by_batch,{"JP-CARDS-046":{"verified":25,"held":0},"JP-CARDS-047":{"verified":25,"held":0},"JP-CARDS-048":{"verified":23,"held":2},"JP-CARDS-049":{"verified":25,"held":0},"JP-CARDS-050":{"verified":2,"held":0}});assert.deepEqual(plan.delivery_scope.excluded_aliases,['057','058']);
 for(const[category,count]of Object.entries({Pokemon:67,Trainer:26,Energy:7}))assert.equal(rows.filter(r=>r.evidence.source_body.accepted_category===category).length,count);
 for(const env of ['production','staging']){bind(rows,plan.binding_expectations[env],env);assert.equal(plan.binding_expectations[env].filter(c=>c.finish_code==='normal').length,86);assert.equal(plan.binding_expectations[env].filter(c=>c.finish_code==='holo').length,14);}
});
test('98 exactPMCG1 photo IDs and2 literalURLhash IDs retain photo versus semantic provenance',()=>{
 let photo=0,url=0;for(const row of rows){const body=row.evidence.source_body;if(Number(row.collector_number)<=100){assert.match(row.provider_id,/^pokellector:PMCG1:\d+$/);photo++;}else{assert.equal(row.provider_id,'pokellector-image-url-sha256:'+digest(Buffer.from(row.image_url)));url++;}assert.equal(body.photo_source_identifier,row.provider_id);assert.equal(body.photo_source_url_sha256,digest(Buffer.from(row.image_url)));assert.equal(body.semantic_metadata_provider,'tcgdex');assert.equal(body.semantic_metadata_is_photo_provenance,false);assert.equal(body.historical_association.source_ordinal_used_as_identity,false);assert.equal(body.historical_association.selected_source_card_id,null);}assert.equal(photo,98);assert.equal(url,2);
});
test('all7 Energy preserve context-only authority and false genericJapanese/name/rule/artist/symbol claims',()=>{
 const energy=rows.filter(row=>row.evidence.source_body.accepted_category==='Energy');assert.deepEqual(energy.map(row=>row.collector_number).sort(),['096','097','098','099','100','101','102']);
 for(const row of energy){const b=row.evidence.source_body,c=b.finite_contextual_energy_identity;assert.equal(c.exact_finite_context_only,true);for(const key of ['printed_japanese_script_verified','printed_japanese_name_verified','printed_japanese_rules_verified','printed_collector_number_verified','printed_artist_verified','generic_printed_japanese_gate_satisfied','generic_gate_relaxation_allowed'])assert.equal(c[key],false);assert.equal(b.queue_controls.source_qa.contextual_japanese_energy_front_verified,true);assert.equal(b.queue_controls.source_qa.actual_japanese_unnumbered_energy_front_verified,false);assert.equal(b.queue_controls.pixel_observations.full_native_body_verified,false);}
 for(const row of rows){assert.equal(row.evidence.source_body.queue_controls.pixel_observations.set_symbol_printed,false);assert.equal(row.evidence.source_body.queue_controls.pixel_observations.name_and_set_symbol_readable,false);assert.equal(row.evidence.source_body.queue_controls.pixel_observations.source_set_association_verified,true);}
});
test('021032063064actual corrections and strict091TRAINERHP10/noDex35 remain authoritative',()=>{
 for(const[alias,artist]of [['032','Ken Sugimori'],['063','Ken Sugimori'],['064','Tomoaki Imakuni']])assert.equal(rowFor('PMCG1/'+alias).evidence.source_body.actual_pixel_signature.artist,artist);
 assert.equal(rowFor('PMCG1/021').evidence.source_body.actual_pixel_signature.abilities[0].printedStatusRestriction,'「こんらん」状態のときには使えない');
 assert.equal(rowFor('PMCG1/032').evidence.source_body.actual_pixel_signature.abilities[0].distinguishingNativeClause,'カメックス以外の「水」ポケモンに対して');
 const doll=rowFor('PMCG1/091').evidence.source_body;assert.equal(doll.accepted_category,'Trainer');assert.equal(doll.actual_pixel_signature.hp,10);assert.equal(doll.actual_pixel_signature.printedNationalDex,null);assert.equal(doll.strict_trainer_hp10_exception.finiteExactCardExceptionOnly,true);assert.equal(doll.strict_trainer_hp10_exception.borrowedPokemonDexAllowed,false);
 for(const row of rows.filter(row=>row.evidence.source_body.accepted_category==='Trainer'&&row.collector_number!=='091'))assert.equal(row.evidence.source_body.actual_pixel_signature.hp,null);
 assert.equal(rowFor('PMCG1/096').evidence.source_body.actual_pixel_signature.nativeRules,null);
});
test('raw/safe/actual/peer hashes,44direct56records and4PNG96WebP remain truthful without optical gain',()=>{
 let direct=0;for(const row of rows){const b=row.evidence.source_body;validatePublishedWitness(b,row);assert.equal(canonicalHash(b.provider_metadata_identity_projection),b.provider_metadata_identity_projection_sha256);assert.equal(canonicalHash(b.independent_selection),b.independent_selection_public_canonical_json_sha256);assert.equal(canonicalHash(b.actual_pixel_signature),b.actual_pixel_signature_sha256);for(const key of ['provider_full_body_agreement_certified','provider_native_rules_agreement_certified','full_verbatim_native_transcription_certified'])assert.equal(b[key],false);assert.equal(b.source_quality_qualifications.provider_no_resize_certified,false);assert.equal(b.source_quality_qualifications.native_optical_resolution_gain_claimed,false);if(b.independent_coverage.independentDirectWholeFrontView??b.independent_coverage.independentDirectWholeFrontViewed)direct++;for(const object of row.objects)assert.ok(object.width<=row.objects[0].width&&object.height<=row.objects[0].height);}
 assert.equal(direct,44);assert.equal(rows.length-direct,56);assert.equal(rows.filter(row=>row.objects[0].mime_type==='image/png').length,4);assert.equal(rows.filter(row=>row.objects[0].mime_type==='image/webp').length,96);
});
test('joint actual/category/context/bytes/finish/environment changes fail even with recomputed local evidence',()=>{
 for(const mutate of [r=>{r.evidence.source_body.actual_pixel_signature.artist='wrong';},r=>{r.evidence.source_body.actual_pixel_signature.hp=999;},r=>{r.evidence.source_body.actual_pixel_signature.attacks.pop();},r=>{r.evidence.source_body.provider_full_body_agreement_certified=true;},r=>{r.provider_id='wrong';},r=>{r.objects[0].sha256='a'.repeat(64);},r=>{r.objects[1].width=999;}])mutateEvidence('PMCG1/032',mutate);
 for(const mutate of [r=>{r.evidence.source_body.actual_pixel_signature.hp=null;},r=>{r.evidence.source_body.actual_pixel_signature.printedNationalDex=35;},r=>{r.evidence.source_body.strict_trainer_hp10_exception.borrowedPokemonDexAllowed=true;}])mutateEvidence('PMCG1/091',mutate);
 for(const mutate of [r=>{r.evidence.source_body.actual_pixel_signature.nativeRules='invented';},r=>{r.evidence.source_body.finite_contextual_energy_identity.printed_japanese_script_verified=true;},r=>{delete r.evidence.source_body.finite_contextual_energy_identity;},r=>{r.evidence.source_body.queue_controls.pixel_observations.name_and_set_symbol_readable=true;}])mutateEvidence('PMCG1/096',mutate);
 mutateEvidence('PMCG1/021',r=>{r.evidence.source_body.actual_pixel_signature.abilities[0].printedStatusRestriction='Asleep,Paralyzed,Confused';});
 mutateEvidence('PMCG1/032',r=>{r.evidence.source_body.actual_pixel_signature.abilities[0].distinguishingNativeClause='includesBlastoise';});
 for(const field of ['variant_id','finish_code','card_native_name','collector_number','catalogue_version_id']){const changed=clone(plan);changed.binding_expectations.production[0][field]='wrong';assert.throws(()=>validateRows(changed,table));}
});
test('all51 existing source fields and root finite/supplement/private100 authority cannot drift',()=>{
 validateSourcePlan(plan);assert.deepEqual(plan.new_sources.production,[]);assert.deepEqual(plan.new_sources.staging.map(s=>s.code),['pokellector']);for(const original of oldSources)for(const field of Object.keys(original)){const changed=clone(oldSources);changed.find(s=>s.code===original.code)[field]='changed';assert.throws(()=>assertSourcePolicies(plan,changed,'production',true));}
 for(const mutate of [p=>{p.source_policies.production[0].active=true;},p=>{p.new_sources.production=[p.source_policies.production[0]];},p=>{p.new_sources.staging.push(p.source_policies.production.find(x=>x.code==='tcgcollector'));},p=>{p.new_sources.staging=[];},p=>{p.source_evidence.finiteDecision='wrong';},p=>{p.source_evidence.publicationPreservationSupplement='wrong';},p=>{p.source_evidence.private100SourceContract='wrong';},p=>{p.source_policy_checkpoint_sha256='wrong';}]){const changed=clone(plan);mutate(changed);assert.throws(()=>createSourceResolver(changed));}
});
test('public whitelist excludes private paths and commercial/PNG processing captures',()=>{
 for(const key of ['pricing','prices','marketplaces','pop_reports','privateDecodedMetadata','ThumbURI'])assert.throws(()=>publicProjection({[key]:null}));assert.throws(()=>publicProjection({unexpected:'C:/private/file'}));for(const row of rows)assert.deepEqual(publicationBody(row.evidence.source_body),row.evidence.source_body);
});

function database(environment = 'production') {
  const state = {
    printings: rows.map(r => ({ id: r.printing_id, set_id: r.set_id, native_name: r.card_native_name, collector_number: r.collector_number, printing_discriminator: '' })),
    variants: plan.binding_expectations[environment].map(c => ({ id: c.variant_id, printing_id: c.printing_id, variant_code: c.variant_code, finish_code: c.finish_code })),
    names: plan.binding_expectations[environment].flatMap((c, i) => ['native', 'en'].map(kind => ({ id: `name-${i}-${kind}`, printing_id: c.printing_id, variant_id: c.variant_id, name: c.card_native_name, kind }))),
    sets: [...new Map(rows.map(r => [r.set_id, { id: r.set_id, set_code: r.set_code, name: r.set_code }])).values()],
    assets: baselineAssets[environment].map((asset, index) => ({ ...asset, id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`, asset_id: `old-logo-${index}`, printing_id: null, variant_id: null, storage_key: `immutable/old-${index}.png` })),
    links: Array.from({ length: environment === 'production' ? 2 : 0 }, (_, index) => ({ asset_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index % 4).padStart(12, '0')}`, catalogue_version_id: index < 2 ? (environment === 'production' ? PRODUCTION_JA : STAGE_JA) : `historical-version-${index}`, language_code: 'ja', asset_type: index % 2 ? 'set_symbol' : 'set_logo', set_id: rows[index % rows.length].set_id, printing_id: null, variant_id: null })),
    sources: environment === 'production' ? clone(oldSources) : [],
  };
  const calls = [];
  let saved, nextId = 0;
  const db = { state, calls, mutateAfterLinks: null, async query(sql, parameters = []) {
    calls.push(sql);
    if (sql.startsWith('begin')) { saved = clone(state); return { rows: [] }; }
    if (sql === 'rollback') { Object.assign(state, saved); return { rows: [] }; }
    if (sql.startsWith('set ') || sql.startsWith('select pg_advisory')) return { rows: [] };
    if (sql.startsWith('select game_code')) return { rows: clone(plan.binding_expectations[environment]) };
    if (sql.startsWith('select to_jsonb(source) as payload from ingest.sources')) return { rows: state.sources.map(source => ({ payload: clone(source) })) };
    if (sql.startsWith('select id from catalog.catalogue_versions')) return { rows: [{ id: environment === 'staging' ? STAGE_JA : PRODUCTION_JA }] };
    if (sql.startsWith('select id from catalog.assets where asset_type')) return { rows: state.assets.filter(asset => asset.asset_type === 'card_image').map(asset => ({ id: asset.id })) };
    if (sql.startsWith('select * from api.asset_manifest')) return { rows: state.assets.filter(asset => asset.asset_type === 'card_image').map(asset => ({ ...clone(asset), asset_row_id: asset.id })) };
    if (sql.startsWith('insert into ingest.sources')) {
      const source = Object.fromEntries(['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes'].map((key, i) => [key, parameters[i]]));
      if (!state.sources.some(s => s.code === source.code)) state.sources.push({ ...source, deprecated_at: null, id: `new-source-${source.code}` });
      return { rows: [] };
    }
    if (sql.startsWith('insert into catalog.assets')) {
      const inserted = [];
      for (const data of JSON.parse(parameters[0])) if (!state.assets.some(asset => asset.asset_id === data.asset_id)) {
        const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(++nextId).padStart(12, '0')}`;
        state.assets.push({ ...data, id }); inserted.push({ id });
      }
      return { rows: inserted };
    }
    if (sql.startsWith('insert into catalog.catalogue_version_assets')) {
      const inserted = [];
      for (const data of JSON.parse(parameters[0])) if (!state.links.some(link => link.asset_id === data.asset_id && link.catalogue_version_id === data.catalogue_version_id)) { state.links.push(data); inserted.push(data); }
      db.mutateAfterLinks?.(state);
      return { rows: clone(inserted) };
    }
    if (sql.startsWith('select * from catalog.assets where asset_id')) return { rows: clone(state.assets.filter(asset => parameters[0].includes(asset.asset_id))) };
    for (const [table, scope] of [['catalog.card_printings', 'printings'], ['catalog.card_variants', 'variants'], ['catalog.card_names', 'names'], ['catalog.sets', 'sets'], ['catalog.assets', 'assets'], ['catalog.catalogue_version_assets', 'links'], ['ingest.sources', 'sources']]) if (sql.startsWith(`select * from ${table} where`)) {
      const result = clone(state[scope]);
      // Model pg's direct-column timestamp parsing so a second unsafe source
      // reader cannot pass only because the fixture stored JSON strings.
      if (scope === 'sources') for (const source of result) for (const key of ['created_at', 'updated_at', 'deprecated_at', 'source_updated_at']) if (source[key]) source[key] = new Date(source[key]);
      return { rows: result };
    }
    throw Error(`Unexpected test SQL: ${sql}`);
  } };
  return db;
}

test('full source JSON keeps timestamp microseconds and rejects even a one-microsecond source change', async () => {
  const db = database();
  const directColumnDriverValue = { ...clone(oldSource), created_at: new Date(oldSource.created_at), updated_at: new Date(oldSource.updated_at) };
  assert.notEqual(canonicalHash(directColumnDriverValue), canonicalHash(oldSource));
  const snapshot = await readSnapshot(db, rows, plan.scope_counts.production);
  const source = snapshot.find(row => row.scope === 'sources' && row.payload.code === 'scrydex').payload;
  assert.deepEqual(source, oldSource);
  assert.equal(source.created_at, '2026-09-27T14:42:49.489402+00:00');
  assertSourcePolicies(plan, clone(oldSources), 'production');
  const changed = clone(source); changed.created_at = '2026-09-27T14:42:49.489403+00:00';
  assert.throws(() => assertSourcePolicies(plan, oldSources.map(row=>row.code==='scrydex'?changed:clone(row)), 'production'), /Full17-field/);
});

test('source resolver uses the same microsecond-preserving JSON reader as snapshots', async () => {
  const db = database();
  const result = await createSourceResolver(plan)(db, receipt, 'production');
  assert.equal(result.get('scrydex'), oldSource.id);
  assert.equal(result.size, 3);
  assert.ok(!db.calls.some(sql => sql.startsWith('select * from ingest.sources')));
  const changed = database(); changed.state.sources[0].updated_at = '2026-09-27T14:42:49.489403+00:00';
  await assert.rejects(createSourceResolver(plan)(changed, receipt, 'production'), /Full17-field/);
});

test('publication inserts only the eligible fronts/links and no provenance source; every existing scoped row survives; rerun is empty', async () => {
  const db = database(); const initial = clone(db.state); const guard = createMetadataGuard(plan); const first = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', first, createSourceResolver(plan), null, null, guard);
  assert.equal(first.assets.filter(asset => asset.created).length, FRONTS);
  assert.equal(first.links.filter(link => link.created).length, FRONTS);
  assert.equal(first.preservation.before_counts.names, FRONTS * 2);
  assert.equal(Object.values(first.preservation.before_counts).reduce((a, b) => a + b, 0), 409);
  assert.equal(Object.values(first.preservation.after_counts).reduce((a, b) => a + b, 0), 609);
  assert.equal(first.preservation.new_inactive_provenance_sources, 0);
  assert.ok(!db.calls.some(sql=>sql.startsWith('insert into ingest.sources')));assert.deepEqual(db.state.sources,initial.sources);
  for (const scope of ['printings', 'variants', 'names', 'sets']) assert.deepEqual(db.state[scope], initial[scope]);
  assert.deepEqual(db.state.assets.slice(0, initial.assets.length), initial.assets);
  assert.deepEqual(db.state.links.slice(0, initial.links.length), initial.links);
  const second = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', second, createSourceResolver(plan), null, null, guard);
  assert.equal(second.assets.filter(asset => asset.created).length, 0);
  assert.equal(second.links.filter(link => link.created).length, 0);
  assert.equal(second.preservation.before_sha256, second.preservation.after_sha256);
});

test('identity, old logo/symbol and links, existing policy and unplanned provenance changes abort before commit and roll back', async () => {
  for (const mutate of [s => { s.names[0].name = 'changed'; }, s => { s.variants[0].finish_code = 'changed-finish'; }, s => { s.printings[0].collector_number = 'unapproved'; }, s => { s.assets[0].storage_key = 'changed'; }, s => { s.links[1].asset_type = 'changed-symbol-link'; }, s => { s.sets[0].name = 'changed'; }, s => { s.sources[0].active = true; }, s => { s.sources[0].robots_policy = 'changed'; }, s => { s.sources.push({ id: 'unplanned-source', code: 'unexpected', base_url: 'https://mirror.tcgcollector.com' }); }, s => { s.names.push({ id: 'extra-name' }); }]) {
    const db = database(); const initial = clone(db.state); db.mutateAfterLinks = mutate;
    await assert.rejects(rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'production', journal(), createSourceResolver(plan), null, null, createMetadataGuard(plan))), /scoped row changed|counts changed|source insertion|source count|source policy changed|metadata insertion|existing provenance changed/);
    assert.deepEqual(db.state, initial);
    assert.equal(db.calls.at(-1), 'rollback');
  }
});

test('the single staging Pokellector fixture and all eligible artwork changes are rolled back', async () => {
  const db = database('staging'); const initial = clone(db.state); const result = journal();
  await rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'staging', result, createSourceResolver(plan), null, null, createMetadataGuard(plan)));
  assert.equal(result.preservation.staging_fixture_sources, 1);
  assert.equal(Object.values(result.preservation.before_counts).reduce((a, b) => a + b, 0), 402);
  assert.equal(result.assets.length, FRONTS);
  assert.deepEqual(db.state, initial);
});

test('reused preservation comparison rejects unjournalled new assets or unplanned production source insertion', () => {
  const before = [oldSource].map((source, i) => ({ scope: 'sources', identity: String(i), payload: source }));
  assert.throws(() => compareSnapshots(before, [...before, { scope: 'assets', identity: 'unlisted', payload: {} }], journal(), plan, 'production'), /journal and new rows differ/);
  assert.throws(() => compareSnapshots(before, [...before, { scope: 'sources', identity: 'unlisted', payload: { code: 'unexpected' } }], journal(), plan, 'production'), /source insertion/);
});

test('rollback binds only successful new artwork IDs and preserves objects, links and source policies', () => {
  const success = { ...journal(), status: 'published_manifest_and_public_bytes_verified', revision: 'a'.repeat(40), verified_at: '2026-10-13', assets: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', printing_id: rows[0].printing_id, created: true }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', printing_id: rows[0].printing_id, created: false }] };
  const rollback = rollbackReceipt(success, plan);
  assert.equal(rollback.assets.length, 1);
  assert.deepEqual(rollback.retained_inactive_provenance_sources, []);
  assert.equal(rollback.assets[0].asset_id, assetId(rows[0]));
  assert.ok(rollbackSql(rollback).includes(COHORT_SHA));
  assert.ok(rollbackSql(rollback).includes('SET publicly_servable=false'));
  assert.ok(!rollbackSql(rollback).includes('DELETE'));
  assert.ok(!rollbackSql(rollback).includes('UPDATE ingest.sources'));
  assert.ok(!rollbackSql(rollback).includes('000000000002'));
  assert.throws(() => rollbackReceipt({ ...success, status: 'commit_outcome_unknown' }, plan), /verified publication/);
  assert.ok(rollbackSql(rollbackReceipt({ ...success, assets: [] }, plan)).includes('no rollback writes'));
});

test('execution retains exact-main/manual/two-project/private-output gates under its own confirmation', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_EXPANSION_BASE_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK EXPANSION BASE FRONTS', STACKR_ARTWORK_EXPANSION_BASE_FRONTS_PACKAGES: '/packages', STACKR_ARTWORK_EXPANSION_BASE_FRONTS_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_EXPANSION_BASE_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_EXPANSION_BASE_FRONTS_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});

test('unusedTCG full17 timestamp microseconds survive snapshot and resolver and any drift rejects',async()=>{
 const original=oldSources.find(x=>x.code==='tcgcollector'),db=database();const snapshot=await readSnapshot(db,rows,plan.scope_counts.production);assert.deepEqual(snapshot.find(x=>x.scope==='sources'&&x.payload.code==='tcgcollector').payload,original);assert.equal((await createSourceResolver(plan)(db,receipt,'production')).get('tcgcollector'),original.id);for(const phase of ['snapshot','resolver']){const changed=database();changed.state.sources.find(x=>x.code==='tcgcollector').updated_at='2026-10-15T20:03:02.485065+00:00';if(phase==='resolver')await assert.rejects(createSourceResolver(plan)(changed,receipt,'production'),/Full17/);else await assert.rejects(createMetadataGuard(plan).before(changed,rows,'production'),/Full17/);}
});
test('source reader guards named domains and stage creates onlyPoke, never unusedTCG',async()=>{
 const db=database();await createSourceResolver(plan)(db,receipt,'production');const sql=db.calls.find(x=>x.startsWith('select to_jsonb(source)'));assert.ok(sql.includes('base_url ilike any($2::text[])')&&sql.includes('limit 4'));assert.ok(!db.calls.some(x=>x.startsWith('insert into ingest.sources')));
 const preexistingStage=database('staging');preexistingStage.state.sources.push({...clone(oldSources.find(x=>x.code==='pokellector'))});await assert.rejects(createMetadataGuard(plan).before(preexistingStage,rows,'staging'),/source count/);
 const stage=database('staging');await rehearse(stage,()=>writeMetadata(stage,rows,receipt,approval,'staging',journal(),createSourceResolver(plan),null,null,createMetadataGuard(plan)));assert.deepEqual(stage.state.sources,[]);assert.equal(stage.calls.filter(x=>x.startsWith('insert into ingest.sources')).length,1);
 const unexpected=database();unexpected.state.sources.push({...clone(oldSources[0]),id:'unknown-domain-source',code:'unapprovedAlias',base_url:'https://mirror.tcgcollector.com'});await assert.rejects(createSourceResolver(plan)(unexpected,receipt,'production'),/source count/);
});
