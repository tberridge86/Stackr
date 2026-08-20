import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const SOURCE_CODE = 'pokemon_card_jp_official';
const VARIANT_CODE = 'unclassified';
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

function chunks(values, size = 80) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message ?? String(error)}`);
}

function conceptKey(nativeName) {
  return `pokemon:${nativeName.toLocaleLowerCase('ja-JP')}`;
}

function collectorIdentity(collectorNumber) {
  const value = clean(collectorNumber);
  requireCondition(value, 'Collector number is required.');
  if (/^\d+$/.test(value)) {
    const numeric = Number.parseInt(value, 10);
    return {
      prefix: null,
      sort: numeric,
      suffix: null,
      sortKey: String(numeric).padStart(12, '0'),
    };
  }
  return {
    prefix: null,
    sort: null,
    suffix: value.toUpperCase(),
    sortKey: value.toLowerCase(),
  };
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

async function updateRows(table, rows, context) {
  const updated = [];
  for (const row of rows) {
    const { id, ...patch } = row;
    const { data, error } = await table.update(patch).eq('id', id).select('*').single();
    requireNoError(error, context);
    updated.push(data);
  }
  return updated;
}

async function insertRows(table, rows, context) {
  const inserted = [];
  for (const batch of chunks(rows)) {
    if (!batch.length) continue;
    const { data, error } = await table.insert(batch).select('*');
    requireNoError(error, context);
    inserted.push(...(data ?? []));
  }
  return inserted;
}

function buildCanonicalEntries(sourceReport, unnumberedMap) {
  const entries = [];
  const officialIds = new Set();
  const collectorNumbers = new Set();

  for (const printing of sourceReport.printings ?? []) {
    const ids = (printing.official_card_ids ?? printing.numbered_official_card_ids ?? []).map(String);
    requireCondition(ids.length === 1, `Numbered printing ${printing.collector_number} must have exactly one official ID.`);
    const collectorNumber = clean(printing.collector_number);
    requireCondition(collectorNumber, 'A numbered printing has no collector number.');
    requireCondition(!collectorNumbers.has(collectorNumber), `Duplicate collector number ${collectorNumber}.`);
    requireCondition(!officialIds.has(ids[0]), `Duplicate official card ID ${ids[0]}.`);
    collectorNumbers.add(collectorNumber);
    officialIds.add(ids[0]);
    entries.push({
      collectorNumber,
      sourceCollectorNumber: collectorNumber,
      sourceUnnumbered: false,
      denominator: clean(printing.denominator),
      nativeName: clean(printing.native_name),
      supertype: clean(printing.supertype),
      artist: clean(printing.artist),
      officialId: ids[0],
      officialSetCode: clean(printing.official_set_code),
      detailUrl: clean((printing.detail_urls ?? [])[0]),
      thumbnailPath: clean((printing.thumbnail_paths ?? [])[0]),
      officialImageUrl: clean((printing.official_image_urls ?? [])[0]),
    });
  }

  const unnumberedRows = [
    ...(sourceReport.unnumbered_entries ?? []),
    ...(sourceReport.unresolved_unnumbered_variants ?? []),
  ];
  const defaultDenominator = clean((sourceReport.denominators ?? [])[0]);
  for (const row of unnumberedRows) {
    const mapping = unnumberedMap[row.native_name];
    requireCondition(mapping, `No canonical unnumbered mapping exists for ${row.native_name}.`);
    const collectorNumber = clean(typeof mapping === 'string' ? mapping : mapping.collector_number);
    requireCondition(collectorNumber, `Invalid unnumbered mapping for ${row.native_name}.`);
    const officialId = String(row.card_id ?? '').trim();
    requireCondition(officialId, `Unnumbered entry ${row.native_name} has no official ID.`);
    requireCondition(!collectorNumbers.has(collectorNumber), `Duplicate canonical collector number ${collectorNumber}.`);
    requireCondition(!officialIds.has(officialId), `Duplicate official card ID ${officialId}.`);
    collectorNumbers.add(collectorNumber);
    officialIds.add(officialId);
    entries.push({
      collectorNumber,
      sourceCollectorNumber: null,
      sourceUnnumbered: true,
      denominator: clean(row.denominator) ?? defaultDenominator,
      nativeName: clean(row.native_name),
      supertype: clean(row.supertype),
      artist: clean(row.artist),
      officialId,
      officialSetCode: clean(row.official_set_code),
      detailUrl: clean(row.detail_url),
      thumbnailPath: clean(row.thumbnail_path),
      officialImageUrl: clean(row.official_image_url),
    });
  }

  requireCondition(entries.length === Number(sourceReport.api_card_ids_collected),
    `Canonical entry count ${entries.length} does not match official hit count ${sourceReport.api_card_ids_collected}.`);
  requireCondition(entries.every((entry) => entry.nativeName), 'Every canonical entry requires a native name.');
  requireCondition(entries.every((entry) => ['Pokémon', 'Trainer', 'Energy'].includes(entry.supertype)),
    'Every canonical entry requires a valid supertype.');
  requireCondition(entries.every((entry) => entry.detailUrl), 'Every canonical entry requires an official detail URL.');
  return entries;
}

async function ensureSource(ingest) {
  const { data, error } = await ingest.from('sources').upsert({
    code: SOURCE_CODE,
    display_name: 'Pokémon Card Game Japan official card database',
    source_type: 'catalogue',
    base_url: 'https://www.pokemon-card.com',
    terms_url: 'https://www.pokemon-card.com/rules/',
    licence_status: 'approved',
    attribution_required: true,
    robots_policy: 'bounded metadata and authorised asset acquisition',
    rate_limit_config: {
      minimum_delay_ms: 650,
      bounded: true,
      metadata_authorised: true,
      image_use_authorised_by_stackr_owner: true,
    },
    active: true,
    internal_notes: 'Pokémon data and asset rights confirmed by the StackR owner. Preserve exact source provenance.',
    source_updated_at: new Date().toISOString(),
    deprecated_at: null,
    deprecated_reason: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'code' }).select('*').single();
  requireNoError(error, 'ensure official Japanese source');
  return data;
}

async function ensureImportRun(ingest, sourceId, canonicalSetCode, inputHash, entries, sourceReport) {
  const runKey = `official-jp-complete:${canonicalSetCode}:${inputHash.slice(0, 20)}`;
  const { data: existing, error: existingError } = await ingest.from('import_runs')
    .select('*')
    .eq('source_id', sourceId)
    .eq('run_key', runKey)
    .maybeSingle();
  requireNoError(existingError, 'lookup complete import run');
  const patch = {
    status: 'running',
    import_type: 'manual',
    request_id: `github:${process.env.GITHUB_RUN_ID ?? 'local'}`,
    started_at: existing?.started_at ?? new Date().toISOString(),
    finished_at: null,
    records_requested: entries.length,
    records_retrieved: entries.length,
    records_inserted: 0,
    records_updated: 0,
    records_skipped: 0,
    records_conflicted: 0,
    error_message: null,
    metadata: {
      input_hash: inputHash,
      canonical_set_code: canonicalSetCode,
      official_set_codes: sourceReport.official_set_codes,
      official_hit_count: sourceReport.api_card_ids_collected,
      unnumbered_entries: entries.filter((entry) => entry.sourceUnnumbered).length,
      rights_status: 'approved_by_stackr_owner',
    },
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const { data, error } = await ingest.from('import_runs').update(patch).eq('id', existing.id).select('*').single();
    requireNoError(error, 'resume complete import run');
    return data;
  }
  const { data, error } = await ingest.from('import_runs')
    .insert({ source_id: sourceId, run_key: runKey, ...patch })
    .select('*')
    .single();
  requireNoError(error, 'create complete import run');
  return data;
}

async function ensureSetEvidence({ ingest, source, importRun, setRow, canonicalSetCode, officialSetCode, sourceReport, entries, inputHash }) {
  const sourceUrl = `https://www.pokemon-card.com/card-search/index.php?mode=statuslist&pg=${encodeURIComponent(officialSetCode)}`;
  const payload = {
    provider: SOURCE_CODE,
    official_set_code: officialSetCode,
    canonical_set_code: canonicalSetCode,
    language_code: 'ja',
    native_name: setRow.native_name,
    english_display_name: setRow.english_display_name,
    printed_total: setRow.printed_total,
    total: setRow.total,
    official_card_ids: entries.length,
    source_url: sourceUrl,
    collector_generated_at: sourceReport.generated_at,
    rights_status: 'approved_by_stackr_owner',
  };
  const { data: existingRaw, error: rawLookupError } = await ingest.from('raw_source_records')
    .select('id')
    .eq('source_id', source.id)
    .eq('record_type', 'set')
    .eq('external_id', officialSetCode)
    .eq('language_code', 'ja')
    .is('deprecated_at', null)
    .order('retrieved_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  requireNoError(rawLookupError, 'lookup official set evidence');
  const rawPatch = {
    source_id: source.id,
    import_run_id: importRun.id,
    record_type: 'set',
    external_id: officialSetCode,
    provider_record_id: officialSetCode,
    language_code: 'ja',
    source_url: sourceUrl,
    source_endpoint: `/card-search/index.php?mode=statuslist&pg=${officialSetCode}`,
    source_updated_at: sourceReport.generated_at,
    licence_status: 'approved',
    attribution_text: 'Pokémon Card Game Japan official card database',
    payload_hash: hash(payload),
    raw_payload: payload,
    internal_notes: `Verified complete-set evidence ${inputHash}.`,
    http_metadata: { bounded_collection: true, rights_status: 'approved_by_stackr_owner' },
    validation_status: 'valid',
    validation_errors: [],
    deprecated_at: null,
    deprecated_reason: null,
    updated_at: new Date().toISOString(),
  };
  let rawRecord;
  if (existingRaw?.id) {
    const { data, error } = await ingest.from('raw_source_records').update(rawPatch).eq('id', existingRaw.id).select('*').single();
    requireNoError(error, 'update official set evidence');
    rawRecord = data;
  } else {
    const { data, error } = await ingest.from('raw_source_records').insert(rawPatch).select('*').single();
    requireNoError(error, 'insert official set evidence');
    rawRecord = data;
  }

  const { data: identifier, error: identifierLookupError } = await ingest.from('external_identifiers')
    .select('id,set_id')
    .eq('source_id', source.id)
    .eq('source_entity_type', 'set')
    .eq('external_id', officialSetCode)
    .eq('language_code', 'ja')
    .eq('is_current', true)
    .is('deprecated_at', null)
    .maybeSingle();
  requireNoError(identifierLookupError, 'lookup official set identifier');
  if (identifier?.set_id) requireCondition(identifier.set_id === setRow.id, 'Official set code points to another canonical set.');
  const identifierPatch = {
    source_id: source.id,
    raw_record_id: rawRecord.id,
    source_entity_type: 'set',
    external_id: officialSetCode,
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
    requireNoError(error, 'update official set identifier');
  } else {
    const { error } = await ingest.from('external_identifiers').insert(identifierPatch);
    requireNoError(error, 'insert official set identifier');
  }
}

