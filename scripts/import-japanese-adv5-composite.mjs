#!/usr/bin/env node
import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const COMPOSITE_SOURCE_CODE = 'stackr_adv5_composite';
const BULBAPEDIA_SOURCE_CODE = 'bulbapedia';
const POKECARDEX_SOURCE_CODE = 'pokecardex';
const VARIANT_CODE = 'unclassified';
const EXPECTED_NUMBERS = Array.from({ length: 83 }, (_, index) => String(index + 1).padStart(3, '0'));

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

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
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

async function insertInBatches(table, rows, context) {
  const inserted = [];
  for (const batch of chunks(rows)) {
    if (!batch.length) continue;
    const { data, error } = await table.insert(batch).select('*');
    requireNoError(error, context);
    inserted.push(...(data ?? []));
  }
  return inserted;
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

function validateManifest(manifest) {
  requireCondition(manifest?.source === COMPOSITE_SOURCE_CODE, `Unexpected source: ${manifest?.source}`);
  requireCondition(manifest.language_code === 'ja', 'ADV5 manifest is not Japanese.');
  requireCondition(manifest.canonical_set_code === 'ADV5', 'ADV5 canonical code is missing.');
  requireCondition(manifest.native_set_name === 'とかれた封印', 'Unexpected ADV5 native set name.');
  requireCondition(manifest.english_set_name === 'Undone Seal', 'Unexpected ADV5 English set name.');
  requireCondition(manifest.release_date === '2004-01-16', 'Unexpected ADV5 release date.');
  requireCondition(Number(manifest.printed_total) === 83 && Number(manifest.full_total) === 83, 'ADV5 totals must both be 83.');
  requireCondition(manifest.rights_status === 'approved_by_stackr_owner', 'ADV5 rights status is not approved.');
  requireCondition(manifest.read_only === true && manifest.database_modified === false, 'ADV5 collector evidence is not read-only.');
  requireCondition(Array.isArray(manifest.cards) && manifest.cards.length === 83, 'ADV5 manifest must contain 83 cards.');

  const numbers = manifest.cards.map((card) => clean(card.collector_number));
  requireCondition(JSON.stringify(numbers) === JSON.stringify(EXPECTED_NUMBERS), 'ADV5 numbers are not exactly 001–083 in order.');
  requireCondition(new Set(numbers).size === 83, 'ADV5 collector numbers are not unique.');
  requireCondition(new Set(manifest.cards.map((card) => clean(card.native_name))).size === 83, 'ADV5 Japanese names are not unique.');
  requireCondition(new Set(manifest.cards.map((card) => clean(card.image_url))).size === 83, 'ADV5 image URLs are not unique.');
  requireCondition(manifest.cards.every((card) => clean(card.native_name)), 'ADV5 contains a blank Japanese name.');
  requireCondition(manifest.cards.every((card) => clean(card.english_name)), 'ADV5 contains a blank English name.');
  requireCondition(manifest.cards.every((card) => clean(card.artist)), 'ADV5 contains a blank artist.');
  requireCondition(manifest.cards.every((card) => ['Pokémon', 'Trainer'].includes(card.supertype)), 'ADV5 contains an invalid supertype.');
  requireCondition(manifest.cards.every((card) => clean(card.rarity_label)), 'ADV5 contains a blank rarity label.');
  requireCondition(manifest.cards.every((card) => clean(card.bulbapedia_card_url)), 'ADV5 contains a blank Bulbapedia URL.');
  requireCondition(manifest.cards.every((card) => clean(card.pokecardex_card_url)), 'ADV5 contains a blank PokéCardex card URL.');
  requireCondition(manifest.cards.every((card) => clean(card.image_url)), 'ADV5 contains a blank image URL.');
  requireCondition(clean(manifest.logo_url) && clean(manifest.symbol_url), 'ADV5 logo or symbol URL is missing.');
}

async function ensureSource(ingest, payload) {
  const { data, error } = await ingest.from('sources')
    .upsert({
      ...payload,
      active: true,
      licence_status: 'approved',
      deprecated_at: null,
      deprecated_reason: null,
      source_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'code' })
    .select('*')
    .single();
  requireNoError(error, `ensure source ${payload.code}`);
  return data;
}

async function ensureImportRun(ingest, sourceId, inputHash, manifest) {
  const runKey = `adv5-composite:${inputHash.slice(0, 24)}`;
  const { data: existing, error: lookupError } = await ingest.from('import_runs')
    .select('*')
    .eq('source_id', sourceId)
    .eq('run_key', runKey)
    .maybeSingle();
  requireNoError(lookupError, 'lookup ADV5 import run');
  const patch = {
    import_type: 'manual',
    status: 'running',
    request_id: `github:${process.env.GITHUB_RUN_ID ?? 'local'}`,
    started_at: existing?.started_at ?? new Date().toISOString(),
    finished_at: null,
    records_requested: 83,
    records_retrieved: 83,
    records_inserted: 0,
    records_updated: 0,
    records_skipped: 0,
    records_conflicted: 0,
    error_message: null,
    metadata: {
      input_hash: inputHash,
      canonical_set_code: 'ADV5',
      sources: [BULBAPEDIA_SOURCE_CODE, POKECARDEX_SOURCE_CODE],
      collector_generated_at: manifest.generated_at,
      rights_status: manifest.rights_status,
    },
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const { data, error } = await ingest.from('import_runs').update(patch).eq('id', existing.id).select('*').single();
    requireNoError(error, 'resume ADV5 import run');
    return data;
  }
  const { data, error } = await ingest.from('import_runs')
    .insert({ source_id: sourceId, run_key: runKey, ...patch })
    .select('*')
    .single();
  requireNoError(error, 'create ADV5 import run');
  return data;
}

async function loadEnglishReferenceSet(catalog, cards) {
  const { data: sets, error: setError } = await catalog.from('sets')
    .select('id,set_code,native_name,total')
    .eq('language_code', 'en')
    .eq('set_code', 'ex5')
    .is('deprecated_at', null);
  requireNoError(setError, 'load EX Hidden Legends reference set');
  requireCondition(sets?.length === 1, 'Expected one active English ex5 reference set.');

  const { data: printings, error: printingError } = await catalog.from('card_printings')
    .select('id,collector_number,native_name,english_display_name,card_concept_id,rarity_id,supertype,subtypes,artist')
    .eq('set_id', sets[0].id)
    .eq('language_code', 'en')
    .is('deprecated_at', null);
  requireNoError(printingError, 'load EX Hidden Legends printings');

  const byName = new Map();
  for (const printing of printings ?? []) {
    for (const value of unique([clean(printing.native_name), clean(printing.english_display_name)])) {
      const key = value.toLocaleLowerCase('en-US');
      const list = byName.get(key) ?? [];
      list.push(printing);
      byName.set(key, list);
    }
  }

  const referenceByNumber = new Map();
  const errors = [];
  for (const card of cards) {
    const matches = byName.get(card.english_name.toLocaleLowerCase('en-US')) ?? [];
    const uniqueMatches = [...new Map(matches.map((row) => [row.id, row])).values()];
    if (uniqueMatches.length !== 1) {
      errors.push({
        collector_number: card.collector_number,
        english_name: card.english_name,
        match_count: uniqueMatches.length,
        matches: uniqueMatches.map((row) => ({ id: row.id, number: row.collector_number, name: row.native_name })),
      });
      continue;
    }
    const match = uniqueMatches[0];
    requireCondition(match.card_concept_id, `English reference ${card.english_name} has no concept.`);
    requireCondition(match.rarity_id, `English reference ${card.english_name} has no rarity.`);
    referenceByNumber.set(card.collector_number, match);
  }
  requireCondition(errors.length === 0, `ADV5 English reference mapping failed: ${JSON.stringify(errors)}`);
  requireCondition(referenceByNumber.size === 83, 'ADV5 English reference mapping did not resolve all 83 cards.');
  return { set: sets[0], referenceByNumber };
}

async function ensureNames(catalog, cards, referenceByNumber, sourceUpdatedAt) {
  const conceptIds = unique([...referenceByNumber.values()].map((row) => row.card_concept_id));
  const existing = await selectInBatches(
    catalog.from('card_names'),
    'card_concept_id',
    conceptIds,
    'card_concept_id,language_code,name_type,name',
    (query) => query.eq('language_code', 'ja').eq('name_type', 'native').is('deprecated_at', null),
  );
  const existingKeys = new Set(existing.map((row) => `${row.card_concept_id}\u0000${row.name}`));
  const rows = [];
  for (const card of cards) {
    const reference = referenceByNumber.get(card.collector_number);
    const key = `${reference.card_concept_id}\u0000${card.native_name}`;
    if (existingKeys.has(key)) continue;
    rows.push({
      card_concept_id: reference.card_concept_id,
      language_code: 'ja',
      name_type: 'native',
      name: card.native_name,
      normalized_name: card.native_name.toLocaleLowerCase('ja-JP'),
      source_confidence: 1,
      source_updated_at: sourceUpdatedAt,
    });
  }
  const inserted = await insertInBatches(catalog.from('card_names'), rows, 'insert ADV5 Japanese names');
  return inserted.length;
}

async function upsertPrintings(catalog, setRow, manifest, referenceByNumber) {
  const { data: existing, error: existingError } = await catalog.from('card_printings')
    .select('*')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null);
  requireNoError(existingError, 'load existing ADV5 printings');
  const existingByNumber = new Map();
  for (const row of existing ?? []) {
    requireCondition(!existingByNumber.has(row.collector_number), `Duplicate ADV5 printing ${row.collector_number}.`);
    existingByNumber.set(row.collector_number, row);
  }

  const inserts = [];
  const updates = [];
  for (const card of manifest.cards) {
    const reference = referenceByNumber.get(card.collector_number);
    const numberSort = Number.parseInt(card.collector_number, 10);
    const base = {
      game_code: 'pokemon',
      set_id: setRow.id,
      language_code: 'ja',
      card_concept_id: reference.card_concept_id,
      collector_number: card.collector_number,
      collector_number_prefix: null,
      collector_number_sort: numberSort,
      collector_number_suffix: null,
      collector_number_sort_key: String(numberSort).padStart(12, '0'),
      native_name: card.native_name,
      english_display_name: card.english_name,
      rarity_id: reference.rarity_id,
      supertype: card.supertype,
      subtypes: reference.subtypes ?? [],
      artist: card.artist,
      source_updated_at: manifest.generated_at,
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    };
    const old = existingByNumber.get(card.collector_number);
    if (old) updates.push({ ...base, id: old.id });
    else inserts.push(base);
  }

  const inserted = await insertInBatches(catalog.from('card_printings'), inserts, 'insert ADV5 printings');
  const updated = await updateRows(catalog.from('card_printings'), updates, 'update ADV5 printings');
  const allRows = [...inserted, ...updated];
  const byNumber = new Map(allRows.map((row) => [row.collector_number, row]));
  requireCondition(byNumber.size === 83, 'ADV5 printing write did not produce 83 identities.');
  return { byNumber, inserted: inserted.length, updated: updated.length };
}

