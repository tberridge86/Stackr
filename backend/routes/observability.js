import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  loadProtectedDashboard,
  refreshProtectedDashboard,
  recordOperationalEvent,
  storeQualityReport,
} from '../lib/qualityObservability.js';
import { createTracedFetch } from '../lib/traceContext.js';

const router = express.Router();
let supabaseAdmin;

function database() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials are not configured.');
  supabaseAdmin = createClient(url, key, { global: { fetch: createTracedFetch() } });
  return supabaseAdmin;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ''), 'utf8');
  const b = Buffer.from(String(right ?? ''), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  const expected = String(process.env.STACKR_ADMIN_API_KEY || process.env.ADMIN_API_KEY || '').trim();
  if (!expected) return res.status(503).json({ error: 'Observability admin access is not configured.' });
  if (!safeEqual(req.headers['x-stackr-admin-key'], expected)) return res.status(401).json({ error: 'Admin access required.' });
  next();
}

router.post('/events', async (req, res) => {
  try {
    const id = await recordOperationalEvent(database(), req.body);
    res.status(202).json({ accepted: true, eventId: id });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/dashboard', requireAdmin, async (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(await loadProtectedDashboard(database()));
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.post('/evaluations', requireAdmin, async (req, res) => {
  try {
    const evaluationRunId = await storeQualityReport(database(), req.body);
    res.status(201).json({ stored: true, evaluationRunId });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.post('/refresh', requireAdmin, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(await refreshProtectedDashboard(database(), Number(req.body?.windowHours ?? 24)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
