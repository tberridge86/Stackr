/* eslint-env node */
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  ApiError,
  DEFAULT_CATALOGUE_CACHE_CONTROL,
  etagFor,
  matchesIfNoneMatch,
  NO_STORE_CACHE_CONTROL,
  requestIdFrom,
  STACKR_API_V1,
  createCatalogueV1Service,
} from '../lib/stackrApiV1.js';
import {
  MARKET_CACHE_CONTROL,
  MARKET_HISTORY_CACHE_CONTROL,
  createMarketPricingService,
} from '../lib/marketPricing/service.js';
import { createTracedFetch } from '../lib/traceContext.js';

let supabaseAdmin = null;
let catalogueSupabase = null;
let assetSupabase = null;
let searchSupabase = null;

function getSupabaseKeyCandidate() {
  const candidates = [
    ['SUPABASE_PUBLISHABLE_KEY', process.env.SUPABASE_PUBLISHABLE_KEY],
    ['SUPABASE_ANON_KEY', process.env.SUPABASE_ANON_KEY],
    ['SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
  ];
  const selected = candidates.find(([, value]) => String(value ?? '').trim());
  return selected ? { name: selected[0], value: selected[1] } : null;
}

function getSupabaseServerKeyCandidate() {
  const candidates = [
    ['SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
  ];
  const selected = candidates.find(([, value]) => String(value ?? '').trim());
  return selected ? { name: selected[0], value: selected[1] } : null;
}

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const key = getSupabaseServerKeyCandidate();
  if (!url || !key) {
    throw new Error('Supabase server credentials are not configured on the backend.');
  }
  console.info(JSON.stringify({
    level: 'info',
    event: 'stackr_api_v1_supabase_client',
    supabaseKeyName: key.name,
  }));
  supabaseAdmin = createClient(url, key.value, { global: { fetch: createTracedFetch() } });
  return supabaseAdmin;
}

function createApiSchemaFetch() {
  const tracedFetch = createTracedFetch();
  return async (input, init = {}) => {
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('Accept-Profile', 'api');
    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) headers.set('Content-Profile', 'api');
    return tracedFetch(input, { ...init, headers });
  };
}

function getCatalogueSupabase() {
  if (catalogueSupabase) return catalogueSupabase;
  const url = process.env.SUPABASE_URL;
  const key = getSupabaseKeyCandidate();
  if (!url || !key) {
    throw new Error('Supabase credentials are not configured on the backend.');
  }
  console.info(JSON.stringify({
    level: 'info',
    event: 'stackr_api_v1_catalogue_client',
    supabaseKeyName: key.name,
    forcedSchema: 'api',
  }));
  catalogueSupabase = createClient(url, key.value, { global: { fetch: createApiSchemaFetch() } });
  return catalogueSupabase;
}

function getAssetSupabase() {
  if (assetSupabase) return assetSupabase;
  const url = process.env.SUPABASE_URL;
  const key = getSupabaseServerKeyCandidate();
  if (!url || !key) {
    throw new Error('Supabase server credentials are not configured on the backend.');
  }
  console.info(JSON.stringify({
    level: 'info',
    event: 'stackr_api_v1_asset_client',
    supabaseKeyName: key.name,
    forcedSchema: 'api',
  }));
  assetSupabase = createClient(url, key.value, { global: { fetch: createApiSchemaFetch() } });
  return assetSupabase;
}

function getSearchSupabase() {
  if (searchSupabase) return searchSupabase;
  const url = process.env.SUPABASE_URL;
  const key = getSupabaseServerKeyCandidate();
  if (!url || !key) {
    throw new Error('Supabase server credentials are not configured on the backend.');
  }
  console.info(JSON.stringify({
    level: 'info',
    event: 'stackr_api_v1_search_client',
    supabaseKeyName: key.name,
    forcedSchema: 'api',
  }));
  searchSupabase = createClient(url, key.value, { global: { fetch: createApiSchemaFetch() } });
  return searchSupabase;
}

function defaultService() {
  return createCatalogueV1Service({
    supabase: getCatalogueSupabase(),
    searchSupabase: getSearchSupabase(),
    assetSupabase: getAssetSupabase(),
  });
}

function defaultPricingService() {
  return createMarketPricingService({
    supabase: getSupabaseAdmin(),
  });
}

function logRequest(req, res, startedAt) {
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  console.info(JSON.stringify({
    level: 'info',
    event: 'stackr_api_request',
    api_version: STACKR_API_V1,
    request_id: req.stackrRequestId,
    method: req.method,
    path: req.originalUrl,
    status: res.statusCode,
    duration_ms: Math.round(durationMs),
    trace_id: req.stackrTrace?.traceId ?? null,
    span_id: req.stackrTrace?.spanId ?? null,
  }));
}

