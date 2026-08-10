import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildApprovedCatalogueAsset } from '../backend/lib/assetPipeline.js';
import { SupabaseObjectStorageAdapter } from '../backend/lib/objectStorage.js';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';
const EXPECTED_MANIFEST_SHA256 = '6bdf058eb49064c1eff9929535f62ca903e1d3194062236f9009fd7666b55afd';

const CAPTURES = [
  {
    collectorNumber: '037',
    cardName: 'Vulpix',
    sourceRelativePath: 'Vulpix_1/20260805T205102839Z_001.jpg',
    sourceSha256: '6718d6f4b0ad314610c9a319504a2411811f06f8766a863af8cbcd393e6658e9',
  },
  {
    collectorNumber: '048',
    cardName: 'Venonat',
    sourceRelativePath: 'venonat_1/20260805T205210221Z_001.jpg',
    sourceSha256: '75da32a9c38616c04582d5ad532aff489c1e84359e33d67eb67c673def95b1eb',
  },
  {
    collectorNumber: '082',
    cardName: 'Magneton',
    sourceRelativePath: 'Magneton_1/20260805T205517169Z_002.jpg',
    sourceSha256: '9a0b0479a250363c88de8fc1652ecf3d1344e70ad3876525f131fd9c2745b3ec',
  },
  {
    collectorNumber: '100',
    cardName: 'Voltorb',
    sourceRelativePath: 'Voltorb_1/20260805T205316481Z_001.jpg',
    sourceSha256: 'ca8d48b8688f49fcad8377a362edc012342aa93130c898c2550e5233e0418e32',
  },
  {
    collectorNumber: '119',
    cardName: 'Seaking',
    sourceRelativePath: 'Seaking_1/20260805T205415948Z_001.jpg',
    sourceSha256: '3f586bb242c1e0733798e1ca68b63fe3b7009bb501b527e99d1b3aafd87fe1a9',
  },
  {
    collectorNumber: '138',
    cardName: 'Omanyte',
    sourceRelativePath: 'Omanyte_1/20260805T205616100Z_002.jpg',
    sourceSha256: '0c94cb2e731b7b72e3348bc957fe1d084e3918afe79f171f9bebdb29b26c3511',
  },
];

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireStagingEnvironment() {
  const url = String(process.env.SUPABASE_URL ?? '').trim();
  const key = String(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url.includes(STAGING_SUPABASE_REF) || url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(`Capture catalogue assets may only be imported into staging ${STAGING_SUPABASE_REF}.`);
  }
  if (!key) throw new Error('A backend-only staging Supabase credential is required.');
  return { url, key };
}

async function readApprovedInputs(manifestPath, assetRoot) {
  const manifestBytes = await readFile(manifestPath);
  const manifestSha256 = sha256(manifestBytes);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifestSha256 !== EXPECTED_MANIFEST_SHA256) throw new Error('The consent manifest checksum is not approved.');
  if (manifest.schemaVersion !== 'stackr-reviewed-capture-evaluation-manifest-v1.1.0') {
    throw new Error('Unsupported capture consent manifest.');
  }
  if (!manifest.productionPublicationApproved
    || !manifest.publicationPolicy?.cataloguePublicationAllowed
    || !manifest.publicationPolicy?.derivativeGenerationAllowed) {
    throw new Error('The capture manifest does not approve public catalogue derivatives.');
  }

  const inputs = [];
  for (const capture of CAPTURES) {
    const evidence = manifest.images.find((image) => (
      image.relativePath === capture.sourceRelativePath
      && image.sha256 === capture.sourceSha256
      && image.setCode === '151c'
      && image.collectorNumber === `${capture.collectorNumber}/151`
      && image.cardName === capture.cardName
      && image.rightsStatus === 'user_consent'
      && image.reviewStatus === 'confirmed'
      && ['reviewed', 'verified'].includes(image.labelVerificationStatus)
    ));
    if (!evidence) throw new Error(`Approved source evidence is missing for 151c ${capture.collectorNumber}.`);
    const filePath = path.join(assetRoot, `151c-${capture.collectorNumber}-normal-owned-capture.jpg`);
    const buffer = await readFile(filePath);
    inputs.push({ ...capture, captureId: evidence.id, filePath, buffer, derivativeSha256: sha256(buffer) });
  }
  return { manifest, manifestSha256, inputs };
}

async function loadCanonicalTargets(supabase) {
  const { data: setRows, error: setError } = await supabase.schema('catalog').from('sets')
    .select('id,set_code,language_code')
    .eq('game_code', 'pokemon')
    .eq('language_code', 'zh-cn')
    .eq('set_code', '151c')
    .is('deprecated_at', null);
  if (setError) throw setError;
  if (setRows.length !== 1) throw new Error(`Expected one canonical zh-cn 151c set, found ${setRows.length}.`);
  const set = setRows[0];

  const { data: printingRows, error: printingError } = await supabase.schema('catalog').from('card_printings')
    .select('id,collector_number,native_name,english_display_name')
    .eq('set_id', set.id)
    .eq('language_code', 'zh-cn')
    .in('collector_number', CAPTURES.map((entry) => entry.collectorNumber))
    .is('deprecated_at', null);
  if (printingError) throw printingError;

  const targets = new Map();
  for (const capture of CAPTURES) {
    const printings = printingRows.filter((row) => row.collector_number === capture.collectorNumber);
    if (printings.length !== 1) {
      throw new Error(`Expected one canonical printing for 151c ${capture.collectorNumber}, found ${printings.length}.`);
    }
    const printing = printings[0];
    const { data: variants, error: variantError } = await supabase.schema('catalog').from('card_variants')
      .select('id,printing_id,variant_code,finish_code')
      .eq('printing_id', printing.id)
      .eq('variant_code', 'normal')
      .eq('finish_code', 'normal')
      .is('deprecated_at', null);
    if (variantError) throw variantError;
    if (variants.length !== 1) {
      throw new Error(`Expected one normal variant for 151c ${capture.collectorNumber}, found ${variants.length}.`);
    }
    targets.set(capture.collectorNumber, { set, printing, variant: variants[0] });
  }
  return targets;
}

