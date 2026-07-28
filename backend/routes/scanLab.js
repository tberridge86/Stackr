/* eslint-env node */
import { createHash } from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { validatePrivateScanUpload } from '../lib/assetPipeline.js';

const router = express.Router();
const STORAGE_BUCKET = process.env.SCAN_LAB_STORAGE_BUCKET || 'scan-lab-training';
const ROUTE_VERSION = 'stackr-scan-lab-upload-v1.0.0';
const UPLOADS_ENABLED =
  process.env.STACKR_SCAN_LAB_UPLOADS_ENABLED === 'true' ||
  process.env.NODE_ENV !== 'production';
const REVIEW_STATUSES = new Set(['confirmed', 'corrected', 'unresolved', 'wrong_variant', 'poor_capture']);
const IMAGE_CONTENT_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
]);

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

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

function fail(res, status, error, details = undefined) {
  res.status(status).json({
    ok: false,
    routeVersion: ROUTE_VERSION,
    error,
    ...(details ? { details } : {}),
  });
}

async function requireScanLabAdmin(req, res) {
  if (!UPLOADS_ENABLED) {
    fail(res, 403, 'Scan Lab uploads are disabled on this backend.');
    return null;
  }

  const token = getBearerToken(req);
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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    fail(res, 403, 'Scan Lab uploads are limited to admin testers.');
    return null;
  }

  return { supabase, user, profile };
}

function normaliseIdentity(identity = {}) {
  const clean = (value) => {
    const trimmed = String(value ?? '').trim();
    return trimmed.length ? trimmed : null;
  };

  return {
    stackrCardId: clean(identity.stackrCardId),
    cardName: clean(identity.cardName),
    setId: clean(identity.setId),
    language: clean(identity.language)?.toLowerCase() ?? null,
    variant: clean(identity.variant),
  };
}

export function assertScanLabCaptureMetadata(capture) {
  const reasons = [];
  if (!capture || typeof capture !== 'object') reasons.push('capture_payload_required');
  if (capture?.consentToUploadImages !== true) reasons.push('image_upload_consent_required');
  if (!String(capture?.localId ?? '').trim()) reasons.push('local_id_required');
  if (!String(capture?.physicalCardSessionId ?? '').trim()) reasons.push('physical_card_session_required');
  if (!REVIEW_STATUSES.has(capture?.reviewStatus)) {
    reasons.push('supported_review_decision_required');
  }
  if (!Number.isFinite(Number(capture?.originalPhotoWidth)) || Number(capture?.originalPhotoWidth) <= 0 ||
    !Number.isFinite(Number(capture?.originalPhotoHeight)) || Number(capture?.originalPhotoHeight) <= 0) {
    reasons.push('original_dimensions_required');
  }
  if (!Number.isFinite(Number(capture?.rectifiedCardWidth)) || Number(capture?.rectifiedCardWidth) <= 0 ||
    !Number.isFinite(Number(capture?.rectifiedCardHeight)) || Number(capture?.rectifiedCardHeight) <= 0) {
    reasons.push('rectified_dimensions_required');
  }
  if (!capture?.captureQuality || typeof capture.captureQuality !== 'object') {
    reasons.push('capture_quality_required');
  }
  if (reasons.length) {
    const error = new Error('Invalid Scan Lab capture metadata.');
    error.details = reasons;
    throw error;
  }
}

function toDbCapture(capture, userId) {
  return {
    created_by: userId,
    local_capture_id: String(capture.localId),
    schema_version: capture.schemaVersion,
    route_version: capture.routeVersion ?? ROUTE_VERSION,
    physical_card_session_id: String(capture.physicalCardSessionId),
    captured_at: capture.capturedAt ?? new Date().toISOString(),
    original_photo_width: capture.originalPhotoWidth ?? null,
    original_photo_height: capture.originalPhotoHeight ?? null,
    original_photo_orientation: capture.originalPhotoOrientation ?? null,
    rectified_card_width: capture.rectifiedCardWidth ?? null,
    rectified_card_height: capture.rectifiedCardHeight ?? null,
    expected_identity: normaliseIdentity(capture.expectedIdentity),
    user_confirmed_identity: capture.userConfirmedIdentity
      ? normaliseIdentity(capture.userConfirmedIdentity)
      : null,
    review_status: capture.reviewStatus,
    capture_quality: capture.captureQuality ?? {},
    ocr_evidence: capture.ocrEvidence ?? {},
    rectification: capture.rectification ?? {},
    device_info: capture.device ?? {},
    lighting_category: capture.lightingCategory ?? 'unknown',
    sleeve_state: capture.sleeveState ?? 'unknown',
    holder_state: capture.holderState ?? 'unknown',
    card_side: capture.cardSide ?? 'front',
    image_upload_consent: true,
    image_upload_status: 'metadata_received',
  };
}

function contentExtension(contentType) {
  return IMAGE_CONTENT_TYPES.get(contentType) ?? 'jpg';
}

export function normaliseScanLabImageContentType(contentType) {
  const normalised = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  return IMAGE_CONTENT_TYPES.has(normalised) ? normalised : null;
}

function fileColumn(role) {
  if (role === 'original-photo') {
    return {
      path: 'original_photo_storage_path',
      checksum: 'original_photo_checksum_sha256',
    };
  }
  if (role === 'rectified-card') {
    return {
      path: 'rectified_card_storage_path',
      checksum: 'rectified_card_checksum_sha256',
    };
  }
  return null;
}

