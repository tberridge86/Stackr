import { randomUUID } from 'node:crypto';

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function check(baseUrl, path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs ?? 10_000));
  const requestId = randomUUID();
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      headers: { 'x-request-id': requestId, ...(options.headers ?? {}) },
      signal: controller.signal,
    });
    const returnedRequestId = response.headers.get('x-request-id');
    return {
      path,
      status: response.status,
      ok: options.accept?.includes(response.status) ?? response.ok,
      requestIdPropagated: returnedRequestId === requestId,
    };
  } catch (error) {
    return { path, status: null, ok: false, requestIdPropagated: false, error: error.name };
  } finally {
    clearTimeout(timeout);
  }
}

const gatewayUrl = argument('gateway', process.env.STACKR_GATEWAY_URL);
const backendUrl = argument('backend', process.env.STACKR_BACKEND_URL);
const recognitionUrl = argument('recognition', process.env.STACKR_RECOGNITION_URL);
const allowRecognitionNotReady = process.argv.includes('--allow-recognition-not-ready');
const allowMissingRequestId = process.argv.includes('--allow-missing-request-id');
const checks = [];

if (backendUrl) checks.push(await check(backendUrl, '/health'));
if (recognitionUrl) {
  checks.push(await check(recognitionUrl, '/health'));
  checks.push(await check(recognitionUrl, '/ready', { accept: allowRecognitionNotReady ? [200, 503] : [200] }));
}
if (gatewayUrl) {
  checks.push(await check(gatewayUrl, '/v1/health'));
  checks.push(await check(gatewayUrl, '/v1/ready'));
  checks.push(await check(gatewayUrl, '/v1/catalog/manifest'));
}

if (!checks.length) {
  console.error('No deployment smoke-test URLs were supplied.');
  process.exit(1);
}

const failed = checks.filter((item) => !item.ok || (!allowMissingRequestId && !item.requestIdPropagated));
console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
if (failed.length) process.exit(1);
