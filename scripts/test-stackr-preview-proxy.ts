import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveStackrApiDeviceIdForRequest,
  STACKR_PREVIEW_PROXY_PREFIX,
  rewriteStackrApiUrlForLoopbackPreview,
  stripStackrPreviewProxyAuthorization,
} from '../lib/stackrPreviewApiProxy';

const {
  isAuthorizedPreviewRead,
  isLoopbackPeerAddress,
} = require('./stackr-preview-proxy-policy.cjs') as {
  isAuthorizedPreviewRead: (
    request: { method: string; headers: { host: string }; socket: { remoteAddress: string } },
    gateway: URL | null,
    upstreamPath: string,
  ) => boolean;
  isLoopbackPeerAddress: (value: string) => boolean;
};

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

async function verifyAnonymousPreviewReadSkipsDeviceStorage() {
  let deviceIdCalls = 0;
  const remoteUrl = 'https://gateway.stackr.test/v1/sets?language=zh-cn&limit=250';
  const requestUrl = rewriteStackrApiUrlForLoopbackPreview(remoteUrl, 'GET', loopback);
  const deviceId = await resolveStackrApiDeviceIdForRequest(remoteUrl, requestUrl, async () => {
    deviceIdCalls += 1;
    return 'device-id-that-must-not-be-used';
  });
  assert.equal(deviceId, null);
  assert.equal(deviceIdCalls, 0);

  const remoteDeviceId = await resolveStackrApiDeviceIdForRequest(remoteUrl, remoteUrl, async () => {
    deviceIdCalls += 1;
    return 'remote-device-id';
  });
  assert.equal(remoteDeviceId, 'remote-device-id');
  assert.equal(deviceIdCalls, 1);

  const apiClientSource = readFileSync('lib/stackrApiV1.ts', 'utf8');
  assert.match(apiClientSource, /resolveStackrApiDeviceIdForRequest\(remoteUrl, requestUrl, this\.getDeviceId\)/);
  assert.match(apiClientSource, /\.\.\.\(deviceId \? \{ 'X-Stackr-Device-Id': deviceId \} : \{\}\)/);
  assert.match(apiClientSource, /createStackrApiFetch\(options\.fetchImpl\)/);
  assert.doesNotMatch(apiClientSource, /options\.fetchImpl \?\? fetch;/);
}

const metro = readFileSync('metro.config.js', 'utf8');
assert.match(metro, /isAuthorizedPreviewRead\(request, gateway, upstreamPath\)/);
assert.match(metro, /parsed\.protocol !== 'https:'/);
assert.match(metro, /new Worker/);
assert.match(metro, /stackr-preview-proxy-worker\.cjs/);
assert.match(metro, /resolveMobileRuntimeConfig\(process\.env\)\.stackrApiUrl/);
assert.match(metro, /existingEnhanceMiddleware/);
assert.doesNotMatch(metro, /Authorization:\s*request\.headers/);

const configuredGateway = new URL('https://gateway.stackr.test');
const loopbackRequest = {
  method: 'GET',
  headers: { host: 'localhost:8081' },
  socket: { remoteAddress: '::ffff:127.0.0.1' },
};
assert.equal(isLoopbackPeerAddress('127.0.0.1'), true);
assert.equal(isLoopbackPeerAddress('::1'), true);
assert.equal(isLoopbackPeerAddress('::ffff:127.0.0.1'), true);
assert.equal(isLoopbackPeerAddress('203.0.113.7'), false);
assert.equal(isAuthorizedPreviewRead(loopbackRequest, configuredGateway, '/sets'), true);
assert.equal(
  isAuthorizedPreviewRead({
    ...loopbackRequest,
    // A forged loopback Host header is not enough: the TCP peer must itself be loopback.
    socket: { remoteAddress: '203.0.113.7' },
  }, configuredGateway, '/sets'),
  false,
);
assert.equal(isAuthorizedPreviewRead({ ...loopbackRequest, method: 'POST' }, configuredGateway, '/sets'), false);
assert.equal(isAuthorizedPreviewRead(loopbackRequest, configuredGateway, '/cards/unapproved'), false);
const worker = readFileSync('scripts/stackr-preview-proxy-worker.cjs', 'utf8');
assert.match(worker, /https\.request/);
assert.match(worker, /agent: false/);
assert.match(worker, /family: 4/);
assert.match(worker, /status >= 300 && status < 400/);
assert.match(worker, /MAX_PAYLOAD_BYTES/);
void verifyAnonymousPreviewReadSkipsDeviceStorage().then(() => {
  console.log('Stackr loopback preview proxy checks passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
