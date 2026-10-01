import { isDeepStrictEqual } from 'node:util';
import { check } from '../queue1-publish-20260927/publish.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

// Keep this in step with scripts/catalogue-ingestion/sourceAdapter.ts.
export const normalizeNativeName = (value) => String(value ?? '')
  .normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');

function assertUuid(value, label) {
  check(typeof value === 'string' && UUID.test(value), `Invalid ${label}`);
}

function assertOnlyChanged(before, after, allowed, label) {
  const ignored = new Set(['updated_at', ...allowed]);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !ignored.has(key) && !isDeepStrictEqual(before[key], after[key]));
  check(changed.length === 0, `${label} changed unexpectedly: ${changed.join(', ')}`);
}

function requirePlanRow(row, index) {
  check(row && typeof row === 'object', `Invalid native correction row ${index + 1}`);
  assertUuid(row.printing_id, `printing_id at native correction row ${index + 1}`);
  assertUuid(row.set_id, `set_id at native correction row ${index + 1}`);
  check(row.expected_native_name_row_id && typeof row.expected_native_name_row_id === 'object' && !Array.isArray(row.expected_native_name_row_id), `Invalid expected_native_name_row_id map at native correction row ${index + 1}`);
  for (const environment of ['staging', 'production']) assertUuid(row.expected_native_name_row_id[environment], `expected_native_name_row_id.${environment} at native correction row ${index + 1}`);
  check(typeof row.language_code === 'string' && row.language_code.trim() !== '', `Invalid language_code at native correction row ${index + 1}`);
  check(typeof row.collector_number === 'string' && row.collector_number !== '', `Invalid collector_number at native correction row ${index + 1}`);
  check(typeof row.current_native_name === 'string' && row.current_native_name.trim() !== '', `Invalid current_native_name at native correction row ${index + 1}`);
  const newName = row.proposed_native_name ?? row.observed_native_title;
  check(typeof newName === 'string' && newName.trim() !== '', `Invalid proposed native name at native correction row ${index + 1}`);
  check(row.current_native_name !== newName, `Native correction old and new names match at row ${index + 1}`);
  return { ...row, proposed_native_name: newName };
}

function assertPrinting(printing, row) {
  check(printing && printing.id === row.printing_id, 'Missing native correction printing');
  check(printing.deprecated_at == null, `Native correction printing is deprecated: ${row.printing_id}`);
  check(printing.language_code === row.language_code && printing.set_id === row.set_id && printing.collector_number === row.collector_number, `Native correction printing identity drift: ${row.printing_id}`);
}

function assertNativeRow(rows, row, environment) {
  const active = rows.filter((name) => name.name_type === 'native' && name.deprecated_at == null);
  check(active.length === 1, `Expected exactly one active native name row: ${row.printing_id}`);
  const native = active[0];
  check(native.id === row.expected_native_name_row_id[environment] && native.printing_id === row.printing_id && native.language_code === row.language_code, `Native name row identity drift: ${row.printing_id}`);
  return native;
}

function stateFor(printing, native, row) {
  const old = printing.native_name === row.current_native_name
    && native.name === row.current_native_name
    && native.normalized_name === normalizeNativeName(row.current_native_name);
  const repaired = printing.native_name === row.proposed_native_name
    && native.name === row.proposed_native_name
    && native.normalized_name === normalizeNativeName(row.proposed_native_name);
  check(old || repaired, `Native correction old/new state drift: ${row.printing_id}`);
  return old ? 'old' : 'repaired';
}

function assertNamesPreserved(beforeRows, afterRows, nativeId, row, changed) {
  check(afterRows.length === beforeRows.length, `Card-name row count changed: ${row.printing_id}`);
  const afterById = new Map(afterRows.map((name) => [name.id, name]));
  check(afterById.size === afterRows.length, `Duplicate card-name row id after correction: ${row.printing_id}`);
  for (const before of beforeRows) {
    const after = afterById.get(before.id);
    check(after, `Card-name row removed during correction: ${row.printing_id}`);
    assertOnlyChanged(before, after, changed && before.id === nativeId ? ['name', 'normalized_name'] : [], `Card-name row ${before.id}`);
  }
  const nativeAfter = afterById.get(nativeId);
  check(nativeAfter.name === row.proposed_native_name && nativeAfter.normalized_name === normalizeNativeName(row.proposed_native_name), `Native name final state drift: ${row.printing_id}`);
}

