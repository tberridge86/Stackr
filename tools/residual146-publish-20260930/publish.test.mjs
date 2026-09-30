import { readFileSync } from 'node:fs';
import test from 'node:test'; import assert from 'node:assert/strict';
import { FRONTS, SOURCE_COUNTS, SOURCES, TCGPLAYER_SOURCE, assertConfig, exceptionLedger, sourcesFor, validateApproval, validatePlan } from './publish.mjs';
const file = (name) => new URL(`./${name}`, import.meta.url);
test('residual146 has a reviewed ledger boundary', () => { const rows = [...exceptionLedger().values()]; assert.ok(rows.length >= FRONTS); assert.equal(new Set(rows.map((r) => r.printing_id)).size, rows.length); });
test('residual146 frozen plan remains exact, disjoint and has four objects per front', () => { const bytes = readFileSync(file('cohort.json.gz')); const rows = validatePlan(bytes, JSON.parse(readFileSync(file('plan-receipt.json')))); assert.equal(rows.length, FRONTS); assert.deepEqual(Object.fromEntries(Object.entries(SOURCE_COUNTS).map(([k]) => [k, rows.filter((r) => r.source_code === k).length])), SOURCE_COUNTS); assert.equal(rows.flatMap((r) => r.objects).length, FRONTS * 4); assert.throws(() => validatePlan(Buffer.concat([bytes, Buffer.from('x')]), JSON.parse(readFileSync(file('plan-receipt.json'))))); });
test('approval is precisely bounded to these 146 fronts', () => { const approval = JSON.parse(readFileSync(file('approval.json'))); validateApproval(approval); for (const changed of [{ fronts: 145 }, { approved: false }, { store_resize_display: false }, { source_wide_approval: true }, { source_counts: { tcgplayer_card_artwork: 139, pokemon_card_tw_official: 7 } }]) assert.throws(() => validateApproval({ ...approval, ...changed })); });
test('configuration rejects unconfirmed or unprotected deployments', () => { assert.throws(() => assertConfig({})); assert.throws(() => assertConfig({ STACKR_RESIDUAL146_CONFIRMATION: 'PUBLISH RESIDUAL146', GITHUB_REF: 'refs/heads/topic' })); });
test('source resolver inserts each narrow source only during its correct transactional scope', async () => {
  for (const environment of ['staging', 'production']) {
    const calls=[];
    const tw={id:'tw',code:SOURCES['zh-tw'],source_type:'image',base_url:'https://asia.pokemon-card.com/tw',active:false,licence_status:'under_review',attribution_required:true,internal_notes:'Provenance only; acquisition inactive. Exactly 4926 Taiwanese fronts in the frozen recovered-artwork cohort 20f4d3b1e5673f494c05c0330257296f78e3b35c21b06254523dfb066ea2f2cd; no source-wide approval.',deprecated_at:null};
    const db={query:async(sql,args)=>{calls.push({sql,args}); if(/^select/i.test(sql)) return {rows:[{id:'en',deprecated_at:null,...TCGPLAYER_SOURCE},tw]}; return {rows:[]};}};
    const sources=await sourcesFor(db,null,environment);
    assert.equal(sources.get(SOURCES.en),'en'); assert.equal(sources.get(SOURCES['zh-tw']),'tw');
    assert.equal(calls.length, environment === 'staging' ? 3 : 2);
    assert.match(calls[0].sql,/insert into ingest\.sources/i); assert.match(calls[0].sql,/on conflict\(code\) do nothing/i);
    if (environment === 'staging') { assert.match(calls[1].sql,/pokemon_card_tw_official/); assert.match(calls[1].sql,/on conflict\(code\) do nothing/i); }
    assert.match(calls.at(-1).sql,/^select/i);
  }
});
test('changed provenance is rejected after insert-if-missing', async () => { const db={query:async(sql)=>/^select/i.test(sql)?{rows:[{id:'en',deprecated_at:null,...TCGPLAYER_SOURCE,active:true},{id:'tw',code:SOURCES['zh-tw'],source_type:'image',base_url:'https://asia.pokemon-card.com/tw',active:false,licence_status:'under_review',attribution_required:true,internal_notes:'wrong',deprecated_at:null}]}:{rows:[]}}; await assert.rejects(sourcesFor(db)); });


