/* eslint-env node */
import { createHash } from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { validatePrivateScanUpload } from '../lib/assetPipeline.js';

const router = express.Router();
const STORAGE_BUCKET = process.env.RECOGNITION_FEEDBACK_STORAGE_BUCKET || 'recognition-feedback';
const ROUTE_VERSION = 'stackr-recognition-feedback-upload-v1.0.0';
const SCHEMA_VERSION = 'stackr-recognition-feedback-v1.0.0';

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

async function requireReviewer(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return null;

  const { data: profile, error: profileError } = await auth.supabase
    .from('profiles')
    .select('id, role')
    .eq('id', auth.user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    fail(res, 403, 'Recognition feedback review is limited to internal reviewers.');
    return null;
  }

  return { ...auth, profile };
}

function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

function normaliseIdentity(identity = {}) {
  return {
    stackrCardId: clean(identity.stackrCardId),
    cardName: clean(identity.cardName),
    setId: clean(identity.setId),
    collectorNumber: clean(identity.collectorNumber),
    language: clean(identity.language)?.toLowerCase() ?? null,
    variant: clean(identity.variant),
  };
}

function assertFeedbackMetadata(feedback) {
  const reasons = [];
  if (!feedback || typeof feedback !== 'object') reasons.push('feedback_payload_required');
  if (feedback?.schemaVersion !== SCHEMA_VERSION) reasons.push('unsupported_schema_version');
  if (!clean(feedback?.localId)) reasons.push('local_feedback_id_required');
  if (!clean(feedback?.anonymousScanId)) reasons.push('anonymous_scan_id_required');
  if (!clean(feedback?.action)) reasons.push('feedback_action_required');
  if (!feedback?.consentState || typeof feedback.consentState !== 'object') reasons.push('consent_state_required');
  if (feedback?.consentState?.imageUploadConsent !== true) reasons.push('image_upload_consent_required_for_backend_upload');
  if (feedback?.consentState?.imageUploadWithdrawnAt) reasons.push('image_upload_consent_withdrawn');
  if (reasons.length) {
    const error = new Error('Invalid recognition feedback metadata.');
    error.details = reasons;
    throw error;
  }
}

function toDbFeedback(feedback, userId) {
  return {
    created_by: userId,
    local_feedback_id: String(feedback.localId),
    schema_version: feedback.schemaVersion,
    route_version: ROUTE_VERSION,
    anonymous_scan_id: String(feedback.anonymousScanId),
    feedback_action: feedback.action,
    predicted_identity: feedback.predictedIdentity ? normaliseIdentity(feedback.predictedIdentity) : null,
    corrected_identity: feedback.correctedIdentity ? normaliseIdentity(feedback.correctedIdentity) : null,
    corrected_variant: clean(feedback.correctedVariant),
    missing_card_description: clean(feedback.missingCardDescription),
    top_candidate_scores: Array.isArray(feedback.topCandidateScores) ? feedback.topCandidateScores.slice(0, 10) : [],
    capture_quality: feedback.captureQuality ?? {},
    ocr_evidence_summary: feedback.ocrEvidenceSummary ?? {},
    model_version: clean(feedback.modelVersion),
    catalogue_version: clean(feedback.catalogueVersion),
    device_class: clean(feedback.deviceClass),
    consent_state: feedback.consentState ?? {},
    user_label_status: 'queued_for_review',
    review_status: 'queued',
    physical_card_session_id: clean(feedback.physicalCardSessionId),
    rectified_image_width: feedback.rectifiedImageWidth ?? null,
    rectified_image_height: feedback.rectifiedImageHeight ?? null,
    image_upload_status: 'metadata_received',
    created_at: feedback.createdAt ?? new Date().toISOString(),
  };
}

function contentExtension(contentType) {
  if (/png/i.test(contentType)) return 'png';
  if (/webp/i.test(contentType)) return 'webp';
  if (/heic|heif/i.test(contentType)) return 'heic';
  return 'jpg';
}

