import { CATALOGUE_DERIVATIVE_SPECS, STACKR_ASSET_BUCKETS, buildCatalogueAssetRepairFromStoredOriginal } from './assetPipeline.js';

export const STAGING_SUPABASE_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
export const PRODUCTION_SUPABASE_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
export const STAGING_SUPABASE_URL = `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co`;
export const APPROVED_REPAIR_SOURCE = 'pokemon_card_jp_official';
export const APPROVED_REPAIR_LANGUAGE = 'ja';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PERCEPTUAL_HASH_PATTERN = /^[a-f0-9]{16}$/;
const REQUIRED_DERIVATIVE_ROLES = Object.freeze(CATALOGUE_DERIVATIVE_SPECS.map((spec) => spec.role));
const ASSET_COLUMNS = [
  'id',
  'asset_id',
  'asset_type',
  'source_id',
  'variant_id',
  'storage_provider',
  'storage_bucket',
  'storage_key',
  'rights_status',
  'permission_status',
  'asset_visibility',
  'publicly_servable',
  'retention_status',
  'sha256',
  'content_sha256',
  'perceptual_hash',
  'mime_type',
  'width',
  'height',
  'byte_size',
  'derivative_list',
  'updated_at',
].join(',');

function clean(value) {
  const result = String(value ?? '').trim();
  return result.length > 0 ? result : null;
}

function positiveInteger(value) {
  const result = Number(value);
  return Number.isInteger(result) && result > 0;
}

function derivativeIsReady(derivative, role) {
  return derivative?.role === role
    && derivative?.storageProvider === 'supabase_storage'
    && derivative?.storageBucket === STACKR_ASSET_BUCKETS.publicCatalogue
    && clean(derivative?.storageKey)
    && derivative?.mimeType === 'image/webp'
    && SHA256_PATTERN.test(String(derivative?.contentSha256 ?? ''))
    && positiveInteger(derivative?.width)
    && positiveInteger(derivative?.height)
    && positiveInteger(derivative?.byteSize);
}

export function missingRequiredCatalogueDerivativeRoles(asset) {
  const derivatives = Array.isArray(asset?.derivative_list) ? asset.derivative_list : [];
  return REQUIRED_DERIVATIVE_ROLES.filter(
    (role) => !derivatives.some((derivative) => derivativeIsReady(derivative, role)),
  );
}

export function catalogueAssetRepairReasons(asset) {
  const reasons = [];
  const contentSha256 = String(asset?.content_sha256 ?? '');
  const legacySha256 = String(asset?.sha256 ?? '');
  if (!SHA256_PATTERN.test(contentSha256)) reasons.push('missing_content_sha256');
  if (!SHA256_PATTERN.test(legacySha256)) reasons.push('missing_sha256');
  if (SHA256_PATTERN.test(contentSha256) && SHA256_PATTERN.test(legacySha256) && contentSha256 !== legacySha256) {
    reasons.push('hash_mismatch');
  }
  if (!PERCEPTUAL_HASH_PATTERN.test(String(asset?.perceptual_hash ?? ''))) reasons.push('missing_perceptual_hash');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(String(asset?.mime_type ?? ''))) reasons.push('missing_mime_type');
  if (!positiveInteger(asset?.width)) reasons.push('missing_width');
  if (!positiveInteger(asset?.height)) reasons.push('missing_height');
  if (!positiveInteger(asset?.byte_size)) reasons.push('missing_byte_size');
  for (const role of missingRequiredCatalogueDerivativeRoles(asset)) reasons.push(`missing_derivative:${role}`);
  return reasons;
}

export function mergeCatalogueDerivativeList(existing, generated) {
  const generatedByRole = new Map(generated.map((derivative) => [derivative.role, derivative]));
  const preserved = (Array.isArray(existing) ? existing : []).filter(
    (derivative) => !generatedByRole.has(derivative?.role),
  );
  const replacements = REQUIRED_DERIVATIVE_ROLES
    .map((role) => generatedByRole.get(role))
    .filter(Boolean);
  return [...preserved, ...replacements];
}