function sendEnvelope(req, res, payload, options = {}) {
  const status = options.status ?? 200;
  const cacheControl = options.cacheControl ?? DEFAULT_CATALOGUE_CACHE_CONTROL;
  const body = {
    data: payload,
    meta: {
      requestId: req.stackrRequestId,
      apiVersion: STACKR_API_V1,
      generatedAt: new Date().toISOString(),
      ...(options.pagination ? { pagination: options.pagination } : {}),
    },
  };
  const etag = options.etag ?? etagFor(body);
  res.setHeader('X-Request-Id', req.stackrRequestId);
  res.setHeader('X-Stackr-Api-Version', STACKR_API_V1);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('ETag', etag);
  res.setHeader('Vary', 'Accept-Encoding, If-None-Match');

  if (matchesIfNoneMatch(req, etag) && status === 200) {
    res.status(304).end();
    return;
  }

  res.status(status).json(body);
}

function sendError(req, res, error) {
  const status = Number(error?.status ?? 500);
  const code = error?.code ?? (status >= 500 ? 'internal_error' : 'request_error');
  const message = error instanceof Error ? error.message : String(error);
  const postgrestDetails = /^PGRST\d+$/.test(String(error?.code ?? ''))
    ? errorForLog(error)
    : undefined;
  const details = error instanceof ApiError ? error.details : postgrestDetails;
  res.setHeader('X-Request-Id', req.stackrRequestId);
  res.setHeader('X-Stackr-Api-Version', STACKR_API_V1);
  res.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
  res.status(status).json({
    error: {
      code,
      message: status >= 500 ? 'Stackr API request failed.' : message,
      requestId: req.stackrRequestId,
      ...(details ? { details } : {}),
    },
    meta: {
      apiVersion: STACKR_API_V1,
      generatedAt: new Date().toISOString(),
    },
  });
}

function bearerToken(req) {
  const header = String(req.headers.authorization ?? '').trim();
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
}

async function authenticatedUserId(req) {
  const token = bearerToken(req);
  if (!token) throw new ApiError(401, 'authentication_required', 'Sign in is required to request a price refresh.');
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data?.user?.id) throw new ApiError(401, 'authentication_required', 'Your sign-in session is not valid.');
  return data.user.id;
}

function errorForLog(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code ?? null,
      status: error.status ?? null,
    };
  }
  if (error && typeof error === 'object') {
    const body = {};
    for (const key of ['code', 'message', 'details', 'hint', 'status', 'statusCode']) {
      if (error[key] != null) body[key] = error[key];
    }
    return Object.keys(body).length ? body : { message: JSON.stringify(error) };
  }
  return { message: String(error) };
}

function asyncRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'stackr_api_error',
        api_version: STACKR_API_V1,
        request_id: req.stackrRequestId,
        method: req.method,
        path: req.originalUrl,
        status: Number(error?.status ?? 500),
        error: errorForLog(error),
      }));
      sendError(req, res, error);
    }
  };
}

