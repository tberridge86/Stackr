import 'dotenv/config';

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function clean(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function chunks(values, size = 100) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message ?? String(error)}`);
}

async function selectInBatches(table, column, values, columns, configure = (query) => query) {
  const rows = [];
  for (const batch of chunks(unique(values), 100)) {
    if (!batch.length) continue;
    const { data, error } = await configure(table.select(columns).in(column, batch));
    requireNoError(error, `select ${column}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function updateRows(table, rows, context) {
  for (const row of rows) {
    const { id, ...patch } = row;
    const { error } = await table.update(patch).eq('id', id);
    requireNoError(error, context);
  }
}

async function main() {
  const setCode = clean(option('set-code'));
  const target = clean(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const reportPath = path.resolve(option('report', `reports/catalogue/official-japanese-set/${setCode ?? 'unknown'}-reconciliation.json`));
  const apply = hasFlag('apply');

  requireCondition(setCode, '--set-code is required.');
  requireCondition(target === 'staging', 'Reconciliation is restricted to staging.');
  requireCondition(apply, '--apply is required.');

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Expected StackR staging SUPABASE_URL.');
  requireCondition(!supabaseUrl.includes(PRODUCTION_PROJECT_REF), 'Production target detected; reconciliation refused.');
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const catalog = db.schema('catalog');
  const ingest = db.schema('ingest');

  const { data: sets, error: setError } = await catalog.from('sets')
    .select('id,set_code,native_name,english_display_name,total,printed_total')
    .eq('language_code', 'ja')
    .eq('set_code', setCode)
    .is('deprecated_at', null);
  requireNoError(setError, 'load target set');
  requireCondition(sets?.length === 1, `Expected one active Japanese set ${setCode}.`);
  const setRow = sets[0];

  const { data: beforeRows, error: beforeError } = await catalog.from('card_printings')
    .select('id,collector_number,native_name,english_display_name,card_concept_id')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null)
    .order('collector_number_sort', { ascending: true });
  requireNoError(beforeError, 'load target printings');
  requireCondition((beforeRows ?? []).length > 0, 'Target set has no active printings.');

  const unresolvedNames = unique((beforeRows ?? [])
    .filter((row) => !row.card_concept_id)
    .map((row) => clean(row.native_name)));
  const candidatesByName = new Map(unresolvedNames.map((name) => [name, new Set()]));

  const nameCandidates = await selectInBatches(
    catalog.from('card_names'),
    'name',
    unresolvedNames,
    'name,card_concept_id',
    (query) => query
      .eq('language_code', 'ja')
      .eq('name_type', 'native')
      .not('card_concept_id', 'is', null)
      .is('deprecated_at', null),
  );
  for (const row of nameCandidates) {
    if (row.card_concept_id) candidatesByName.get(row.name)?.add(row.card_concept_id);
  }

  const printingCandidates = await selectInBatches(
    catalog.from('card_printings'),
    'native_name',
    unresolvedNames,
    'native_name,card_concept_id',
    (query) => query
      .eq('language_code', 'ja')
      .not('card_concept_id', 'is', null)
      .is('deprecated_at', null),
  );
  for (const row of printingCandidates) {
    if (row.card_concept_id) candidatesByName.get(row.native_name)?.add(row.card_concept_id);
  }

  const uniqueConceptByName = new Map();
  const ambiguousNames = [];
  const noCandidateNames = [];
  for (const [name, candidateSet] of candidatesByName) {
    const candidateIds = [...candidateSet];
    if (candidateIds.length === 1) uniqueConceptByName.set(name, candidateIds[0]);
    else if (candidateIds.length > 1) ambiguousNames.push({ name, concept_ids: candidateIds });
    else noCandidateNames.push(name);
  }

  const conceptUpdates = (beforeRows ?? [])
    .filter((row) => !row.card_concept_id && uniqueConceptByName.has(row.native_name))
    .map((row) => ({
      id: row.id,
      card_concept_id: uniqueConceptByName.get(row.native_name),
      source_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  await updateRows(catalog.from('card_printings'), conceptUpdates, 'update resolved card concept');

  const { data: afterConceptRows, error: afterConceptError } = await catalog.from('card_printings')
    .select('id,collector_number,native_name,english_display_name,card_concept_id')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null)
    .order('collector_number_sort', { ascending: true });
  requireNoError(afterConceptError, 'reload reconciled printings');

  const conceptIds = unique((afterConceptRows ?? []).map((row) => row.card_concept_id));
  const englishByConcept = new Map(conceptIds.map((id) => [id, new Set()]));

  const conceptRows = await selectInBatches(
    catalog.from('card_concepts'),
    'id',
    conceptIds,
    'id,default_english_name',
    (query) => query.is('deprecated_at', null),
  );
  for (const row of conceptRows) {
    const value = clean(row.default_english_name);
    if (value) englishByConcept.get(row.id)?.add(value);
  }

  const englishNameRows = await selectInBatches(
    catalog.from('card_names'),
    'card_concept_id',
    conceptIds,
    'card_concept_id,name,name_type',
    (query) => query.eq('language_code', 'en').is('deprecated_at', null),
  );
  for (const row of englishNameRows) {
    const value = clean(row.name);
    if (value) englishByConcept.get(row.card_concept_id)?.add(value);
  }

  const englishUpdates = [];
  for (const row of afterConceptRows ?? []) {
    if (clean(row.english_display_name) || !row.card_concept_id) continue;
    const candidates = [...(englishByConcept.get(row.card_concept_id) ?? new Set())];
    if (candidates.length === 1) {
      englishUpdates.push({
        id: row.id,
        english_display_name: candidates[0],
        source_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }
  await updateRows(catalog.from('card_printings'), englishUpdates, 'update English display name');

  const { data: conflictRows, error: conflictError } = await ingest.from('data_conflicts')
    .select('id,canonical_key,proposed_payload,status')
    .like('canonical_key', `pokemon:ja:${setRow.id}:%:concept-ambiguity`)
    .in('status', ['open', 'in_review']);
  requireNoError(conflictError, 'load import conflicts');

  const resolvedNames = new Set(uniqueConceptByName.keys());
  const conflictUpdates = (conflictRows ?? [])
    .filter((row) => resolvedNames.has(clean(row.proposed_payload?.native_name)))
    .map((row) => ({
      id: row.id,
      status: 'resolved',
      resolution_notes: 'Automatically resolved after null concept candidates were discarded and one real Japanese concept remained.',
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  await updateRows(ingest.from('data_conflicts'), conflictUpdates, 'resolve false concept conflict');

  const { data: finalRows, error: finalError } = await catalog.from('card_printings')
    .select('id,collector_number,native_name,english_display_name,card_concept_id,rarity_id,artist,supertype')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null)
    .order('collector_number_sort', { ascending: true });
  requireNoError(finalError, 'load final printings');

  const duplicateNumbers = [];
  const seenNumbers = new Set();
  for (const row of finalRows ?? []) {
    if (seenNumbers.has(row.collector_number)) duplicateNumbers.push(row.collector_number);
    seenNumbers.add(row.collector_number);
  }

  const { count: openConflictCount, error: openConflictError } = await ingest.from('data_conflicts')
    .select('id', { count: 'exact', head: true })
    .like('canonical_key', `pokemon:ja:${setRow.id}:%:concept-ambiguity`)
    .in('status', ['open', 'in_review']);
  requireNoError(openConflictError, 'count remaining concept conflicts');

  const report = {
    ok: ambiguousNames.length === 0 && duplicateNumbers.length === 0,
    target: 'staging',
    production_modified: false,
    set: setRow,
    before: {
      active_printings: beforeRows?.length ?? 0,
      unresolved_concepts: (beforeRows ?? []).filter((row) => !row.card_concept_id).length,
    },
    writes: {
      concept_links_applied: conceptUpdates.length,
      english_names_applied: englishUpdates.length,
      false_conflicts_resolved: conflictUpdates.length,
    },
    final: {
      active_printings: finalRows?.length ?? 0,
      distinct_collector_numbers: seenNumbers.size,
      duplicate_collector_numbers: unique(duplicateNumbers),
      unresolved_concepts: (finalRows ?? []).filter((row) => !row.card_concept_id).length,
      missing_english_names: (finalRows ?? []).filter((row) => !clean(row.english_display_name)).length,
      missing_rarity: (finalRows ?? []).filter((row) => !row.rarity_id).length,
      missing_artist: (finalRows ?? []).filter((row) => !clean(row.artist)).length,
      missing_supertype: (finalRows ?? []).filter((row) => !clean(row.supertype)).length,
      open_concept_conflicts: openConflictCount ?? 0,
    },
    unresolved: {
      ambiguous_names: ambiguousNames,
      no_candidate_names: noCandidateNames,
    },
  };

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));

  requireCondition(report.final.active_printings === setRow.total, 'Active printing count does not equal full set total.');
  requireCondition(report.final.distinct_collector_numbers === setRow.total, 'Collector-number count does not equal full set total.');
  requireCondition(report.final.duplicate_collector_numbers.length === 0, 'Duplicate collector numbers remain.');
  requireCondition(report.final.unresolved_concepts === 0, 'Unresolved concept links remain.');
  requireCondition(report.final.open_concept_conflicts === 0, 'Open concept conflicts remain.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