export function assertStagingCatalogueAssetRepairTarget(input) {
  const target = clean(input.target)?.toLowerCase();
  const rawUrl = clean(input.supabaseUrl);
  if (target !== 'staging') {
    throw new Error('Stored catalogue asset repair requires explicit --target=staging.');
  }
  if (!rawUrl) throw new Error('Staging Supabase URL is required.');

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Staging Supabase URL is invalid.');
  }
  if (url.hostname === `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` || rawUrl.includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
    throw new Error(`Stored catalogue asset repair refuses production project ${PRODUCTION_SUPABASE_PROJECT_REF}.`);
  }
  if (url.origin !== STAGING_SUPABASE_URL || url.pathname !== '/') {
    throw new Error(`Stored catalogue asset repair is restricted to ${STAGING_SUPABASE_URL}.`);
  }
}

export function assertApprovedCatalogueAssetRepairScope(input) {
  if (clean(input.source) !== APPROVED_REPAIR_SOURCE || clean(input.language) !== APPROVED_REPAIR_LANGUAGE) {
    throw new Error(
      `Stored catalogue asset repair is restricted to audited scope ${APPROVED_REPAIR_SOURCE}/${APPROVED_REPAIR_LANGUAGE}.`,
    );
  }
}

function assertEligibleStoredCatalogueAsset(asset) {
  const checks = [
    [asset?.asset_type === 'card_image', 'asset type must be card_image'],
    [Boolean(clean(asset?.source_id)), 'source association is required'],
    [Boolean(clean(asset?.variant_id)), 'variant association is required'],
    [asset?.storage_provider === 'supabase_storage', 'storage provider must be supabase_storage'],
    [asset?.storage_bucket === STACKR_ASSET_BUCKETS.publicCatalogue, `storage bucket must be ${STACKR_ASSET_BUCKETS.publicCatalogue}`],
    [Boolean(clean(asset?.storage_key)), 'storage key is required'],
    [asset?.rights_status === 'approved', 'rights status must be approved'],
    [asset?.permission_status === 'approved', 'permission status must be approved'],
    [asset?.asset_visibility === 'public_catalogue', 'asset visibility must be public_catalogue'],
    [asset?.publicly_servable === true, 'asset must be publicly servable'],
    [asset?.retention_status === 'active', 'retention status must be active'],
    [Boolean(clean(asset?.updated_at)), 'updated_at is required for optimistic mutation'],
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) throw new Error(`Asset ${asset?.id ?? 'unknown'} is not eligible for repair: ${failed[1]}.`);
}

export function summariseCatalogueAssetRepairBatch(rows, limit) {
  const scanned = Array.isArray(rows) ? rows : [];
  const candidates = scanned
    .map((asset) => ({ ...asset, repairReasons: catalogueAssetRepairReasons(asset) }))
    .filter((asset) => asset.repairReasons.length > 0);
  return {
    scanned,
    candidates,
    cursor: {
      nextAfterId: scanned.length > 0 ? scanned[scanned.length - 1].id : null,
      exhausted: scanned.length < limit,
    },
  };
}

export async function resolveCatalogueAssetRepairSource(supabase, sourceCode) {
  assertApprovedCatalogueAssetRepairScope({ source: sourceCode, language: APPROVED_REPAIR_LANGUAGE });
  const { data, error } = await supabase.schema('ingest').from('sources')
    .select('id,code,source_type,licence_status,active,deprecated_at')
    .eq('code', sourceCode)
    .eq('active', true)
    .is('deprecated_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Active staging source ${sourceCode} is missing.`);
  if (!['catalogue', 'image'].includes(data.source_type) || data.licence_status !== 'approved') {
    throw new Error(`Staging source ${sourceCode} is not an approved catalogue image source.`);
  }
  return data;
}

function scopedEmptyDerivativeQuery(supabase, input, selectOptions = undefined, columns = undefined) {
  let query = supabase.schema('catalog').from('assets')
    .select(
      columns ?? `${ASSET_COLUMNS},language_scope:card_variants!assets_variant_id_fkey!inner(language_code,deprecated_at)`,
      selectOptions,
    )
    .eq('source_id', input.sourceId)
    .eq('asset_type', 'card_image')
    .eq('storage_provider', 'supabase_storage')
    .eq('storage_bucket', STACKR_ASSET_BUCKETS.publicCatalogue)
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved')
    .eq('asset_visibility', 'public_catalogue')
    .eq('publicly_servable', true)
    .eq('retention_status', 'active')
    .eq('language_scope.language_code', input.language)
    .is('language_scope.deprecated_at', null)
    .not('variant_id', 'is', null)
    .not('storage_key', 'is', null)
    .eq('derivative_list', '[]')
    .is('deprecated_at', null)
    .is('deleted_at', null);
  if (clean(input.afterId)) query = query.gt('id', clean(input.afterId));
  return query;
}

export async function listStoredCatalogueAssetRepairBatch(supabase, input = {}) {
  assertApprovedCatalogueAssetRepairScope(input);
  const query = scopedEmptyDerivativeQuery(supabase, input)
    .order('id', { ascending: true })
    .limit(input.limit);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []).map(({ language_scope: _languageScope, ...asset }) => asset);
  return summariseCatalogueAssetRepairBatch(rows, input.limit);
}

