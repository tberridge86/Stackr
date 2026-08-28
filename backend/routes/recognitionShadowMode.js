/* eslint-env node */
import express from 'express';
import { hasTrustedStackrAdminClaim } from '../lib/trustedAuthorization.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const ROUTE_VERSION = 'stackr-shadow-mode-pilot-route-v1.0.0';
const SCHEMA_VERSION = 'stackr-shadow-mode-pilot-v1.0.0';

const DISAGREEMENT_CATEGORIES = new Set([
  'pending_manual_review',
  'current_provider_correct_local_wrong',
  'local_correct_current_provider_wrong',
  'both_wrong',
  'both_correct',
  'exact_identity_agreement_variant_disagreement',
  'language_disagreement',
  'catalogue_missing',
  'capture_quality_failure',
  'local_unavailable',
  'visible_unavailable',
]);

let supabaseAdmin = null;

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase service credentials are not configured on the backend.');
  }
  supabaseAdmin = createClient(url, key);
  return supabaseAdmin;
}

function enabledFromEnv(value) {
  return value === 'true' || value === '1';
}

function isShadowModePilotEnabled() {
  return enabledFromEnv(process.env.INTERNAL_LOCAL_RECOGNITION_SHADOW_MODE_ENABLED)
    || enabledFromEnv(process.env.LOCAL_RECOGNITION_SHADOW_MODE_ENABLED)
    || enabledFromEnv(process.env.EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE);
}

function fail(res, status, error, details = undefined) {
  res.status(status).json({
    ok: false,
    routeVersion: ROUTE_VERSION,
    error,
    ...(details ? { details } : {}),
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

async function requireUser(req, res) {
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

  return { supabase, user };
}

async function requireInternalTester(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return null;

  if (!hasTrustedStackrAdminClaim(auth.user)) {
    fail(res, 403, 'Shadow-mode pilot access is limited to internal Stackr testers.');
    return null;
  }

  return auth;
}

function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

function assertNoImageFields(value, path = 'record') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower === 'base64'
      || lower === 'base64image'
      || lower === 'imageuri'
      || lower === 'rectifiedimageuri'
      || lower === 'originaluri'
      || lower === 'rawimageuri'
      || lower === 'rawimagestoragepath'
      || lower === 'photouri'
    ) {
      const error = new Error('Shadow-mode pilot records must not include image payloads or image URIs.');
      error.details = [`${path}.${key}`];
      throw error;
    }
    if (child && typeof child === 'object') {
      assertNoImageFields(child, `${path}.${key}`);
    }
  }
}

function redactOcrSummary(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return {};
  const redacted = {};
  for (const [key, value] of Object.entries(summary)) {
    if (/raw|text|line|block/i.test(key)) continue;
    redacted[key] = value;
  }
  return redacted;
}

function assertRecord(record) {
  const reasons = [];
  if (!record || typeof record !== 'object') reasons.push('record_required');
  if (record?.schemaVersion !== SCHEMA_VERSION) reasons.push('unsupported_schema_version');
  if (!clean(record?.localRecordId)) reasons.push('local_record_id_required');
  if (!clean(record?.anonymousScanId)) reasons.push('anonymous_scan_id_required');
  if (record?.rawImageRecorded !== false) reasons.push('raw_images_are_not_allowed');
  if (!record?.shadowSnapshot || typeof record.shadowSnapshot !== 'object') reasons.push('shadow_snapshot_required');
  if (record?.shadowSnapshot?.rawImageRecorded !== false) reasons.push('shadow_snapshot_raw_images_not_allowed');
  if (!record?.userOutcome || typeof record.userOutcome !== 'object') reasons.push('user_outcome_required');
  if (!DISAGREEMENT_CATEGORIES.has(record?.disagreementCategory)) reasons.push('valid_disagreement_category_required');
  if (reasons.length) {
    const error = new Error('Invalid shadow-mode pilot record.');
    error.details = reasons;
    throw error;
  }
  assertNoImageFields(record);
}

