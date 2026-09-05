import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STACKR_PREVIEW_PROXY_PREFIX,
  rewriteStackrApiUrlForLoopbackPreview,
  stripStackrPreviewProxyAuthorization,
} from '../lib/stackrPreviewApiProxy';

const loopback = { development: true, location: { origin: 'http://127.0.0.1:8081', hostname: '127.0.0.1' } } as const;
assert.equal(
  rewriteStackrApiUrlForLoopbackPreview('https://gateway.stackr.test/v1/sets?language=zh-cn', 'GET', loopback),
  `http://127.0.0.1:8081${STACKR_PREVIEW_PROXY_PREFIX}/sets?language=zh-cn`,
);
assert.equal(
  rewriteStackrApiUrlForLoopbackPreview('https://gateway.stackr.test/v1/sets/11111111-1111-4111-8111-111111111111/cards?language=zh-tw', 'GET', loopback),
  `http://127.0.0.1:8081${STACKR_PREVIEW_PROXY_PREFIX}/sets/11111111-1111-4111-8111-111111111111/cards?language=zh-tw`,
);
assert.equal(
  rewriteStackrApiUrlForLoopbackPreview('https://gateway.stackr.test/v1/assets/manifest?limit=20', 'GET', loopback),
  `http://127.0.0.1:8081${STACKR_PREVIEW_PROXY_PREFIX}/assets/manifest?limit=20`,
);
assert.equal(
  rewriteStackrApiUrlForLoopbackPreview('https://gateway.stackr.test/v1/sets?language=zh-cn', 'POST', loopback),
  'https://gateway.stackr.test/v1/sets?language=zh-cn',
);
assert.equal(
  rewriteStackrApiUrlForLoopbackPreview('https://gateway.stackr.test/v1/cards/abc', 'GET', loopback),
  'https://gateway.stackr.test/v1/cards/abc',
);
assert.equal(
  rewriteStackrApiUrlForLoopbackPreview('https://gateway.stackr.test/v1/sets/11111111-1111-4111-8111-111111111111/metadata', 'GET', loopback),
  'https://gateway.stackr.test/v1/sets/11111111-1111-4111-8111-111111111111/metadata',
);
assert.equal(
  rewriteStackrApiUrlForLoopbackPreview('https://gateway.stackr.test/v1/sets?language=zh-cn', 'GET', {
    development: false,
    location: loopback.location,
  }),
  'https://gateway.stackr.test/v1/sets?language=zh-cn',
);
assert.equal(
  rewriteStackrApiUrlForLoopbackPreview('https://gateway.stackr.test/v1/sets?language=zh-cn', 'GET', {
    development: true,
    location: { origin: 'http://preview.stackr.test', hostname: 'preview.stackr.test' },
  }),
  'https://gateway.stackr.test/v1/sets?language=zh-cn',
);
assert.deepEqual(
  stripStackrPreviewProxyAuthorization({
    Accept: 'application/json',
    Authorization: 'Bearer uppercase',
    authorization: 'Bearer lowercase',
    'X-Stackr-Api-Version': '1',
  }),
  {
    Accept: 'application/json',
    'X-Stackr-Api-Version': '1',
  },
);

const metro = readFileSync('metro.config.js', 'utf8');
assert.match(metro, /request\.method !== 'GET'/);
assert.match(metro, /isAllowedPreviewRead/);
assert.match(metro, /parsed\.protocol !== 'https:'/);
assert.match(metro, /new Worker/);
assert.match(metro, /stackr-preview-proxy-worker\.cjs/);
assert.match(metro, /resolveMobileRuntimeConfig\(process\.env\)\.stackrApiUrl/);
assert.match(metro, /existingEnhanceMiddleware/);
assert.doesNotMatch(metro, /Authorization:\s*request\.headers/);
const worker = readFileSync('scripts/stackr-preview-proxy-worker.cjs', 'utf8');
assert.match(worker, /https\.request/);
assert.match(worker, /agent: false/);
assert.match(worker, /family: 4/);
assert.match(worker, /status >= 300 && status < 400/);
assert.match(worker, /MAX_PAYLOAD_BYTES/);
console.log('Stackr loopback preview proxy checks passed.');