async function ensureVariants(catalog, printings, sourceUpdatedAt) {
  const printingIds = [...printings.byNumber.values()].map((row) => row.id);
  const existing = await selectInBatches(
    catalog.from('card_variants'),
    'printing_id',
    printingIds,
    'id,printing_id,variant_code,is_default',
    (query) => query.is('deprecated_at', null),
  );
  const byPrinting = new Map();
  for (const variant of existing) {
    const list = byPrinting.get(variant.printing_id) ?? [];
    list.push(variant);
    byPrinting.set(variant.printing_id, list);
  }

  const inserts = [];
  for (const printing of printings.byNumber.values()) {
    if ((byPrinting.get(printing.id) ?? []).length > 0) continue;
    inserts.push({
      printing_id: printing.id,
      game_code: 'pokemon',
      set_id: printing.set_id,
      language_code: 'ja',
      collector_number: printing.collector_number,
      variant_code: VARIANT_CODE,
      finish_code: null,
      canonical_key: `pokemon:ja:${printing.set_id}:${printing.collector_number}:${VARIANT_CODE}`.toLowerCase(),
      artwork_key: null,
      image_signature: null,
      is_default: true,
      variant_display_name: 'Finish pending review',
      source_confidence: 0.75,
      source_updated_at: sourceUpdatedAt,
      native_image_status: 'pending_review',
      deprecated_at: null,
      deprecated_reason: null,
    });
  }
  const inserted = await insertInBatches(catalog.from('card_variants'), inserts, 'insert ADV5 variants');
  for (const row of inserted) byPrinting.set(row.printing_id, [row]);

  const selectedByPrinting = new Map();
  for (const printing of printings.byNumber.values()) {
    const variants = byPrinting.get(printing.id) ?? [];
    requireCondition(variants.length > 0, `ADV5 ${printing.collector_number} has no variant.`);
    selectedByPrinting.set(
      printing.id,
      variants.find((row) => row.variant_code === VARIANT_CODE)
        ?? variants.find((row) => row.is_default)
        ?? variants[0],
    );
  }
  return { selectedByPrinting, inserted: inserted.length };
}

