#!/usr/bin/env node
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const LANGUAGE = 'ja';
const STORED_PROVIDERS = new Set(['supabase_storage', 's3_compatible', 'local_dev']);
const REQUIRED_DERIVATIVE_ROLES = ['card-grid', 'search-result', 'detail-page'];

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer from ${min} to ${max}, received ${value}.`);
  }
  return parsed;
}

function requireStaging() {
  const target = String(arg('target') || process.env.STACKR_CATALOGUE_IMPORT_TARGET || '').trim().toLowerCase();
  const url = String(process.env.SUPABASE_URL || '');
  let origin = '';
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/' && !parsed.search && !parsed.hash && !parsed.username && !parsed.password) {
      origin = parsed.origin;
    }
  } catch {
    // The canonical-origin check below handles malformed URLs.
  }
  if (target !== 'staging' || origin !== `https://${STAGING_SUPABASE_REF}.supabase.co`) {
    throw new Error(`Japanese image completion is restricted to staging project ${STAGING_SUPABASE_REF}.`);
  }
}

function adminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Staging Supabase backend credentials are required.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch(input, init = {}) {
        return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });
      },
    },
  });
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function percentage(count, total) {
  return total === 0 ? 0 : Number(((count / total) * 100).toFixed(2));
}

function derivativeRoleCounts(asset) {
  const roles = (Array.isArray(asset?.derivative_list) ? asset.derivative_list : [])
    .filter((item) => {
      const key = String(
        item?.storageKey
        ?? item?.storage_key
        ?? item?.deliveryPath
        ?? item?.delivery_path
        ?? item?.path
        ?? '',
      ).trim();
      return key && !key.split('/').some((part) => !part || part === '.' || part === '..');
    })
    .map((item) => String(item?.role || '').trim())
    .filter(Boolean);
  const counts = new Map();
  for (const role of roles) counts.set(role, (counts.get(role) ?? 0) + 1);
  return counts;
}

function safeStorageKey(value) {
  const key = String(value ?? '').trim();
  return Boolean(key) && !key.split('/').some((part) => !part || part === '.' || part === '..');
}

export function assetState(asset) {
  const approved = asset?.rights_status === 'approved'
    && asset?.permission_status === 'approved'
    && asset?.publicly_servable === true;
  const stored = approved
    && STORED_PROVIDERS.has(asset?.storage_provider)
    && Boolean(asset?.storage_bucket)
    && safeStorageKey(asset?.storage_key);
  const roles = derivativeRoleCounts(asset);
  return {
    ref: approved && Boolean(asset?.url || asset?.original_source_url),
    stored,
    ready: stored && REQUIRED_DERIVATIVE_ROLES.every((role) => roles.get(role) === 1),
  };
}

function mergeState(current, next) {
  return {
    ref: Boolean(current?.ref || next?.ref),
    stored: Boolean(current?.stored || next?.stored),
    ready: Boolean(current?.ready || next?.ready),
  };
}

