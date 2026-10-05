import 'dotenv/config';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createCataloguePriceDatabase } from './catalogue-price-database.mjs';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';

const PUBLIC_TCGDEX_BASE = 'https://api.tcgdex.net/v2';
const LANGUAGES = new Set(['ko', 'zh-cn', 'zh-tw']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 100;
const RUN_METADATA_PURPOSE = 'cardmarket_tcgdex_provenance_only';

const option = (args, name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
const stableJson = value => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const payloadHash = payload => createHash('sha256').update(stableJson(payload)).digest('hex');
const tcgdexSourceUrl = (language, cardId) => `${PUBLIC_TCGDEX_BASE}/${encodeURIComponent(language)}/cards/${encodeURIComponent(cardId)}`;

export function tcgdexCardIdFromExternalId(externalId) {
  const cardId = String(externalId ?? '').split(':', 1)[0]?.trim();
  if (!cardId || !/^[A-Za-z0-9._-]+$/.test(cardId)) throw Error('Invalid TCGdex external card identifier.');
  return cardId;
}

export function validateTcgdexPricePayload(payload, expectedCardId, physical = null) {
  const productId = payload?.pricing?.cardmarket?.idProduct;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.id !== expectedCardId) throw Error('TCGdex card response identity mismatch.');
  if (!Number.isSafeInteger(productId) || productId < 1) throw Error('TCGdex card response has no positive Cardmarket product id.');
  if (physical) {
    if (payload.set?.id !== physical.providerSetCode || payload.localId !== physical.collectorNumber) throw Error('TCGdex card response set or collector number mismatch.');
  }
  return productId;
}

export function buildRawRetentionInput(identity, payload, { retrievedAt = new Date().toISOString(), sourceUrl } = {}) {
  if (!identity || !LANGUAGES.has(identity.language_code) || !UUID.test(identity.source_id ?? '') || !UUID.test(identity.catalogue_version_id ?? '') || !identity.physical) throw Error('Invalid published TCGdex identity.');
  const cardId = tcgdexCardIdFromExternalId(identity.external_id);
  validateTcgdexPricePayload(payload, cardId, identity.physical);
  if (sourceUrl !== tcgdexSourceUrl(identity.language_code, cardId)) throw Error('Invalid TCGdex source URL.');
  return {
    recordType: identity.external_id.includes(':') ? 'variant' : 'card',
    externalId: identity.external_id,
    providerRecordId: identity.external_id,
    languageCode: identity.language_code,
    sourceUrl,
    sourceEndpoint: sourceUrl,
    retrievedAt,
    sourceUpdatedAt: typeof payload.updated === 'string' ? payload.updated : null,
    payloadHash: payloadHash(payload),
    rawPayload: payload,
  };
}

async function rows(query, label) {
  const { data, error } = await query;
  if (error) throw Error(`${label}: ${error.message}`);
  return data ?? [];
}

export async function currentVersion(db, language) {
  const versions = await rows(db.schema('catalog').from('catalogue_versions')
    .select('id,language_code,published_at,created_at')
    .eq('language_code', language).eq('status', 'published').is('deprecated_at', null)
    .order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1), 'read current catalogue version');
  if (versions.length !== 1 || !UUID.test(versions[0].id ?? '') || versions[0].language_code !== language) throw Error(`No current published ${language} catalogue version.`);
  return versions[0];
}

async function tcgdexSource(db) {
  const sources = await rows(db.schema('ingest').from('sources')
    .select('id,code,display_name,base_url,terms_url,licence_status,attribution_required,active,deprecated_at')
    .eq('code', 'tcgdex').limit(2), 'read TCGdex source');
  const source = sources[0];
  if (sources.length !== 1 || !UUID.test(source?.id ?? '') || source.code !== 'tcgdex' || source.active !== true || source.deprecated_at !== null || typeof source.licence_status !== 'string' || !source.licence_status.trim()) throw Error('TCGdex ingest source is not an active, rights-recorded source.');
  return source;
}

function validIdentityCursor(cursor) {
  return cursor === null || (typeof cursor === 'string' && cursor.length > 0 && cursor.length <= 500 && !/[\u0000\r\n]/.test(cursor));
}