async function upsertRawRecord(ingest, source, importRun, record) {
  const { data: existing, error: lookupError } = await ingest.from('raw_source_records')
    .select('id')
    .eq('source_id', source.id)
    .eq('record_type', record.record_type)
    .eq('external_id', record.external_id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null)
    .order('retrieved_at', { ascending: false })
    .limit(2);
  requireNoError(lookupError, `lookup raw ${source.code} ${record.external_id}`);
  requireCondition((existing ?? []).length <= 1, `Multiple active raw rows exist for ${source.code} ${record.external_id}.`);

  const payload = record.raw_payload;
  const patch = {
    source_id: source.id,
    import_run_id: importRun.id,
    record_type: record.record_type,
    external_id: record.external_id,
    provider_record_id: record.external_id,
    language_code: 'ja',
    source_url: record.source_url,
    source_endpoint: clean(record.source_endpoint),
    source_updated_at: record.source_updated_at,
    licence_status: 'approved',
    attribution_text: record.attribution_text,
    payload_hash: sha256(payload),
    raw_payload: payload,
    internal_notes: record.internal_notes,
    http_metadata: { composite_manifest: true, rights_status: 'approved_by_stackr_owner' },
    validation_status: 'valid',
    validation_errors: [],
    deprecated_at: null,
    deprecated_reason: null,
    updated_at: new Date().toISOString(),
  };
  if (existing?.[0]?.id) {
    const { data, error } = await ingest.from('raw_source_records')
      .update(patch)
      .eq('id', existing[0].id)
      .select('*')
      .single();
    requireNoError(error, `update raw ${source.code} ${record.external_id}`);
    return { row: data, action: 'updated' };
  }
  const { data, error } = await ingest.from('raw_source_records').insert(patch).select('*').single();
  requireNoError(error, `insert raw ${source.code} ${record.external_id}`);
  return { row: data, action: 'inserted' };
}

