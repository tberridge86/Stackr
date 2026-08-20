import 'dotenv/config';

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const SOURCE_CODE = 'pokemon_card_jp_official';

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message ?? String(error)}`);
}

async function main() {
  const canonicalSetCode = clean(option('canonical-set-code'));
  const officialSetCode = clean(option('official-set-code'));
  const target = clean(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const reportPath = path.resolve(option('report', 'reports/catalogue/official-japanese-set/alias-report.json'));

  requireCondition(canonicalSetCode, '--canonical-set-code is required.');
  requireCondition(officialSetCode, '--official-set-code is required.');
  requireCondition(target === 'staging', 'Alias reconciliation is restricted to staging.');

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Expected StackR staging SUPABASE_URL.');
  requireCondition(!supabaseUrl.includes(PRODUCTION_PROJECT_REF), 'Production target detected; alias reconciliation refused.');
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

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
    .select('id,set_code,native_name,total')
    .eq('language_code', 'ja')
    .eq('set_code', canonicalSetCode)
    .is('deprecated_at', null);
  requireNoError(setError, 'load canonical Japanese set');
  requireCondition(sets?.length === 1, `Expected one active Japanese set ${canonicalSetCode}.`);
  const setRow = sets[0];

  const { data: existingOfficial, error: officialLookupError } = await ingest.from('external_identifiers')
    .select('id,set_id,raw_record_id,external_id')
    .eq('source_id', source.id)
    .eq('source_entity_type', 'set')
    .eq('external_id', officialSetCode)
    .eq('language_code', 'ja')
    .eq('is_current', true)
    .is('deprecated_at', null)
    .maybeSingle();
  requireNoError(officialLookupError, 'lookup official set alias');
  if (existingOfficial) {
    requireCondition(existingOfficial.set_id === setRow.id, `Official alias ${officialSetCode} already points to another set.`);
  }

  const { data: canonicalIdentifier, error: canonicalLookupError } = await ingest.from('external_identifiers')
    .select('id,set_id,raw_record_id,external_id')
    .eq('source_id', source.id)
    .eq('source_entity_type', 'set')
    .eq('external_id', canonicalSetCode)
    .eq('language_code', 'ja')
    .eq('is_current', true)
    .is('deprecated_at', null)
    .maybeSingle();
  requireNoError(canonicalLookupError, 'lookup normalized set identifier');

  let identifierUpdated = 0;
  let rawSetUpdated = 0;
  if (!existingOfficial && canonicalIdentifier) {
    const sourceUrl = `https://www.pokemon-card.com/card-search/index.php?mode=statuslist&pg=${encodeURIComponent(officialSetCode)}`;
    if (canonicalIdentifier.raw_record_id) {
      const { data: rawSet, error: rawSetError } = await ingest.from('raw_source_records')
        .select('id,raw_payload')
        .eq('id', canonicalIdentifier.raw_record_id)
        .single();
      requireNoError(rawSetError, 'load official raw set record');
      const rawPayload = {
        ...(rawSet.raw_payload ?? {}),
        id: officialSetCode,
        set_id: officialSetCode,
        provider_set_code: officialSetCode,
        canonical_set_code: canonicalSetCode,
        source_url: sourceUrl,
      };
      const { error } = await ingest.from('raw_source_records')
        .update({
          external_id: officialSetCode,
          provider_record_id: officialSetCode,
          source_url: sourceUrl,
          source_endpoint: `/card-search/index.php?mode=statuslist&pg=${officialSetCode}`,
          raw_payload: rawPayload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rawSet.id);
      requireNoError(error, 'update official raw set alias');
      rawSetUpdated = 1;
    }

    const { error } = await ingest.from('external_identifiers')
      .update({
        external_id: officialSetCode,
        external_uri: sourceUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', canonicalIdentifier.id);
    requireNoError(error, 'update official set identifier alias');
    identifierUpdated = 1;
  }

  const { data: printings, error: printingError } = await catalog.from('card_printings')
    .select('id')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null);
  requireNoError(printingError, 'load canonical printings');
  const printingIds = unique((printings ?? []).map((row) => row.id));

  const cardIdentifiers = [];
  for (const batch of chunks(printingIds)) {
    const { data, error } = await ingest.from('external_identifiers')
      .select('id,raw_record_id,printing_id')
      .eq('source_id', source.id)
      .eq('source_entity_type', 'card')
      .eq('language_code', 'ja')
      .eq('is_current', true)
      .in('printing_id', batch)
      .is('deprecated_at', null);
    requireNoError(error, 'load official card identifiers');
    cardIdentifiers.push(...(data ?? []));
  }

  let rawCardsUpdated = 0;
  for (const batch of chunks(unique(cardIdentifiers.map((row) => row.raw_record_id)))) {
    const { data: rawRows, error: rawRowsError } = await ingest.from('raw_source_records')
      .select('id,raw_payload')
      .in('id', batch)
      .is('deprecated_at', null);
    requireNoError(rawRowsError, 'load official raw card rows');
    for (const rawRow of rawRows ?? []) {
      const { error } = await ingest.from('raw_source_records')
        .update({
          raw_payload: {
            ...(rawRow.raw_payload ?? {}),
            set_id: officialSetCode,
            official_set_code: officialSetCode,
            canonical_set_code: canonicalSetCode,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', rawRow.id);
      requireNoError(error, 'update official raw card alias');
      rawCardsUpdated += 1;
    }
  }

  const report = {
    ok: true,
    target: 'staging',
    production_modified: false,
    canonical_set_code: canonicalSetCode,
    official_set_code: officialSetCode,
    set_id: setRow.id,
    active_printings: printingIds.length,
    official_card_identifiers: cardIdentifiers.length,
    writes: {
      set_identifier_updated: identifierUpdated,
      raw_set_record_updated: rawSetUpdated,
      raw_card_records_updated: rawCardsUpdated,
    },
  };

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));

  requireCondition(report.active_printings === setRow.total, 'Canonical printing count does not match the set total.');
  requireCondition(report.official_card_identifiers === setRow.total, 'Official card identifier count does not match the set total.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
