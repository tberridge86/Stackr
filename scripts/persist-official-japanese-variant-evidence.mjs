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
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function checksum(value) {
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
  const setCode = clean(option('set-code'));
  const reportPath = path.resolve(option('report', `reports/catalogue/official-japanese-set/${setCode}-variant-evidence.json`));
  const target = clean(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const apply = hasFlag('apply');

  requireCondition(inputPath, '--input is required.');
  requireCondition(setCode, '--set-code is required.');
  requireCondition(target === 'staging', 'Evidence persistence is restricted to staging.');
  requireCondition(apply, '--apply is required.');

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Expected StackR staging SUPABASE_URL.');
  requireCondition(!supabaseUrl.includes(PRODUCTION_PROJECT_REF), 'Production target detected; write refused.');
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

  const sourceReport = JSON.parse(readFileSync(inputPath, 'utf8'));
  requireCondition(sourceReport.source === SOURCE_CODE, 'Unexpected source report.');
  requireCondition(sourceReport.set_code_requested === setCode, 'Set-code mismatch.');
  requireCondition(sourceReport.read_only === true, 'Source report is not immutable read-only evidence.');
  requireCondition((sourceReport.parser_errors ?? []).length === 0, 'Source report has parser errors.');
  requireCondition((sourceReport.identity_conflicts ?? []).length === 0, 'Source report has identity conflicts.');
  requireCondition((sourceReport.unresolved_unnumbered_variants ?? []).length === 0, 'Source report has unresolved variants.');

  const evidenceRows = [];
  for (const printing of sourceReport.printings ?? []) {
    const ids = (printing.official_card_ids ?? []).map(String);
    const numberedIds = new Set((printing.numbered_official_card_ids ?? ids.slice(0, 1)).map(String));
    const urls = printing.detail_urls ?? [];
    const paths = printing.thumbnail_paths ?? [];
    const images = printing.official_image_urls ?? [];
    requireCondition(ids.length > 0, `Printing ${printing.collector_number} has no official IDs.`);
    requireCondition(urls.length === ids.length, `Detail URL count mismatch for ${printing.collector_number}.`);
    for (let index = 0; index < ids.length; index += 1) {
      evidenceRows.push({
        externalId: ids[index],
        collectorNumber: printing.collector_number,
        denominator: printing.denominator,
        nativeName: printing.native_name,
        supertype: printing.supertype,
        artist: clean(printing.artist),
        detailUrl: urls[index],
        thumbnailPath: paths[index] ?? null,
        officialImageUrl: images[index] ?? null,
        isNumberedEntry: numberedIds.has(ids[index]),
        sourceOrdinal: index + 1,
      });
    }
  }
  requireCondition(evidenceRows.length === Number(sourceReport.api_card_ids_collected), 'Official ID count mismatch.');
  requireCondition(new Set(evidenceRows.map((row) => row.externalId)).size === evidenceRows.length, 'Official IDs are not unique.');

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
    .select('id,set_code,total')
    .eq('language_code', 'ja')
    .eq('set_code', setCode)
    .is('deprecated_at', null);
  requireNoError(setError, 'load target set');
  requireCondition(sets?.length === 1, `Expected one active Japanese set ${setCode}.`);
  const setRow = sets[0];

  const { data: printings, error: printingError } = await catalog.from('card_printings')
    .select('id,collector_number,native_name')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null);
  requireNoError(printingError, 'load target printings');
  const printingByNumber = new Map((printings ?? []).map((row) => [row.collector_number, row]));
  for (const row of evidenceRows) {
    requireCondition(printingByNumber.has(row.collectorNumber), `Missing canonical printing ${row.collectorNumber}.`);
  }

  const externalIds = evidenceRows.map((row) => row.externalId);
  const existingRawRows = await selectInBatches(
    ingest.from('raw_source_records'),
    'external_id',
    externalIds,
    'id,external_id',
    (query) => query
      .eq('source_id', source.id)
      .eq('record_type', 'card')
      .eq('language_code', 'ja')
      .is('deprecated_at', null),
  );
  const rawByExternalId = new Map(existingRawRows.map((row) => [row.external_id, row]));

  let rawInserted = 0;
  let rawUpdated = 0;
  for (const row of evidenceRows) {
    const rawPayload = {
      provider: SOURCE_CODE,
      card_id: row.externalId,
      set_id: setCode,
      language_code: 'ja',
      collector_number: row.collectorNumber,
      printed_denominator: row.denominator,
      native_name: row.nativeName,
      supertype: row.supertype,
      artist: row.artist,
      rarity: null,
      finish_status: 'pending_review',
      is_numbered_entry: row.isNumberedEntry,
      source_ordinal_for_printing: row.sourceOrdinal,
      detail_url: row.detailUrl,
      thumbnail_path: row.thumbnailPath,
      official_image_url: row.officialImageUrl,
      image_downloaded: false,
      rights_status: 'approved_by_stackr_owner',
      collector_generated_at: sourceReport.generated_at,
    };
    const patch = {
      source_id: source.id,
      record_type: 'card',
      external_id: row.externalId,
      provider_record_id: row.externalId,
      language_code: 'ja',
      source_url: row.detailUrl,
      source_endpoint: new URL(row.detailUrl).pathname,
      source_updated_at: sourceReport.generated_at,
      licence_status: 'approved',
      attribution_text: 'Pokémon Card Game Japan official card database',
      payload_hash: checksum(rawPayload),
      raw_payload: rawPayload,
      internal_notes: 'Full metadata and image-use rights confirmed by the StackR owner. Exact finish remains pending review.',
      http_metadata: {
        bounded_collection: true,
        image_downloaded: false,
        image_url_captured: Boolean(row.officialImageUrl),
      },
      validation_status: 'valid',
      validation_errors: [],
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    };
    const existing = rawByExternalId.get(row.externalId);
    if (existing?.id) {
      const { data, error } = await ingest.from('raw_source_records')
        .update(patch)
        .eq('id', existing.id)
        .select('id,external_id')
        .single();
      requireNoError(error, 'update official raw card evidence');
      rawByExternalId.set(row.externalId, data);
      rawUpdated += 1;
    } else {
      const { data, error } = await ingest.from('raw_source_records')
        .insert(patch)
        .select('id,external_id')
        .single();
      requireNoError(error, 'insert official raw card evidence');
      rawByExternalId.set(row.externalId, data);
      rawInserted += 1;
    }
  }

  const existingIdentifiers = await selectInBatches(
    ingest.from('external_identifiers'),
    'external_id',
    externalIds,
    'id,external_id',
    (query) => query
      .eq('source_id', source.id)
      .eq('source_entity_type', 'card')
      .eq('language_code', 'ja')
      .eq('is_current', true)
      .is('deprecated_at', null),
  );
  const identifierByExternalId = new Map(existingIdentifiers.map((row) => [row.external_id, row]));

  let identifiersInserted = 0;
  let identifiersUpdated = 0;
  for (const row of evidenceRows) {
    const printing = printingByNumber.get(row.collectorNumber);
    const raw = rawByExternalId.get(row.externalId);
    const patch = {
      source_id: source.id,
      raw_record_id: raw.id,
      source_entity_type: 'card',
      external_id: row.externalId,
      external_uri: row.detailUrl,
      game_code: 'pokemon',
      language_code: 'ja',
      set_id: null,
      printing_id: printing.id,
      variant_id: null,
      confidence: 1,
      is_current: true,
      source_updated_at: sourceReport.generated_at,
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    };
    const existing = identifierByExternalId.get(row.externalId);
    if (existing?.id) {
      const { error } = await ingest.from('external_identifiers').update(patch).eq('id', existing.id);
      requireNoError(error, 'update official card identifier');
      identifiersUpdated += 1;
    } else {
      const { error } = await ingest.from('external_identifiers').insert(patch);
      requireNoError(error, 'insert official card identifier');
      identifiersInserted += 1;
    }
  }

  const verifiedIdentifiers = await selectInBatches(
    ingest.from('external_identifiers'),
    'external_id',
    externalIds,
    'external_id,printing_id,variant_id',
    (query) => query
      .eq('source_id', source.id)
      .eq('source_entity_type', 'card')
      .eq('language_code', 'ja')
      .eq('is_current', true)
      .is('deprecated_at', null),
  );
  const verifiedIds = new Set(verifiedIdentifiers.map((row) => row.external_id));
  const missingIds = externalIds.filter((id) => !verifiedIds.has(id));

  const report = {
    ok: missingIds.length === 0,
    target: 'staging',
    production_modified: false,
    set_code: setCode,
    canonical_printings: printingByNumber.size,
    official_ids_expected: evidenceRows.length,
    official_ids_verified: verifiedIds.size,
    additional_unnumbered_variants: evidenceRows.filter((row) => !row.isNumberedEntry).length,
    missing_official_ids: missingIds,
    writes: {
      raw_records_inserted: rawInserted,
      raw_records_updated: rawUpdated,
      identifiers_inserted: identifiersInserted,
      identifiers_updated: identifiersUpdated,
    },
  };
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  requireCondition(report.ok, 'Official source evidence remains incomplete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