async function resolveConcepts(catalog, entries) {
  const names = unique(entries.map((entry) => entry.nativeName));
  const candidates = new Map(names.map((name) => [name, new Set()]));

  const nameRows = await selectInBatches(
    catalog.from('card_names'), 'name', names, 'name,card_concept_id',
    (query) => query.eq('language_code', 'ja').eq('name_type', 'native').not('card_concept_id', 'is', null).is('deprecated_at', null),
  );
  for (const row of nameRows) if (row.card_concept_id) candidates.get(row.name)?.add(row.card_concept_id);

  const printingRows = await selectInBatches(
    catalog.from('card_printings'), 'native_name', names, 'native_name,card_concept_id',
    (query) => query.eq('language_code', 'ja').not('card_concept_id', 'is', null).is('deprecated_at', null),
  );
  for (const row of printingRows) if (row.card_concept_id) candidates.get(row.native_name)?.add(row.card_concept_id);

  const unresolved = names.filter((name) => candidates.get(name).size === 0);
  const keys = unresolved.map(conceptKey);
  const conceptRows = await selectInBatches(
    catalog.from('card_concepts'), 'concept_key', keys, 'id,concept_key',
    (query) => query.eq('game_code', 'pokemon').is('deprecated_at', null),
  );
  const conceptsByKey = new Map(conceptRows.map((row) => [row.concept_key, row]));
  const newConceptRows = unresolved
    .filter((name) => !conceptsByKey.has(conceptKey(name)))
    .map((name) => ({
      game_code: 'pokemon',
      concept_key: conceptKey(name),
      default_english_name: null,
      source_updated_at: new Date().toISOString(),
    }));
  const insertedConcepts = await insertRows(catalog.from('card_concepts'), newConceptRows, 'insert Japanese concepts');
  for (const row of insertedConcepts) conceptsByKey.set(row.concept_key, row);
  for (const name of unresolved) {
    const concept = conceptsByKey.get(conceptKey(name));
    if (concept?.id) candidates.get(name).add(concept.id);
  }

  const ambiguous = [...candidates.entries()]
    .filter(([, ids]) => ids.size !== 1)
    .map(([name, ids]) => ({ name, concept_ids: [...ids] }));
  requireCondition(ambiguous.length === 0, `Ambiguous Japanese concepts: ${JSON.stringify(ambiguous.slice(0, 10))}`);

  const conceptByName = new Map([...candidates.entries()].map(([name, ids]) => [name, [...ids][0]]));
  const conceptIds = unique([...conceptByName.values()]);

  const existingNativeNames = await selectInBatches(
    catalog.from('card_names'), 'card_concept_id', conceptIds, 'card_concept_id,name',
    (query) => query.eq('language_code', 'ja').eq('name_type', 'native').is('deprecated_at', null),
  );
  const existingKeys = new Set(existingNativeNames.map((row) => `${row.card_concept_id}\u0000${row.name}`));
  const nativeRows = [];
  for (const [name, conceptId] of conceptByName) {
    if (existingKeys.has(`${conceptId}\u0000${name}`)) continue;
    nativeRows.push({
      card_concept_id: conceptId,
      language_code: 'ja',
      name_type: 'native',
      name,
      normalized_name: name.toLocaleLowerCase('ja-JP'),
      source_confidence: 1,
      source_updated_at: new Date().toISOString(),
    });
  }
  await insertRows(catalog.from('card_names'), nativeRows, 'insert Japanese native names');

  const englishCandidates = new Map(conceptIds.map((id) => [id, new Set()]));
  const conceptDetails = await selectInBatches(
    catalog.from('card_concepts'), 'id', conceptIds, 'id,default_english_name',
    (query) => query.is('deprecated_at', null),
  );
  for (const row of conceptDetails) {
    const value = clean(row.default_english_name);
    if (value) englishCandidates.get(row.id)?.add(value);
  }
  const englishRows = await selectInBatches(
    catalog.from('card_names'), 'card_concept_id', conceptIds, 'card_concept_id,name',
    (query) => query.eq('language_code', 'en').is('deprecated_at', null),
  );
  for (const row of englishRows) {
    const value = clean(row.name);
    if (value) englishCandidates.get(row.card_concept_id)?.add(value);
  }
  const englishByConcept = new Map();
  for (const [conceptId, values] of englishCandidates) {
    if (values.size === 1) englishByConcept.set(conceptId, [...values][0]);
  }

  return { conceptByName, englishByConcept, insertedConcepts: insertedConcepts.length, insertedNativeNames: nativeRows.length };
}