export async function countStoredCatalogueAssetRepairCandidates(supabase, input = {}) {
  assertApprovedCatalogueAssetRepairScope(input);
  const { count, error } = await scopedEmptyDerivativeQuery(supabase, input, { count: 'exact', head: true });
  if (!error && Number.isSafeInteger(count) && count >= 0) return count;

  const pageSize = 500;
  const maximumCandidates = 2500;
  let afterId = clean(input.afterId);
  let total = 0;
  while (total <= maximumCandidates) {
    const { data, error: pageError } = await scopedEmptyDerivativeQuery(
      supabase,
      { ...input, afterId },
      undefined,
      'id,language_scope:card_variants!assets_variant_id_fkey!inner(language_code,deprecated_at)',
    )
      .order('id', { ascending: true })
      .limit(pageSize);
    if (pageError) throw pageError;
    const rows = data ?? [];
    total += rows.length;
    if (rows.length < pageSize) return total;
    const nextAfterId = clean(rows.at(-1)?.id);
    if (!nextAfterId || (afterId && nextAfterId <= afterId)) {
      throw new Error('Staging repair count cursor did not advance.');
    }
    afterId = nextAfterId;
  }
  throw new Error(`Staging repair candidate count exceeded the audited ${maximumCandidates}-asset bound.`);
}

export async function repairStoredCatalogueAsset(supabase, storage, asset, input = {}) {
  assertEligibleStoredCatalogueAsset(asset);
  const repairReasons = catalogueAssetRepairReasons(asset);
  if (repairReasons.length === 0) return { id: asset.id, status: 'already_ready', repairReasons };
  if (input.execute !== true) return { id: asset.id, status: 'would_repair', repairReasons };
  if (storage?.id !== 'supabase_storage' || typeof storage.getObject !== 'function') {
    throw new Error('Stored catalogue asset repair requires the Supabase Storage adapter.');
  }

  const derivativeRoles = missingRequiredCatalogueDerivativeRoles(asset);
  const original = await storage.getObject(asset.storage_bucket, asset.storage_key, { maxBytes: input.maxBytes });
  const repaired = await buildCatalogueAssetRepairFromStoredOriginal({
    assetType: asset.asset_type,
    buffer: original,
    mimeType: asset.mime_type,
    permissionStatus: asset.permission_status,
    rightsStatus: asset.rights_status,
    bucket: asset.storage_bucket,
    derivativeRoles,
    maxBytes: input.maxBytes,
    storage,
  });
  const patch = {
    sha256: repaired.sha256,
    content_sha256: repaired.content_sha256,
    perceptual_hash: repaired.perceptual_hash,
    mime_type: repaired.mime_type,
    width: repaired.width,
    height: repaired.height,
    byte_size: repaired.byte_size,
    derivative_list: mergeCatalogueDerivativeList(asset.derivative_list, repaired.derivative_list),
    last_verified_at: repaired.last_verified_at,
  };

  const { data, error } = await supabase.schema('catalog').from('assets')
    .update(patch)
    .eq('id', asset.id)
    .eq('updated_at', asset.updated_at)
    .eq('source_id', asset.source_id)
    .eq('variant_id', asset.variant_id)
    .eq('asset_type', 'card_image')
    .eq('storage_provider', 'supabase_storage')
    .eq('storage_bucket', STACKR_ASSET_BUCKETS.publicCatalogue)
    .eq('storage_key', asset.storage_key)
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved')
    .eq('asset_visibility', 'public_catalogue')
    .eq('publicly_servable', true)
    .eq('retention_status', 'active')
    .eq('derivative_list', '[]')
    .is('deprecated_at', null)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    return { id: asset.id, status: 'stale_skipped', repairReasons, derivativeRoles };
  }
  return {
    id: asset.id,
    status: 'repaired',
    repairReasons,
    derivativeRoles,
    contentSha256: repaired.content_sha256,
  };
}

export { REQUIRED_DERIVATIVE_ROLES };