export function validatePhysicalIdentityRows({ language, version, identities, memberships, variants, printings, sets, languageRow }) {
  if (!languageRow || languageRow.code !== language || languageRow.active !== true || languageRow.deprecated_at !== null) throw Error('Published TCGdex identity language is not active.');
  const membershipByVariant = new Map(memberships.map(row => [row.variant_id, row]));
  const variantById = new Map(variants.map(row => [row.id, row]));
  const printingById = new Map(printings.map(row => [row.id, row]));
  const setById = new Map(sets.map(row => [row.id, row]));
  return identities.map(identity => {
    if (identity.catalogue_version_id !== version.id || !UUID.test(identity.variant_id ?? '') || identity.source_entity_type !== 'card' || identity.set_id !== null || identity.printing_id !== null) throw Error('Published TCGdex identity is not a card-to-variant identity.');
    const membership = membershipByVariant.get(identity.variant_id);
    const variant = variantById.get(identity.variant_id);
    if (!membership || membership.catalogue_version_id !== version.id || membership.language_code !== language || !variant || variant.deprecated_at !== null || variant.language_code !== language || membership.printing_id !== variant.printing_id) throw Error('Published TCGdex variant membership failed validation.');
    const printing = printingById.get(variant.printing_id);
    if (!printing || printing.deprecated_at !== null || printing.language_code !== language || printing.set_id !== membership.set_id || typeof printing.collector_number !== 'string' || !printing.collector_number) throw Error('Published TCGdex printing membership failed validation.');
    const set = setById.get(printing.set_id);
    const providerSetCode = set?.provider_set_code ?? set?.set_code;
    if (!set || set.deprecated_at !== null || set.language_code !== language || typeof providerSetCode !== 'string' || !providerSetCode) throw Error('Published TCGdex set membership failed validation.');
    return { ...identity, physical: { providerSetCode, collectorNumber: printing.collector_number } };
  });
}

async function validatePhysicalIdentityMembership(db, { language, version, identities }) {
  if (identities.length === 0) return { identities: [], entries: [] };
  const variantIds = identities.map(identity => identity.variant_id);
  const [memberships, variants, languageRows] = await Promise.all([
    rows(db.schema('catalog').from('catalogue_version_variants').select('catalogue_version_id,language_code,set_id,printing_id,variant_id').eq('catalogue_version_id', version.id).in('variant_id', variantIds), 'read current variant memberships'),
    rows(db.schema('catalog').from('card_variants').select('id,printing_id,language_code,deprecated_at').in('id', variantIds), 'read current variants'),
    rows(db.schema('catalog').from('languages').select('code,active,deprecated_at').eq('code', language).limit(2), 'read published language'),
  ]);
  const printingIds = [...new Set(variants.map(variant => variant.printing_id).filter(Boolean))];
  const printings = await rows(db.schema('catalog').from('card_printings').select('id,set_id,language_code,collector_number,deprecated_at').in('id', printingIds), 'read current printings');
  const setIds = [...new Set(printings.map(printing => printing.set_id).filter(Boolean))];
  const sets = await rows(db.schema('catalog').from('sets').select('id,language_code,set_code,provider_set_code,deprecated_at').in('id', setIds), 'read current sets');
  if (languageRows.length !== 1) throw Error('Expected one published language record.');
  const context = { language, version, memberships, variants, printings, sets, languageRow: languageRows[0] };
  validatePhysicalIdentityRows({ ...context, identities: [] });
  const entries = identities.map(identity => {
    if (identity.catalogue_version_id !== version.id || !UUID.test(identity.variant_id ?? '') || identity.source_entity_type !== 'card' || identity.set_id !== null || identity.printing_id !== null) throw Error('Published TCGdex identity is not a card-to-variant identity.');
    const variant = variants.find(row => row.id === identity.variant_id);
    const printing = printings.find(row => row.id === variant?.printing_id);
    const set = sets.find(row => row.id === printing?.set_id);
    // Historical aliases may remain in a publication after their physical rows retire.
    // Advance past explicit retirements, but still fail on missing or conflicting live rows.
    if ([variant, printing, set].some(row => row?.deprecated_at != null)) return { ...identity, skipped: 'deprecated_identity' };
    return validatePhysicalIdentityRows({ ...context, identities: [identity] })[0];
  });
  return { identities: entries.filter(identity => !identity.skipped), entries };
}