export function createV1Router(options = {}) {
  const router = express.Router();
  const getService = options.getService ?? (() => options.service ?? defaultService());
  const getPricingService = options.getPricingService ?? (() => options.pricingService ?? defaultPricingService());
  const getAuthenticatedUserId = options.getAuthenticatedUserId ?? authenticatedUserId;

  router.use((req, res, next) => {
    req.stackrRequestId = requestIdFrom(req);
    const startedAt = process.hrtime.bigint();
    res.setHeader('X-Request-Id', req.stackrRequestId);
    res.setHeader('X-Stackr-Api-Version', STACKR_API_V1);
    res.on('finish', () => logRequest(req, res, startedAt));
    next();
  });

  router.get('/health', asyncRoute(async (req, res) => {
    sendEnvelope(req, res, await getService().health(req.query), {
      cacheControl: NO_STORE_CACHE_CONTROL,
    });
  }));

  router.get('/ready', asyncRoute(async (req, res) => {
    sendEnvelope(req, res, await getService().ready(req.query), {
      cacheControl: NO_STORE_CACHE_CONTROL,
    });
  }));

  router.get('/catalog/manifest', asyncRoute(async (req, res) => {
    const manifest = await getService().manifest(req.query);
    sendEnvelope(req, res, manifest, {
      etag: manifest.etag,
      cacheControl: 'public, max-age=300, stale-while-revalidate=600',
    });
  }));

  router.get('/catalog/delta', asyncRoute(async (req, res) => {
    const delta = await getService().delta(req.query);
    sendEnvelope(req, res, { sinceChangeSequence: delta.sinceChangeSequence, changes: delta.changes }, {
      pagination: delta.pagination,
      cacheControl: DEFAULT_CATALOGUE_CACHE_CONTROL,
    });
  }));

  router.get('/languages', asyncRoute(async (req, res) => {
    sendEnvelope(req, res, await getService().languages(req.query));
  }));

  router.get('/series', asyncRoute(async (req, res) => {
    const series = await getService().series(req.query);
    sendEnvelope(req, res, { series: series.series }, {
      pagination: series.pagination,
    });
  }));

  router.get('/sets', asyncRoute(async (req, res) => {
    const sets = await getService().sets(req.query);
    sendEnvelope(req, res, { sets: sets.sets }, {
      pagination: sets.pagination,
    });
  }));

  router.get('/sets/:setId', asyncRoute(async (req, res) => {
    sendEnvelope(req, res, await getService().set(req.params.setId));
  }));

  router.get('/sets/:setId/cards', asyncRoute(async (req, res) => {
    const cards = await getService().setCards(req.params.setId, req.query);
    sendEnvelope(req, res, { cards: cards.cards }, {
      pagination: cards.pagination,
    });
  }));

  router.get('/cards/:cardId', asyncRoute(async (req, res) => {
    sendEnvelope(req, res, await getService().card(req.params.cardId));
  }));

  router.get('/cards/:cardId/variants', asyncRoute(async (req, res) => {
    sendEnvelope(req, res, await getService().cardVariants(req.params.cardId));
  }));

  router.post('/cards/display-artwork-references', asyncRoute(async (req, res) => {
    sendEnvelope(req, res, await getService().sameArtworkDisplayReferences(req.body ?? {}), {
      cacheControl: NO_STORE_CACHE_CONTROL,
    });
  }));

  router.get('/assets/manifest', asyncRoute(async (req, res) => {
    const manifest = await getService().assetManifest(req.query);
    sendEnvelope(req, res, { assets: manifest.assets }, {
      pagination: manifest.pagination,
      cacheControl: 'public, max-age=300, stale-while-revalidate=600',
    });
  }));

  router.get('/cards/:variantId/price', asyncRoute(async (req, res) => {
    sendEnvelope(req, res, await getPricingService().price(req.params.variantId, req.query), {
      cacheControl: MARKET_CACHE_CONTROL,
    });
  }));

  router.get('/cards/:variantId/price-history', asyncRoute(async (req, res) => {
    const history = await getPricingService().priceHistory(req.params.variantId, req.query);
    sendEnvelope(req, res, { variantId: history.variantId, observations: history.observations }, {
      cacheControl: MARKET_CACHE_CONTROL,
      pagination: history.pagination,
    });
  }));

  router.get('/market/price-snapshots', asyncRoute(async (req, res) => {
    const variantIds = String(req.query.variantIds ?? '').split(',').map((id) => id.trim()).filter(Boolean);
    const history = await getPricingService().snapshotHistory(variantIds, req.query);
    sendEnvelope(req, res, history, {
      cacheControl: MARKET_HISTORY_CACHE_CONTROL,
    });
  }));

  router.post('/cards/:variantId/price-refresh', asyncRoute(async (req, res) => {
    const userId = await getAuthenticatedUserId(req);
    const refresh = await getPricingService().requestSnapshotRefresh(req.params.variantId, req.body ?? {}, userId);
    sendEnvelope(req, res, refresh, {
      status: refresh.status === 'queued' ? 202 : 200,
      cacheControl: NO_STORE_CACHE_CONTROL,
    });
  }));

  router.post('/market/price-refresh', asyncRoute(async (req, res) => {
    const userId = await getAuthenticatedUserId(req);
    const { variantIds, ...input } = req.body ?? {};
    const refresh = await getPricingService().requestSnapshotRefreshBatch(variantIds, input, userId);
    sendEnvelope(req, res, refresh, {
      status: refresh.summary.queued > 0 ? 202 : 200,
      cacheControl: NO_STORE_CACHE_CONTROL,
    });
  }));

  router.get('/market/movers', asyncRoute(async (req, res) => {
    const movers = await getPricingService().marketMovers(req.query);
    sendEnvelope(req, res, { movers: movers.movers }, {
      cacheControl: MARKET_CACHE_CONTROL,
      pagination: movers.pagination,
    });
  }));

  router.get('/market/opportunities', asyncRoute(async (req, res) => {
    const opportunities = await getPricingService().marketOpportunities(req.query);
    sendEnvelope(req, res, { opportunities: opportunities.opportunities }, {
      cacheControl: MARKET_CACHE_CONTROL,
      pagination: opportunities.pagination,
    });
  }));

  router.get('/search', asyncRoute(async (req, res) => {
    const search = await getService().search(req.query);
    sendEnvelope(req, res, { query: search.query, normalizedQuery: search.normalizedQuery, results: search.results }, {
      pagination: search.pagination,
      cacheControl: DEFAULT_CATALOGUE_CACHE_CONTROL,
    });
  }));

  return router;
}

export default createV1Router;