async function upsertIdentifier(ingest, source, rawRow, payload) {
  const { data: existing, error: lookupError } = await ingest.from('external_identifiers')
    .select('id')
    .eq('source_id', source.id)
    .eq('source_entity_type', payload.source_entity_type)
    .eq('external_id', payload.external_id)
    .eq('language_code', 'ja')
    .eq('is_current', true)
    .is('deprecated_at', null)
    .maybeSingle();
  requireNoError(lookupError, `lookup identifier ${source.code} ${payload.external_id}`);
  const patch = {
    source_id: source.id,
    raw_record_id: rawRow.id,
    source_entity_type: payload.source_entity_type,
    external_id: payload.external_id,
    external_uri: payload.external_uri,
    game_code: 'pokemon',
    language_code: 'ja',
    series_id: null,
    set_id: payload.set_id ?? null,
    card_concept_id: null,
    printing_id: null,
    variant_id: payload.variant_id ?? null,
    sealed_product_id: null,
    sealed_product_variant_id: null,
    asset_id: null,
    confidence: 1,
    is_current: true,
    source_updated_at: payload.source_updated_at,
    deprecated_at: null,
    deprecated_reason: null,
    updated_at: new Date().toISOString(),
  };
  if (existing?.id) {
    const { error } = await ingest.from('external_identifiers').update(patch).eq('id', existing.id);
    requireNoError(error, `update identifier ${source.code} ${payload.external_id}`);
    return 'updated';
  }
  const { error } = await ingest.from('external_identifiers').insert(patch);
  requireNoError(error, `insert identifier ${source.code} ${payload.external_id}`);
  return 'inserted';
}

