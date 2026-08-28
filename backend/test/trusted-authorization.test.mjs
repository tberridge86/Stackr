import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { hasTrustedStackrAdminClaim } from '../lib/trustedAuthorization.js';

test('only an exact trusted app_metadata claim grants Stackr admin access', () => {
  assert.equal(hasTrustedStackrAdminClaim({ app_metadata: { stackr_admin: true } }), true);
  assert.equal(hasTrustedStackrAdminClaim({ app_metadata: { stackr_admin: false } }), false);
  assert.equal(hasTrustedStackrAdminClaim({ app_metadata: { stackr_admin: 'true' } }), false);
  assert.equal(hasTrustedStackrAdminClaim({ user_metadata: { stackr_admin: true } }), false);
  assert.equal(hasTrustedStackrAdminClaim({ role: 'admin' }), false);
  assert.equal(hasTrustedStackrAdminClaim(null), false);
});

test('privileged recognition routes do not trust the client-editable profiles role', () => {
  for (const route of [
    'recognitionFeedback.js',
    'recognitionShadowMode.js',
    'scanLab.js',
  ]) {
    const source = readFileSync(new URL(`../routes/${route}`, import.meta.url), 'utf8');
    assert.match(source, /hasTrustedStackrAdminClaim\(/, route);
    assert.doesNotMatch(source, /\.select\(['"]id, role['"]\)/, route);
    assert.doesNotMatch(source, /profile\?\.role\s*!==\s*['"]admin['"]/, route);
  }
});
