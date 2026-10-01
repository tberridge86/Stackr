import { isDeepStrictEqual } from 'node:util';
import { check } from '../queue1-publish-20260927/publish.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const normalizeNativeName = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
const assertUuid = (value, label) => check(typeof value === 'string' && UUID.test(value), `Invalid ${label}`);

function assertOnlyChanged(before, after, allowed, label) {
  const ignored = new Set(['updated_at', ...allowed]);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !ignored.has(key) && !isDeepStrictEqual(before[key], after[key]));
  check(changed.length === 0, `${label} changed unexpectedly: ${changed.join(', ')}`);
}

function expectedRows(row, index, multi) {
  if (!multi) {
    check(row.expected_native_name_row_id && typeof row.expected_native_name_row_id === 'object' && !Array.isArray(row.expected_native_name_row_id), `Invalid expected_native_name_row_id map at native correction row ${index + 1}`);
    for (const env of ['staging', 'production']) assertUuid(row.expected_native_name_row_id[env], `expected_native_name_row_id.${env} at native correction row ${index + 1}`);
    return { staging: [{ id: row.expected_native_name_row_id.staging }], production: [{ id: row.expected_native_name_row_id.production }] };
  }
  check(!Object.hasOwn(row, 'expected_native_name_row_id'), `Singular expected native name row is forbidden in multi-row mode at native correction row ${index + 1}`);
  check(row.expected_native_name_rows && typeof row.expected_native_name_rows === 'object' && !Array.isArray(row.expected_native_name_rows), `Invalid expected_native_name_rows map at native correction row ${index + 1}`);
  const result = {};
  for (const env of ['staging', 'production']) {
    const values = row.expected_native_name_rows[env];
    check(Array.isArray(values) && values.length > 0, `Missing expected ${env} native name rows at native correction row ${index + 1}`);
    for (const value of values) { check(value && typeof value === 'object' && !Array.isArray(value), `Invalid expected ${env} native name row at native correction row ${index + 1}`); assertUuid(value.id, `expected ${env} native name id at native correction row ${index + 1}`); assertUuid(value.variant_id, `expected ${env} native variant_id at native correction row ${index + 1}`); }
    check(new Set(values.map((value) => value.id)).size === values.length && new Set(values.map((value) => value.variant_id)).size === values.length, `Duplicate expected ${env} native row identity at native correction row ${index + 1}`);
    result[env] = values.map(({ id, variant_id }) => ({ id, variant_id }));
  }
  return result;
}

function requirePlanRow(row, index, multi) {
  check(row && typeof row === 'object', `Invalid native correction row ${index + 1}`);
  assertUuid(row.printing_id, `printing_id at native correction row ${index + 1}`); assertUuid(row.set_id, `set_id at native correction row ${index + 1}`);
  check(typeof row.language_code === 'string' && row.language_code.trim() !== '', `Invalid language_code at native correction row ${index + 1}`);
  check(typeof row.collector_number === 'string' && row.collector_number !== '', `Invalid collector_number at native correction row ${index + 1}`);
  check(typeof row.current_native_name === 'string' && row.current_native_name.trim() !== '', `Invalid current_native_name at native correction row ${index + 1}`);
  const proposed_native_name = row.proposed_native_name ?? row.observed_native_title;
  check(typeof proposed_native_name === 'string' && proposed_native_name.trim() !== '', `Invalid proposed native name at native correction row ${index + 1}`);
  check(row.current_native_name !== proposed_native_name, `Native correction old and new names match at row ${index + 1}`);
  return { ...row, proposed_native_name, expectedRows: expectedRows(row, index, multi) };
}

function assertPrinting(printing, row) {
  check(printing && printing.id === row.printing_id, 'Missing native correction printing');
  check(printing.deprecated_at == null, `Native correction printing is deprecated: ${row.printing_id}`);
  check(printing.language_code === row.language_code && printing.set_id === row.set_id && printing.collector_number === row.collector_number, `Native correction printing identity drift: ${row.printing_id}`);
}

function assertNativeRows(rows, row, environment, multi) {
  const active = rows.filter((name) => name.name_type === 'native' && name.deprecated_at == null), expected = row.expectedRows[environment];
  check(active.length === expected.length, `Active native name row count drift: ${row.printing_id}`);
  const byId = new Map(active.map((name) => [name.id, name])); check(byId.size === active.length, `Duplicate active native name row id: ${row.printing_id}`);
  for (const wanted of expected) { const native = byId.get(wanted.id); check(native && native.printing_id === row.printing_id && native.language_code === row.language_code, `Native name row identity drift: ${row.printing_id}`); if (multi) check(native.variant_id === wanted.variant_id, `Native name variant identity drift: ${row.printing_id}`); }
  return expected.map((wanted) => byId.get(wanted.id));
}

function stateFor(printing, natives, row) {
  const old = printing.native_name === row.current_native_name && natives.every((native) => native.name === row.current_native_name && native.normalized_name === normalizeNativeName(row.current_native_name));
  const repaired = printing.native_name === row.proposed_native_name && natives.every((native) => native.name === row.proposed_native_name && native.normalized_name === normalizeNativeName(row.proposed_native_name));
  check(old || repaired, `Native correction old/new state drift: ${row.printing_id}`); return old ? 'old' : 'repaired';
}