async function upsertPrintings(catalog, setRow, entries, concepts, sourceUpdatedAt) {
  const { data: existing, error: existingError } = await catalog.from('card_printings')
    .select('*')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null);
  requireNoError(existingError, 'load target Japanese printings');
  const existingByNumber = new Map();
  for (const row of existing ?? []) {
    requireCondition(!existingByNumber.has(row.collector_number), `Duplicate active printing ${row.collector_number}.`);
    existingByNumber.set(row.collector_number, row);
  }

  const inserts = [];
  const updates = [];
  for (const entry of entries) {
    const identity = collectorIdentity(entry.collectorNumber);
    const conceptId = concepts.conceptByName.get(entry.nativeName);
    const englishName = concepts.englishByConcept.get(conceptId) ?? null;
    const base = {
      game_code: 'pokemon',
      set_id: setRow.id,
      language_code: 'ja',
      card_concept_id: conceptId,
      collector_number: entry.collectorNumber,
      collector_number_prefix: identity.prefix,
      collector_number_sort: identity.sort,
      collector_number_suffix: identity.suffix,
      collector_number_sort_key: identity.sortKey,
      native_name: entry.nativeName,
      english_display_name: englishName,
      rarity_id: null,
      supertype: entry.supertype,
      subtypes: [],
      artist: entry.artist,
      source_updated_at: sourceUpdatedAt,
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    };
    const old = existingByNumber.get(entry.collectorNumber);
    if (old) {
      updates.push({
        ...base,
        id: old.id,
        rarity_id: old.rarity_id,
        english_display_name: clean(old.english_display_name) ?? englishName,
        artist: clean(old.artist) ?? entry.artist,
      });
    } else inserts.push(base);
  }
  const inserted = await insertRows(catalog.from('card_printings'), inserts, 'insert complete Japanese printings');
  const updated = await updateRows(catalog.from('card_printings'), updates, 'update complete Japanese printings');
  const all = [...inserted, ...updated];
  const byNumber = new Map(all.map((row) => [row.collector_number, row]));
  requireCondition(byNumber.size === entries.length, 'Canonical printing write count mismatch.');
  return { byNumber, inserted: inserted.length, updated: updated.length };
}

