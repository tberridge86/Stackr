import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REFS = new Set(['oakdbbzdqwurpjnoqhmu']);
const SOURCE_CODE = 'pokemon_card_jp_official';

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function chunks(values, size = 100) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function selectInBatches(table, column, values, columns, configure = (query) => query) {
  const rows = [];
  for (const batch of chunks(unique(values), 100)) {
    if (!batch.length) continue;
    const { data, error } = await configure(table.select(columns).in(column, batch));
    requireNoError(error, `select ${column} batch`);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function insertInBatches(table, rows, context, size = 100) {
  const inserted = [];
  for (const batch of chunks(rows, size)) {
    if (!batch.length) continue;
    const { data, error } = await table.insert(batch).select('*');
    requireNoError(error, `${context} insert`);
    inserted.push(...(data ?? []));
  }
  return inserted;
}

async function upsertInBatches(table, rows, context, options = {}, size = 100) {
  const updated = [];
  for (const batch of chunks(rows, size)) {
    if (!batch.length) continue;
    const { data, error } = await table.upsert(batch, options).select('*');
    requireNoError(error, `${context} upsert`);
    updated.push(...(data ?? []));
  }
  return updated;
}

function conceptKey(nativeName) {
  return `pokemon:${nativeName.toLocaleLowerCase('ja-JP')}`;
}

function printingSortKey(collectorNumber) {
  const numeric = Number.parseInt(collectorNumber, 10);
  requireCondition(Number.isInteger(numeric) && numeric >= 0, `Non-numeric collector number: ${collectorNumber}`);
  return String(numeric).padStart(12, '0');
}

function validateInput(report, expectedSetCode) {
  requireCondition(report && typeof report === 'object', 'Input report must be an object.');
  requireCondition(report.source === SOURCE_CODE, `Unexpected source: ${report.source}`);
  requireCondition(report.read_only === true, 'Collector evidence must be read-only.');
  requireCondition(report.images_downloaded === false, 'Collector evidence must not contain downloaded images.');
  requireCondition(report.rarity_populated === false, 'Rarity must remain unset in the collector evidence.');
  requireCondition(report.finish_populated === false, 'Finish must remain unset in the collector evidence.');
  requireCondition(Array.isArray(report.parser_errors) && report.parser_errors.length === 0, 'Parser evidence contains errors.');
  requireCondition(Array.isArray(report.identity_conflicts) && report.identity_conflicts.length === 0, 'Collector evidence contains identity conflicts.');
  requireCondition(Array.isArray(report.printings) && report.printings.length > 0, 'Collector evidence contains no printings.');
  requireCondition(report.set_code_requested === expectedSetCode, 'Requested set code does not match import scope.');
  requireCondition(
    Array.isArray(report.official_set_codes)
      && report.official_set_codes.length === 1
      && report.official_set_codes[0] === expectedSetCode,
    `Official set code mismatch: ${JSON.stringify(report.official_set_codes)}`,
  );
  requireCondition(Number(report.api_card_ids_collected) === report.printings.length, 'Official card ID count must equal unique printings.');
  requireCondition(Number(report.detail_rows_collected) === report.printings.length, 'Every official detail page must be collected.');
  requireCondition(Number(report.duplicate_official_variants) === 0, 'This importer only accepts one official ID per collector number.');

  const collectorNumbers = report.printings.map((printing) => cleanText(printing.collector_number));
  const officialCardIds = report.printings.flatMap((printing) => printing.official_card_ids ?? []).map(String);
  requireCondition(collectorNumbers.every(Boolean), 'Every printing requires a collector number.');
  requireCondition(new Set(collectorNumbers).size === report.printings.length, 'Collector numbers must be unique.');
  requireCondition(officialCardIds.length === report.printings.length, 'Every printing requires exactly one official card ID.');
  requireCondition(new Set(officialCardIds).size === report.printings.length, 'Official card IDs must be unique.');
  requireCondition(report.printings.every((printing) => cleanText(printing.native_name)), 'Every printing requires a native name.');
  requireCondition(report.printings.every((printing) => ['Pokémon', 'Trainer', 'Energy'].includes(printing.supertype)), 'Unexpected supertype.');

  const denominators = unique(report.printings.map((printing) => cleanText(printing.denominator)));
  requireCondition(denominators.length === 1, `Expected one printed denominator, found ${denominators.join(',')}`);
  return {
    fullTotal: report.printings.length,
    printedTotal: Number.parseInt(denominators[0], 10),
  };
}

async function ensureSource(ingest) {
  const payload = {
    code: SOURCE_CODE,
    display_name: 'Pokémon Card Game Japan official card database',
    source_type: 'catalogue',
    base_url: 'https://www.pokemon-card.com',
    terms_url: 'https://www.pokemon-card.com/rules/',
    licence_status: 'approved',
    attribution_required: true,
    robots_policy: 'bounded metadata-only requests; no image downloads',
    rate_limit_config: {
      minimum_delay_ms: 650,
      bounded: true,
      metadata_only: true,
      image_downloads: false,
    },
    active: true,
    internal_notes: 'Official Japanese catalogue metadata. Card image paths are retained only as non-served source evidence.',
    deprecated_at: null,
    deprecated_reason: null,
    source_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await ingest.from('sources')
    .upsert(payload, { onConflict: 'code' })
    .select('*')
    .single();
  requireNoError(error, 'ensure official Japanese source');
  return data;
}

async function ensureImportRun(ingest, sourceId, inputHash, report) {
  const runKey = `official-jp:${report.set_code_requested}:${inputHash.slice(0, 20)}`;
  const { data: existing, error: lookupError } = await ingest.from('import_runs')
    .select('*')
    .eq('source_id', sourceId)
    .eq('run_key', runKey)
    .maybeSingle();
  requireNoError(lookupError, 'lookup import run');
  if (existing) {
    const { data, error } = await ingest.from('import_runs')
      .update({
        status: 'running',
        started_at: existing.started_at ?? new Date().toISOString(),
        finished_at: null,
        error_message: null,
        records_requested: report.printings.length,
        records_retrieved: report.printings.length,
        metadata: {
          ...(existing.metadata ?? {}),
          input_hash: inputHash,
          official_set_code: report.set_code_requested,
          collector_generated_at: report.generated_at,
          images_downloaded: false,
          rarity_populated: false,
          finish_populated: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    requireNoError(error, 'resume import run');
    return data;
  }
  const { data, error } = await ingest.from('import_runs')
    .insert({
      source_id: sourceId,
      run_key: runKey,
      import_type: 'manual',
      status: 'running',
      request_id: `github:${process.env.GITHUB_RUN_ID ?? 'local'}`,
      started_at: new Date().toISOString(),
      records_requested: report.printings.length,
      records_retrieved: report.printings.length,
      records_inserted: 0,
      records_updated: 0,
      records_skipped: 0,
      records_conflicted: 0,
      metadata: {
        input_hash: inputHash,
        official_set_code: report.set_code_requested,
        collector_generated_at: report.generated_at,
        images_downloaded: false,
        rarity_populated: false,
        finish_populated: false,
      },
    })
    .select('*')
    .single();
  requireNoError(error, 'create import run');
  return data;
}

async function ensureSetEvidence({ ingest, source, importRun, targetSet, report, inputHash }) {
  const externalId = report.set_code_requested;
  const rawPayload = {
    provider: SOURCE_CODE,
    id: externalId,
    language_code: 'ja',
    native_name: targetSet.native_name,
    english_display_name: targetSet.english_display_name,
    printed_total: Number.parseInt(report.denominators?.[0] ?? report.printings[0].denominator, 10),
    total: report.printings.length,
    official_card_ids: report.api_card_ids_collected,
    source_url: `https://www.pokemon-card.com/card-search/index.php?mode=statuslist&pg=${encodeURIComponent(externalId)}`,
    collector_generated_at: report.generated_at,
    images_downloaded: false,
    rarity_populated: false,
    finish_populated: false,
  };
  const rawBase = {
    source_id: source.id,
    import_run_id: importRun.id,
    record_type: 'set',
    external_id: externalId,
    provider_record_id: externalId,
    language_code: 'ja',
    source_url: rawPayload.source_url,
    source_endpoint: `/card-search/index.php?mode=statuslist&pg=${externalId}`,
    source_updated_at: report.generated_at,
    licence_status: 'approved',
    attribution_text: 'Pokémon Card Game Japan official card database',
    payload_hash: checksum(rawPayload),
    raw_payload: rawPayload,
    internal_notes: `Verified from immutable collector input ${inputHash}. Metadata only; no image right asserted.`,
    http_metadata: {
      bounded_collection: true,
      images_downloaded: false,
      input_hash: inputHash,
    },
    validation_status: 'valid',
    validation_errors: [],
    deprecated_at: null,
    deprecated_reason: null,
    updated_at: new Date().toISOString(),
  };
  const { data: existingRaw, error: rawLookupError } = await ingest.from('raw_source_records')
    .select('id')
    .eq('source_id', source.id)
    .eq('record_type', 'set')
    .eq('external_id', externalId)
    .eq('language_code', 'ja')
    .is('deprecated_at', null)
    .order('retrieved_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  requireNoError(rawLookupError, 'lookup official set raw record');
  let rawRecord;
  if (existingRaw?.id) {
    const { data, error } = await ingest.from('raw_source_records')
      .update(rawBase)
      .eq('id', existingRaw.id)
      .select('*')
      .single();
    requireNoError(error, 'update official set raw record');
    rawRecord = data;
  } else {
    const { data, error } = await ingest.from('raw_source_records')
      .insert(rawBase)
      .select('*')
      .single();
    requireNoError(error, 'insert official set raw record');
    rawRecord = data;
  }

  const { data: existingIdentifier, error: identifierLookupError } = await ingest.from('external_identifiers')
    .select('id')
    .eq('source_id', source.id)
    .eq('source_entity_type', 'set')
    .eq('external_id', externalId)
    .eq('language_code', 'ja')
    .eq('is_current', true)
    .is('deprecated_at', null)
    .maybeSingle();
  requireNoError(identifierLookupError, 'lookup official set identifier');
  const identifierBase = {
    source_id: source.id,
    raw_record_id: rawRecord.id,
    source_entity_type: 'set',
    external_id: externalId,
    external_uri: rawPayload.source_url,
    game_code: 'pokemon',
    language_code: 'ja',
    set_id: targetSet.id,
    printing_id: null,
    variant_id: null,
    confidence: 1,
    is_current: true,
    source_updated_at: report.generated_at,
    deprecated_at: null,
    deprecated_reason: null,
    updated_at: new Date().toISOString(),
  };
  if (existingIdentifier?.id) {
    const { error } = await ingest.from('external_identifiers').update(identifierBase).eq('id', existingIdentifier.id);
    requireNoError(error, 'update official set identifier');
  } else {
    const { error } = await ingest.from('external_identifiers').insert(identifierBase);
    requireNoError(error, 'insert official set identifier');
  }
}

async function resolveConcepts(catalog, printings) {
  const names = unique(printings.map((printing) => printing.native_name));
  const conceptsByName = new Map(names.map((name) => [name, new Set()]));

  const nameRows = await selectInBatches(
    catalog.from('card_names'),
    'name',
    names,
    'card_concept_id,name',
    (query) => query.eq('language_code', 'ja').is('deprecated_at', null),
  );
  for (const row of nameRows) conceptsByName.get(row.name)?.add(row.card_concept_id);

  const printingRows = await selectInBatches(
    catalog.from('card_printings'),
    'native_name',
    names,
    'card_concept_id,native_name',
    (query) => query.eq('language_code', 'ja').is('deprecated_at', null).not('card_concept_id', 'is', null),
  );
  for (const row of printingRows) conceptsByName.get(row.native_name)?.add(row.card_concept_id);

  const unresolvedNames = names.filter((name) => (conceptsByName.get(name)?.size ?? 0) === 0);
  const keys = unresolvedNames.map(conceptKey);
  const conceptRows = await selectInBatches(
    catalog.from('card_concepts'),
    'concept_key',
    keys,
    'id,concept_key,default_english_name',
    (query) => query.eq('game_code', 'pokemon').is('deprecated_at', null),
  );
  const conceptsByKey = new Map(conceptRows.map((row) => [row.concept_key, row]));
  const missingConceptRows = unresolvedNames
    .filter((name) => !conceptsByKey.has(conceptKey(name)))
    .map((name) => ({
      game_code: 'pokemon',
      concept_key: conceptKey(name),
      default_english_name: null,
      source_updated_at: new Date().toISOString(),
    }));
  const insertedConcepts = await insertInBatches(catalog.from('card_concepts'), missingConceptRows, 'card concepts');
  for (const row of insertedConcepts) conceptsByKey.set(row.concept_key, row);
  for (const name of unresolvedNames) {
    const row = conceptsByKey.get(conceptKey(name));
    if (row?.id) conceptsByName.get(name)?.add(row.id);
  }

  const allConceptIds = unique([...conceptsByName.values()].flatMap((set) => [...set]));
  const allConceptRows = await selectInBatches(
    catalog.from('card_concepts'),
    'id',
    allConceptIds,
    'id,default_english_name,concept_key',
    (query) => query.is('deprecated_at', null),
  );
  const conceptById = new Map(allConceptRows.map((row) => [row.id, row]));

  const existingNativeNames = await selectInBatches(
    catalog.from('card_names'),
    'card_concept_id',
    allConceptIds,
    'card_concept_id,language_code,name_type,name',
    (query) => query.eq('language_code', 'ja').eq('name_type', 'native').is('deprecated_at', null),
  );
  const existingNativeKey = new Set(existingNativeNames.map((row) => `${row.card_concept_id}\u0000${row.name}`));
  const nativeNameRows = [];
  for (const [name, conceptIds] of conceptsByName) {
    if (conceptIds.size !== 1) continue;
    const conceptId = [...conceptIds][0];
    const key = `${conceptId}\u0000${name}`;
    if (existingNativeKey.has(key)) continue;
    nativeNameRows.push({
      card_concept_id: conceptId,
      language_code: 'ja',
      name_type: 'native',
      name,
      normalized_name: name.toLocaleLowerCase('ja-JP'),
      source_confidence: 1,
      source_updated_at: new Date().toISOString(),
    });
  }
  await insertInBatches(catalog.from('card_names'), nativeNameRows, 'Japanese card names');

  return {
    conceptsByName,
    conceptById,
    ambiguous: [...conceptsByName.entries()]
      .filter(([, ids]) => ids.size > 1)
      .map(([name, ids]) => ({ name, concept_ids: [...ids] })),
    insertedConcepts: insertedConcepts.length,
    insertedNativeNames: nativeNameRows.length,
  };
}

async function upsertPrintings({ catalog, targetSet, report, concepts }) {
  const { data: existingRows, error: existingError } = await catalog.from('card_printings')
    .select('*')
    .eq('set_id', targetSet.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null)
    .order('collector_number_sort', { ascending: true });
  requireNoError(existingError, 'load existing target printings');
  const existingByNumber = new Map();
  for (const row of existingRows ?? []) {
    if (existingByNumber.has(row.collector_number)) {
      throw new Error(`Duplicate active target printing before import: ${row.collector_number}`);
    }
    existingByNumber.set(row.collector_number, row);
  }

  const rows = report.printings.map((printing) => {
    const ids = concepts.conceptsByName.get(printing.native_name) ?? new Set();
    const conceptId = ids.size === 1 ? [...ids][0] : null;
    const englishName = conceptId ? cleanText(concepts.conceptById.get(conceptId)?.default_english_name) : null;
    const base = {
      game_code: 'pokemon',
      set_id: targetSet.id,
      language_code: 'ja',
      card_concept_id: conceptId,
      collector_number: printing.collector_number,
      collector_number_prefix: null,
      collector_number_sort: Number.parseInt(printing.collector_number, 10),
      collector_number_suffix: null,
      collector_number_sort_key: printingSortKey(printing.collector_number),
      native_name: printing.native_name,
      english_display_name: englishName,
      rarity_id: null,
      supertype: printing.supertype,
      subtypes: [],
      artist: cleanText(printing.artist),
      source_updated_at: report.generated_at,
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    };
    const existing = existingByNumber.get(printing.collector_number);
    return existing ? { ...base, id: existing.id } : base;
  });

  const toUpdate = rows.filter((row) => row.id);
  const toInsert = rows.filter((row) => !row.id);
  const inserted = await insertInBatches(catalog.from('card_printings'), toInsert, 'Japanese card printings');
  await upsertInBatches(catalog.from('card_printings'), toUpdate, 'Japanese card printings', { onConflict: 'id' });

  const allRows = [...toUpdate, ...inserted];
  const printingByNumber = new Map(allRows.map((row) => [row.collector_number, row]));
  requireCondition(printingByNumber.size === report.printings.length, 'Printing write did not produce the expected identity count.');
  return {
    printingByNumber,
    inserted: inserted.length,
    updated: toUpdate.length,
  };
}

async function upsertRawCards({ ingest, source, importRun, report, inputHash }) {
  const officialIds = report.printings.map((printing) => String(printing.official_card_ids[0]));
  const existingRows = await selectInBatches(
    ingest.from('raw_source_records'),
    'external_id',
    officialIds,
    'id,external_id',
    (query) => query.eq('source_id', source.id).eq('record_type', 'card').eq('language_code', 'ja').is('deprecated_at', null),
  );
  const existingByExternalId = new Map(existingRows.map((row) => [row.external_id, row]));
  const rows = report.printings.map((printing) => {
    const cardId = String(printing.official_card_ids[0]);
    const detailUrl = printing.detail_urls[0];
    const rawPayload = {
      provider: SOURCE_CODE,
      card_id: cardId,
      set_id: report.set_code_requested,
      language_code: 'ja',
      collector_number: printing.collector_number,
      printed_denominator: printing.denominator,
      native_name: printing.native_name,
      supertype: printing.supertype,
      artist: cleanText(printing.artist),
      rarity: null,
      finish_status: 'pending_review',
      detail_url: detailUrl,
      thumbnail_path_reference_only: printing.thumbnail_paths[0],
      images_downloaded: false,
      image_right_asserted: false,
      collector_generated_at: report.generated_at,
    };
    const base = {
      source_id: source.id,
      import_run_id: importRun.id,
      record_type: 'card',
      external_id: cardId,
      provider_record_id: cardId,
      language_code: 'ja',
      source_url: detailUrl,
      source_endpoint: new URL(detailUrl).pathname,
      source_updated_at: report.generated_at,
      licence_status: 'approved',
      attribution_text: 'Pokémon Card Game Japan official card database',
      payload_hash: checksum(rawPayload),
      raw_payload: rawPayload,
      internal_notes: `Verified from immutable collector input ${inputHash}. Metadata only; thumbnail is a non-served source reference.`,
      http_metadata: {
        bounded_collection: true,
        images_downloaded: false,
        image_right_asserted: false,
        input_hash: inputHash,
      },
      validation_status: 'valid',
      validation_errors: [],
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    };
    const existing = existingByExternalId.get(cardId);
    return existing ? { ...base, id: existing.id } : base;
  });
  const inserted = await insertInBatches(ingest.from('raw_source_records'), rows.filter((row) => !row.id), 'official Japanese raw cards');
  await upsertInBatches(ingest.from('raw_source_records'), rows.filter((row) => row.id), 'official Japanese raw cards', { onConflict: 'id' });
  const allRows = [...rows.filter((row) => row.id), ...inserted];
  const rawByExternalId = new Map(allRows.map((row) => [row.external_id, row]));
  requireCondition(rawByExternalId.size === report.printings.length, 'Raw card write did not produce the expected identity count.');
  return {
    rawByExternalId,
    inserted: inserted.length,
    updated: rows.filter((row) => row.id).length,
  };
}

async function upsertPrintingIdentifiers({ ingest, source, report, printings, rawCards }) {
  const officialIds = report.printings.map((printing) => String(printing.official_card_ids[0]));
  const existingRows = await selectInBatches(
    ingest.from('external_identifiers'),
    'external_id',
    officialIds,
    'id,external_id',
    (query) => query
      .eq('source_id', source.id)
      .eq('source_entity_type', 'card')
      .eq('language_code', 'ja')
      .eq('is_current', true)
      .is('deprecated_at', null),
  );
  const existingByExternalId = new Map(existingRows.map((row) => [row.external_id, row]));
  const rows = report.printings.map((printing) => {
    const cardId = String(printing.official_card_ids[0]);
    const printingRow = printings.printingByNumber.get(printing.collector_number);
    const rawRow = rawCards.rawByExternalId.get(cardId);
    requireCondition(printingRow?.id, `Missing canonical printing ${printing.collector_number}`);
    requireCondition(rawRow?.id, `Missing raw record ${cardId}`);
    const base = {
      source_id: source.id,
      raw_record_id: rawRow.id,
      source_entity_type: 'card',
      external_id: cardId,
      external_uri: printing.detail_urls[0],
      game_code: 'pokemon',
      language_code: 'ja',
      set_id: null,
      printing_id: printingRow.id,
      variant_id: null,
      confidence: 1,
      is_current: true,
      source_updated_at: report.generated_at,
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    };
    const existing = existingByExternalId.get(cardId);
    return existing ? { ...base, id: existing.id } : base;
  });
  const inserted = await insertInBatches(ingest.from('external_identifiers'), rows.filter((row) => !row.id), 'official Japanese printing identifiers');
  await upsertInBatches(ingest.from('external_identifiers'), rows.filter((row) => row.id), 'official Japanese printing identifiers', { onConflict: 'id' });
  return {
    inserted: inserted.length,
    updated: rows.filter((row) => row.id).length,
  };
}

async function recordConceptConflicts({ ingest, source, importRun, targetSet, report, concepts }) {
  if (!concepts.ambiguous.length) return 0;
  const collectorNumbersByName = new Map();
  for (const printing of report.printings) {
    const list = collectorNumbersByName.get(printing.native_name) ?? [];
    list.push(printing.collector_number);
    collectorNumbersByName.set(printing.native_name, list);
  }
  let inserted = 0;
  for (const conflict of concepts.ambiguous) {
    const canonicalKey = `pokemon:ja:${targetSet.id}:${conflict.name}:concept-ambiguity`;
    const { data: existing, error: lookupError } = await ingest.from('data_conflicts')
      .select('id')
      .eq('conflict_type', 'identity_collision')
      .eq('canonical_key', canonicalKey)
      .in('status', ['open', 'in_review'])
      .maybeSingle();
    requireNoError(lookupError, 'lookup concept conflict');
    if (existing?.id) continue;
    const { error } = await ingest.from('data_conflicts').insert({
      source_id: source.id,
      import_run_id: importRun.id,
      conflict_type: 'identity_collision',
      severity: 'medium',
      entity_schema: 'catalog',
      entity_table: 'card_printings',
      canonical_key: canonicalKey,
      proposed_payload: {
        language_code: 'ja',
        set_id: targetSet.id,
        native_name: conflict.name,
        collector_numbers: collectorNumbersByName.get(conflict.name) ?? [],
      },
      existing_payload: { concept_ids: conflict.concept_ids },
      status: 'open',
      internal_notes: 'Official Japanese card name maps to more than one existing concept. Printing retained with null concept instead of guessing.',
    });
    requireNoError(error, 'insert concept conflict');
    inserted += 1;
  }
  return inserted;
}

async function verifyImport({ catalog, ingest, source, targetSetId, report, expected }) {
  const { data: setRow, error: setError } = await catalog.from('sets')
    .select('id,set_code,provider_set_code,native_name,english_display_name,printed_total,total,release_date')
    .eq('id', targetSetId)
    .single();
  requireNoError(setError, 'verify target set');

  const { data: printingRows, error: printingError } = await catalog.from('card_printings')
    .select('id,collector_number,native_name,english_display_name,rarity_id,supertype,artist,card_concept_id')
    .eq('set_id', targetSetId)
    .eq('language_code', 'ja')
    .is('deprecated_at', null)
    .order('collector_number_sort', { ascending: true });
  requireNoError(printingError, 'verify target printings');

  const { count: rawCount, error: rawError } = await ingest.from('raw_source_records')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', source.id)
    .eq('record_type', 'card')
    .eq('language_code', 'ja')
    .is('deprecated_at', null);
  requireNoError(rawError, 'verify raw source records');

  const { count: identifierCount, error: identifierError } = await ingest.from('external_identifiers')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', source.id)
    .eq('source_entity_type', 'card')
    .eq('language_code', 'ja')
    .eq('is_current', true)
    .not('printing_id', 'is', null)
    .is('deprecated_at', null);
  requireNoError(identifierError, 'verify official identifiers');

  const duplicateNumbers = [...new Set((printingRows ?? []).map((row) => row.collector_number)
    .filter((number, index, values) => values.indexOf(number) !== index))];
  const reportNumbers = new Set(report.printings.map((printing) => printing.collector_number));
  const missingNumbers = [...reportNumbers].filter((number) => !(printingRows ?? []).some((row) => row.collector_number === number));
  const unexpectedNumbers = (printingRows ?? []).map((row) => row.collector_number).filter((number) => !reportNumbers.has(number));

  const verification = {
    set: setRow,
    expected,
    active_printings: printingRows?.length ?? 0,
    distinct_collector_numbers: new Set((printingRows ?? []).map((row) => row.collector_number)).size,
    duplicate_collector_numbers: duplicateNumbers,
    missing_collector_numbers: missingNumbers,
    unexpected_collector_numbers: unexpectedNumbers,
    missing_native_names: (printingRows ?? []).filter((row) => !cleanText(row.native_name)).length,
    missing_english_names: (printingRows ?? []).filter((row) => !cleanText(row.english_display_name)).length,
    missing_rarity: (printingRows ?? []).filter((row) => row.rarity_id == null).length,
    missing_artist: (printingRows ?? []).filter((row) => !cleanText(row.artist)).length,
    missing_supertype: (printingRows ?? []).filter((row) => !cleanText(row.supertype)).length,
    unresolved_concepts: (printingRows ?? []).filter((row) => row.card_concept_id == null).length,
    official_raw_card_records_for_source: rawCount ?? 0,
    official_printing_identifiers_for_source: identifierCount ?? 0,
    images_downloaded: false,
    rarity_asserted_by_importer: false,
    finish_asserted_by_importer: false,
  };

  requireCondition(setRow.total === expected.fullTotal, `Set total mismatch: ${setRow.total}`);
  requireCondition(setRow.printed_total === expected.printedTotal, `Printed total mismatch: ${setRow.printed_total}`);
  requireCondition(verification.active_printings === expected.fullTotal, `Printing count mismatch: ${verification.active_printings}`);
  requireCondition(verification.distinct_collector_numbers === expected.fullTotal, 'Collector-number count mismatch.');
  requireCondition(verification.duplicate_collector_numbers.length === 0, 'Duplicate collector numbers remain.');
  requireCondition(verification.missing_collector_numbers.length === 0, 'Official collector numbers remain missing.');
  requireCondition(verification.unexpected_collector_numbers.length === 0, 'Unexpected collector numbers were written.');
  requireCondition(verification.missing_native_names === 0, 'Native names remain missing.');
  requireCondition(verification.missing_supertype === 0, 'Supertype remains missing.');
  requireCondition(verification.official_raw_card_records_for_source >= expected.fullTotal, 'Official raw source evidence is incomplete.');
  requireCondition(verification.official_printing_identifiers_for_source >= expected.fullTotal, 'Official printing identifiers are incomplete.');
  return verification;
}

async function main() {
  const inputPath = path.resolve(option('input', 'reports/catalogue/official-japanese-set/catalogue.json'));
  const reportPath = path.resolve(option('report', 'reports/catalogue/official-japanese-set/import-report.json'));
  const expectedSetCode = cleanText(option('set-code'));
  const releaseDate = cleanText(option('release-date'));
  const englishName = cleanText(option('english-name'));
  const target = cleanText(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const apply = hasFlag('apply');

  requireCondition(expectedSetCode, '--set-code is required.');
  requireCondition(target === 'staging', 'Official Japanese imports are restricted to staging.');
  requireCondition(apply, 'Importer is dry-run by default; --apply is required for writes.');
  requireCondition(releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(releaseDate), '--release-date must be YYYY-MM-DD.');
  requireCondition(englishName, '--english-name is required.');

  const supabaseUrl = cleanText(process.env.SUPABASE_URL);
  const supabaseKey = cleanText(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'SUPABASE_URL is not the approved StackR staging project.');
  for (const productionRef of PRODUCTION_PROJECT_REFS) {
    requireCondition(!supabaseUrl.includes(productionRef), 'Production Supabase URL detected; import refused.');
  }
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

  const inputText = readFileSync(inputPath, 'utf8');
  const inputHash = createHash('sha256').update(inputText).digest('hex');
  const collectorReport = JSON.parse(inputText);
  const expected = validateInput(collectorReport, expectedSetCode);

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-StackR-Import': `official-jp-${expectedSetCode}` } },
  });
  const catalog = db.schema('catalog');
  const ingest = db.schema('ingest');

  const source = await ensureSource(ingest);
  const importRun = await ensureImportRun(ingest, source.id, inputHash, collectorReport);

  try {
    const { data: targetSets, error: targetError } = await catalog.from('sets')
      .select('*')
      .eq('language_code', 'ja')
      .eq('set_code', expectedSetCode)
      .is('deprecated_at', null);
    requireNoError(targetError, 'load target set');
    requireCondition(targetSets?.length === 1, `Expected exactly one active Japanese set ${expectedSetCode}.`);
    const targetSet = targetSets[0];

    const { data: updatedSet, error: setUpdateError } = await catalog.from('sets')
      .update({
        provider_set_code: targetSet.provider_set_code ?? expectedSetCode,
        native_name: targetSet.native_name,
        english_display_name: englishName,
        printed_total: expected.printedTotal,
        total: expected.fullTotal,
        release_date: releaseDate,
        source_updated_at: collectorReport.generated_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetSet.id)
      .select('*')
      .single();
    requireNoError(setUpdateError, 'update target set');

    await ensureSetEvidence({ ingest, source, importRun, targetSet: updatedSet, report: collectorReport, inputHash });
    const concepts = await resolveConcepts(catalog, collectorReport.printings);
    const printingResult = await upsertPrintings({ catalog, targetSet: updatedSet, report: collectorReport, concepts });
    const rawResult = await upsertRawCards({ ingest, source, importRun, report: collectorReport, inputHash });
    const identifierResult = await upsertPrintingIdentifiers({
      ingest,
      source,
      report: collectorReport,
      printings: printingResult,
      rawCards: rawResult,
    });
    const conceptConflictsInserted = await recordConceptConflicts({
      ingest,
      source,
      importRun,
      targetSet: updatedSet,
      report: collectorReport,
      concepts,
    });
    const verification = await verifyImport({
      catalog,
      ingest,
      source,
      targetSetId: updatedSet.id,
      report: collectorReport,
      expected,
    });

    const result = {
      ok: true,
      target: 'staging',
      production_modified: false,
      input_hash: inputHash,
      official_set_code: expectedSetCode,
      source_id: source.id,
      import_run_id: importRun.id,
      collector: {
        api_card_ids: collectorReport.api_card_ids_collected,
        unique_printings: collectorReport.unique_printings,
        parser_errors: collectorReport.parser_errors.length,
        identity_conflicts: collectorReport.identity_conflicts.length,
      },
      writes: {
        concepts_inserted: concepts.insertedConcepts,
        native_names_inserted: concepts.insertedNativeNames,
        concept_name_ambiguities: concepts.ambiguous.length,
        concept_conflicts_inserted: conceptConflictsInserted,
        printings_inserted: printingResult.inserted,
        printings_updated: printingResult.updated,
        raw_records_inserted: rawResult.inserted,
        raw_records_updated: rawResult.updated,
        identifiers_inserted: identifierResult.inserted,
        identifiers_updated: identifierResult.updated,
      },
      verification,
    };

    const { error: completeError } = await ingest.from('import_runs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        records_requested: expected.fullTotal,
        records_retrieved: expected.fullTotal,
        records_inserted: printingResult.inserted,
        records_updated: printingResult.updated,
        records_skipped: 0,
        records_conflicted: concepts.ambiguous.length,
        error_message: null,
        metadata: {
          input_hash: inputHash,
          official_set_code: expectedSetCode,
          verification,
          images_downloaded: false,
          rarity_populated: false,
          finish_populated: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', importRun.id);
    requireNoError(completeError, 'complete import run');

    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ingest.from('import_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', importRun.id);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
