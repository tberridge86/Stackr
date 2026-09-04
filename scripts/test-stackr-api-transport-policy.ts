import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeStackrApiBaseUrl } from '../lib/stackrApiTransportPolicy';

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
assert.match(readFileSync('lib/stackrApiV1.ts', 'utf8'), /this\.baseUrl\s*=\s*normalizeStackrApiBaseUrl\(/);
console.log('Stackr API client HTTPS transport policy tests passed.');
