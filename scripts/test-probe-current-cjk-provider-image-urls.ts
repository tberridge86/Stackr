import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runCurrentCjkProviderImageHeadProbe } from './probe-current-cjk-provider-image-urls';
import type { ProbeTransport } from './probe-current-cjk-provider-image-urls';

const source = JSON.stringify({ canonical_variant_id: 'a', language: 'ja', provider_image_url: 'https://assets.tcgdex.net/ja/SV/SV1/001', disposition: 'candidate_url_declared_in_pinned_provider_snapshot' }) + '\n';
const digest = createHash('sha256').update(source).digest('hex');
const headers = (values: Record<string, string> = {}) => ({ get: (key: string) => values[key.toLowerCase()] ?? null });
async function main() {
  let calls = 0;
  const transport: ProbeTransport = async (request) => { calls += 1; assert.equal(request.method, 'HEAD'); assert.equal(request.redirect, 'manual'); assert.equal(request.url, 'https://assets.tcgdex.net/ja/SV/SV1/001/low.webp'); return { status: 200, url: request.url, headers: headers({ 'content-type': 'image/webp', 'content-length': '12' }) }; };
  const available = await runCurrentCjkProviderImageHeadProbe({ probe: true, queueBody: source, queueSha256: digest, transport, concurrency: 1, timeoutMs: 100 });
  assert.equal(calls, 1); assert.equal(available.rows[0].outcome, 'available'); assert.equal(available.rows[0].image_body_downloaded, false);
  await assert.rejects(() => runCurrentCjkProviderImageHeadProbe({ probe: false, queueBody: source, queueSha256: digest, transport }), /exact --probe/);
  await assert.rejects(() => runCurrentCjkProviderImageHeadProbe({ probe: true, queueBody: source, queueSha256: '0'.repeat(64), transport }), /hash verification/);
  const hostile = JSON.stringify({ canonical_variant_id: 'b', language: 'ja', provider_image_url: 'http://assets.tcgdex.net/ja/SV/SV1/001', disposition: 'candidate_url_declared_in_pinned_provider_snapshot' }) + '\n';
  await assert.rejects(() => runCurrentCjkProviderImageHeadProbe({ probe: true, queueBody: hostile, queueSha256: createHash('sha256').update(hostile).digest('hex'), transport }), /allowlist/);
  const redirect: ProbeTransport = async (request) => ({ status: 302, url: request.url, headers: headers({ location: 'https://assets.tcgdex.net/ja/SV/SV1/other/low.webp' }) });
  const redirected = await runCurrentCjkProviderImageHeadProbe({ probe: true, queueBody: source, queueSha256: digest, transport: redirect });
  assert.equal(redirected.rows[0].outcome, 'error'); assert.equal(redirected.rows[0].error_code, 'redirect_target_path_changed');
  const crossHost: ProbeTransport = async (request) => ({ status: 302, url: request.url, headers: headers({ location: 'https://evil.example/x.webp' }) });
  const rejected = await runCurrentCjkProviderImageHeadProbe({ probe: true, queueBody: source, queueSha256: digest, transport: crossHost });
  assert.equal(rejected.rows[0].error_code, 'redirect_target_not_exact_allowlisted_path');
  console.log('Current CJK provider image HEAD probe tests passed.');
}
main().catch((error) => { throw error; });