function toDbRecord(record, userId) {
  const visible = record.shadowSnapshot.visible ?? {};
  const local = record.shadowSnapshot.local ?? {};
  const agreement = record.shadowSnapshot.agreement ?? {};
  return {
    created_by: userId,
    local_record_id: String(record.localRecordId),
    schema_version: SCHEMA_VERSION,
    route_version: ROUTE_VERSION,
    anonymous_scan_id: String(record.anonymousScanId),
    visible_engine_result: visible,
    local_engine_result: local,
    top_three_local_candidates: Array.isArray(local.topCandidates)
      ? local.topCandidates.slice(0, 3)
      : [],
    local_confidence: Number.isFinite(Number(local.confidence)) ? Number(local.confidence) : null,
    visible_confidence: Number.isFinite(Number(visible.confidence)) ? Number(visible.confidence) : null,
    timings: {
      visible: visible.timings ?? {},
      local: local.timings ?? {},
    },
    agreement,
    user_confirmed_identity: record.userOutcome.confirmedIdentity ?? null,
    user_feedback_action: clean(record.userOutcome.action),
    disagreement_category: record.disagreementCategory,
    capture_quality_failure_reasons: Array.isArray(record.captureQuality?.failures)
      ? record.captureQuality.failures.map((failure) => String(failure?.code ?? failure)).filter(Boolean)
      : [],
    capture_quality: record.captureQuality ?? {},
    ocr_evidence_summary: redactOcrSummary(record.ocrEvidenceSummary),
    model_version: clean(local.modelVersion),
    catalogue_version: clean(local.catalogueVersion),
    visible_model_version: clean(visible.modelVersion),
    visible_catalogue_version: clean(visible.catalogueVersion),
    device_class: clean(record.deviceClass),
    app_context: record.appContext ?? {},
    raw_image_recorded: false,
    image_upload_consent_active: false,
    review_status: 'pending_review',
    created_at: clean(record.createdAt) ?? new Date().toISOString(),
  };
}

function summarise(rows) {
  const categoryCounts = {};
  for (const row of rows) {
    const key = row.disagreement_category ?? 'pending_manual_review';
    categoryCounts[key] = (categoryCounts[key] ?? 0) + 1;
  }
  return {
    total: rows.length,
    categoryCounts,
    localUnavailable: rows.filter((row) => row.disagreement_category === 'local_unavailable').length,
    pendingReview: rows.filter((row) => row.review_status === 'pending_review').length,
  };
}

router.get('/status', async (req, res) => {
  try {
    const auth = await requireInternalTester(req, res);
    if (!auth) return;

    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      internalLocalRecognitionShadowModeEnabled: isShadowModePilotEnabled(),
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.post('/items', async (req, res) => {
  try {
    const auth = await requireInternalTester(req, res);
    if (!auth) return;
    if (!isShadowModePilotEnabled()) {
      fail(res, 403, 'Shadow-mode pilot recording is disabled on this backend.');
      return;
    }

    const record = req.body?.record;
    assertRecord(record);
    const dbRecord = toDbRecord(record, auth.user.id);
    const { data, error } = await auth.supabase
      .from('recognition_shadow_mode_pilot_items')
      .upsert(dbRecord, { onConflict: 'created_by,local_record_id' })
      .select('id, disagreement_category')
      .single();

    if (error) throw error;

    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      itemId: data.id,
      disagreementCategory: data.disagreement_category,
    });
  } catch (error) {
    fail(res, error.details ? 400 : 500, error.message, error.details);
  }
});

router.get('/disagreements', async (req, res) => {
  try {
    const auth = await requireInternalTester(req, res);
    if (!auth) return;

    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const reviewStatus = clean(req.query.status);
    const category = clean(req.query.category);
    let query = auth.supabase
      .from('recognition_shadow_mode_pilot_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (reviewStatus && reviewStatus !== 'all') query = query.eq('review_status', reviewStatus);
    if (category && category !== 'all') query = query.eq('disagreement_category', category);

    const { data, error } = await query;
    if (error) throw error;

    const items = data ?? [];
    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      items,
      summary: summarise(items),
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.patch('/disagreements/:itemId', async (req, res) => {
  try {
    const auth = await requireInternalTester(req, res);
    if (!auth) return;

    const reviewStatus = clean(req.body?.reviewStatus) ?? 'reviewed';
    const disagreementCategory = clean(req.body?.disagreementCategory);
    if (!['pending_review', 'reviewed', 'ignored'].includes(reviewStatus)) {
      fail(res, 400, 'Invalid review status.');
      return;
    }
    if (disagreementCategory && !DISAGREEMENT_CATEGORIES.has(disagreementCategory)) {
      fail(res, 400, 'Invalid disagreement category.');
      return;
    }

    const patch = {
      review_status: reviewStatus,
      reviewer_notes: clean(req.body?.reviewerNotes),
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
      ...(disagreementCategory ? { disagreement_category: disagreementCategory } : {}),
    };
    const { data, error } = await auth.supabase
      .from('recognition_shadow_mode_pilot_items')
      .update(patch)
      .eq('id', req.params.itemId)
      .select('*')
      .single();

    if (error) throw error;
    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      item: data,
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

export default router;
