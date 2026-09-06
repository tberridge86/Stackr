import express from 'express';
import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import { authenticateOwnerRecognition } from '../lib/ownerRecognitionAccess.js';

const MODEL = 'siglip2_vision_256_768';
const INDEX = 'siglip2-vision-256-768-r3f9f96cb-full-48011-v1';
let authClient;

function defaultSupabase() {
  if (!authClient) {
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
      || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!process.env.SUPABASE_URL || !key) return null;
    authClient = createClient(process.env.SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return authClient;
}

function serviceConfiguration(env) {
  try {
    const url = new URL(env.STACKR_OWNER_RECOGNITION_SERVICE_URL);
    const privateHost = url.hostname.endsWith('.railway.internal')
      || (env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname));
    if (url.username || url.password || url.search || url.hash
      || (url.protocol !== 'https:' && !(url.protocol === 'http:' && privateHost))) return null;
    const token = String(env.OWNER_SIGLIP_SERVICE_TOKEN || '').trim();
    if (token.length < 32) return null;
    return { url: url.origin, token };
  } catch { return null; }
}

export function isOwnerRecognitionResult(value) {
  return value?.modelVersion === MODEL && value?.indexVersion === INDEX
    && value.status === 'review_required' && value.requiresReview === true
    && value.autoAccept === false && value.autoAdd === false
    && Array.isArray(value.candidates) && value.candidates.length <= 5
    && value.candidates.every((candidate) => typeof candidate.variantId === 'string'
      && typeof candidate.canonicalKey === 'string' && typeof candidate.name === 'string'
      && typeof candidate.similarity === 'number' && Number.isFinite(candidate.similarity)
      && candidate.similarity >= -1.001 && candidate.similarity <= 1.001);
}

function publicRecognitionResult(result) {
  const textFields = ['variantId', 'canonicalKey', 'name', 'nativeName', 'language',
    'setId', 'setCode', 'collectorNumber', 'variantCode', 'referenceAssetId'];
  return {
    status: 'review_required', modelVersion: MODEL, indexVersion: INDEX,
    requiresReview: true, autoAccept: false, autoAdd: false,
    candidates: result.candidates.map((candidate, index) => ({
      rank: index + 1, similarity: candidate.similarity,
      ...Object.fromEntries(textFields.filter((key) => typeof candidate[key] === 'string')
        .map((key) => [key, candidate[key].slice(0, 512)])),
    })),
    ...(result.timings && typeof result.timings === 'object' ? {
      timings: Object.fromEntries(['preprocessingMs', 'inferenceMs', 'searchMs', 'totalMs']
        .filter((key) => Number.isFinite(result.timings[key]) && result.timings[key] >= 0)
        .map((key) => [key, result.timings[key]])),
    } : {}),
  };
}

export function createOwnerRecognitionRouter({
  env = process.env, getSupabase = defaultSupabase, fetchImpl = globalThis.fetch,
  timeoutMs = 45_000,
} = {}) {
  const router = express.Router();
  let inFlight = false;
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const access = await authenticateOwnerRecognition(req, { supabase: getSupabase(), env });
      if (!access.ok) return res.status(access.status).json({ error: { code: access.code, message: access.error } });
      res.locals.ownerId = access.user.id;
      next();
    } catch {
      res.status(503).json({ error: { code: 'OWNER_AUTH_UNAVAILABLE', message: 'Account verification is unavailable.' } });
    }
  });

  async function callService(path, options = {}) {
    const config = serviceConfiguration(env);
    if (!config) throw Object.assign(new Error('Service not configured'), { code: 'OWNER_MODEL_UNCONFIGURED' });
    const response = await fetchImpl(`${config.url}${path}`, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { ...options.headers, Authorization: `Bearer ${config.token}` },
    });
    if (!response.ok) throw Object.assign(new Error('Recognition service unavailable'), { code: 'OWNER_MODEL_UNAVAILABLE' });
    const text = await response.text();
    if (text.length > 262_144) throw new Error('Oversized recognition response');
    return JSON.parse(text);
  }

  router.get('/status', async (_req, res) => {
    try {
      const ready = await callService('/ready');
      if (!(ready.ready === true || ready.ok === true)
        || ready.modelVersion !== MODEL || ready.indexVersion !== INDEX) throw new Error('Model not ready');
      res.json({ available: true, ownerId: res.locals.ownerId, modelVersion: MODEL, indexVersion: INDEX,
        inferenceLocation: 'server', autoAccept: false, autoAdd: false, retainsImages: false });
    } catch (error) {
      res.status(503).json({ available: false, error: { code: error.code || 'OWNER_MODEL_UNAVAILABLE',
        message: 'Private recognition is not ready. Your existing scanner remains available.' } });
    }
  });

  router.post('/identify', (req, res, next) => {
    if (inFlight) return res.status(429).json({ error: { code: 'OWNER_MODEL_BUSY', message: 'A scan is already running. Try again shortly.' } });
    if (!['image/jpeg', 'image/png'].includes(req.get('content-type')?.split(';')[0])) {
      return res.status(415).json({ error: { code: 'OWNER_IMAGE_TYPE', message: 'Use a JPEG or PNG card photograph.' } });
    }
    next();
  }, express.raw({ type: ['image/jpeg', 'image/png'], limit: '5mb' }), async (req, res) => {
    if (inFlight) return res.status(429).json({ error: { code: 'OWNER_MODEL_BUSY', message: 'A scan is already running.' } });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: { code: 'OWNER_IMAGE_REQUIRED', message: 'Choose a card photograph.' } });
    inFlight = true;
    const started = Date.now();
    try {
      const result = await callService('/v1/owner-recognition/identify', {
        method: 'POST', headers: { 'Content-Type': req.get('content-type') }, body: req.body,
      });
      if (!isOwnerRecognitionResult(result)) throw new Error('Incompatible model response');
      // No photograph, OCR text, access token or user identifier is logged or retained.
      res.json(publicRecognitionResult(result));
      console.info(JSON.stringify({ event: 'owner_recognition', outcome: 'review_required',
        durationMs: Date.now() - started, candidateCount: result.candidates.length, modelVersion: MODEL }));
    } catch (error) {
      const timeout = ['TimeoutError', 'AbortError'].includes(error.name);
      res.status(timeout ? 504 : 503).json({ error: { code: timeout ? 'OWNER_MODEL_TIMEOUT' : error.code || 'OWNER_MODEL_UNAVAILABLE',
        message: timeout ? 'Recognition timed out. Retake the card photo and try again.' : 'Private recognition is unavailable. No match was accepted.' } });
    } finally { inFlight = false; }
  });
  router.use((error, _req, res, _next) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: {
      code: 'OWNER_IMAGE_INVALID', message: 'Use a JPEG or PNG photograph smaller than 5 MB.',
    } });
  });
  return router;
}

export default createOwnerRecognitionRouter();
