import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function option(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function baseUrl(value, allowHttp) {
  let parsed;
  try { parsed = new URL(String(value ?? '').trim()); } catch { throw new Error('gateway URL must be a valid URL.'); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('gateway URL must not contain credentials, query, or fragment.');
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) throw new Error('gateway URL must use HTTPS.');
  return parsed;
}

async function requestJson(fetchImpl, base, path, timeoutMs) {
  const response = await fetchImpl(new URL(path, base), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { response, body: await response.json().catch(() => null) };
}

function requestId(response, body) {
  return String(response.headers.get('x-request-id') ?? body?.error?.requestId ?? body?.meta?.requestId ?? '').trim();
}

function assertHealth(response, body, name, expectedDataStatus) {
  const id = requestId(response, body);
  if (response.status !== 200 || body?.data?.status !== expectedDataStatus || body?.meta?.apiVersion !== '1' || !id) {
    throw new Error(`${name} did not return the expected Stackr API v1 readiness envelope.`);
  }
  return { name, status: response.status, requestId: id };
}

function assertPrivateAnonymousPricing(response, body, name) {
  const id = requestId(response, body);
  if (response.status !== 401 || body?.error?.code !== 'authentication_required' || body?.meta?.apiVersion !== '1' || body?.error?.requestId !== id) {
    throw new Error(`${name} did not deny anonymous pricing with the expected private v1 error.`);
  }
  if (response.headers.get('cache-control') !== 'private, no-store' || !/authorization/i.test(response.headers.get('vary') ?? '')) {
    throw new Error(`${name} did not preserve private cache controls.`);
  }
  return { name, status: response.status, requestId: id };
}

export async function runGatewayPrivacySmoke({ gatewayUrl, variantId, fetchImpl = fetch, timeoutMs = 15_000, allowHttp = false } = {}) {
  if (!UUID.test(String(variantId ?? ''))) throw new Error('variant ID must be a canonical UUID.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error('timeout must be an integer between 1000 and 60000 milliseconds.');
  const base = baseUrl(gatewayUrl, allowHttp);
  const checks = [];
  for (const [name, path, expectedDataStatus] of [
    ['gateway_health', '/v1/health', 'ok'],
    ['gateway_ready', '/v1/ready', 'ready'],
  ]) {
    const { response, body } = await requestJson(fetchImpl, base, path, timeoutMs);
    checks.push(assertHealth(response, body, name, expectedDataStatus));
  }
  for (const [name, path] of [
    ['anonymous_exact_price', `/v1/cards/${encodeURIComponent(variantId)}/price?productType=raw_card&currency=GBP&condition=near_mint`],
    ['anonymous_price_history', `/v1/cards/${encodeURIComponent(variantId)}/price-history?productType=raw_card&currency=GBP&condition=near_mint&limit=1`],
    ['anonymous_market_movers', '/v1/market/movers?productType=raw_card&currency=GBP&limit=1'],
  ]) {
    const { response, body } = await requestJson(fetchImpl, base, path, timeoutMs);
    checks.push(assertPrivateAnonymousPricing(response, body, name));
  }
  return { ok: true, checks };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  runGatewayPrivacySmoke({
    gatewayUrl: option('gateway'),
    variantId: option('variant-id'),
    timeoutMs: Number(option('timeout-ms', '15000')),
  }).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`gateway_privacy_smoke_failed:${error.message}\n`);
    process.exitCode = 1;
  });
}
