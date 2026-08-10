/* eslint-env node */
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  enqueueCatalogueIngestionCommand,
  getCatalogueQualityReport,
  listQuarantinedConflicts,
} from '../lib/catalogueIngestionAdmin.js';

const router = express.Router();
const ROUTE_VERSION = 'stackr-catalogue-ingestion-admin-v1.0.0';

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

function getAuthToken(req) {
  const header = String(req.headers.authorization || '').trim();
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return String(req.headers['x-stackr-admin-key'] || '').trim();
}

function requireAdminAccess(req, res) {
  const expected = String(process.env.STACKR_ADMIN_API_KEY || process.env.ADMIN_API_KEY || '').trim();
  if (!expected) {
    res.status(503).json({
      ok: false,
      routeVersion: ROUTE_VERSION,
      error: 'Admin API key is not configured.',
    });
    return false;
  }

  if (getAuthToken(req) !== expected) {
    res.status(401).json({
      ok: false,
      routeVersion: ROUTE_VERSION,
      error: 'Admin API key required.',
    });
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

function fail(res, error) {
  const status = Number(error?.status ?? 500);
  res.status(status).json({
    ok: false,
    routeVersion: ROUTE_VERSION,
    error: error instanceof Error ? error.message : String(error),
  });
}

router.post('/:command(run-source|run-language|run-set|resume-import|rebuild-record)', async (req, res) => {
  if (!requireAdminAccess(req, res)) return;

  try {
    const result = await enqueueCatalogueIngestionCommand(
      getSupabaseAdmin(),
      req.params.command,
      bodyAndQuery(req),
    );
    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      mode: 'queued',
      ...result,
    });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/conflicts', async (req, res) => {
  if (!requireAdminAccess(req, res)) return;

  try {
    const conflicts = await listQuarantinedConflicts(getSupabaseAdmin(), bodyAndQuery(req));
    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      count: conflicts.length,
      conflicts,
    });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/quality-report', async (req, res) => {
  if (!requireAdminAccess(req, res)) return;

  try {
    const rows = await getCatalogueQualityReport(getSupabaseAdmin(), bodyAndQuery(req));
    res.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      generatedAt: new Date().toISOString(),
      count: rows.length,
      rows,
    });
  } catch (error) {
    fail(res, error);
  }
});

export default router;
