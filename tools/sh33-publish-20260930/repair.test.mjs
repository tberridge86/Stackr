import assert from 'node:assert/strict';
import test from 'node:test';
import { TARGET, assertPrintingScope, assertScope, catalogueCorrection, identityHash, repairWithinTransaction } from './repair.mjs';

const identities=[...Array.from({length:53},(_,i)=>({printing_id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,set_id:TARGET.set_id,language_code:TARGET.language_code,set_code:TARGET.set_code,collector_number:String(i+1).padStart(3,'0'),card_native_name:`Card ${i+1}`,catalogue_version_id:TARGET.catalogue_version_id})),...TARGET.energies.map((collector_number,i)=>({printing_id:`00000000-0000-4000-8001-${String(i+1).padStart(12,'0')}`,set_id:TARGET.set_id,language_code:TARGET.language_code,set_code:TARGET.set_code,collector_number,card_native_name:collector_number,catalogue_version_id:TARGET.catalogue_version_id}))];

const scope = (printed_total = 38, total = 59) => ({
  set: { id: TARGET.set_id, game_code: 'pokemon', language_code: 'zh-tw', set_code: 'SH', provider_set_code: 'SH', printed_total, total, deprecated_at: null },
  printings: { catalogue_version_id: TARGET.catalogue_version_id, printings: 59, numeric_printings: 53, numeric_min: '001', numeric_max: '053', non_numeric_collectors: [...TARGET.energies] }, identities,identity_sha256:identityHash(identities),
});

test('SH33 scope accepts only the reviewed 38-to-53 idempotent transition', () => {
  assertScope(scope(38, 59));
  assertScope(scope(53, 78));
  assert.throws(() => assertScope(scope(39, 59)));
  assert.throws(() => assertScope({ ...scope(), set: { ...scope().set, language_code: 'zh-cn' } }));
});

test('SH33 scope preserves all 59 identities including six named energies', () => {
  assertPrintingScope(scope().printings);
  assert.throws(() => assertPrintingScope({ ...scope().printings, printings: 58 }));
  assert.throws(() => assertPrintingScope({ ...scope().printings, numeric_max: '052' }));
  assert.throws(() => assertPrintingScope({ ...scope().printings, non_numeric_collectors: ['DAR'] }));
  assert.throws(()=>assertScope({...scope(),identities:[...identities.slice(0,58),identities[0]],identity_sha256:identityHash([...identities.slice(0,58),identities[0]])}));
});

test('repair updates only printed_total and preserves each environment total', async () => {
  const before = scope(38, 78);
  const calls = [];
  const db = { query: async (sql, args) => {
    calls.push({ sql, args });
    if(sql.startsWith('update'))return { rows: [{ ...before.set, printed_total: 53 }] };
    if(sql.includes('from catalog.sets'))return {rows:[{...before.set,printed_total:53}]};
    if(sql.includes('count(*) as printings'))return {rows:[before.printings]};
    return {rows:identities};
  } };
  const result = await repairWithinTransaction(db, before);
  assert.equal(result.changed,true);assert.equal(result.metadata_changes,1);assert.equal(result.set.total,78);
  assert.equal(calls.length, 4);
  assert.match(calls[0].sql, /^update catalog\.sets set printed_total=\$2/);
  assert.doesNotMatch(calls[0].sql, /set[^\n]*\btotal\s*=/i);
  assert.equal(calls[0].args.at(-1), 78);
});

test('already-correct 53 is idempotent and makes no query', async () => {
  const db = { query: async () => { throw new Error('must not update'); } };
  const result = await repairWithinTransaction(db, scope(53, 59));
  assert.equal(result.changed, false);
});

test('a concurrent total change or an imprecise update is rejected', async () => {
  const db = { query: async () => ({ rows: [] }) };
  await assert.rejects(repairWithinTransaction(db, scope(38, 59)));
});

test('shared hook returns one explicit bounded audit and detects preserved-field drift', async () => {
  const before=scope(38,59);let phase=0;
  const db={query:async sql=>{
    if(sql.startsWith('update')){phase=1;return {rows:[{...before.set,printed_total:53}]};}
    if(sql.includes('from catalog.sets'))return {rows:phase?[{...before.set,printed_total:53,native_name:'drift'}]:[before.set]};
    if(sql.includes('count(*) as printings'))return {rows:[before.printings]};return {rows:identities};
  }};
  await assert.rejects(catalogueCorrection(db,'staging'),/preserved set field/);
});