function reviewPatch(decision, reviewerId) {
  const now = new Date().toISOString();
  const notes = clean(decision.reviewerNotes);
  const physicalCardSessionId = clean(decision.physicalCardSessionId);

  if (decision.decision === 'approve_identity') {
    return {
      review_status: 'approved_identity',
      user_label_status: 'reviewed',
      reviewed_identity: decision.reviewedIdentity ? normaliseIdentity(decision.reviewedIdentity) : null,
      reviewer_notes: notes,
      reviewed_by: reviewerId,
      reviewed_at: now,
      ...(physicalCardSessionId ? { physical_card_session_id: physicalCardSessionId } : {}),
    };
  }

  if (decision.decision === 'change_identity') {
    return {
      review_status: 'changed_identity',
      user_label_status: 'reviewed',
      reviewed_identity: normaliseIdentity(decision.reviewedIdentity ?? {}),
      reviewer_notes: notes,
      reviewed_by: reviewerId,
      reviewed_at: now,
      ...(physicalCardSessionId ? { physical_card_session_id: physicalCardSessionId } : {}),
    };
  }

  if (decision.decision === 'mark_ambiguous') {
    return {
      review_status: 'ambiguous',
      user_label_status: 'rejected',
      reviewed_identity: null,
      reviewer_notes: notes,
      reviewed_by: reviewerId,
      reviewed_at: now,
      ...(physicalCardSessionId ? { physical_card_session_id: physicalCardSessionId } : {}),
    };
  }

  if (decision.decision === 'reject_poor_image') {
    return {
      review_status: 'rejected_poor_image',
      user_label_status: 'rejected',
      reviewed_identity: null,
      reviewer_notes: notes,
      reviewed_by: reviewerId,
      reviewed_at: now,
      ...(physicalCardSessionId ? { physical_card_session_id: physicalCardSessionId } : {}),
    };
  }

  if (decision.decision === 'group_physical_card') {
    if (!physicalCardSessionId) {
      const error = new Error('physicalCardSessionId is required.');
      error.details = ['physical_card_session_required'];
      throw error;
    }
    return {
      physical_card_session_id: physicalCardSessionId,
      reviewer_notes: notes,
      reviewed_by: reviewerId,
      reviewed_at: now,
    };
  }

  return {
    review_status: 'rejected_other',
    user_label_status: 'rejected',
    reviewed_identity: null,
    reviewer_notes: notes,
    reviewed_by: reviewerId,
    reviewed_at: now,
    ...(physicalCardSessionId ? { physical_card_session_id: physicalCardSessionId } : {}),
  };
}

router.post('/items', async (req, res) => {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const feedback = req.body?.feedback;
    assertFeedbackMetadata(feedback);

    const dbFeedback = toDbFeedback(feedback, auth.user.id);
    const { data, error } = await auth.supabase
      .from('recognition_feedback_items')
      .upsert(dbFeedback, { onConflict: 'created_by,local_feedback_id' })
      .select('id')
      .single();

    if (error) throw error;

    await auth.supabase.from('recognition_feedback_events').insert({
      feedback_id: data.id,
      created_by: auth.user.id,
      event_type: 'metadata_received',
      event_context: {
        routeVersion: ROUTE_VERSION,
        feedbackAction: feedback.action,
        anonymousScanId: feedback.anonymousScanId,
      },
    });

    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      feedbackId: data.id,
    });
  } catch (error) {
    fail(res, error.details ? 400 : 500, error.message, error.details);
  }
});