async function persistSources({ ingest, manifest, sources, importRun, setRow, printings, variants }) {
  const counts = {
    raw_inserted: 0,
    raw_updated: 0,
    identifiers_inserted: 0,
    identifiers_updated: 0,
  };
  const bump = (kind, action) => {
    counts[`${kind}_${action}`] += 1;
  };

  const setRecords = [
    {
      source: sources.bulbapedia,
      record: {
        record_type: 'set',
        external_id: 'ADV5',
        source_url: 'https://bulbapedia.bulbagarden.net/wiki/Undone_Seal_(TCG)',
        source_endpoint: '/wiki/Undone_Seal_(TCG)',
        source_updated_at: manifest.generated_at,
        attribution_text: 'Bulbapedia / Bulbagarden Archives',
        internal_notes: 'Cross-verified ADV5 checklist and metadata source.',
        raw_payload: {
          canonical_set_code: 'ADV5',
          native_name: manifest.native_set_name,
          english_name: manifest.english_set_name,
          release_date: manifest.release_date,
          printed_total: 83,
          total: 83,
          checklist_rows: 83,
          rights_status: manifest.rights_status,
        },
      },
    },
    {
      source: sources.pokecardex,
      record: {
        record_type: 'set',
        external_id: 'ADV5',
        source_url: 'https://www.pokecardex.com/series/jp/ADV5',
        source_endpoint: '/series/jp/ADV5',
        source_updated_at: manifest.generated_at,
        attribution_text: 'PokéCardex',
        internal_notes: 'Rendered Japanese ADV5 image, logo and symbol source.',
        raw_payload: {
          canonical_set_code: 'ADV5',
          card_images: 83,
          logo_url: manifest.logo_url,
          symbol_url: manifest.symbol_url,
          rights_status: manifest.rights_status,
        },
      },
    },
  ];
  for (const item of setRecords) {
    const raw = await upsertRawRecord(ingest, item.source, importRun, item.record);
    bump('raw', raw.action);
    const action = await upsertIdentifier(ingest, item.source, raw.row, {
      source_entity_type: 'set',
      external_id: 'ADV5',
      external_uri: item.record.source_url,
      set_id: setRow.id,
      source_updated_at: manifest.generated_at,
    });
    bump('identifiers', action);
  }

  for (const card of manifest.cards) {
    const printing = printings.byNumber.get(card.collector_number);
    const variant = variants.selectedByPrinting.get(printing.id);
    const bulbExternalId = `ADV5-${card.collector_number}`;
    const pokeExternalId = `ADV5-${Number.parseInt(card.collector_number, 10)}`;
    const cardRecords = [
      {
        source: sources.bulbapedia,
        externalId: bulbExternalId,
        url: card.bulbapedia_card_url,
        endpoint: new URL(card.bulbapedia_card_url).pathname,
        attribution: 'Bulbapedia / Bulbagarden Archives',
        notes: 'Japanese name, artist, checklist identity, type and rarity source.',
        payload: {
          canonical_set_code: 'ADV5',
          collector_number: card.collector_number,
          denominator: card.denominator,
          native_name: card.native_name,
          english_name: card.english_name,
          artist: card.artist,
          supertype: card.supertype,
          type_label: card.type_label,
          rarity_label: card.rarity_label,
          rights_status: manifest.rights_status,
        },
      },
      {
        source: sources.pokecardex,
        externalId: pokeExternalId,
        url: card.pokecardex_card_url,
        endpoint: new URL(card.pokecardex_card_url).pathname,
        attribution: 'PokéCardex',
        notes: 'Exact Japanese ADV5 scan source. Asset mirroring is a separate controlled step.',
        payload: {
          canonical_set_code: 'ADV5',
          collector_number: card.collector_number,
          native_name: card.native_name,
          image_url: card.image_url,
          card_detail_url: card.pokecardex_card_url,
          image_alt: card.image_alt,
          image_width: card.image_width,
          image_height: card.image_height,
          rights_status: manifest.rights_status,
          image_downloaded: false,
        },
      },
    ];
    for (const item of cardRecords) {
      const raw = await upsertRawRecord(ingest, item.source, importRun, {
        record_type: 'card',
        external_id: item.externalId,
        source_url: item.url,
        source_endpoint: item.endpoint,
        source_updated_at: manifest.generated_at,
        attribution_text: item.attribution,
        internal_notes: item.notes,
        raw_payload: item.payload,
      });
      bump('raw', raw.action);
      const action = await upsertIdentifier(ingest, item.source, raw.row, {
        source_entity_type: 'card',
        external_id: item.externalId,
        external_uri: item.url,
        variant_id: variant.id,
        source_updated_at: manifest.generated_at,
      });
      bump('identifiers', action);
    }
  }
  return counts;
}