router.post('/captures', async (req, res) => {
  try {
    const auth = await requireScanLabAdmin(req, res);
    if (!auth) return;

    const capture = req.body?.capture;
    assertScanLabCaptureMetadata(capture);

    const dbCapture = toDbCapture(capture, auth.user.id);
    const { data, error } = await auth.supabase
      .from('scan_lab_captures')
      .upsert(dbCapture, { onConflict: 'created_by,local_capture_id' })
      .select('id')
      .single();

    if (error) throw error;

    await auth.supabase.from('scan_lab_capture_events').insert({
      capture_id: data.id,
      created_by: auth.user.id,
      event_type: 'metadata_received',
      event_context: {
        routeVersion: ROUTE_VERSION,
        reviewStatus: capture.reviewStatus,
        physicalCardSessionId: capture.physicalCardSessionId,
      },
    });

    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      captureId: data.id,
    });
  } catch (error) {
    fail(res, error.details ? 400 : 500, error.message, error.details);
  }
});

router.put(
  '/captures/:captureId/files/:role',
  express.raw({
    type: [...IMAGE_CONTENT_TYPES.keys()],
    limit: '40mb',
  }),
  async (req, res) => {
    try {
      const auth = await requireScanLabAdmin(req, res);
      if (!auth) return;

      const role = req.params.role;
      const columns = fileColumn(role);
      if (!columns) {
        fail(res, 400, 'Unsupported Scan Lab file role.');
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        fail(res, 400, 'Image body is required.');
        return;
      }

      const { data: capture, error: captureError } = await auth.supabase
        .from('scan_lab_captures')
        .select('id, created_by, original_photo_storage_path, rectified_card_storage_path')
        .eq('id', req.params.captureId)
        .eq('created_by', auth.user.id)
        .is('deleted_at', null)
        .single();

      if (captureError || !capture) {
        fail(res, 404, 'Scan Lab capture was not found for this tester.');
        return;
      }

      const contentType = normaliseScanLabImageContentType(req.headers['content-type']);
      if (!contentType) {
        fail(res, 415, 'Scan Lab file uploads must use an approved image content type.');
        return;
      }
      const validation = validatePrivateScanUpload(req.body, contentType, { maxBytes: 40 * 1024 * 1024 });
      if (!validation.ok) {
        fail(res, 400, 'Scan Lab image failed validation.', validation.reasons);
        return;
      }
      const extension = contentExtension(contentType);
      const userSegment = createHash('sha256').update(auth.user.id).digest('hex').slice(0, 24);
      const storagePath = `private/u/${userSegment}/${capture.id}/${role}.${extension}`;
      const checksum = validation.sha256;

      const { error: uploadError } = await auth.supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, req.body, {
          contentType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const nextOriginalPath = role === 'original-photo'
        ? storagePath
        : capture.original_photo_storage_path;
      const nextRectifiedPath = role === 'rectified-card'
        ? storagePath
        : capture.rectified_card_storage_path;
      const update = {
        [columns.path]: storagePath,
        [columns.checksum]: checksum,
        image_upload_status: nextOriginalPath && nextRectifiedPath ? 'uploaded' : 'metadata_received',
        uploaded_at: new Date().toISOString(),
      };

      const { error: updateError } = await auth.supabase
        .from('scan_lab_captures')
        .update(update)
        .eq('id', capture.id)
        .eq('created_by', auth.user.id);

      if (updateError) throw updateError;

      await auth.supabase.from('scan_lab_capture_events').insert({
        capture_id: capture.id,
        created_by: auth.user.id,
        event_type: `${role}_uploaded`,
        event_context: {
          routeVersion: ROUTE_VERSION,
          checksumSha256: checksum,
          storagePath,
          byteLength: req.body.length,
          mimeType: contentType,
          width: validation.width,
          height: validation.height,
        },
      });

      res.json({
        ok: true,
        routeVersion: ROUTE_VERSION,
        captureId: capture.id,
        storagePath,
        checksumSha256: checksum,
      });
    } catch (error) {
      fail(res, 500, error.message);
    }
  }
);

router.delete('/captures/:captureId', async (req, res) => {
  try {
    const auth = await requireScanLabAdmin(req, res);
    if (!auth) return;

    const { data: capture, error: captureError } = await auth.supabase
      .from('scan_lab_captures')
      .select('id, created_by, original_photo_storage_path, rectified_card_storage_path')
      .eq('id', req.params.captureId)
      .eq('created_by', auth.user.id)
      .single();

    if (captureError || !capture) {
      fail(res, 404, 'Scan Lab capture was not found for this tester.');
      return;
    }

    const paths = [
      capture.original_photo_storage_path,
      capture.rectified_card_storage_path,
    ].filter(Boolean);
    if (paths.length) {
      await auth.supabase.storage.from(STORAGE_BUCKET).remove(paths);
    }

    const deletedAt = new Date().toISOString();
    const { error: updateError } = await auth.supabase
      .from('scan_lab_captures')
      .update({
        image_upload_status: 'deleted',
        review_status: 'deleted',
        deleted_at: deletedAt,
      })
      .eq('id', capture.id)
      .eq('created_by', auth.user.id);

    if (updateError) throw updateError;

    await auth.supabase.from('scan_lab_capture_events').insert({
      capture_id: capture.id,
      created_by: auth.user.id,
      event_type: 'deleted',
      event_context: {
        routeVersion: ROUTE_VERSION,
        deletedAt,
      },
    });

    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      captureId: capture.id,
      deletedAt,
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

export default router;
