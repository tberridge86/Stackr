import 'dotenv/config';

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REFS = new Set(['oakdbbzdqwurpjnoqhmu']);

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message ?? String(error)}`);
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

async function selectInBatches(table, column, values, columns, configure = (query) => query) {
  const rows = [];
  for (const batch of chunks(unique(values))) {
    if (!batch.length) continue;
    const { data, error } = await configure(table.select(columns).in(column, batch));
    requireNoError(error, `select ${column} batch`);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function main() {
  const setCode = cleanText(option('set-code'));
  const reportPath = path.resolve(option('report', 'reports/catalogue/official-japanese-set/concept-reconciliation.json'));
  requireCondition(setCode, '--set-code is required.');

  const supabaseUrl = cleanText(process.env.SUPABASE_URL);
  const supabaseKey = cleanText(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Only the approved StackR staging project is permitted.');
  for (const productionRef of PRODUCTION_PROJECT_REFS) {
    requireCondition(!supabaseUrl.includes(productionRef), 'Production Supabase URL detected; reconciliation refused.');
  }
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-StackR-Reconciliation': `official-jp-${setCode}` } },
  });
  const catalog = db.schema('catalog');
  const ingest = db.schema('ingest');

  const { data: targetSets, error: setError } = await catalog.from('sets')
    .select('id,set_code,language_code')
    .eq('language_code', 'ja')
    .eq('set_code', setCode)
    .is('deprecated_at', null);
  requireNoError(setError, 'load target set');
  requireCondition(targetSets?.length === 1, `Expected exactly one active Japanese set ${setCode}.`);
  const targetSet = targetSets[0];

  const { data: unresolvedRows, error: unresolvedError } = await catalog.from('card_printings')
    .select('id,collector_number,native_name,card_concept_id')
    .eq('set_id', targetSet.id)
    .eq('language_code', 'ja')
    .is('card_concept_id', null)
    .is('deprecated_at', null)
    .order('collector_number_sort', { ascending: true });
  requireNoError(unresolvedError, 'load unresolved target printings');

  const names = unique((unresolvedRows ?? []).map((row) => cleanText(row.native_name)));
  const candidatesByName = new Map(names.map((name) => [name, new Set()]));

  const nameRows = await selectInBatches(
    catalog.from('card_names'),
    'name',
    names,
    'name,card_concept_id',
    (query) => query.eq('language_code', 'ja').is('deprecated_at', null),
  );
  for (const row of nameRows) {
    if (row.card_concept_id) candidatesByName.get(row.name)?.add(row.card_concept_id);
  }

  const printingRows = await selectInBatches(
    catalog.from('card_printings'),
    'native_name',
    names,
    'native_name,card_concept_id',
    (query) => query.eq('language_code', 'ja').is('deprecated_at', null),
  );
  for (const row of printingRows) {
    if (row.card_concept_id) candidatesByName.get(row.native_name)?.add(row.card_concept_id);
  }

  const uniquelyResolved = [];
  const noCandidate = [];
  const realAmbiguity = [];
  for (const printing of unresolvedRows ?? []) {
    const candidates = [...(candidatesByName.get(printing.native_name) ?? new Set())];
    if (candidates.length === 1) {
      uniquelyResolved.push({ ...printing, card_concept_id: candidates[0] });
    } else if (candidates.length === 0) {
      noCandidate.push({ ...printing, candidate_concept_ids: [] });
    } else {
      realAmbiguity.push({ ...printing, candidate_concept_ids: candidates });
    }
  }

  for (const batch of chunks(uniquelyResolved, 100)) {
    for (const printing of batch) {
      const { error } = await catalog.from('card_printings')
        .update({
          card_concept_id: printing.card_concept_id,
          source_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', printing.id)
        .is('card_concept_id', null);
      requireNoError(error, `link concept for ${printing.collector_number}`);
    }
  }

  for (const printing of uniquelyResolved) {
    const canonicalKey = `pokemon:ja:${targetSet.id}:${printing.native_name}:concept-ambiguity`;
    const { error } = await ingest.from('data_conflicts')
      .update({
        status: 'resolved',
        resolution_notes: 'Resolved by excluding null concept IDs from the candidate set; exactly one non-null canonical concept remained.',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('canonical_key', canonicalKey)
      .in('status', ['open', 'in_review']);
    requireNoError(error, `resolve false conflict for ${printing.native_name}`);
  }

  const { data: finalRows, error: finalError } = await catalog.from('card_printings')
    .select('id,collector_number,native_name,card_concept_id')
    .eq('set_id', targetSet.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null);
  requireNoError(finalError, 'verify reconciled target printings');

  const unresolvedAfter = (finalRows ?? []).filter((row) => !row.card_concept_id);
  const result = {
    ok: unresolvedAfter.length === 0 && realAmbiguity.length === 0 && noCandidate.length === 0,
    target: 'staging',
    production_modified: false,
    set_code: setCode,
    unresolved_before: unresolvedRows?.length ?? 0,
    uniquely_resolved: uniquelyResolved.length,
    no_candidate: noCandidate.length,
    real_ambiguity: realAmbiguity.length,
    unresolved_after: unresolvedAfter.length,
    no_candidate_examples: noCandidate.slice(0, 20),
    real_ambiguity_examples: realAmbiguity.slice(0, 20),
  };

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  requireCondition(result.ok, 'Concept reconciliation left unresolved or genuinely ambiguous printings.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