async function importAssets(supabase, approved, targets) {
  const storage = new SupabaseObjectStorageAdapter(supabase);
  const { data: source, error: sourceError } = await supabase.schema('ingest').from('sources')
    .select('id,code')
    .eq('code', 'stackr_manual')
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!source?.id) throw new Error('The stackr_manual ingestion source is missing.');

  const results = [];
  for (const input of approved.inputs) {
    const target = targets.get(input.collectorNumber);
    const { data: existing, error: lookupError } = await supabase.schema('catalog').from('assets')
      .select('id')
      .eq('variant_id', target.variant.id)
      .eq('asset_type', 'card_image')
      .eq('original_source_identifier', input.captureId)
      .is('deleted_at', null)
      .is('deprecated_at', null)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const asset = await buildApprovedCatalogueAsset({
      assetId: existing?.id,
      assetType: 'card_image',
      buffer: input.buffer,
      mimeType: 'image/jpeg',
      permissionStatus: 'approved',
      sourceIdentifier: input.captureId,
      sourceAttribution: 'Stackr owner-authorised capture',
      preserveArchivalOriginal: true,
      storage,
    });
    const publicUrl = storage.publicUrl(asset.storage_bucket, asset.storage_key);
    const row = {
      id: asset.asset_id,
      asset_id: asset.asset_id,
      asset_type: asset.asset_type,
      game_code: 'pokemon',
      set_id: target.set.id,
      printing_id: target.printing.id,
      variant_id: target.variant.id,
      source_id: source.id,
      url: publicUrl,
      storage_path: asset.storage_path,
      mime_type: asset.mime_type,
      width: asset.width,
      height: asset.height,
      sha256: asset.sha256,
      rights_status: 'approved',
      publicly_servable: true,
      attribution_text: 'Stackr owner-authorised capture',
      licensing_review_notes: `Public publication approved by consent manifest ${approved.manifestSha256}; excluded from recognition references because the source session participates in evaluation.`,
      source_updated_at: approved.manifest.generatedAt,
      asset_visibility: 'public_catalogue',
      storage_provider: asset.storage_provider,
      storage_bucket: asset.storage_bucket,
      storage_key: asset.storage_key,
      original_source_url: null,
      original_source_identifier: input.captureId,
      source_attribution: 'Stackr owner-authorised capture',
      permission_status: 'approved',
      content_sha256: asset.content_sha256,
      perceptual_hash: asset.perceptual_hash,
      byte_size: asset.byte_size,
      derivative_list: asset.derivative_list,
      cache_control: asset.cache_control,
      archival_storage_key: asset.archival_storage_key,
      externally_referenced: false,
      unavailable_reason: null,
      last_verified_at: asset.last_verified_at,
      retention_status: 'active',
      acquisition_source: 'user_licensed',
      recognition_reference_eligible: false,
    };
    const write = existing?.id
      ? await supabase.schema('catalog').from('assets').update(row).eq('id', existing.id).select('id').maybeSingle()
      : await supabase.schema('catalog').from('assets').insert(row).select('id').maybeSingle();
    if (write.error) throw write.error;
    const { error: variantError } = await supabase.schema('catalog').from('card_variants')
      .update({ native_image_status: 'available' })
      .eq('id', target.variant.id);
    if (variantError) throw variantError;
    results.push({
      collectorNumber: input.collectorNumber,
      captureId: input.captureId,
      derivativeSha256: input.derivativeSha256,
      assetId: write.data.id,
      publicUrl,
      originalSha256: asset.content_sha256,
      derivativeCount: asset.derivative_list.length,
      recognitionReferenceEligible: false,
    });
  }
  return results;
}

async function main() {
  const manifestPath = arg('manifest');
  const assetRoot = arg('assetRoot');
  if (!manifestPath || !assetRoot) {
    throw new Error('Pass --manifest=<approved-manifest.json> and --assetRoot=<reviewed-derivative-directory>.');
  }
  const approved = await readApprovedInputs(manifestPath, assetRoot);
  const summary = {
    ok: true,
    apply: hasFlag('apply'),
    productionModified: false,
    manifestSha256: approved.manifestSha256,
    inputAssets: approved.inputs.length,
    publicationApproved: true,
    recognitionReferenceEligible: false,
  };
  if (!hasFlag('apply')) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const { url, key } = requireStagingEnvironment();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const targets = await loadCanonicalTargets(supabase);
  const assets = await importAssets(supabase, approved, targets);
  const report = { ...summary, assets, completedAt: new Date().toISOString() };
  const reportPath = arg('report');
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), productionModified: false }, null, 2));
  process.exitCode = 1;
});
