import { buildCanonicalPriceEstimatePlan } from './estimateBuilder.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = 'market-pricing-v1.0.0';
const MAX_OBSERVATIONS = 200;

async function rows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`Canonical pricing ${label} failed: ${error.message}`);
  return data ?? [];
}

function rawEvidenceMatches(observation, raw, source) {
  return Boolean(raw && source
    && source.code === observation.provider_code
    && ['pricing', 'manual'].includes(source.source_type)
    && source.active === true && source.licence_status === 'approved' && !source.deprecated_at
    && raw.record_type === 'price' && raw.licence_status === 'approved'
    && raw.validation_status === 'valid' && !raw.deprecated_at
    && String(raw.payload_hash ?? '').toLowerCase() === String(observation.evidence_sha256 ?? '').toLowerCase()
    && (raw.provider_record_id ?? raw.external_id) === observation.source_item_id
    && raw.source_url === observation.source_url);
}

/** Publish one exact raw-card scope from retained evidence, never legacy quotes.
 * The RPC rechecks provenance and scope transactionally before accepting a plan.
 * Read-only by default; production callers must explicitly opt into writing.
 */
export async function publishCanonicalPriceEstimate(supabase, {
  variantId,
  condition = 'raw_near_mint',
  currency = 'GBP',
  now = new Date().toISOString(),
  dryRun = true,
} = {}) {
  if (!UUID.test(variantId ?? '')) throw new Error('Canonical publishing requires an exact variant UUID.');
  if (!/^raw_(mint|near_mint|lightly_played|moderately_played|heavily_played|damaged)$/.test(condition)) {
    throw new Error('Canonical publishing requires an explicit supported raw condition.');
  }
  if (currency !== 'GBP') throw new Error('Canonical publishing currently supports GBP evidence only; no implicit FX conversion.');
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('Canonical publishing requires a valid observation time.');
  const market = (name) => supabase.schema('market').from(name);
  const observed = await rows(market('sold_observations')
    .select('id,market_identity_id,variant_id,sealed_product_variant_id,provider_code,source_item_id,sold_price,shipping_price,currency_code,condition_code,grader_code,grade_id,observed_at,sold_at,parsed_match_confidence,source_url,raw_title,raw_record_id,evidence_sha256,sale_verification_state,final_price_confirmed,canonical_match_verified,transaction_status,provenance_version')
    .eq('variant_id', variantId).eq('condition_code', condition).eq('currency_code', currency)
    .is('sealed_product_variant_id', null).is('grader_code', null).is('grade_id', null)
    .in('sale_verification_state', ['provider_observed', 'confirmed'])
    .eq('transaction_status', 'completed').eq('final_price_confirmed', true).eq('canonical_match_verified', true)
    .gte('parsed_match_confidence', 0.85)
    .gte('sold_at', new Date(nowMs - 180 * 86_400_000).toISOString()).lte('sold_at', now)
    .order('sold_at', { ascending: false }).order('id', { ascending: false })
    .limit(MAX_OBSERVATIONS + 1), 'observation read');
  if (observed.length > MAX_OBSERVATIONS) throw new Error('Canonical pricing scope exceeds the reviewed 200-observation bound; no partial estimate was published.');
  if (!observed.length) return { status: 'no_qualified_evidence', dryRun, writtenCount: 0, observations: 0 };
  if (observed.some((row) => row.variant_id !== variantId || row.condition_code !== condition
    || row.currency_code !== currency || row.grader_code || row.grade_id || row.sealed_product_variant_id)) {
    throw new Error('Canonical pricing read returned evidence outside the requested exact scope.');
  }

  const rawIds = [...new Set(observed.map((row) => row.raw_record_id).filter(Boolean))];
  const providerCodes = [...new Set(observed.map((row) => row.provider_code))];
  const [providers, rawRecords, versions] = await Promise.all([
    rows(market('source_providers')
      .select('code,provider_kind,active,supports_sold_observations,data_licence_status,automated_refresh_allowed,deprecated_at')
      .in('code', providerCodes), 'provider authorisation read'),
    rawIds.length ? rows(supabase.schema('ingest').from('raw_source_records')
      .select('id,source_id,record_type,external_id,provider_record_id,source_url,licence_status,payload_hash,validation_status,deprecated_at')
      .in('id', rawIds), 'raw provenance read') : [],
    rows(market('price_estimate_versions').select('id,version_key,status')
      .eq('version_key', VERSION).eq('status', 'active').limit(2), 'active version read'),
  ]);
  if (versions.length !== 1 || !UUID.test(versions[0].id)) throw new Error('Canonical publishing requires exactly one active reviewed estimate version.');
  const sourceIds = [...new Set(rawRecords.map((row) => row.source_id))];
  const sources = sourceIds.length ? await rows(supabase.schema('ingest').from('sources')
    .select('id,code,source_type,active,licence_status,deprecated_at').in('id', sourceIds), 'evidence source read') : [];
  const authorised = new Set(providers.filter((provider) => provider.active === true && !provider.deprecated_at
    && provider.supports_sold_observations === true && provider.data_licence_status === 'approved'
    && (provider.provider_kind === 'manual_import' || provider.automated_refresh_allowed === true)).map((row) => row.code));
  const rawById = new Map(rawRecords.map((row) => [row.id, row]));
  const sourceById = new Map(sources.map((row) => [row.id, row]));
  const observations = observed.map((row) => {
    const raw = rawById.get(row.raw_record_id);
    return {
      ...row,
      provider_authorised: authorised.has(row.provider_code),
      raw_evidence_verified: rawEvidenceMatches(row, raw, sourceById.get(raw?.source_id)),
    };
  });
  const plan = buildCanonicalPriceEstimatePlan({ observations, estimateVersionId: versions[0].id, now });
  if (plan.estimates.length > 1) throw new Error('Canonical publishing resolved more than one identity for the requested exact scope.');
  if (!plan.estimates.length) return { status: 'insufficient_exact_sold_evidence', dryRun, writtenCount: 0, summary: plan.summary };
  if (dryRun) return { status: 'ready', dryRun: true, writtenCount: 0, plan };

  const { data, error } = await supabase.schema('api').rpc('apply_canonical_price_estimate_batch', {
    p_estimate_version_id: versions[0].id,
    p_rows: plan.estimates,
  });
  if (error) throw new Error(`Canonical estimate publication failed: ${error.message}`);
  if (data?.status !== 'applied' || data.estimateVersionId !== versions[0].id
    || Number(data.requestedCount) !== plan.estimates.length || Number(data.writtenCount) !== plan.estimates.length
    || Number(data.includedSoldDecisionCount) !== plan.summary.totalSoldObservationsUsed) {
    throw new Error('Canonical estimate publication returned an incomplete acknowledgement; refresh remains retryable.');
  }
  // Return the acknowledged plan to the worker, not to the public client. Its
  // snapshot must use exactly the same item-price basis as the canonical API.
  return { status: 'applied', dryRun: false, writtenCount: data.writtenCount, summary: plan.summary, estimate: plan.estimates[0] };
}
