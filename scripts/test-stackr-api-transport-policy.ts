import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createStackrApiFetch,
  normalizeStackrApiBaseUrl,
} from '../lib/stackrApiTransportPolicy';

for (const baseUrl of [
  'http://api.stackr.test/v1',
  'https://user:password@api.stackr.test/v1',
  'https://api.stackr.test/v1?transport=http',
  'https://api.stackr.test/v1#insecure',
  '/v1',
  '',
]) {
  assert.throws(() => normalizeStackrApiBaseUrl(baseUrl), /HTTPS|query or fragment/);
}

assert.equal(normalizeStackrApiBaseUrl('https://api.stackr.test/v1/'), 'https://api.stackr.test/v1');
const clientSource = readFileSync('lib/stackrApiV1.ts', 'utf8');
assert.match(clientSource, /this\.baseUrl\s*=\s*normalizeStackrApiBaseUrl\(/);
assert.match(clientSource, /this\.fetchImpl\s*=\s*createStackrApiFetch\(options\.fetchImpl\)/);
assert.match(clientSource, /this\.fetchImpl\(requestUrl, \{\s*\.\.\.init,\s*headers: requestHeaders,/s);
assert.match(clientSource, /sets\(query:[\s\S]*?init: RequestInit = \{\}\)[\s\S]*?this\.request<\{ sets: StackrSet\[\] \}>\('\/sets', query, init\)/);

async function verifyLazyFetchAndSignalForwarding() {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let observedSignal: AbortSignal | null = null;
  let replacementCalls = 0;
  try {
    globalThis.fetch = (async () => {
      throw new Error('the fetch present at client construction must not be retained');
    }) as typeof fetch;
    const lazyFetch = createStackrApiFetch();
    globalThis.fetch = (async (_input, init) => {
      replacementCalls += 1;
      observedSignal = init?.signal ?? null;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    await lazyFetch('https://api.stackr.test/v1/sets', { signal: controller.signal });
    assert.equal(replacementCalls, 1);
    assert.equal(observedSignal, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void verifyLazyFetchAndSignalForwarding().then(() => {
  console.log('Stackr API client HTTPS transport policy tests passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
