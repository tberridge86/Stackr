import { randomUUID } from 'node:crypto';

const READY_DERIVATIVE_ROLES = new Set(['card-grid', 'search-result', 'detail-page']);

function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

function limit(input, fallback = 250, max = 1000) {
  return Math.max(1, Math.min(Number(input?.limit ?? fallback), max));
}

function hasRequiredDerivatives(asset) {
  const derivatives = Array.isArray(asset?.derivative_list) ? asset.derivative_list : [];
  const roles = new Set(derivatives.map((item) => item?.role).filter(Boolean));
  return [...READY_DERIVATIVE_ROLES].every((role) => roles.has(role));
}

function assetProcessingAction(asset) {
  const permissionStatus = clean(asset.permission_status) ?? clean(asset.rights_status) ?? 'unknown';
  const rightsStatus = clean(asset.rights_status) ?? permissionStatus;
  if (permissionStatus !== 'approved' || rightsStatus !== 'approved') {
    return {
      action: 'metadata_only',
      reason: 'mirroring_not_authorised',
    };
  }

  if (!clean(asset.url) && !clean(asset.storage_path) && !clean(asset.storage_key)) {
    return {
      action: 'unavailable',
      reason: 'no_source_or_storage_path',
    };
  }

  if (clean(asset.storage_key) && clean(asset.content_sha256) && hasRequiredDerivatives(asset)) {
    return {
      action: 'already_ready',
      reason: 'content_addressed_derivatives_present',
    };
  }

  return {
    action: 'queue_asset_processing',
    reason: 'approved_asset_needs_content_hash_or_derivatives',
  };
}

function queueKey(asset) {
  return [
    'asset_processing',
    'migrate_existing',
    clean(asset.id) ?? clean(asset.asset_id) ?? 'unknown-asset',
    clean(asset.updated_at) ?? clean(asset.url) ?? clean(asset.storage_path) ?? 'unknown-version',
  ].join(':').toLowerCase();
}

async function enqueueWorkItem(supabase, asset, input = {}) {
  const idempotencyKey = clean(input.idempotencyKey) ?? queueKey(asset);
  const requestId = clean(input.requestId) ?? randomUUID();
  const row = {
    queue_name: 'asset_processing',
    source_id: asset.source_id ?? null,
    command: 'process_asset',
    idempotency_key: idempotencyKey,
    priority: Number(input.priority ?? 55),
    run_after: clean(input.runAfter) ?? new Date().toISOString(),
    status: 'pending',
    request_id: requestId,
    payload: {
      action: 'migrate_existing_asset',
      assetId: asset.id,
      assetPublicId: asset.asset_id ?? null,
      assetType: asset.asset_type,
      sourceUrl: asset.url ?? null,
      sourceStoragePath: asset.storage_path ?? null,
      storageBucket: asset.storage_bucket ?? null,
      storageKey: asset.storage_key ?? null,
      rightsStatus: asset.rights_status ?? null,
      permissionStatus: asset.permission_status ?? null,
      dryRun: input.dryRun === true,
    },
  };

  const { data: existing, error: lookupError } = await supabase
    .schema('ingest')
    .from('work_queue')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error } = await supabase
      .schema('ingest')
      .from('work_queue')
      .update(row)
      .eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, status: 'updated', idempotencyKey, requestId };
  }

  const { data, error } = await supabase
    .schema('ingest')
    .from('work_queue')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return { id: data?.id ?? null, status: 'inserted', idempotencyKey, requestId };
}

export async function listPublicAssetManifest(supabase, input = {}, storage = null) {
  let query = supabase
    .schema('api')
    .from('asset_manifest')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit(input, 250, 1000));

  if (clean(input.assetType)) query = query.eq('asset_type', clean(input.assetType));
  if (clean(input.setId)) query = query.eq('set_id', clean(input.setId));
  if (clean(input.printingId)) query = query.eq('printing_id', clean(input.printingId));
  if (clean(input.variantId)) query = query.eq('variant_id', clean(input.variantId));
  if (clean(input.since)) query = query.gte('updated_at', clean(input.since));

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((asset) => {
    const publicUrl = storage && asset.storage_bucket && asset.storage_key
      ? storage.publicUrl(asset.storage_bucket, asset.storage_key)
      : null;
    const derivatives = Array.isArray(asset.derivative_list) ? asset.derivative_list : [];
    return {
      ...asset,
      delivery_url: publicUrl ?? asset.external_url ?? null,
      derivative_list: derivatives.map((derivative) => ({
        ...derivative,
        deliveryUrl: storage && derivative.storageBucket && derivative.storageKey
          ? storage.publicUrl(derivative.storageBucket, derivative.storageKey)
          : null,
      })),
    };
  });
}

export async function enqueueExistingAssetMigration(supabase, input = {}) {
  let query = supabase
    .schema('catalog')
    .from('assets')
    .select('id, asset_id, asset_type, source_id, url, storage_path, storage_bucket, storage_key, rights_status, permission_status, content_sha256, derivative_list, updated_at')
    .is('deprecated_at', null)
    .order('updated_at', { ascending: false })
    .limit(limit(input, 100, 1000));

  if (clean(input.assetType)) query = query.eq('asset_type', clean(input.assetType));
  if (clean(input.setId)) query = query.eq('set_id', clean(input.setId));
  if (clean(input.printingId)) query = query.eq('printing_id', clean(input.printingId));
  if (clean(input.variantId)) query = query.eq('variant_id', clean(input.variantId));

  const { data, error } = await query;
  if (error) throw error;

  const queued = [];
  const skipped = [];
  for (const asset of data ?? []) {
    const decision = assetProcessingAction(asset);
    if (decision.action !== 'queue_asset_processing' || input.dryRun === true) {
      skipped.push({
        assetId: asset.id,
        assetType: asset.asset_type,
        action: decision.action,
        reason: decision.reason,
      });
      continue;
    }

    const result = await enqueueWorkItem(supabase, asset, input);
    queued.push({
      assetId: asset.id,
      assetType: asset.asset_type,
      reason: decision.reason,
      ...result,
    });
  }

  return {
    inspected: data?.length ?? 0,
    queuedCount: queued.length,
    skippedCount: skipped.length,
    queued,
    skipped,
  };
}

export function classifyExistingAssetForMigration(asset) {
  return assetProcessingAction(asset);
}
