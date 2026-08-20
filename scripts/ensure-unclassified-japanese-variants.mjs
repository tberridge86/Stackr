import 'dotenv/config';

import { mkdirSync, writeFileSync } from 'node:fs';
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

function chunks(values, size = 100) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message ?? String(error)}`);
}

async function main() {
  const setCode = clean(option('set-code'));
  const target = clean(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const reportPath = path.resolve(option('report', `reports/catalogue/official-japanese-set/${setCode}-variants.json`));
  const apply = hasFlag('apply');

  requireCondition(setCode, '--set-code is required.');
  requireCondition(target === 'staging', 'Variant creation is restricted to staging.');
  requireCondition(apply, '--apply is required.');

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Expected StackR staging SUPABASE_URL.');
  requireCondition(!supabaseUrl.includes(PRODUCTION_PROJECT_REF), 'Production target detected; variant creation refused.');
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const catalog = db.schema('catalog');
  const ingest = db.schema('ingest');

  const { error: taxonomyError } = await catalog.from('variant_taxonomy').upsert({
    code: VARIANT_CODE,
    english_label: 'Unclassified physical variant',
    variant_group: 'other',
    finish_code: null,
    description: 'Temporary truthful identity used while exact finish, edition, stamp or parallel treatment is under review.',
    sort_order: 5,
    active: true,
    source_updated_at: new Date().toISOString(),
    deprecated_at: null,
    deprecated_reason: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'code' });
  requireNoError(taxonomyError, 'ensure unclassified variant taxonomy');

  const { data: sets, error: setError } = await catalog.from('sets')
    .select('id,set_code,total')
    .eq('language_code', 'ja')
    .eq('set_code', setCode)
    .is('deprecated_at', null);
  requireNoError(setError, 'load target set');
  requireCondition(sets?.length === 1, `Expected one active Japanese set ${setCode}.`);
  const setRow = sets[0];

  const { data: printings, error: printingError } = await catalog.from('card_printings')
    .select('id,game_code,set_id,language_code,collector_number')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null)
    .order('collector_number_sort', { ascending: true });
  requireNoError(printingError, 'load target printings');
  requireCondition((printings ?? []).length === setRow.total, 'Printing count does not match set total.');

  const printingIds = (printings ?? []).map((row) => row.id);
  const existingVariants = [];
  for (const batch of chunks(printingIds)) {
    const { data, error } = await catalog.from('card_variants')
      .select('id,printing_id,variant_code')
      .in('printing_id', batch)
      .is('deprecated_at', null);
    requireNoError(error, 'load existing variants');
    existingVariants.push(...(data ?? []));
  }
  const printingIdsWithVariant = new Set(existingVariants.map((row) => row.printing_id));
  const missingPrintings = (printings ?? []).filter((row) => !printingIdsWithVariant.has(row.id));

  let inserted = 0;
  for (const batch of chunks(missingPrintings, 100)) {
    const rows = batch.map((printing) => ({
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
      source_updated_at: new Date().toISOString(),
      native_image_status: 'pending_review',
      deprecated_at: null,
      deprecated_reason: null,
    }));
    const { data, error } = await catalog.from('card_variants').insert(rows).select('id,printing_id');
    requireNoError(error, 'insert unclassified variants');
    inserted += data?.length ?? 0;
  }

  const allVariants = [];
  for (const batch of chunks(printingIds)) {
    const { data, error } = await catalog.from('card_variants')
      .select('id,printing_id,variant_code,native_image_status')
      .in('printing_id', batch)
      .is('deprecated_at', null);
    requireNoError(error, 'reload variants');
    allVariants.push(...(data ?? []));
  }
  const preferredVariantByPrinting = new Map();
  for (const variant of allVariants) {
    const current = preferredVariantByPrinting.get(variant.printing_id);
    if (!current || variant.variant_code === VARIANT_CODE) {
      preferredVariantByPrinting.set(variant.printing_id, variant);
    }
  }
  const variantIds = allVariants.map((row) => row.id);

  const { data: source, error: sourceError } = await ingest.from('sources')
    .select('id')
    .eq('code', SOURCE_CODE)
    .eq('active', true)
    .is('deprecated_at', null)
    .single();
  requireNoError(sourceError, 'load official source');

  const printingLinkedIdentifiers = [];
  for (const batch of chunks(printingIds)) {
    const { data, error } = await ingest.from('external_identifiers')
      .select('id,external_id,printing_id,variant_id')
      .eq('source_id', source.id)
      .eq('source_entity_type', 'card')
      .eq('language_code', 'ja')
      .eq('is_current', true)
      .in('printing_id', batch)
      .is('deprecated_at', null);
    requireNoError(error, 'load printing-linked official identifiers');
    printingLinkedIdentifiers.push(...(data ?? []));
  }

  let identifierLinksUpdated = 0;
  for (const identifier of printingLinkedIdentifiers) {
    const variant = preferredVariantByPrinting.get(identifier.printing_id);
    requireCondition(variant?.id, `No variant exists for printing ${identifier.printing_id}.`);
    const { error } = await ingest.from('external_identifiers')
      .update({
        printing_id: null,
        variant_id: variant.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', identifier.id);
    requireNoError(error, 'move official identifier from printing to variant');
    identifierLinksUpdated += 1;
  }

  const coveredPrintingIds = new Set(allVariants.map((row) => row.printing_id));
  const finalIdentifiers = [];
  for (const batch of chunks(variantIds)) {
    const { data, error } = await ingest.from('external_identifiers')
      .select('id,external_id,printing_id,variant_id')
      .eq('source_id', source.id)
      .eq('source_entity_type', 'card')
      .eq('language_code', 'ja')
      .eq('is_current', true)
      .in('variant_id', batch)
      .is('deprecated_at', null);
    requireNoError(error, 'verify variant-linked official identifiers');
    finalIdentifiers.push(...(data ?? []));
  }

  const report = {
    ok: coveredPrintingIds.size === printingIds.length
      && finalIdentifiers.length >= printingIds.length
      && finalIdentifiers.every((row) => Boolean(row.variant_id) && !row.printing_id),
    target: 'staging',
    production_modified: false,
    set_code: setCode,
    active_printings: printingIds.length,
    active_variants: allVariants.length,
    printings_with_variant: coveredPrintingIds.size,
    official_identifiers: finalIdentifiers.length,
    official_identifiers_linked_to_variant: finalIdentifiers.length,
    writes: {
      unclassified_variants_inserted: inserted,
      identifier_variant_links_updated: identifierLinksUpdated,
    },
    note: 'Unclassified variants are deliberately temporary and do not assert normal, holo, reverse, edition or stamp status.',
  };
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  requireCondition(report.ok, 'Variant coverage verification failed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
