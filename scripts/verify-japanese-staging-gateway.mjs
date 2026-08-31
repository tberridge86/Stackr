import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  assertCanonicalStagingConfiguration,
  inspectAppReadyImage,
  loadPublishedJapaneseVariants,
  mapWithConcurrency,
  probeStorageUrl,
  verifyJapaneseCatalogue,
} from './verify-japanese-catalogue-api-storage.mjs';

export const STAGING_GATEWAY_ORIGIN = 'https://stackr-api-gateway-staging.berridge14.workers.dev';

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REQUIRED_SAMPLE_ROLES = Object.freeze(['original', 'card-grid', 'search-result', 'detail-page']);

function clean(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function percentage(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

function parseInteger(value, fallback, { min, max, name }) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function parseCli(argv) {
  const options = new Map();
  for (const argument of argv) {
    if (!argument.startsWith('--')) continue;
    const [name, ...valueParts] = argument.slice(2).split('=');
    options.set(name, valueParts.length ? valueParts.join('=') : true);
  }
  return {
    gateway: clean(options.get('gateway')) ?? clean(process.env.STACKR_STAGING_GATEWAY_URL),
    output: clean(options.get('output')),
    setConcurrency: parseInteger(options.get('set-concurrency'), 4, {
      min: 1,
      max: 8,
      name: 'set-concurrency',
    }),
    probeConcurrency: parseInteger(options.get('probe-concurrency'), 4, {
      min: 1,
      max: 4,
      name: 'probe-concurrency',
    }),
    probeRetries: parseInteger(options.get('probe-retries'), 3, {
      min: 0,
      max: 5,
      name: 'probe-retries',
    }),
  };
}

export function assertCanonicalStagingGateway(value) {
  const raw = clean(value);
  let parsed;
  try {
    parsed = new URL(raw ?? '');
  } catch {
    throw new Error(`The deployed Japanese smoke must use exactly ${STAGING_GATEWAY_ORIGIN}.`);
  }
  if (parsed.origin !== STAGING_GATEWAY_ORIGIN
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password) {
    throw new Error(`The deployed Japanese smoke must use exactly ${STAGING_GATEWAY_ORIGIN}.`);
  }
  return STAGING_GATEWAY_ORIGIN;
}

function addImageSamples(samples, cards) {
  for (const card of cards ?? []) {
    for (const variant of card?.variants ?? []) {
      const image = variant?.image;
      if (!inspectAppReadyImage(image).ok) continue;
      if (!samples.has('original') && clean(image.deliveryUrl)) {
        samples.set('original', image.deliveryUrl);
      }
      for (const role of REQUIRED_SAMPLE_ROLES.slice(1)) {
        const derivative = image.derivatives?.find((item) => clean(item?.role) === role);
        if (!samples.has(role) && clean(derivative?.deliveryUrl)) {
          samples.set(role, derivative.deliveryUrl);
        }
      }
      if (samples.size === REQUIRED_SAMPLE_ROLES.length) return;
    }
  }
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1_000, 5_000);
  return Math.min(250 * (2 ** attempt), 2_000);
}

export function createStagingGatewayCatalogueService(options = {}) {
  const gateway = assertCanonicalStagingGateway(options.gateway);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const retries = options.retries ?? 3;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const imageSamples = new Map();
  const stats = {
    requests: 0,
    cacheBypassResponses: 0,
    requestIdsVerified: 0,
    apiVersions: new Set(),
  };

  async function request(pathname, parameters = {}) {
    const url = new URL(pathname, gateway);
    for (const [name, value] of Object.entries(parameters)) {
      if (value != null && value !== '') url.searchParams.set(name, String(value));
    }

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const requestId = randomUUID();
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer stackr-japanese-catalogue-cache-bypass',
            'X-Request-Id': requestId,
          },
        });
        if (TRANSIENT_HTTP_STATUSES.has(response.status) && attempt < retries) {
          await response.body?.cancel?.();
          await sleep(retryDelay(response, attempt));
          continue;
        }
        if (response.status !== 200) {
          await response.body?.cancel?.();
          throw new Error(`Staging gateway ${url.pathname} returned HTTP ${response.status}.`);
        }
        const contentType = clean(response.headers.get('content-type'))?.toLowerCase();
        if (!contentType?.startsWith('application/json')) {
          await response.body?.cancel?.();
          throw new Error(`Staging gateway ${url.pathname} returned a non-JSON response.`);
        }
        const cacheState = clean(response.headers.get('x-stackr-cache'));
        if (cacheState !== 'BYPASS') {
          await response.body?.cancel?.();
          throw new Error(`Staging gateway ${url.pathname} did not bypass its catalogue cache.`);
        }
        const returnedRequestId = clean(response.headers.get('x-request-id'));
        if (returnedRequestId !== requestId) {
          await response.body?.cancel?.();
          throw new Error(`Staging gateway ${url.pathname} did not preserve the smoke request ID.`);
        }
        const apiVersion = clean(response.headers.get('x-stackr-api-version'));
        const body = await response.json();
        if (!apiVersion || clean(body?.meta?.apiVersion) !== apiVersion || !body?.data) {
          throw new Error(`Staging gateway ${url.pathname} returned an invalid StackR API envelope.`);
        }
        stats.requests += 1;
        stats.cacheBypassResponses += 1;
        stats.requestIdsVerified += 1;
        stats.apiVersions.add(apiVersion);
        return body;
      } catch (error) {
        if (attempt >= retries || (response && !TRANSIENT_HTTP_STATUSES.has(response.status))) throw error;
        await sleep(retryDelay(response, attempt));
      }
    }
    throw new Error('unreachable_staging_gateway_retry_state');
  }

  return {
    async manifest() {
      return (await request('/v1/catalog/manifest')).data;
    },
    async sets(input = {}) {
      const body = await request('/v1/sets', input);
      return {
        sets: body.data.sets ?? [],
        pagination: body.meta.pagination ?? { nextCursor: null },
      };
    },
    async setCards(setId, input = {}) {
      const body = await request(`/v1/sets/${encodeURIComponent(setId)}/cards`, input);
      const cards = body.data.cards ?? [];
      addImageSamples(imageSamples, cards);
      return {
        cards,
        pagination: body.meta.pagination ?? { nextCursor: null },
      };
    },
    imageSamples,
    report() {
      return {
        origin: gateway,
        requests: stats.requests,
        cacheBypassResponses: stats.cacheBypassResponses,
        cacheBypassPercent: percentage(stats.cacheBypassResponses, stats.requests),
        requestIdsVerified: stats.requestIdsVerified,
        requestIdPercent: percentage(stats.requestIdsVerified, stats.requests),
        apiVersions: [...stats.apiVersions].sort(),
      };
    },
  };
}