export async function listPublishedTcgdexIdentities(db, { language, afterExternalId = null, limit = MAX_PAGE_SIZE, version = null, source = null } = {}) {
  if (!LANGUAGES.has(language) || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE || !validIdentityCursor(afterExternalId)) throw Error('Invalid provenance retention page request.');
  const [current, tcgdex] = await Promise.all([version ? Promise.resolve(version) : currentVersion(db, language), source ? Promise.resolve(source) : tcgdexSource(db)]);
  let query = db.schema('catalog').from('catalogue_version_external_identifiers')
    .select('catalogue_version_id,source_id,source_entity_type,external_id,language_code,set_id,printing_id,variant_id')
    .eq('catalogue_version_id', current.id).eq('source_id', tcgdex.id).eq('language_code', language).eq('source_entity_type', 'card')
    .order('external_id', { ascending: true }).limit(limit);
  if (afterExternalId) query = query.gt('external_id', afterExternalId);
  const rawIdentities = await rows(query, 'read published TCGdex external identities');
  for (const identity of rawIdentities) {
    if (identity.catalogue_version_id !== current.id || identity.source_id !== tcgdex.id || identity.language_code !== language) throw Error('Published TCGdex identity response failed validation.');
    tcgdexCardIdFromExternalId(identity.external_id);
  }
  const physical = await validatePhysicalIdentityMembership(db, { language, version: current, identities: rawIdentities });
  return { version: current, source: tcgdex, ...physical, nextAfterExternalId: rawIdentities.length === limit ? rawIdentities.at(-1).external_id : null };
}

async function fetchTcgdexCard(language, externalId, fetchImpl = fetch) {
  const cardId = tcgdexCardIdFromExternalId(externalId);
  const sourceUrl = tcgdexSourceUrl(language, cardId);
  const response = await fetchImpl(sourceUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) });
  const payload = await response.json().catch(() => null);
  if (response.status === 404) return { skipped: 'not_found', sourceUrl };
  if (!response.ok) throw Error(`TCGdex card request failed (${response.status}).`);
  if (!payload || typeof payload !== 'object' || !Number.isSafeInteger(payload?.pricing?.cardmarket?.idProduct) || payload.pricing.cardmarket.idProduct < 1) return { skipped: 'no_cardmarket_product', sourceUrl };
  return { payload, sourceUrl };
}

function runContext({ version, language }) {
  return { purpose: RUN_METADATA_PURPOSE, canonicalWrites: false, catalogueVersionId: version.id, language, intendedCohort: { sourceCode: 'tcgdex', sourceEntityType: 'card', recordScope: 'variant_identifiers', cursorPolicy: 'durable_checkpoint_only' }, checkpoint: null };
}

function checkpointFromMetadata(metadata, { version, language }) {
  const checkpoint = metadata?.checkpoint;
  if (checkpoint === null || checkpoint === undefined) return null;
  if (!validIdentityCursor(checkpoint.externalId)
    || checkpoint.catalogueVersionId !== version.id
    || checkpoint.languageCode !== language
    || checkpoint.sourceEntityType !== metadata?.intendedCohort?.sourceEntityType) {
    throw Error('Raw-retention run checkpoint is not bound to the current cohort.');
  }
  return checkpoint.externalId;
}