async function ensureVariants(catalog, printings, sourceUpdatedAt) {
  const printingIds = [...printings.byNumber.values()].map((row) => row.id);
  const existing = await selectInBatches(
    catalog.from('card_variants'), 'printing_id', printingIds, 'id,printing_id,variant_code,is_default',
    (query) => query.is('deprecated_at', null),
  );
  const variantsByPrinting = new Map();
  for (const row of existing) {
    const list = variantsByPrinting.get(row.printing_id) ?? [];
    list.push(row);
    variantsByPrinting.set(row.printing_id, list);
  }

  const inserts = [];
  for (const printing of printings.byNumber.values()) {
    const variants = variantsByPrinting.get(printing.id) ?? [];
    if (variants.length) continue;
    inserts.push({
      printing_id: printing.id,
      game_code: printing.game_code,
      set_id: printing.set_id,
      language_code: printing.language_code,
      collector_number: printing.collector_number,
      variant_code: VARIANT_CODE,
      finish_code: null,
      canonical_key: `${printing.game_code}:${printing.language_code}:${printing.set_id}:${printing.collector_number}:${VARIANT_CODE}`.toLowerCase(),
      artwork_key: null,
      image_signature: null,
      is_default: true,
      variant_display_name: 'Finish pending review',
      source_confidence: 0.5,
      source_updated_at: sourceUpdatedAt,
      native_image_status: 'pending_review',
      deprecated_at: null,
      deprecated_reason: null,
    });
  }
  const inserted = await insertRows(catalog.from('card_variants'), inserts, 'insert complete Japanese variants');
  for (const row of inserted) variantsByPrinting.set(row.printing_id, [row]);

  const selectedByPrinting = new Map();
  for (const printing of printings.byNumber.values()) {
    const variants = variantsByPrinting.get(printing.id) ?? [];
    requireCondition(variants.length > 0, `No variant exists for printing ${printing.collector_number}.`);
    selectedByPrinting.set(printing.id,
      variants.find((row) => row.variant_code === VARIANT_CODE)
      ?? variants.find((row) => row.is_default)
      ?? variants[0]);
  }
  return { selectedByPrinting, inserted: inserted.length };
}

