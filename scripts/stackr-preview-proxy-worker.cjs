'use strict';

const https = require('node:https');
const { parentPort, workerData } = require('node:worker_threads');

const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;

if (!parentPort) throw new Error('stackr_preview_proxy_worker_parent_missing');

let settled = false;
function finish(message) {
  if (settled) return;
  settled = true;
  parentPort.postMessage(message);
}

let upstreamUrl;
try {
  upstreamUrl = new URL(String(workerData?.url ?? ''));
  if (upstreamUrl.protocol !== 'https:' || upstreamUrl.username || upstreamUrl.password) {
    throw new Error('stackr_preview_proxy_worker_url_invalid');
  }
} catch {
  finish({ ok: false, status: 502 });
}

if (upstreamUrl) {
  const upstreamRequest = https.request(upstreamUrl, {
    method: 'GET',
    agent: false,
    family: 4,
    headers: {
      Accept: String(workerData?.accept || 'application/json'),
      'X-Stackr-Api-Version': '1',
    },
    timeout: 15_000,
  }, (upstreamResponse) => {
    const status = upstreamResponse.statusCode ?? 502;
    if (status >= 300 && status < 400) {
      upstreamResponse.resume();
      finish({ ok: false, status: 502 });
      return;
    }

    const chunks = [];
    let payloadSize = 0;
    upstreamResponse.on('data', (chunk) => {
      payloadSize += chunk.length;
      if (payloadSize > MAX_PAYLOAD_BYTES) {
        upstreamRequest.destroy(new Error('stackr_preview_proxy_payload_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    upstreamResponse.on('end', () => {
      finish({
        ok: true,
        status,
        headers: {
          'content-type': upstreamResponse.headers['content-type'],
          'cache-control': upstreamResponse.headers['cache-control'],
          etag: upstreamResponse.headers.etag,
          'x-request-id': upstreamResponse.headers['x-request-id'],
        },
        payload: Buffer.concat(chunks),
      });
    });
  });
  upstreamRequest.on('timeout', () => {
    upstreamRequest.destroy(new Error('stackr_preview_proxy_timeout'));
  });
  upstreamRequest.on('error', () => {
    finish({ ok: false, status: 502 });
  });
  upstreamRequest.end();
}