async function createOrResumeRawImportRun(db, sourceId, runKey, apply, context) {
  if (!apply) return { id: null, dryRun: true, metadata: runContext(context) };
  const prior = await rows(db.schema('ingest').from('import_runs').select('id,status,metadata,records_requested,records_retrieved,records_inserted,records_updated,records_skipped').eq('source_id', sourceId).eq('run_key', runKey).limit(2), 'read raw-retention import run');
  if (prior.length > 1) throw Error('Raw-retention import run key is not unique.');
  if (prior.length === 1) {
    const existing = prior[0];
    if (existing.status === 'completed') throw Error('Raw-retention import run is already completed; use a new run key.');
    if (existing.metadata?.purpose !== RUN_METADATA_PURPOSE || existing.metadata?.catalogueVersionId !== context.version.id || existing.metadata?.language !== context.language || existing.metadata?.intendedCohort?.sourceCode !== 'tcgdex' || existing.metadata?.intendedCohort?.sourceEntityType !== 'card' || existing.metadata?.intendedCohort?.recordScope !== 'variant_identifiers' || existing.metadata?.intendedCohort?.cursorPolicy !== 'durable_checkpoint_only') throw Error('Raw-retention run key belongs to a different current catalogue revision or cohort.');
    await rows(db.schema('ingest').from('import_runs').update({ status: 'running', finished_at: null, error_message: null }).eq('id', existing.id), 'resume raw-retention import run');
    return existing;
  }
  const inserted = await rows(db.schema('ingest').from('import_runs').insert({
    source_id: sourceId, run_key: runKey, import_type: 'repair', status: 'running', started_at: new Date().toISOString(),
    records_requested: 0, records_retrieved: 0, records_inserted: 0, records_updated: 0, records_skipped: 0,
    metadata: runContext(context),
  }).select('id,status,metadata').limit(2), 'create raw-retention import run');
  if (inserted.length !== 1 || !UUID.test(inserted[0].id ?? '')) throw Error('Raw-retention import run creation failed.');
  return inserted[0];
}

async function updateRunProgress(db, runId, metadata, counts, identity, { complete = false, error = null } = {}) {
  const nextMetadata = { ...metadata, checkpoint: identity ? { catalogueVersionId: identity.catalogue_version_id, sourceEntityType: identity.source_entity_type, externalId: identity.external_id, languageCode: identity.language_code } : metadata.checkpoint ?? null, retentionAccounting: { reused: counts.reused, providerSkipped: counts.providerSkipped, identitySkipped: counts.identitySkipped } };
  const update = {
    metadata: nextMetadata, records_requested: counts.requested, records_retrieved: counts.retrieved,
    records_inserted: counts.inserted, records_updated: counts.updated, records_skipped: counts.skipped,
    status: complete ? 'completed' : error ? 'failed' : 'running', finished_at: complete || error ? new Date().toISOString() : null, error_message: error,
  };
  await rows(db.schema('ingest').from('import_runs').update(update).eq('id', runId), 'update raw-retention import run');
  return nextMetadata;
}

async function retainRaw(db, source, importRunId, input) {
  const { data, error } = await db.schema('ingest').rpc('retain_raw_source_record', {
    p_source_id: source.id, p_import_run_id: importRunId, p_record_type: input.recordType,
    p_external_id: input.externalId, p_provider_record_id: input.providerRecordId,
    p_language_code: input.languageCode, p_source_url: input.sourceUrl,
    p_source_endpoint: input.sourceEndpoint, p_retrieved_at: input.retrievedAt,
    p_source_updated_at: input.sourceUpdatedAt, p_licence_status: source.licence_status,
    p_attribution_text: source.attribution_required ? source.display_name : null, p_payload_hash: input.payloadHash,
    p_raw_payload: input.rawPayload,
    p_http_metadata: { sourceCode: source.code, sourceBaseUrl: source.base_url ?? null, sourceTermsUrl: source.terms_url ?? null, sourceLicenceStatus: source.licence_status, sourceAttributionRequired: source.attribution_required === true, retentionScope: 'cardmarket_provenance_only' },
    p_validation_status: 'valid', p_validation_errors: [],
  });
  if (error || !UUID.test(data?.id ?? '') || !['inserted', 'updated', 'reused'].includes(data?.changed)) throw Error(`retain raw TCGdex record: ${error?.message ?? 'invalid RPC response'}`);
  return data.changed;
}

