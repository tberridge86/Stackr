/* eslint-env node */
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  createPrivateScanSignedUpload,
  perceptualHashForImage,
  privateScanStorageKey,
  STACKR_ASSET_BUCKETS,
  validatePrivateScanUpload,
} from '../lib/assetPipeline.js';
import {
  enqueueExistingAssetMigration,
  listPublicAssetManifest,
} from '../lib/assetRepository.js';
import { SupabaseObjectStorageAdapter } from '../lib/objectStorage.js';

export const adminAssetsRouter = express.Router();
const router = express.Router();
const ROUTE_VERSION = 'stackr-asset-repository-v1.0.0';

let supabaseAdmin = null;

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('Supabase service credentials are not configured on the backend.');
  }
  supabaseAdmin = createClient(url, key);
  return supabaseAdmin;
}

function getAuthToken(req) {
  const header = String(req.headers.authorization || '').trim();
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return String(req.headers['x-stackr-admin-key'] || '').trim();
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim();
}

function fail(res, status, error, details = undefined) {
  res.status(status).json({
    ok: false,
    routeVersion: ROUTE_VERSION,
    error,
    ...(details ? { details } : {}),
  });
}

async function requireUser(req, res) {
  const token = bearerToken(req);
  if (!token) {
    fail(res, 401, 'Missing bearer token.');
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user ?? null;
  if (userError || !user) {
    fail(res, 401, 'Invalid bearer token.');
    return null;
  }

  return { supabase, user };
}

function requireAdminAccess(req, res) {
  const expected = String(process.env.STACKR_ADMIN_API_KEY || process.env.ADMIN_API_KEY || '').trim();
  if (!expected) {
    fail(res, 503, 'Admin API key is not configured.');
    return false;
  }

  if (getAuthToken(req) !== expected) {
    fail(res, 401, 'Admin API key required.');
    return false;
  }

  return true;
}

function bodyAndQuery(req) {
  return {
    ...(req.query ?? {}),
    ...(req.body ?? {}),
  };
}

router.get('/manifest', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const storage = new SupabaseObjectStorageAdapter(supabase);
    const assets = await listPublicAssetManifest(supabase, bodyAndQuery(req), storage);
    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      generatedAt: new Date().toISOString(),
      count: assets.length,
      assets,
    });
  } catch (error) {
    fail(res, 500, 'Asset manifest lookup failed.', error instanceof Error ? error.message : String(error));
  }
});

router.post('/scans/presigned-upload', async (req, res) => {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const request = bodyAndQuery(req);
    const storage = new SupabaseObjectStorageAdapter(auth.supabase);
    const upload = await createPrivateScanSignedUpload({
      storage,
      userId: auth.user.id,
      uploadId: request.uploadId,
      mimeType: request.mimeType,
      declaredByteSize: request.byteSize,
      maxBytes: Number(process.env.STACKR_SCAN_UPLOAD_MAX_BYTES || 20 * 1024 * 1024),
      expiresInSeconds: Number(request.expiresInSeconds ?? 600),
    });

    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      upload: {
        provider: upload.provider,
        storageBucket: upload.storageBucket,
        storageKey: upload.storageKey,
        signedUrl: upload.signedUrl,
        token: upload.token ?? null,
        expiresAt: upload.expiresAt,
        mimeType: upload.mimeType,
        maxBytes: upload.maxBytes,
        retentionStatus: upload.retentionStatus,
        retentionUntil: upload.retentionUntil,
      },
    });
  } catch (error) {
    fail(res, Number(error?.status ?? 500), error instanceof Error ? error.message : String(error), error?.details);
  }
});

router.post(
  '/scans/upload',
  express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/octet-stream'],
    limit: '20mb',
  }),
  async (req, res) => {
    try {
      const auth = await requireUser(req, res);
      if (!auth) return;

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        fail(res, 400, 'Scan image body is required.');
        return;
      }

      const validation = validatePrivateScanUpload(
        req.body,
        req.headers['content-type'] || 'application/octet-stream',
        { maxBytes: Number(process.env.STACKR_SCAN_UPLOAD_MAX_BYTES || 20 * 1024 * 1024) },
      );
      if (!validation.ok) {
        fail(res, 400, 'Scan image failed validation.', validation.reasons);
        return;
      }

      const uploadId = String(req.headers['x-stackr-upload-id'] || req.query.uploadId || '').trim() || undefined;
      const storageKey = privateScanStorageKey({
        userId: auth.user.id,
        uploadId,
        mimeType: validation.mimeType,
      });
      const storage = new SupabaseObjectStorageAdapter(auth.supabase);
      await storage.putObject({
        bucket: STACKR_ASSET_BUCKETS.scanTemp,
        key: storageKey,
        body: req.body,
        contentType: validation.mimeType,
        cacheControl: 'private, max-age=0',
        upsert: false,
      });

      const now = new Date().toISOString();
      const retentionUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const perceptualHash = await perceptualHashForImage(req.body);
      const { data, error } = await auth.supabase
        .schema('ml')
        .from('scan_upload_assets')
        .insert({
          asset_type: 'user_scan',
          asset_visibility: 'private_scan_temp',
          created_by: auth.user.id,
          storage_provider: storage.id,
          storage_bucket: STACKR_ASSET_BUCKETS.scanTemp,
          storage_key: storageKey,
          original_source: 'stackr_authenticated_api_upload',
          permission_status: 'temporary_upload',
          content_sha256: validation.sha256,
          perceptual_hash: perceptualHash,
          mime_type: validation.mimeType,
          width: validation.width,
          height: validation.height,
          byte_size: validation.byteSize,
          derivative_list: [],
          last_verified_at: now,
          retention_status: 'temporary',
          retention_until: retentionUntil,
          upload_context: {
            routeVersion: ROUTE_VERSION,
            requestId: String(req.headers['x-request-id'] || '').trim() || null,
            clientUploadId: uploadId ?? null,
          },
        })
        .select('asset_id, storage_bucket, storage_key, retention_status, retention_until')
        .single();

      if (error) throw error;

      res.json({
        ok: true,
        routeVersion: ROUTE_VERSION,
        asset: data,
      });
    } catch (error) {
      fail(res, Number(error?.status ?? 500), error instanceof Error ? error.message : String(error), error?.details);
    }
  },
);

adminAssetsRouter.post('/migrate-existing', async (req, res) => {
  if (!requireAdminAccess(req, res)) return;

  try {
    const result = await enqueueExistingAssetMigration(getSupabaseAdmin(), bodyAndQuery(req));
    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      mode: 'queued',
      ...result,
    });
  } catch (error) {
    fail(res, Number(error?.status ?? 500), error instanceof Error ? error.message : String(error));
  }
});

export default router;