async function verify({ catalog, ingest, setRow, sources }) {
  const { data: printings, error: printingError } = await catalog.from('card_printings')
    .select('id,collector_number,native_name,english_display_name,card_concept_id,rarity_id,artist,supertype')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null);
  requireNoError(printingError, 'verify ADV5 printings');
  const printingIds = (printings ?? []).map((row) => row.id);
  const variants = await selectInBatches(
    catalog.from('card_variants'),
    'printing_id',
    printingIds,
    'id,printing_id,canonical_key,native_image_status',
    (query) => query.is('deprecated_at', null),
  );
  const variantIds = variants.map((row) => row.id);

  const sourceIds = [sources.bulbapedia.id, sources.pokecardex.id];
  const identifiers = await selectInBatches(
    ingest.from('external_identifiers'),
    'variant_id',
    variantIds,
    'id,source_id,external_id,variant_id,printing_id',
    (query) => query
      .in('source_id', sourceIds)
      .eq('source_entity_type', 'card')
      .eq('language_code', 'ja')
      .eq('is_current', true)
      .is('deprecated_at', null),
  );
  const numbers = (printings ?? []).map((row) => row.collector_number);
  const variantKeys = variants.map((row) => row.canonical_key);
  return {
    active_printings: printings?.length ?? 0,
    distinct_collector_numbers: new Set(numbers).size,
    duplicate_collector_numbers: numbers.filter((value, index, array) => array.indexOf(value) !== index),
    unresolved_concepts: (printings ?? []).filter((row) => !row.card_concept_id).length,
    missing_native_names: (printings ?? []).filter((row) => !clean(row.native_name)).length,
    missing_english_names: (printings ?? []).filter((row) => !clean(row.english_display_name)).length,
    missing_rarity: (printings ?? []).filter((row) => !row.rarity_id).length,
    missing_artist: (printings ?? []).filter((row) => !clean(row.artist)).length,
    missing_supertype: (printings ?? []).filter((row) => !clean(row.supertype)).length,
    active_variants: variants.length,
    printings_with_variant: new Set(variants.map((row) => row.printing_id)).size,
    duplicate_variant_keys: variantKeys.filter((value, index, array) => array.indexOf(value) !== index),
    bulbapedia_card_identifiers: identifiers.filter((row) => row.source_id === sources.bulbapedia.id).length,
    pokecardex_card_identifiers: identifiers.filter((row) => row.source_id === sources.pokecardex.id).length,
    invalid_dual_identifiers: identifiers.filter((row) => row.variant_id && row.printing_id).length,
  };
}