async function upsertCardEvidence({ ingest, source, importRun, entries, printings, variants, sourceReport, canonicalSetCode, officialSetCode, inputHash }) {
  const officialIds = entries.map((entry) => entry.officialId);
  const existingRaw = await selectInBatches(
    ingest.from('raw_source_records'), 'external_id', officialIds, 'id,external_id',
    (query) => query.eq('source_id', source.id).eq('record_type', 'card').eq('language_code', 'ja').is('deprecated_at', null),
  );
  const rawById = new Map(existingRaw.map((row) => [row.external_id, row]));
  let rawInserted = 0;
  let rawUpdated = 0;

  for (const entry of entries) {
    const payload = {
      provider: SOURCE_CODE,
      official_card_id: entry.officialId,
      official_set_code: officialSetCode,
      canonical_set_code: canonicalSetCode,
      language_code: 'ja',
      source_collector_number: entry.sourceCollectorNumber,
      canonical_collector_number: entry.collectorNumber,
      printed_denominator: entry.denominator,
      source_unnumbered: entry.sourceUnnumbered,
      native_name: entry.nativeName,
      supertype: entry.supertype,
      artist: entry.artist,
      rarity: null,
      finish_status: 'pending_review',
      detail_url: entry.detailUrl,
      thumbnail_path: entry.thumbnailPath,
      official_image_url: entry.officialImageUrl,
      image_downloaded: false,
      rights_status: 'approved_by_stackr_owner',
      collector_generated_at: sourceReport.generated_at,
    };
    const patch = {
      source_id: source.id,
      import_run_id: importRun.id,
      record_type: 'card',
      external_id: entry.officialId,
      provider_record_id: entry.officialId,
      language_code: 'ja',
      source_url: entry.detailUrl,
      source_endpoint: new URL(entry.detailUrl).pathname,
      source_updated_at: sourceReport.generated_at,
      licence_status: 'approved',
      attribution_text: 'Pokémon Card Game Japan official card database',
      payload_hash: hash(payload),
      raw_payload: payload,
      internal_notes: `Complete official identity ${inputHash}; exact finish remains pending.`,
      http_metadata: {
        bounded_collection: true,
        image_url_captured: Boolean(entry.officialImageUrl),
        rights_status: 'approved_by_stackr_owner',
      },
      validation_status: 'valid',
      validation_errors: [],
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    };
    const old = rawById.get(entry.officialId);
    let saved;
    if (old?.id) {
      const { data, error } = await ingest.from('raw_source_records').update(patch).eq('id', old.id).select('*').single();
      requireNoError(error, 'update complete Japanese raw card');
      saved = data;
      rawUpdated += 1;
    } else {
      const { data, error } = await ingest.from('raw_source_records').insert(patch).select('*').single();
      requireNoError(error, 'insert complete Japanese raw card');
      saved = data;
      rawInserted += 1;
    }
    rawById.set(entry.officialId, saved);
  }

  const existingIdentifiers = await selectInBatches(
    ingest.from('external_identifiers'), 'external_id', officialIds, 'id,external_id',
    (query) => query.eq('source_id', source.id).eq('source_entity_type', 'card').eq('language_code', 'ja').eq('is_current', true).is('deprecated_at', null),
  );
  const identifierById = new Map(existingIdentifiers.map((row) => [row.external_id, row]));
  let identifiersInserted = 0;
  let identifiersUpdated = 0;
  for (const entry of entries) {
    const printing = printings.byNumber.get(entry.collectorNumber);
    const variant = variants.selectedByPrinting.get(printing.id);
    const raw = rawById.get(entry.officialId);
    const patch = {
      source_id: source.id,
      raw_record_id: raw.id,
      source_entity_type: 'card',
      external_id: entry.officialId,
      external_uri: entry.detailUrl,
      game_code: 'pokemon',
      language_code: 'ja',
      series_id: null,
      set_id: null,
      card_concept_id: null,
      printing_id: null,
      variant_id: variant.id,
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
    const old = identifierById.get(entry.officialId);
    if (old?.id) {
      const { error } = await ingest.from('external_identifiers').update(patch).eq('id', old.id);
      requireNoError(error, 'update complete Japanese identifier');
      identifiersUpdated += 1;
    } else {
      const { error } = await ingest.from('external_identifiers').insert(patch);
      requireNoError(error, 'insert complete Japanese identifier');
      identifiersInserted += 1;
    }
  }
  return { rawInserted, rawUpdated, identifiersInserted, identifiersUpdated };
}

async function verify({ catalog, ingest, source, setRow, entries }) {
  const { data: printings, error: printingError } = await catalog.from('card_printings')
    .select('id,collector_number,native_name,english_display_name,card_concept_id,rarity_id,artist,supertype')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null);
  requireNoError(printingError, 'verify complete Japanese printings');
  const printingIds = (printings ?? []).map((row) => row.id);
  const variants = await selectInBatches(
    catalog.from('card_variants'), 'printing_id', printingIds, 'id,printing_id,canonical_key,native_image_status',
    (query) => query.is('deprecated_at', null),
  );
  const variantIds = variants.map((row) => row.id);
  const identifiers = await selectInBatches(
    ingest.from('external_identifiers'), 'variant_id', variantIds, 'id,external_id,variant_id,printing_id',
    (query) => query.eq('source_id', source.id).eq('source_entity_type', 'card').eq('language_code', 'ja').eq('is_current', true).is('deprecated_at', null),
  );
  const officialIds = new Set(entries.map((entry) => entry.officialId));
  const verifiedOfficialIds = new Set(identifiers.filter((row) => officialIds.has(row.external_id)).map((row) => row.external_id));
  const collectorNumbers = (printings ?? []).map((row) => row.collector_number);
  const canonicalKeys = variants.map((row) => row.canonical_key);
  return {
    active_printings: printings?.length ?? 0,
    distinct_collector_numbers: new Set(collectorNumbers).size,
    duplicate_collector_numbers: collectorNumbers.filter((value, index, array) => array.indexOf(value) !== index),
    printings_with_variant: new Set(variants.map((row) => row.printing_id)).size,
    active_variants: variants.length,
    duplicate_variant_keys: canonicalKeys.filter((value, index, array) => array.indexOf(value) !== index),
    official_ids_expected: officialIds.size,
    official_ids_verified: verifiedOfficialIds.size,
    official_ids_missing: [...officialIds].filter((id) => !verifiedOfficialIds.has(id)),
    identifiers_with_both_printing_and_variant: identifiers.filter((row) => row.printing_id && row.variant_id).length,
    unresolved_concepts: (printings ?? []).filter((row) => !row.card_concept_id).length,
    missing_english_names: (printings ?? []).filter((row) => !clean(row.english_display_name)).length,
    missing_rarity: (printings ?? []).filter((row) => !row.rarity_id).length,
    missing_artist: (printings ?? []).filter((row) => !clean(row.artist)).length,
    missing_supertype: (printings ?? []).filter((row) => !clean(row.supertype)).length,
  };
}