/**
 * Builds the bounded hook invoked inside the caller's serializable transaction.
 * The wrapper must enrich the reviewed plan with environment-specific UUIDs.
 */
export function createNativeNameCorrections(plan, { expectedCount = 53 } = {}) {
  // The caller freezes its intended cohort cardinality. Do not derive this from
  // plan.length: that would turn a truncated plan into an accepted release.
  check(Number.isInteger(expectedCount) && [53, 72].includes(expectedCount), 'Unsupported native-name correction count');
  check(Array.isArray(plan) && plan.length === expectedCount, `Expected ${expectedCount} native-name corrections`);
  const corrections = plan.map(requirePlanRow);
  check(new Set(corrections.map((row) => row.printing_id)).size === expectedCount, `Expected ${expectedCount} unique native correction printings`);
  for (const environment of ['staging', 'production']) check(new Set(corrections.map((row) => row.expected_native_name_row_id[environment])).size === expectedCount, `Expected ${expectedCount} unique ${environment} native correction name rows`);

  return async function nativeNameCorrections(db, environment) {
    check(environment === 'staging' || environment === 'production', `Unsupported native correction environment: ${environment}`);
    const audit = [];
    for (const row of corrections) {
      // PostgreSQL cannot combine FOR UPDATE with the previous aggregate query.
      // Locking all names also gives an exact before/after alias preservation check.
      const printingResult = await db.query('select * from catalog.card_printings where id=$1 for update', [row.printing_id]);
      check(printingResult.rows.length === 1, 'Missing native correction printing');
      const printingBefore = printingResult.rows[0];
      assertPrinting(printingBefore, row);
      const namesBefore = (await db.query('select * from catalog.card_names where printing_id=$1 for update', [row.printing_id])).rows;
      const nativeBefore = assertNativeRow(namesBefore, row, environment);
      const state = stateFor(printingBefore, nativeBefore, row);
      const normalizedName = normalizeNativeName(row.proposed_native_name);

      if (state === 'old') {
        const updatedPrinting = await db.query('update catalog.card_printings set native_name=$2 where id=$1 and native_name=$3 returning *', [row.printing_id, row.proposed_native_name, row.current_native_name]);
        check(updatedPrinting.rowCount === 1 && updatedPrinting.rows.length === 1, `Native printing update count drift: ${row.printing_id}`);
        assertOnlyChanged(printingBefore, updatedPrinting.rows[0], ['native_name'], `Printing ${row.printing_id}`);
        check(updatedPrinting.rows[0].native_name === row.proposed_native_name, `Native printing update drift: ${row.printing_id}`);

        const updatedNative = await db.query('update catalog.card_names set name=$2, normalized_name=$3 where id=$1 and name=$4 and normalized_name=$5 returning *', [nativeBefore.id, row.proposed_native_name, normalizedName, row.current_native_name, nativeBefore.normalized_name]);
        check(updatedNative.rowCount === 1 && updatedNative.rows.length === 1, `Native name update count drift: ${row.printing_id}`);
        assertOnlyChanged(nativeBefore, updatedNative.rows[0], ['name', 'normalized_name'], `Native name ${nativeBefore.id}`);
        check(updatedNative.rows[0].name === row.proposed_native_name && updatedNative.rows[0].normalized_name === normalizedName, `Native name update drift: ${row.printing_id}`);
      }

      const namesAfter = (await db.query('select * from catalog.card_names where printing_id=$1', [row.printing_id])).rows;
      assertNamesPreserved(namesBefore, namesAfter, nativeBefore.id, row, state === 'old');
      const printingAfter = (await db.query('select * from catalog.card_printings where id=$1', [row.printing_id])).rows;
      check(printingAfter.length === 1, `Native correction printing disappeared: ${row.printing_id}`);
      assertOnlyChanged(printingBefore, printingAfter[0], state === 'old' ? ['native_name'] : [], `Printing ${row.printing_id}`);
      check(printingAfter[0].native_name === row.proposed_native_name, `Native correction final printing drift: ${row.printing_id}`);
      audit.push({ table: 'catalog.card_printings', id: row.printing_id, column: 'native_name', before: row.current_native_name, after: row.proposed_native_name, changed: state === 'old', native_name_row_id: nativeBefore.id, environment });
    }
    return audit;
  };
}