async function main() {
  const inputPath = path.resolve(option('input'));
  const reportPath = path.resolve(option('report', 'reports/catalogue/japanese-adv5-composite/import-report.json'));
  const target = clean(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const apply = hasFlag('apply');

  requireCondition(inputPath, '--input is required.');
  requireCondition(target === 'staging', 'ADV5 composite import is restricted to staging.');
  requireCondition(apply, '--apply is required.');

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Expected StackR staging SUPABASE_URL.');
  requireCondition(!supabaseUrl.includes(PRODUCTION_PROJECT_REF), 'Production target detected; ADV5 import refused.');
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

  const inputText = readFileSync(inputPath, 'utf8');
  const inputHash = sha256(inputText);
  const manifest = JSON.parse(inputText);
  validateManifest(manifest);

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const catalog = db.schema('catalog');
  const ingest = db.schema('ingest');

  const sources = {
    composite: await ensureSource(ingest, {
      code: COMPOSITE_SOURCE_CODE,
      display_name: 'StackR ADV5 cross-source manifest',
      source_type: 'internal',
      base_url: null,
      terms_url: null,
      attribution_required: false,
      robots_policy: null,
      rate_limit_config: {},
      internal_notes: 'Validated composite of Bulbapedia metadata and PokéCardex Japanese assets.',
    }),
    bulbapedia: await ensureSource(ingest, {
      code: BULBAPEDIA_SOURCE_CODE,
      display_name: 'Bulbapedia',
      source_type: 'catalogue',
      base_url: 'https://bulbapedia.bulbagarden.net',
      terms_url: 'https://bulbapedia.bulbagarden.net/wiki/Bulbapedia:Copyrights',
      attribution_required: true,
      robots_policy: 'bounded checklist and card metadata requests',
      rate_limit_config: { minimum_delay_ms: 700, bounded: true },
      internal_notes: 'Pokémon metadata rights confirmed by the StackR owner; preserve attribution and exact source URL.',
    }),
    pokecardex: await ensureSource(ingest, {
      code: POKECARDEX_SOURCE_CODE,
      display_name: 'PokéCardex',
      source_type: 'catalogue',
      base_url: 'https://www.pokecardex.com',
      terms_url: null,
      attribution_required: true,
      robots_policy: 'browser-rendered catalogue evidence; bounded asset acquisition',
      rate_limit_config: { minimum_delay_ms: 750, bounded: true },
      internal_notes: 'Japanese scan, logo and symbol rights confirmed by the StackR owner; preserve attribution and exact source URL.',
    }),
  };
  const importRun = await ensureImportRun(ingest, sources.composite.id, inputHash, manifest);

  try {
    const { data: sets, error: setLookupError } = await catalog.from('sets')
      .select('*')
      .eq('language_code', 'ja')
      .eq('set_code', 'ADV5')
      .is('deprecated_at', null);
    requireNoError(setLookupError, 'load Japanese ADV5 set');
    requireCondition(sets?.length === 1, 'Expected one active Japanese ADV5 set.');
    const currentSet = sets[0];
    const { data: setRow, error: setUpdateError } = await catalog.from('sets')
      .update({
        provider_set_code: currentSet.provider_set_code ?? 'ADV5',
        native_name: manifest.native_set_name,
        english_display_name: manifest.english_set_name,
        printed_total: 83,
        total: 83,
        release_date: manifest.release_date,
        source_updated_at: manifest.generated_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentSet.id)
      .select('*')
      .single();
    requireNoError(setUpdateError, 'update Japanese ADV5 set');

    const { error: taxonomyError } = await catalog.from('variant_taxonomy').upsert({
      code: VARIANT_CODE,
      english_label: 'Unclassified physical variant',
      variant_group: 'other',
      finish_code: null,
      description: 'Temporary truthful identity while exact finish, edition, stamp or parallel treatment is under review.',
      sort_order: 5,
      active: true,
      source_updated_at: manifest.generated_at,
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'code' });
    requireNoError(taxonomyError, 'ensure ADV5 unclassified variant taxonomy');

    const references = await loadEnglishReferenceSet(catalog, manifest.cards);
    const namesInserted = await ensureNames(catalog, manifest.cards, references.referenceByNumber, manifest.generated_at);
    const printings = await upsertPrintings(catalog, setRow, manifest, references.referenceByNumber);
    const variants = await ensureVariants(catalog, printings, manifest.generated_at);
    const provenance = await persistSources({ ingest, manifest, sources, importRun, setRow, printings, variants });
    const verification = await verify({ catalog, ingest, setRow, sources });

    requireCondition(verification.active_printings === 83, 'ADV5 active printing count is not 83.');
    requireCondition(verification.distinct_collector_numbers === 83, 'ADV5 collector-number coverage is not 83.');
    requireCondition(verification.duplicate_collector_numbers.length === 0, 'ADV5 duplicate collector numbers remain.');
    requireCondition(verification.unresolved_concepts === 0, 'ADV5 unresolved concepts remain.');
    requireCondition(verification.missing_native_names === 0, 'ADV5 native names remain missing.');
    requireCondition(verification.missing_english_names === 0, 'ADV5 English names remain missing.');
    requireCondition(verification.missing_rarity === 0, 'ADV5 rarity remains missing.');
    requireCondition(verification.missing_artist === 0, 'ADV5 artist remains missing.');
    requireCondition(verification.missing_supertype === 0, 'ADV5 supertype remains missing.');
    requireCondition(verification.printings_with_variant === 83, 'ADV5 variant coverage is not 83.');
    requireCondition(verification.duplicate_variant_keys.length === 0, 'ADV5 duplicate variant keys remain.');
    requireCondition(verification.bulbapedia_card_identifiers === 83, 'ADV5 Bulbapedia identifiers are incomplete.');
    requireCondition(verification.pokecardex_card_identifiers === 83, 'ADV5 PokéCardex identifiers are incomplete.');
    requireCondition(verification.invalid_dual_identifiers === 0, 'ADV5 has invalid dual printing/variant identifiers.');

    const result = {
      ok: true,
      target: 'staging',
      production_modified: false,
      canonical_set_code: 'ADV5',
      printed_total: 83,
      full_total: 83,
      input_hash: inputHash,
      import_run_id: importRun.id,
      source_ids: {
        composite: sources.composite.id,
        bulbapedia: sources.bulbapedia.id,
        pokecardex: sources.pokecardex.id,
      },
      writes: {
        japanese_names_inserted: namesInserted,
        printings_inserted: printings.inserted,
        printings_updated: printings.updated,
        variants_inserted: variants.inserted,
        ...provenance,
      },
      verification,
    };

    const { error: completeError } = await ingest.from('import_runs').update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      records_requested: 83,
      records_retrieved: 83,
      records_inserted: printings.inserted,
      records_updated: printings.updated,
      records_skipped: 0,
      records_conflicted: 0,
      error_message: null,
      metadata: { ...importRun.metadata, verification },
      updated_at: new Date().toISOString(),
    }).eq('id', importRun.id);
    requireNoError(completeError, 'complete ADV5 import run');

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