function assertNamesPreserved(beforeRows, afterRows, natives, row, changed) {
  check(afterRows.length === beforeRows.length, `Card-name row count changed: ${row.printing_id}`);
  const nativeIds = new Set(natives.map((native) => native.id)), afterById = new Map(afterRows.map((name) => [name.id, name]));
  check(afterById.size === afterRows.length, `Duplicate card-name row id after correction: ${row.printing_id}`);
  for (const before of beforeRows) { const after = afterById.get(before.id); check(after, `Card-name row removed during correction: ${row.printing_id}`); assertOnlyChanged(before, after, changed && nativeIds.has(before.id) ? ['name', 'normalized_name'] : [], `Card-name row ${before.id}`); }
  for (const native of natives) { const after = afterById.get(native.id); check(after.name === row.proposed_native_name && after.normalized_name === normalizeNativeName(row.proposed_native_name), `Native name final state drift: ${row.printing_id}`); }
}

/** Builds the bounded hook invoked inside the caller's serializable transaction. */
export function createNativeNameCorrections(plan, { expectedCount = 53, expectedNameRowCount = expectedCount } = {}) {
  check(Number.isInteger(expectedCount) && [53, 70, 71, 72, 74, 81, 97].includes(expectedCount), 'Unsupported native-name correction count');
  check(Number.isInteger(expectedNameRowCount) && expectedNameRowCount >= expectedCount, 'Invalid expected native-name row count');
  const multi = expectedNameRowCount !== expectedCount;
  check(!multi || expectedCount === 97 && expectedNameRowCount === 193, 'Unsupported multi-row native-name correction scope');
  check(Array.isArray(plan) && plan.length === expectedCount, `Expected ${expectedCount} native-name corrections`);
  const corrections = plan.map((row, index) => requirePlanRow(row, index, multi));
  check(new Set(corrections.map((row) => row.printing_id)).size === expectedCount, `Expected ${expectedCount} unique native correction printings`);
  for (const env of ['staging', 'production']) { const rows = corrections.flatMap((row) => row.expectedRows[env]); check(rows.length === expectedNameRowCount, `Expected ${expectedNameRowCount} ${env} native correction name rows`); check(new Set(rows.map((row) => row.id)).size === expectedNameRowCount, `Expected ${expectedNameRowCount} unique ${env} native correction name rows`); }
  return async function nativeNameCorrections(db, environment) {
    check(environment === 'staging' || environment === 'production', `Unsupported native correction environment: ${environment}`);
    const audit = [];
    for (const row of corrections) {
      const lockedPrinting = await db.query('select * from catalog.card_printings where id=$1 for update', [row.printing_id]); check(lockedPrinting.rows.length === 1, 'Missing native correction printing');
      const printingBefore = lockedPrinting.rows[0]; assertPrinting(printingBefore, row);
      const namesBefore = (await db.query('select * from catalog.card_names where printing_id=$1 for update', [row.printing_id])).rows;
      const natives = assertNativeRows(namesBefore, row, environment, multi), state = stateFor(printingBefore, natives, row), normalized = normalizeNativeName(row.proposed_native_name);
      if (multi) {
        const variantIds = natives.map((native) => native.variant_id);
        const variants = (await db.query('select id, printing_id, deprecated_at from catalog.card_variants where printing_id=$1 and id=any($2::uuid[]) for share', [row.printing_id, variantIds])).rows;
        check(variants.length === variantIds.length && variants.every((variant) => variant.printing_id === row.printing_id && variantIds.includes(variant.id) && (environment === 'staging' || variant.deprecated_at == null)), `Native name variant inventory drift: ${row.printing_id}`);
      }
      if (state === 'old') {
        const updatedPrinting = await db.query('update catalog.card_printings set native_name=$2 where id=$1 and native_name=$3 returning *', [row.printing_id, row.proposed_native_name, row.current_native_name]);
        check(updatedPrinting.rowCount === 1 && updatedPrinting.rows.length === 1, `Native printing update count drift: ${row.printing_id}`); assertOnlyChanged(printingBefore, updatedPrinting.rows[0], ['native_name'], `Printing ${row.printing_id}`); check(updatedPrinting.rows[0].native_name === row.proposed_native_name, `Native printing update drift: ${row.printing_id}`);
        for (const native of natives) { const updated = await db.query('update catalog.card_names set name=$2, normalized_name=$3 where id=$1 and name=$4 and normalized_name=$5 returning *', [native.id, row.proposed_native_name, normalized, row.current_native_name, native.normalized_name]); check(updated.rowCount === 1 && updated.rows.length === 1, `Native name update count drift: ${row.printing_id}`); assertOnlyChanged(native, updated.rows[0], ['name', 'normalized_name'], `Native name ${native.id}`); check(updated.rows[0].name === row.proposed_native_name && updated.rows[0].normalized_name === normalized, `Native name update drift: ${row.printing_id}`); }
      }
      const namesAfter = (await db.query('select * from catalog.card_names where printing_id=$1', [row.printing_id])).rows; assertNamesPreserved(namesBefore, namesAfter, natives, row, state === 'old');
      const printingAfter = (await db.query('select * from catalog.card_printings where id=$1', [row.printing_id])).rows; check(printingAfter.length === 1, `Native correction printing disappeared: ${row.printing_id}`); assertOnlyChanged(printingBefore, printingAfter[0], state === 'old' ? ['native_name'] : [], `Printing ${row.printing_id}`); check(printingAfter[0].native_name === row.proposed_native_name, `Native correction final printing drift: ${row.printing_id}`);
      const native_name_rows = natives.map((native) => ({ id: native.id, ...(multi ? { variant_id: native.variant_id } : {}), changed: state === 'old' }));
      audit.push({ table: 'catalog.card_printings', id: row.printing_id, column: 'native_name', before: row.current_native_name, after: row.proposed_native_name, changed: state === 'old', ...(multi ? { native_name_rows } : { native_name_row_id: natives[0].id }), environment });
    }
    return audit;
  };
}