router.put(
  '/items/:feedbackId/files/rectified-card',
  express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/octet-stream'],
    limit: '20mb',
  }),
  async (req, res) => {
    try {
      const auth = await requireUser(req, res);
      if (!auth) return;

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        fail(res, 400, 'Rectified image body is required.');
        return;
      }

      const { data: feedback, error: feedbackError } = await auth.supabase
        .from('recognition_feedback_items')
        .select('id, created_by, consent_state, rectified_image_storage_path')
        .eq('id', req.params.feedbackId)
        .eq('created_by', auth.user.id)
        .is('deleted_at', null)
        .single();

      if (feedbackError || !feedback) {
        fail(res, 404, 'Recognition feedback item was not found for this user.');
        return;
      }

      const consent = feedback.consent_state ?? {};
      if (consent.imageUploadConsent !== true || consent.imageUploadWithdrawnAt || consent.deletionRequestedAt) {
        fail(res, 403, 'Image upload consent is not active for this feedback item.');
        return;
      }

      const validation = validatePrivateScanUpload(
        req.body,
        req.headers['content-type'] || 'application/octet-stream',
        { maxBytes: 20 * 1024 * 1024 },
      );
      if (!validation.ok) {
        fail(res, 400, 'Rectified image failed validation.', validation.reasons);
        return;
      }

      const contentType = validation.mimeType;
      const extension = contentExtension(contentType);
      const userSegment = createHash('sha256').update(auth.user.id).digest('hex').slice(0, 24);
      const storagePath = `private/u/${userSegment}/${feedback.id}/rectified-card.${extension}`;
      const checksum = validation.sha256;

      const { error: uploadError } = await auth.supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, req.body, {
          contentType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await auth.supabase
        .from('recognition_feedback_items')
        .update({
          rectified_image_storage_path: storagePath,
          rectified_image_checksum_sha256: checksum,
          image_upload_status: 'uploaded',
          uploaded_at: new Date().toISOString(),
        })
        .eq('id', feedback.id)
        .eq('created_by', auth.user.id);

      if (updateError) throw updateError;

      await auth.supabase.from('recognition_feedback_events').insert({
        feedback_id: feedback.id,
        created_by: auth.user.id,
        event_type: 'rectified_card_uploaded',
        event_context: {
          routeVersion: ROUTE_VERSION,
          storagePath,
          checksumSha256: checksum,
          byteLength: req.body.length,
          mimeType: contentType,
          width: validation.width,
          height: validation.height,
        },
      });

      res.json({
        ok: true,
        routeVersion: ROUTE_VERSION,
        feedbackId: feedback.id,
        storagePath,
        checksumSha256: checksum,
      });
    } catch (error) {
      fail(res, 500, error.message);
    }
  }
);

router.delete('/items/:feedbackId', async (req, res) => {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { data: feedback, error: feedbackError } = await auth.supabase
      .from('recognition_feedback_items')
      .select('id, created_by, rectified_image_storage_path')
      .eq('id', req.params.feedbackId)
      .eq('created_by', auth.user.id)
      .single();

    if (feedbackError || !feedback) {
      fail(res, 404, 'Recognition feedback item was not found for this user.');
      return;
    }

    if (feedback.rectified_image_storage_path) {
      await auth.supabase.storage.from(STORAGE_BUCKET).remove([feedback.rectified_image_storage_path]);
    }

    const deletedAt = new Date().toISOString();
    const { error: updateError } = await auth.supabase
      .from('recognition_feedback_items')
      .update({
        consent_state: {
          imageUploadConsent: false,
          imageUploadWithdrawnAt: deletedAt,
          deletionRequestedAt: deletedAt,
        },
        user_label_status: 'withdrawn',
        review_status: 'deleted',
        image_upload_status: 'deleted',
        withdrawn_at: deletedAt,
        deleted_at: deletedAt,
      })
      .eq('id', feedback.id)
      .eq('created_by', auth.user.id);

    if (updateError) throw updateError;

    await auth.supabase.from('recognition_feedback_events').insert({
      feedback_id: feedback.id,
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
      feedbackId: feedback.id,
      deletedAt,
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.get('/review-queue', async (req, res) => {
  try {
    const auth = await requireReviewer(req, res);
    if (!auth) return;

    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const status = clean(req.query.status) ?? 'queued';
    const { data, error } = await auth.supabase
      .from('recognition_feedback_items')
      .select('*')
      .eq('review_status', status)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      items: data ?? [],
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.patch('/review-queue/:feedbackId', async (req, res) => {
  try {
    const auth = await requireReviewer(req, res);
    if (!auth) return;

    const decision = req.body?.decision ?? {};
    const patch = reviewPatch(decision, auth.user.id);
    const { data, error } = await auth.supabase
      .from('recognition_feedback_items')
      .update(patch)
      .eq('id', req.params.feedbackId)
      .select('*')
      .single();

    if (error) throw error;

    await auth.supabase.from('recognition_feedback_events').insert({
      feedback_id: data.id,
      created_by: auth.user.id,
      event_type: `review_${decision.decision ?? 'unknown'}`,
      event_context: {
        routeVersion: ROUTE_VERSION,
        decision,
      },
    });

    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      item: data,
    });
  } catch (error) {
    fail(res, error.details ? 400 : 500, error.message, error.details);
  }
});

export default router;