export async function verifyDeployedJapaneseGateway(options) {
  const service = createStagingGatewayCatalogueService({
    gateway: options.gateway,
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
    retries: options.gatewayRetries ?? 3,
    timeoutMs: options.gatewayTimeoutMs ?? 20_000,
  });
  const core = await verifyJapaneseCatalogue({
    service,
    expectedRows: options.expectedRows,
    loadExpectedVariants: options.loadExpectedVariants,
    setConcurrency: options.setConcurrency ?? 4,
    probeStorage: false,
  });
  const gateway = service.report();
  const missingSampleRoles = REQUIRED_SAMPLE_ROLES.filter((role) => !service.imageSamples.has(role));
  const sampleResults = await mapWithConcurrency(
    [...service.imageSamples.entries()],
    options.probeConcurrency ?? 4,
    async ([role, url]) => ({
      role,
      ...await probeStorageUrl(url, {
        fetchImpl: options.storageFetchImpl,
        sleep: options.sleep,
        retries: options.probeRetries ?? 3,
        timeoutMs: options.probeTimeoutMs ?? 15_000,
      }),
    }),
  );
  const passedSamples = sampleResults.filter((result) => result.ok).length;
  const sampleCoverage = percentage(passedSamples, REQUIRED_SAMPLE_ROLES.length);
  const gatewayOk = gateway.requests > 2
    && gateway.cacheBypassPercent === 100
    && gateway.requestIdPercent === 100
    && gateway.apiVersions.length === 1;
  const sampleOk = missingSampleRoles.length === 0
    && sampleResults.length === REQUIRED_SAMPLE_ROLES.length
    && sampleCoverage === 100;
  return {
    ...core,
    ok: core.ok && gatewayOk && sampleOk,
    verificationMode: 'deployed-staging-gateway',
    gateway,
    gatewayStorageSample: {
      requiredRoles: REQUIRED_SAMPLE_ROLES,
      checked: sampleResults.length,
      passed: passedSamples,
      failed: sampleResults.length - passedSamples,
      coveragePercent: sampleCoverage,
      missingRoles: missingSampleRoles,
      results: sampleResults,
    },
  };
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  const serviceKey = clean(process.env.SUPABASE_SECRET_KEY)
    ?? clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const configuration = assertCanonicalStagingConfiguration({
    target: 'staging',
    supabaseUrl: process.env.SUPABASE_URL,
    serviceKey,
  });
  const supabase = createClient(configuration.supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'stackr-ja-deployed-gateway-verifier/1.0' } },
  });
  const report = await verifyDeployedJapaneseGateway({
    gateway: cli.gateway,
    loadExpectedVariants: () => loadPublishedJapaneseVariants(supabase),
    setConcurrency: cli.setConcurrency,
    probeConcurrency: cli.probeConcurrency,
    probeRetries: cli.probeRetries,
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (cli.output) await writeFile(cli.output, json, 'utf8');
  process.stdout.write(json);
  if (!report.ok) process.exitCode = 1;
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
