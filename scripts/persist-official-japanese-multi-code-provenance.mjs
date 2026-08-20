#!/usr/bin/env node
import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const SOURCE_CODE = 'pokemon_card_jp_official';
const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
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

function chunks(values, size = 80) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message ?? String(error)}`);
}

async function selectInBatches(table, column, values, columns, configure = (query) => query) {
  const rows = [];
  for (const batch of chunks(unique(values))) {
    if (!batch.length) continue;
    const { data, error } = await configure(table.select(columns).in(column, batch));
    requireNoError(error, `select ${column}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function main() {
  const inputPath = path.resolve(option('input'));
  const canonicalSetCode = clean(option('canonical-set-code'));
  const reportPath = path.resolve(option('report', `reports/catalogue/official-japanese-set/${canonicalSetCode}-multi-code-provenance.json`));
  const target = clean(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const apply = hasFlag('apply');

  requireCondition(inputPath, '--input is required.');
  requireCondition(canonicalSetCode, '--canonical-set-code is required.');
  requireCondition(target === 'staging', 'Multi-code provenance is restricted to staging.');
  requireCondition(apply, '--apply is required.');

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Expected StackR staging SUPABASE_URL.');
  requireCondition(!supabaseUrl.includes(PRODUCTION_PROJECT_REF), 'Production target detected; provenance write refused.');
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

  const sourceReport = JSON.parse(readFileSync(inputPath, 'utf8'));
  requireCondition(sourceReport.source === SOURCE_CODE, 'Unexpected source report.');
  requireCondition(sourceReport.set_code_requested === canonicalSetCode, 'Canonical set-code mismatch.');
  const officialSetCodes = unique((sourceReport.official_set_codes ?? []).map(clean));
  requireCondition(officialSetCodes.length > 1, 'This worker is only for split official set-code provenance.');

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const catalog = db.schema('catalog');
  const ingest = db.schema('ingest');

  const { data: source, error: sourceError } = await ingest.from('sources')
    .select('id,code')
    .eq('code', SOURCE_CODE)
    .eq('active', true)
    .is('deprecated_at', null)
    .single();
  requireNoError(sourceError, 'load official Japanese source');

  const { data: sets, error: setError } = await catalog.from('sets')
    .select('id,set_code,native_name,english_display_name,printed_total,total,release_date')
    .eq('language_code', 'ja')
    .eq('set_code', canonicalSetCode)
    .is('deprecated_at', null);
  requireNoError(setError, 'load canonical Japanese set');
  requireCondition(sets?.length === 1, `Expected one active Japanese set ${canonicalSetCode}.`);
  const setRow = sets[0];

  const printings = sourceReport.printings ?? [];
  const cardsByOfficialCode = new Map(officialSetCodes.map((code) => [code, []]));
  for (const printing of printings) {
    const officialCode = clean(printing.official_set_code);
    requireCondition(cardsByOfficialCode.has(officialCode), `Printing ${printing.collector_number} has unexpected official code ${officialCode}.`);
    cardsByOfficialCode.get(officialCode).push(printing);
  }

  let setRawInserted = 0;
  let setRawUpdated = 0;
  let setIdentifiersInserted = 0;
  let setIdentifiersUpdated = 0;

  for (const officialCode of officialSetCodes) {
    const sourceUrl = `https://www.pokemon-card.com/card-search/index.php?mode=statuslist&pg=${encodeURIComponent(officialCode)}`;
    const cards = cardsByOfficialCode.get(officialCode) ?? [];
    const payload = {
      provider: SOURCE_CODE,
      official_set_code: officialCode,
      official_set_codes: officialSetCodes,
      canonical_set_code: canonicalSetCode,
      language_code: 'ja',
      native_name: setRow.native_name,
      english_display_name: setRow.english_display_name,
      printed_total: setRow.printed_total,
      canonical_total: setRow.total,
      cards_returned_by_filter: cards.length,
      official_card_ids: cards.flatMap((printing) => printing.official_card_ids ?? []),
      source_url: sourceUrl,
      merged_manifest_generated_at: sourceReport.generated_at,
      rights_status: 'approved_by_stackr_owner',
    };

    const { data: rawRows, error: rawLookupError } = await ingest.from('raw_source_records')
      .select('id')
      .eq('source_id', source.id)
      .eq('record_type', 'set')
      .eq('external_id', officialCode)
      .eq('language_code', 'ja')
      .is('deprecated_at', null)
      .order('retrieved_at', { ascending: false })
      .limit(2);
    requireNoError(rawLookupError, `load set provenance ${officialCode}`);
    requireCondition((rawRows ?? []).length <= 1, `Multiple active raw set records exist for ${officialCode}.`);

    const rawPatch = {
      source_id: source.id,
      record_type: 'set',
      external_id: officialCode,
      provider_record_id: officialCode,
      language_code: 'ja',
      source_url: sourceUrl,
      source_endpoint: `/card-search/index.php?mode=statuslist&pg=${officialCode}`,
      source_updated_at: sourceReport.generated_at,
      licence_status: 'approved',
      attribution_text: 'Pokémon Card Game Japan official card database',
      payload_hash: hash(payload),
      raw_payload: payload,
      internal_notes: `Split official filter for canonical set ${canonicalSetCode}.`,
      http_metadata: { merged_manifest: true, rights_status: 'approved_by_stackr_owner' },
      validation_status: 'valid',
      validation_errors: [],
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    };
    let rawRecord;
    if (rawRows?.[0]?.id) {
      const { data, error } = await ingest.from('raw_source_records')
        .update(rawPatch)
        .eq('id', rawRows[0].id)
        .select('*')
        .single();
      requireNoError(error, `update set provenance ${officialCode}`);
      rawRecord = data;
      setRawUpdated += 1;
    } else {
      const { data, error } = await ingest.from('raw_source_records')
        .insert(rawPatch)
        .select('*')
        .single();
      requireNoError(error, `insert set provenance ${officialCode}`);
      rawRecord = data;
      setRawInserted += 1;
    }

    const { data: identifier, error: identifierLookupError } = await ingest.from('external_identifiers')
      .select('id,set_id')
      .eq('source_id', source.id)
      .eq('source_entity_type', 'set')
      .eq('external_id', officialCode)
      .eq('language_code', 'ja')
      .eq('is_current', true)
      .is('deprecated_at', null)
      .maybeSingle();
    requireNoError(identifierLookupError, `load set identifier ${officialCode}`);
    if (identifier?.set_id) requireCondition(identifier.set_id === setRow.id, `${officialCode} points to another set.`);

    const identifierPatch = {
      source_id: source.id,
      raw_record_id: rawRecord.id,
      source_entity_type: 'set',
      external_id: officialCode,
      external_uri: sourceUrl,
      game_code: 'pokemon',
      language_code: 'ja',
      series_id: null,
      set_id: setRow.id,
      card_concept_id: null,
      printing_id: null,
      variant_id: null,
      sealed_product_id: null,
      sealed_product_variant_id: null,
      asset_id: null,
      confidence: 1,
      is_current: true,
      source_updated_at: sourceReport.generated_at,
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    };
    if (identifier?.id) {
      const { error } = await ingest.from('external_identifiers').update(identifierPatch).eq('id', identifier.id);
      requireNoError(error, `update set identifier ${officialCode}`);
      setIdentifiersUpdated += 1;
    } else {
      const { error } = await ingest.from('external_identifiers').insert(identifierPatch);
      requireNoError(error, `insert set identifier ${officialCode}`);
      setIdentifiersInserted += 1;
    }
  }

  const cardCodeByOfficialId = new Map();
  for (const printing of printings) {
    for (const officialId of printing.official_card_ids ?? []) {
      cardCodeByOfficialId.set(String(officialId), clean(printing.official_set_code));
    }
  }
  const officialIds = [...cardCodeByOfficialId.keys()];
  const rawCardRows = await selectInBatches(
    ingest.from('raw_source_records'),
    'external_id',
    officialIds,
    'id,external_id,raw_payload',
    (query) => query
      .eq('source_id', source.id)
      .eq('record_type', 'card')
      .eq('language_code', 'ja')
      .is('deprecated_at', null),
  );
  requireCondition(rawCardRows.length === officialIds.length, 'Not every merged official card ID has a raw source record.');

  let rawCardsUpdated = 0;
  for (const rawRow of rawCardRows) {
    const officialCode = cardCodeByOfficialId.get(rawRow.external_id);
    const { error } = await ingest.from('raw_source_records')
      .update({
        raw_payload: {
          ...(rawRow.raw_payload ?? {}),
          official_set_code: officialCode,
          official_set_codes: officialSetCodes,
          canonical_set_code: canonicalSetCode,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', rawRow.id);
    requireNoError(error, `update card provenance ${rawRow.external_id}`);
    rawCardsUpdated += 1;
  }

  const { data: verifiedSetIdentifiers, error: verifySetError } = await ingest.from('external_identifiers')
    .select('external_id,set_id')
    .eq('source_id', source.id)
    .eq('source_entity_type', 'set')
    .eq('language_code', 'ja')
    .eq('set_id', setRow.id)
    .eq('is_current', true)
    .is('deprecated_at', null)
    .in('external_id', officialSetCodes);
  requireNoError(verifySetError, 'verify split set identifiers');

  const report = {
    ok: (verifiedSetIdentifiers ?? []).length === officialSetCodes.length && rawCardsUpdated === officialIds.length,
    target: 'staging',
    production_modified: false,
    canonical_set_code: canonicalSetCode,
    official_set_codes: officialSetCodes,
    set_identifiers_verified: (verifiedSetIdentifiers ?? []).map((row) => row.external_id).sort(),
    card_provenance_rows_updated: rawCardsUpdated,
    writes: {
      set_raw_records_inserted: setRawInserted,
      set_raw_records_updated: setRawUpdated,
      set_identifiers_inserted: setIdentifiersInserted,
      set_identifiers_updated: setIdentifiersUpdated,
    },
  };

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  requireCondition(report.ok, 'Split official set-code provenance verification failed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