async function main() {
  const inputPath = path.resolve(option('input'));
  const mapPath = option('unnumbered-map') ? path.resolve(option('unnumbered-map')) : null;
  const canonicalSetCode = clean(option('canonical-set-code'));
  const officialSetCode = clean(option('official-set-code', canonicalSetCode));
  const releaseDate = clean(option('release-date'));
  const englishName = clean(option('english-name'));
  const reportPath = path.resolve(option('report', `reports/catalogue/official-japanese-set/${canonicalSetCode}-complete-import.json`));
  const target = clean(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const apply = hasFlag('apply');

  requireCondition(inputPath, '--input is required.');
  requireCondition(canonicalSetCode, '--canonical-set-code is required.');
  requireCondition(officialSetCode, '--official-set-code is required.');
  requireCondition(releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(releaseDate), '--release-date must be YYYY-MM-DD.');
  requireCondition(englishName, '--english-name is required.');
  requireCondition(target === 'staging', 'Complete imports are restricted to staging.');
  requireCondition(apply, '--apply is required.');

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Expected StackR staging SUPABASE_URL.');
  requireCondition(!supabaseUrl.includes(PRODUCTION_PROJECT_REF), 'Production target detected; complete import refused.');
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

  const inputText = readFileSync(inputPath, 'utf8');
  const sourceReport = JSON.parse(inputText);
  const unnumberedMap = mapPath ? JSON.parse(readFileSync(mapPath, 'utf8')) : {};
  requireCondition(sourceReport.source === SOURCE_CODE, 'Unexpected source report.');
  requireCondition(sourceReport.read_only === true, 'Source report is not read-only evidence.');
  requireCondition(sourceReport.images_downloaded === false, 'Source collector unexpectedly downloaded images.');
  requireCondition((sourceReport.parser_errors ?? []).length === 0, 'Source report contains parser errors.');
  requireCondition((sourceReport.identity_conflicts ?? []).length === 0, 'Source report contains identity conflicts.');
  requireCondition(sourceReport.set_code_requested === officialSetCode, 'Official set-code mismatch.');

  const entries = buildCanonicalEntries(sourceReport, unnumberedMap);
  const denominators = unique(entries.map((entry) => entry.denominator));
  requireCondition(denominators.length === 1 && /^\d+$/.test(denominators[0]), `Invalid printed denominator: ${denominators.join(',')}`);
  const printedTotal = Number.parseInt(denominators[0], 10);
  const inputHash = hash(inputText + JSON.stringify(unnumberedMap));

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const catalog = db.schema('catalog');
  const ingest = db.schema('ingest');
  const source = await ensureSource(ingest);
  const importRun = await ensureImportRun(ingest, source.id, canonicalSetCode, inputHash, entries, sourceReport);

  try {
    const { data: sets, error: setLookupError } = await catalog.from('sets')
      .select('*')
      .eq('language_code', 'ja')
      .eq('set_code', canonicalSetCode)
      .is('deprecated_at', null);
    requireNoError(setLookupError, 'load canonical Japanese set');
    requireCondition(sets?.length === 1, `Expected one active Japanese set ${canonicalSetCode}.`);
    const currentSet = sets[0];
    const { data: setRow, error: setUpdateError } = await catalog.from('sets').update({
      provider_set_code: currentSet.provider_set_code ?? canonicalSetCode,
      english_display_name: englishName,
      printed_total: printedTotal,
      total: entries.length,
      release_date: releaseDate,
      source_updated_at: sourceReport.generated_at,
      updated_at: new Date().toISOString(),
    }).eq('id', currentSet.id).select('*').single();
    requireNoError(setUpdateError, 'update complete Japanese set');

    await catalog.from('variant_taxonomy').upsert({
      code: VARIANT_CODE,
      english_label: 'Unclassified physical variant',
      variant_group: 'other',
      finish_code: null,
      description: 'Temporary truthful identity while exact finish, edition, stamp or parallel treatment is under review.',
      sort_order: 5,
      active: true,
      source_updated_at: new Date().toISOString(),
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'code' }).then(({ error }) => requireNoError(error, 'ensure unclassified taxonomy'));

    await ensureSetEvidence({ ingest, source, importRun, setRow, canonicalSetCode, officialSetCode, sourceReport, entries, inputHash });
    const concepts = await resolveConcepts(catalog, entries);
    const printings = await upsertPrintings(catalog, setRow, entries, concepts, sourceReport.generated_at);
    const variants = await ensureVariants(catalog, printings, sourceReport.generated_at);
    const evidence = await upsertCardEvidence({
      ingest, source, importRun, entries, printings, variants, sourceReport,
      canonicalSetCode, officialSetCode, inputHash,
    });
    const verification = await verify({ catalog, ingest, source, setRow, entries });

    requireCondition(verification.active_printings === entries.length, 'Active printing count mismatch.');
    requireCondition(verification.distinct_collector_numbers === entries.length, 'Collector-number coverage mismatch.');
    requireCondition(verification.duplicate_collector_numbers.length === 0, 'Duplicate collector numbers remain.');
    requireCondition(verification.printings_with_variant === entries.length, 'Variant coverage mismatch.');
    requireCondition(verification.duplicate_variant_keys.length === 0, 'Duplicate variant keys remain.');
    requireCondition(verification.official_ids_verified === entries.length, 'Official identifier coverage mismatch.');
    requireCondition(verification.official_ids_missing.length === 0, 'Official identifiers remain missing.');
    requireCondition(verification.identifiers_with_both_printing_and_variant === 0, 'An identifier points to both a printing and a variant.');
    requireCondition(verification.unresolved_concepts === 0, 'Unresolved concepts remain.');
    requireCondition(verification.missing_supertype === 0, 'Missing supertypes remain.');

    const result = {
      ok: true,
      target: 'staging',
      production_modified: false,
      canonical_set_code: canonicalSetCode,
      official_set_code: officialSetCode,
      source_hit_count: sourceReport.api_card_ids_collected,
      printed_total: printedTotal,
      full_total: entries.length,
      unnumbered_printings: entries.filter((entry) => entry.sourceUnnumbered).length,
      input_hash: inputHash,
      source_id: source.id,
      import_run_id: importRun.id,
      writes: {
        concepts_inserted: concepts.insertedConcepts,
        native_names_inserted: concepts.insertedNativeNames,
        printings_inserted: printings.inserted,
        printings_updated: printings.updated,
        variants_inserted: variants.inserted,
        raw_records_inserted: evidence.rawInserted,
        raw_records_updated: evidence.rawUpdated,
        identifiers_inserted: evidence.identifiersInserted,
        identifiers_updated: evidence.identifiersUpdated,
      },
      verification,
    };

    const { error: completeError } = await ingest.from('import_runs').update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      records_requested: entries.length,
      records_retrieved: entries.length,
      records_inserted: printings.inserted,
      records_updated: printings.updated,
      records_skipped: 0,
      records_conflicted: 0,
      error_message: null,
      metadata: { ...importRun.metadata, verification, rights_status: 'approved_by_stackr_owner' },
      updated_at: new Date().toISOString(),
    }).eq('id', importRun.id);
    requireNoError(completeError, 'complete Japanese import run');

    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await ingest.from('import_runs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
      updated_at: new Date().toISOString(),
    }).eq('id', importRun.id);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
