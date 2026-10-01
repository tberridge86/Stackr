import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeNameCorrections, normalizeNativeName } from './native-name-corrections.mjs';
import { rehearse } from './publish.mjs';

const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const plan = () => Array.from({ length: 53 }, (_, index) => ({
  printing_id: id(index + 1), expected_native_name_row_id: { staging: id(index + 101), production: id(index + 401) }, current_native_name: `旧名 ${index + 1}`,
  proposed_native_name: `新名 ${index + 1}`, language_code: index < 46 ? 'ja' : 'ko', set_id: id(index + 201), collector_number: String(index + 1).padStart(3, '0'),
}));
const clone = (value) => structuredClone(value);

function fixture(rows = plan(), environment = 'staging') {
  const printings = new Map(), names = new Map();
  for (const row of rows) {
    printings.set(row.printing_id, { id: row.printing_id, game_code: 'pokemon', set_id: row.set_id, language_code: row.language_code, collector_number: row.collector_number, native_name: row.current_native_name, english_display_name: `English ${row.collector_number}`, deprecated_at: null, artist: 'Artist', source_updated_at: null, updated_at: 'before', printing_discriminator: '' });
    names.set(row.printing_id, [
      { id: row.expected_native_name_row_id[environment], printing_id: row.printing_id, variant_id: id(500 + Number(row.collector_number)), card_concept_id: null, language_code: row.language_code, name_type: 'native', name: row.current_native_name, normalized_name: normalizeNativeName(row.current_native_name), deprecated_at: null, source_confidence: 0.85, updated_at: 'before' },
      { id: id(600 + Number(row.collector_number)), printing_id: row.printing_id, variant_id: null, card_concept_id: id(700 + Number(row.collector_number)), language_code: 'en', name_type: 'english_display', name: `English ${row.collector_number}`, normalized_name: `english ${row.collector_number}`, deprecated_at: null, source_confidence: 0.85, updated_at: 'before' },
      { id: id(800 + Number(row.collector_number)), printing_id: row.printing_id, variant_id: null, card_concept_id: id(900 + Number(row.collector_number)), language_code: 'en', name_type: 'alias', name: `Alias ${row.collector_number}`, normalized_name: `alias ${row.collector_number}`, deprecated_at: null, source_confidence: 0.85, updated_at: 'before' },
    ]);
  }
  let snapshot = null, updates = 0, mutateAliasOnUpdate = false, mutatePrintingOnNameUpdate = false;
  return {
    printings, names, get updates() { return updates; }, set mutateAliasOnUpdate(value) { mutateAliasOnUpdate = value; }, set mutatePrintingOnNameUpdate(value) { mutatePrintingOnNameUpdate = value; },
    query: async (sql, args = []) => {
      if (sql.startsWith('begin')) { snapshot = clone({ printings: [...printings], names: [...names] }); return { rows: [], rowCount: null }; }
      if (sql === 'rollback') { if (snapshot) { printings.clear(); names.clear(); for (const [key, value] of snapshot.printings) printings.set(key, value); for (const [key, value] of snapshot.names) names.set(key, value); } return { rows: [], rowCount: null }; }
      if (sql.startsWith('set local')) return { rows: [], rowCount: null };
      if (sql.startsWith('select * from catalog.card_printings')) { const value = printings.get(args[0]); return { rows: value ? [clone(value)] : [], rowCount: value ? 1 : 0 }; }
      if (sql.startsWith('select * from catalog.card_names')) { const values = names.get(args[0]) ?? []; return { rows: clone(values), rowCount: values.length }; }
      if (sql.startsWith('update catalog.card_printings')) { const value = printings.get(args[0]); if (!value || value.native_name !== args[2]) return { rows: [], rowCount: 0 }; value.native_name = args[1]; value.updated_at = 'after'; updates += 1; return { rows: [clone(value)], rowCount: 1 }; }
      if (sql.startsWith('update catalog.card_names')) { const value = [...names.values()].flat().find((name) => name.id === args[0]); if (!value || value.name !== args[3] || value.normalized_name !== args[4]) return { rows: [], rowCount: 0 }; value.name = args[1]; value.normalized_name = args[2]; value.updated_at = 'after'; if (mutateAliasOnUpdate) names.get(value.printing_id)[1].name = 'Tampered English alias'; if (mutatePrintingOnNameUpdate) printings.get(value.printing_id).artist = 'Tampered printing field'; updates += 1; return { rows: [clone(value)], rowCount: 1 }; }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test('normalizes names with catalogue NFKC whitespace and case semantics', () => assert.equal(normalizeNativeName(' Ａ\t B '), 'a b'));

test('requires the fully enriched fixed 53-row plan', () => {
  assert.throws(() => createNativeNameCorrections([]), /53/);
  const duplicate = plan(); duplicate[52].printing_id = duplicate[0].printing_id;
  assert.throws(() => createNativeNameCorrections(duplicate), /unique/);
  const missing = plan(); delete missing[0].expected_native_name_row_id.production;
  assert.throws(() => createNativeNameCorrections(missing), /expected_native_name_row_id.production/);
  const unchanged = plan(); unchanged[0].proposed_native_name = unchanged[0].current_native_name;
  assert.throws(() => createNativeNameCorrections(unchanged), /old and new names match/);
});

test('accepts only an explicitly frozen 72-row cohort when requested', async () => {
  const rows = Array.from({ length: 72 }, (_, index) => ({
    printing_id: id(index + 1001), expected_native_name_row_id: { staging: id(index + 2001), production: id(index + 3001) }, current_native_name: `旧72 ${index + 1}`,
    proposed_native_name: `新72 ${index + 1}`, language_code: 'ja', set_id: id(index + 4001), collector_number: String(index + 1).padStart(3, '0'),
  }));
  assert.throws(() => createNativeNameCorrections(rows), /Expected 53/);
  assert.throws(() => createNativeNameCorrections(rows.slice(0, 71), { expectedCount: 72 }), /Expected 72/);
  assert.throws(() => createNativeNameCorrections(rows, { expectedCount: 54 }), /Unsupported/);
  const duplicate = structuredClone(rows); duplicate[71].printing_id = duplicate[0].printing_id;
  assert.throws(() => createNativeNameCorrections(duplicate, { expectedCount: 72 }), /unique/);
  const db = fixture(rows);
  const audit = await createNativeNameCorrections(rows, { expectedCount: 72 })(db, 'staging');
  assert.equal(audit.length, 72); assert.equal(db.updates, 144);
});

test('accepts an explicitly frozen 70-row cohort and rejects cardinality drift', () => {
  const rows = Array.from({ length: 70 }, (_, index) => ({ printing_id: id(index + 5001), expected_native_name_row_id: { staging: id(index + 6001), production: id(index + 7001) }, current_native_name: `old70 ${index}`, proposed_native_name: `new70 ${index}`, language_code: 'ja', set_id: id(index + 8001), collector_number: String(index) }));
  assert.doesNotThrow(() => createNativeNameCorrections(rows, { expectedCount: 70 }));
  assert.throws(() => createNativeNameCorrections(rows.slice(1), { expectedCount: 70 }), /Expected 70/);
  rows[69].printing_id = rows[0].printing_id; assert.throws(() => createNativeNameCorrections(rows, { expectedCount: 70 }), /unique/);
});

test('accepts an explicitly frozen 74-row cohort and rejects cardinality or duplicate drift', () => {
  const rows = Array.from({ length: 74 }, (_, index) => ({ printing_id: id(index + 9001), expected_native_name_row_id: { staging: id(index + 10001), production: id(index + 11001) }, current_native_name: `old74 ${index}`, proposed_native_name: `new74 ${index}`, language_code: 'ja', set_id: id(index + 12001), collector_number: String(index) }));
  assert.doesNotThrow(() => createNativeNameCorrections(rows, { expectedCount: 74 }));
  assert.throws(() => createNativeNameCorrections(rows.slice(1), { expectedCount: 74 }), /Expected 74/);
  rows[73].expected_native_name_row_id.staging = rows[0].expected_native_name_row_id.staging; assert.throws(() => createNativeNameCorrections(rows, { expectedCount: 74 }), /unique/);
});

test('accepts an explicitly frozen 71-row cohort and rejects cardinality or duplicate drift', () => {
  const rows = Array.from({ length: 71 }, (_, index) => ({ printing_id: id(index + 13001), expected_native_name_row_id: { staging: id(index + 14001), production: id(index + 15001) }, current_native_name: `old71 ${index}`, proposed_native_name: `new71 ${index}`, language_code: 'ja', set_id: id(index + 16001), collector_number: String(index) }));
  assert.doesNotThrow(() => createNativeNameCorrections(rows, { expectedCount: 71 }));
  assert.throws(() => createNativeNameCorrections(rows.slice(1), { expectedCount: 71 }), /Expected 71/);
  rows[70].expected_native_name_row_id.production = rows[0].expected_native_name_row_id.production;
  assert.throws(() => createNativeNameCorrections(rows, { expectedCount: 71 }), /unique/);
});

test('an explicit 81-row production plan updates only native pairs and is idempotent', async () => {
  const rows = Array.from({ length: 81 }, (_, i) => ({ printing_id: id(i + 17001), expected_native_name_row_id: { staging: id(i + 18001), production: id(i + 19001) }, current_native_name: `旧81 ${i}`, proposed_native_name: `新81 ${i}`, language_code: 'ja', set_id: id(20001), collector_number: String(i + 1) }));
  assert.throws(() => createNativeNameCorrections(rows), /Expected 53/);
  assert.throws(() => createNativeNameCorrections(rows.slice(1), { expectedCount: 81 }), /Expected 81/);
  const duplicate = clone(rows); duplicate[80].expected_native_name_row_id.production = duplicate[0].expected_native_name_row_id.production;
  assert.throws(() => createNativeNameCorrections(duplicate, { expectedCount: 81 }), /unique/);
  const db = fixture(rows, 'production'), before = clone({ printings: [...db.printings], names: [...db.names] });
  const repair = createNativeNameCorrections(rows, { expectedCount: 81 }), audit = await repair(db, 'production');
  assert.equal(audit.length, 81); assert.equal(audit.filter(r => r.changed).length, 81); assert.equal(db.updates, 162);
  for (const row of rows) {
    const old = before.printings.find(([key]) => key === row.printing_id)[1], after = db.printings.get(row.printing_id);
    assert.equal(after.native_name, row.proposed_native_name);
    assert.deepEqual({ ...after, native_name: old.native_name, updated_at: old.updated_at }, old);
    const oldNames = new Map(before.names.find(([key]) => key === row.printing_id)[1].map(n => [n.id, n]));
    for (const n of db.names.get(row.printing_id).filter(n => n.id !== row.expected_native_name_row_id.production)) assert.deepEqual(n, oldNames.get(n.id));
  }
  const afterFirst = clone({ printings: [...db.printings], names: [...db.names] });
  assert.equal((await repair(db, 'production')).filter(r => r.changed).length, 0); assert.equal(db.updates, 162);
  assert.deepEqual({ printings: [...db.printings], names: [...db.names] }, afterFirst);
});

test('an explicit 97-row production plan updates only native pairs and is idempotent', async () => {
  const rows = Array.from({ length: 97 }, (_, i) => ({ printing_id: id(i + 17001), expected_native_name_row_id: { staging: id(i + 18001), production: id(i + 19001) }, current_native_name: `旧97 ${i}`, proposed_native_name: `新97 ${i}`, language_code: 'ja', set_id: id(20001), collector_number: String(i + 1) }));
  assert.throws(() => createNativeNameCorrections(rows), /Expected 53/);
  assert.throws(() => createNativeNameCorrections(rows.slice(1), { expectedCount: 97 }), /Expected 97/);
  const duplicate = clone(rows); duplicate[96].expected_native_name_row_id.production = duplicate[0].expected_native_name_row_id.production;
  assert.throws(() => createNativeNameCorrections(duplicate, { expectedCount: 97 }), /unique/);
  const db = fixture(rows, 'production'), before = clone({ printings: [...db.printings], names: [...db.names] });
  const repair = createNativeNameCorrections(rows, { expectedCount: 97 }), audit = await repair(db, 'production');
  assert.equal(audit.length, 97); assert.equal(audit.filter(r => r.changed).length, 97); assert.equal(db.updates, 194);
  for (const row of rows) {
    const old = before.printings.find(([key]) => key === row.printing_id)[1], after = db.printings.get(row.printing_id);
    assert.equal(after.native_name, row.proposed_native_name);
    assert.deepEqual({ ...after, native_name: old.native_name, updated_at: old.updated_at }, old);
    const oldNames = new Map(before.names.find(([key]) => key === row.printing_id)[1].map(n => [n.id, n]));
    for (const n of db.names.get(row.printing_id).filter(n => n.id !== row.expected_native_name_row_id.production)) assert.deepEqual(n, oldNames.get(n.id));
  }
  const afterFirst = clone({ printings: [...db.printings], names: [...db.names] });
  assert.equal((await repair(db, 'production')).filter(r => r.changed).length, 0); assert.equal(db.updates, 194);
  assert.deepEqual({ printings: [...db.printings], names: [...db.names] }, afterFirst);
});

test('updates exactly all 53 printing/native pairs while preserving aliases and other columns', async () => {
  const rows = plan(), db = fixture(rows), before = clone({ printings: [...db.printings], names: [...db.names] });
  const audit = await createNativeNameCorrections(rows)(db, 'staging');
  assert.equal(audit.length, 53); assert.equal(audit.filter((entry) => entry.changed).length, 53); assert.equal(db.updates, 106);
  for (const row of rows) {
    assert.equal(db.printings.get(row.printing_id).native_name, row.proposed_native_name);
    const beforeNames = new Map(before.names.find(([key]) => key === row.printing_id)[1].map((name) => [name.id, name]));
    for (const name of db.names.get(row.printing_id).filter((entry) => entry.id !== row.expected_native_name_row_id.staging)) assert.deepEqual(name, beforeNames.get(name.id));
    const beforePrinting = before.printings.find(([key]) => key === row.printing_id)[1], afterPrinting = db.printings.get(row.printing_id);
    assert.deepEqual({ ...afterPrinting, native_name: beforePrinting.native_name, updated_at: beforePrinting.updated_at }, beforePrinting);
  }
});

test('is idempotent when all 53 pairs are already repaired', async () => {
  const rows = plan(), db = fixture(rows); await createNativeNameCorrections(rows)(db, 'staging');
  const afterFirst = clone({ printings: [...db.printings], names: [...db.names] }), updates = db.updates;
  const audit = await createNativeNameCorrections(rows)(db, 'staging');
  assert.equal(audit.filter((entry) => entry.changed).length, 0); assert.equal(db.updates, updates); assert.deepEqual({ printings: [...db.printings], names: [...db.names] }, afterFirst);
});

test('rejects state drift, wrong-environment/wrong-language native rows, duplicates, and unrelated mutations', async () => {
  for (const [index, mutate] of [
    (db, row) => { db.printings.get(row.printing_id).native_name = 'unreviewed'; },
    (db, row) => db.names.set(row.printing_id, db.names.get(row.printing_id).filter((name) => name.name_type !== 'native')),
    (db, row) => db.names.get(row.printing_id).push({ ...db.names.get(row.printing_id)[0], id: id(9999) }),
    (db, row) => { db.names.get(row.printing_id)[0].language_code = 'en'; },
    (db) => { db.mutateAliasOnUpdate = true; },
    (db) => { db.mutatePrintingOnNameUpdate = true; },
  ].entries()) {
    const rows = plan(), db = fixture(rows, 'production'); mutate(db, rows[0]);
    await assert.rejects(createNativeNameCorrections(rows)(db, 'production')); assert.equal(db.updates, index >= 4 ? 2 : 0);
  }
});

test('rejects a staging native-row UUID when asked to repair production and rejects unknown environments', async () => {
  const rows = plan(), stagingDb = fixture(rows, 'staging');
  await assert.rejects(createNativeNameCorrections(rows)(stagingDb, 'production'), /Native name row identity drift/);
  await assert.rejects(createNativeNameCorrections(rows)(fixture(rows), 'preview'), /Unsupported native correction environment/);
});

test('a caller rehearsal rolls back all native updates when a later operation fails', async () => {
  const rows = plan(), db = fixture(rows), before = clone({ printings: [...db.printings], names: [...db.names] });
  await assert.rejects(rehearse(db, async () => { await createNativeNameCorrections(rows)(db, 'staging'); throw new Error('later asset failure'); }), /later asset failure/);
  assert.deepEqual({ printings: [...db.printings], names: [...db.names] }, before);
});