async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await buildQuery().range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const output = new Array(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(values.length, 1)) }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      output[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function japaneseVariants(supabase) {
  return fetchAll(() => supabase.schema('catalog').from('card_variants')
    .select('id,printing_id,variant_code,finish_code,is_default,artwork_key,native_image_status,same_artwork_as_variant_id')
    .eq('language_code', LANGUAGE)
    .is('deprecated_at', null)
    .order('id', { ascending: true }));
}

async function japaneseVariantAssets(supabase) {
  return fetchAll(() => supabase.schema('catalog').from('assets')
    .select([
      'id',
      'asset_id',
      'asset_type',
      'variant_id',
      'printing_id',
      'source_id',
      'url',
      'original_source_url',
      'original_source_identifier',
      'source_attribution',
      'storage_provider',
      'storage_bucket',
      'storage_key',
      'mime_type',
      'rights_status',
      'permission_status',
      'publicly_servable',
      'derivative_list',
      'language_scope:card_variants!assets_variant_id_fkey!inner(language_code)',
    ].join(','))
    .eq('asset_type', 'card_image')
    .eq('asset_visibility', 'public_catalogue')
    .eq('retention_status', 'active')
    .eq('language_scope.language_code', LANGUAGE)
    .is('deprecated_at', null)
    .is('deleted_at', null)
    .order('id', { ascending: true }));
}

async function japanesePrintingAssets(supabase) {
  return fetchAll(() => supabase.schema('catalog').from('assets')
    .select([
      'id',
      'asset_id',
      'asset_type',
      'variant_id',
      'printing_id',
      'source_id',
      'url',
      'original_source_url',
      'original_source_identifier',
      'source_attribution',
      'storage_provider',
      'storage_bucket',
      'storage_key',
      'mime_type',
      'rights_status',
      'permission_status',
      'publicly_servable',
      'derivative_list',
      'language_scope:card_printings!assets_printing_id_fkey!inner(language_code)',
    ].join(','))
    .eq('asset_type', 'card_image')
    .eq('asset_visibility', 'public_catalogue')
    .eq('retention_status', 'active')
    .is('variant_id', null)
    .eq('language_scope.language_code', LANGUAGE)
    .is('deprecated_at', null)
    .is('deleted_at', null)
    .order('id', { ascending: true }));
}

function primaryScore(variant) {
  return (variant.is_default ? 100 : 0)
    + (variant.variant_code === 'normal' ? 50 : 0)
    + (variant.finish_code === 'normal' ? 25 : 0);
}

const FINISH_ONLY_VARIANT_CODES = new Set(['normal', 'holo', 'reverse_holo']);

export function canUseSamePrintingFinishFallback(source, target) {
  if (!source || !target || source.printing_id !== target.printing_id || source.id === target.id) return false;
  if (source.artwork_key && target.artwork_key) return source.artwork_key === target.artwork_key;
  return FINISH_ONLY_VARIANT_CODES.has(String(source.variant_code ?? ''))
    && FINISH_ONLY_VARIANT_CODES.has(String(target.variant_code ?? ''))
    && String(source.finish_code ?? source.variant_code ?? '') === String(source.variant_code ?? '')
    && String(target.finish_code ?? target.variant_code ?? '') === String(target.variant_code ?? '');
}

export function buildJapaneseAliasPlan(variants, readyVariantIds, readyPrintingIds = new Set()) {
  const byPrinting = new Map();
  for (const variant of variants) {
    const values = byPrinting.get(variant.printing_id) ?? [];
    values.push(variant);
    byPrinting.set(variant.printing_id, values);
  }

  const aliasUpdates = new Map();
  const availableVariantIds = [];
  const unresolvedPrintingIds = [];
  const artworkConflictVariantIds = [];
  for (const [printingId, siblings] of byPrinting) {
    const directReady = siblings
      .filter((variant) => readyVariantIds.has(variant.id))
      .sort((left, right) => primaryScore(right) - primaryScore(left) || left.id.localeCompare(right.id));
    if (readyPrintingIds.has(printingId)) {
      for (const variant of siblings) availableVariantIds.push(variant.id);
      continue;
    }
    const primary = directReady[0];
    if (!primary) {
      unresolvedPrintingIds.push(printingId);
      continue;
    }
    availableVariantIds.push(primary.id);
    for (const variant of siblings) {
      if (readyVariantIds.has(variant.id)) {
        availableVariantIds.push(variant.id);
        continue;
      }
      if (!canUseSamePrintingFinishFallback(primary, variant)) {
        artworkConflictVariantIds.push(variant.id);
        continue;
      }
      const values = aliasUpdates.get(primary.id) ?? [];
      values.push(variant.id);
      aliasUpdates.set(primary.id, values);
    }
  }
  return {
    aliasUpdates,
    availableVariantIds: [...new Set(availableVariantIds)],
    unresolvedPrintingIds,
    artworkConflictVariantIds,
  };
}

async function repairDerivative(asset, supabase, storage, buildApprovedCatalogueAsset, dryRun) {
  if (asset.storage_provider !== 'supabase_storage' || !asset.storage_bucket || !asset.storage_key) {
    return { id: asset.id, status: 'unsupported_storage_provider', provider: asset.storage_provider };
  }
  if (dryRun) return { id: asset.id, status: 'would_repair' };
  const { data, error } = await supabase.storage.from(asset.storage_bucket).download(asset.storage_key);
  if (error) throw error;
  const buffer = Buffer.from(await data.arrayBuffer());
  const rebuilt = await buildApprovedCatalogueAsset({
    assetId: asset.asset_id || asset.id,
    assetType: asset.asset_type,
    buffer,
    mimeType: asset.mime_type || data.type,
    permissionStatus: 'approved',
    sourceUrl: asset.original_source_url || asset.url,
    sourceIdentifier: asset.original_source_identifier || asset.asset_id || asset.id,
    sourceAttribution: asset.source_attribution || 'StackR catalogue',
    preserveArchivalOriginal: true,
    storage,
  });
  const publicUrl = storage.publicUrl(rebuilt.storage_bucket, rebuilt.storage_key);
  const { error: updateError } = await supabase.schema('catalog').from('assets').update({
    url: publicUrl,
    storage_provider: rebuilt.storage_provider,
    storage_bucket: rebuilt.storage_bucket,
    storage_key: rebuilt.storage_key,
    storage_path: rebuilt.storage_path,
    sha256: rebuilt.sha256,
    content_sha256: rebuilt.content_sha256,
    perceptual_hash: rebuilt.perceptual_hash,
    mime_type: rebuilt.mime_type,
    width: rebuilt.width,
    height: rebuilt.height,
    byte_size: rebuilt.byte_size,
    derivative_list: rebuilt.derivative_list,
    cache_control: rebuilt.cache_control,
    archival_storage_key: rebuilt.archival_storage_key,
    last_verified_at: rebuilt.last_verified_at,
    retention_status: 'active',
  }).eq('id', asset.id);
  if (updateError) throw updateError;
  return { id: asset.id, status: 'repaired' };
}

async function repairJapaneseDerivatives(supabase, options) {
  const [{ buildApprovedCatalogueAsset }, { SupabaseObjectStorageAdapter }] = await Promise.all([
    import('../backend/lib/assetPipeline.js'),
    import('../backend/lib/objectStorage.js'),
  ]);
  const storage = new SupabaseObjectStorageAdapter(supabase);
  const assets = [...await japaneseVariantAssets(supabase), ...await japanesePrintingAssets(supabase)];
  const candidates = assets
    .filter((asset) => {
      const state = assetState(asset);
      return state.stored && !state.ready;
    })
    .slice(0, options.limit);
  const results = await mapWithConcurrency(candidates, options.concurrency, async (asset) => {
    try {
      return await repairDerivative(asset, supabase, storage, buildApprovedCatalogueAsset, options.dryRun);
    } catch (error) {
      return { id: asset.id, status: 'failed', error: errorMessage(error) };
    }
  });
  return {
    inspected: candidates.length,
    repaired: results.filter((result) => result.status === 'repaired').length,
    wouldRepair: results.filter((result) => result.status === 'would_repair').length,
    unsupported: results.filter((result) => result.status === 'unsupported_storage_provider').length,
    failed: results.filter((result) => result.status === 'failed').length,
    results,
  };
}

async function updateChunked(supabase, ids, patch, dryRun) {
  if (dryRun || ids.length === 0) return;
  for (let start = 0; start < ids.length; start += 200) {
    const { error } = await supabase.schema('catalog').from('card_variants')
      .update(patch)
      .in('id', ids.slice(start, start + 200));
    if (error) throw error;
  }
}

async function completeAliases(supabase, options) {
  const variants = await japaneseVariants(supabase);
  const variantAssets = await japaneseVariantAssets(supabase);
  const printingAssets = await japanesePrintingAssets(supabase);
  const readyVariantIds = new Set(variantAssets.filter((asset) => assetState(asset).ready).map((asset) => asset.variant_id));
  const readyPrintingIds = new Set(printingAssets.filter((asset) => assetState(asset).ready).map((asset) => asset.printing_id));
  const plan = buildJapaneseAliasPlan(variants, readyVariantIds, readyPrintingIds);

  await updateChunked(supabase, plan.availableVariantIds, {
    native_image_status: 'available',
    same_artwork_as_variant_id: null,
  }, options.dryRun);
  for (const [primaryVariantId, targetVariantIds] of plan.aliasUpdates) {
    await updateChunked(supabase, targetVariantIds, {
      native_image_status: 'same_artwork_reference',
      same_artwork_as_variant_id: primaryVariantId,
    }, options.dryRun);
  }
  return {
    variants: variants.length,
    directReady: readyVariantIds.size,
    printingReady: readyPrintingIds.size,
    aliasesApplied: [...plan.aliasUpdates.values()].reduce((sum, ids) => sum + ids.length, 0),
    unresolvedPrintings: plan.unresolvedPrintingIds.length,
    unresolvedPrintingIds: plan.unresolvedPrintingIds,
    artworkConflicts: plan.artworkConflictVariantIds.length,
    artworkConflictVariantIds: plan.artworkConflictVariantIds,
  };
}

function reportCoverage(variants, variantAssets, printingAssets) {
  const directByVariant = new Map();
  for (const asset of variantAssets) {
    directByVariant.set(asset.variant_id, mergeState(directByVariant.get(asset.variant_id), assetState(asset)));
  }
  const byPrinting = new Map();
  for (const asset of printingAssets) {
    byPrinting.set(asset.printing_id, mergeState(byPrinting.get(asset.printing_id), assetState(asset)));
  }
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  let directRefs = 0;
  let directStored = 0;
  let directReady = 0;
  let effectiveRefs = 0;
  let effectiveStored = 0;
  let effectiveReady = 0;
  let aliases = 0;
  for (const variant of variants) {
    const direct = directByVariant.get(variant.id) ?? { ref: false, stored: false, ready: false };
    const printing = byPrinting.get(variant.printing_id) ?? { ref: false, stored: false, ready: false };
    const aliasVariant = variant.same_artwork_as_variant_id
      ? variantById.get(variant.same_artwork_as_variant_id)
      : null;
    const alias = aliasVariant && canUseSamePrintingFinishFallback(aliasVariant, variant)
      ? directByVariant.get(aliasVariant.id) ?? { ref: false, stored: false, ready: false }
      : { ref: false, stored: false, ready: false };
    if (variant.same_artwork_as_variant_id && aliasVariant && canUseSamePrintingFinishFallback(aliasVariant, variant)) aliases += 1;
    directRefs += Number(direct.ref);
    directStored += Number(direct.stored);
    directReady += Number(direct.ready);
    effectiveRefs += Number(direct.ref || printing.ref || alias.ref);
    effectiveStored += Number(direct.stored || printing.stored || alias.stored);
    effectiveReady += Number(direct.ready || printing.ready || alias.ready);
  }
  const total = variants.length;
  return {
    variants: total,
    directRefs,
    directRefPercent: percentage(directRefs, total),
    directStored,
    directStoredPercent: percentage(directStored, total),
    directReady,
    directAppReadyPercent: percentage(directReady, total),
    aliases,
    effectiveRefs,
    effectiveRefPercent: percentage(effectiveRefs, total),
    effectiveStored,
    effectiveStoredPercent: percentage(effectiveStored, total),
    effectiveReady,
    effectiveAppReadyPercent: percentage(effectiveReady, total),
  };
}

async function currentCoverage(supabase) {
  return reportCoverage(
    await japaneseVariants(supabase),
    await japaneseVariantAssets(supabase),
    await japanesePrintingAssets(supabase),
  );
}

async function main() {
  requireStaging();
  const dryRun = hasFlag('dry-run') || hasFlag('dryRun');
  const reportPath = arg('report');
  const repairLimit = boundedInteger(arg('repairLimit', '50000'), 50000, 1, 50000);
  const repairConcurrency = boundedInteger(arg('repairConcurrency', '2'), 2, 1, 4);
  const supabase = adminSupabase();

  const before = await currentCoverage(supabase);
  const derivativeRepair = await repairJapaneseDerivatives(supabase, {
    dryRun,
    limit: repairLimit,
    concurrency: repairConcurrency,
  });
  const aliases = await completeAliases(supabase, { dryRun });
  const after = dryRun ? before : await currentCoverage(supabase);
  const failed = derivativeRepair.failed;
  const conflicts = aliases.unresolvedPrintings + aliases.artworkConflicts;
  const result = {
    schemaVersion: 1,
    ok: failed === 0 && conflicts === 0 && after.effectiveAppReadyPercent === 100,
    language: LANGUAGE,
    dryRun,
    stagingProject: STAGING_SUPABASE_REF,
    productionModified: false,
    before,
    derivativeRepair,
    aliases,
    after,
    variantCount: after.variants,
    directAppReadyCount: after.directReady,
    effectiveAppReadyCount: after.effectiveReady,
    aliasesCreated: aliases.aliasesApplied,
    derivativesRepaired: derivativeRepair.repaired,
    directAppReadyPercent: after.directAppReadyPercent,
    effectiveAppReadyPercent: after.effectiveAppReadyPercent,
    failed,
    conflicts,
  };
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: errorMessage(error), productionModified: false }, null, 2));
    process.exitCode = 1;
  });
}