export async function retainCardmarketTcgdexProvenance({ db, language, afterExternalId = null, limit = MAX_PAGE_SIZE, apply = false, runKey = null, fetchImpl = fetch } = {}) {
  if (!db) throw Error('A service database client is required.');
  if (apply && (!runKey || !/^[a-z0-9:_-]{12,200}$/i.test(runKey))) throw Error('Apply requires a stable raw-retention run key.');
  if (apply && afterExternalId !== null) throw Error('Apply may only begin at the durable import-run checkpoint.');
  const [version, source] = await Promise.all([currentVersion(db, language), tcgdexSource(db)]);
  const importRun = await createOrResumeRawImportRun(db, source.id, runKey, apply, { version, language });
  const priorSkipped = importRun.records_skipped ?? 0;
  const priorReused = importRun.metadata?.retentionAccounting?.reused ?? 0;
  const priorIdentitySkipped = importRun.metadata?.retentionAccounting?.identitySkipped ?? 0;
  const priorProviderSkipped = importRun.metadata?.retentionAccounting?.providerSkipped ?? Math.max(0, priorSkipped - priorReused - priorIdentitySkipped);
  if (![priorReused, priorProviderSkipped, priorIdentitySkipped].every(value => Number.isSafeInteger(value) && value >= 0) || priorReused + priorProviderSkipped + priorIdentitySkipped !== priorSkipped) throw Error('Raw-retention import-run accounting is invalid.');
  const counts = { requested: importRun.records_requested ?? 0, retrieved: importRun.records_retrieved ?? 0, inserted: importRun.records_inserted ?? 0, updated: importRun.records_updated ?? 0, skipped: priorSkipped, reused: priorReused, providerSkipped: priorProviderSkipped, identitySkipped: priorIdentitySkipped };
  let metadata = importRun.metadata;
  try {
    const effectiveAfterExternalId = apply ? checkpointFromMetadata(importRun.metadata, { version, language }) : afterExternalId;
    const page = await listPublishedTcgdexIdentities(db, { language, afterExternalId: effectiveAfterExternalId, limit, version, source });
    const summary = { language, catalogueVersionId: page.version.id, sourceId: page.source.id, runId: importRun.id, scanned: page.entries.length, retained: 0, skipped: 0, identitySkipped: 0, inserted: 0, updated: 0, reused: 0, nextAfterExternalId: page.nextAfterExternalId };
    for (const identity of page.entries) {
      counts.requested += 1;
      const fetched = identity.skipped ? { skipped: identity.skipped } : await fetchTcgdexCard(language, identity.external_id, fetchImpl);
      if (identity.skipped) {
        summary.skipped += 1; summary.identitySkipped += 1; counts.skipped += 1; counts.identitySkipped += 1;
      } else if (fetched.skipped) {
        summary.skipped += 1; counts.skipped += 1; counts.providerSkipped += 1;
      } else {
        const input = buildRawRetentionInput(identity, fetched.payload, { sourceUrl: fetched.sourceUrl });
        counts.retrieved += 1;
        if (!apply) summary.retained += 1;
        else {
          const changed = await retainRaw(db, source, importRun.id, input);
          summary.retained += 1; summary[changed] += 1;
          if (changed === 'reused') counts.skipped += 1;
          counts[changed] += 1;
        }
      }
      if (apply) metadata = await updateRunProgress(db, importRun.id, metadata, counts, identity);
    }
    if (apply) await updateRunProgress(db, importRun.id, metadata, counts, page.entries.at(-1) ?? null, { complete: page.nextAfterExternalId === null });
    return summary;
  } catch (error) {
    if (apply) await updateRunProgress(db, importRun.id, metadata, counts, null, { error: error.message }).catch(() => {});
    throw error;
  }
}
export async function mainRetainCardmarketTcgdexProvenance(args = process.argv.slice(2)) {
  const language = option(args, '--language');
  const afterExternalId = option(args, '--after');
  const limit = Number(option(args, '--limit') ?? 25);
  const apply = args.includes('--apply');
  const runKey = option(args, '--run-key');
  if (apply && process.env.STACKR_CARDMARKET_RAW_RETENTION_ENABLED !== 'true') throw Error('Cardmarket raw-retention writes are disabled.');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw Error('Missing server database credential.');
  const target = resolvePricingV2SupabaseTarget();
  const db = createCataloguePriceDatabase(target.url, key);
  const result = await retainCardmarketTcgdexProvenance({ db, language, afterExternalId, limit, apply, runKey });
  console.log(JSON.stringify({ project: target.projectRef, apply, ...result }));
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  mainRetainCardmarketTcgdexProvenance().catch(error => { console.error(error.message); process.exitCode = 1; });
}
