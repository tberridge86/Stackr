import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateOwnerRecognition } from '../lib/ownerRecognitionAccess.js';
import { requireScanLabAdmin } from '../routes/scanLab.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const env = {
  STACKR_OWNER_RECOGNITION_ENABLED: 'true',
  STACKR_OWNER_RECOGNITION_USER_IDS: owner,
};
const req = { headers: { authorization: 'Bearer opaque-access-token' } };
const client = (user, error = null) => ({ auth: { getUser: async (token) => {
  assert.equal(token, 'opaque-access-token');
  return { data: { user }, error };
} } });
const recorder = () => ({ statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('verified configured owner needs no profile role or admin claim', async () => {
  const user = { id: owner };
  assert.deepEqual(await authenticateOwnerRecognition(req, { env, supabase: client(user) }), { ok: true, user });
});

test('nonowner admin and user-editable owner claims cannot grant access', async () => {
  for (const user of [
    { id: other, app_metadata: { stackr_admin: true } },
    { id: other, user_metadata: { role: 'admin', owner: true, id: owner } },
    { id: owner, is_anonymous: true },
  ]) {
    const result = await authenticateOwnerRecognition(req, { env, supabase: client(user) });
    assert.equal(result.status, 403);
    assert.equal(result.code, 'owner_access_required');
  }
});

test('disabled and invalid allowlist fail closed before contacting auth', async () => {
  const supabase = { auth: { getUser: () => { throw new Error('must not call'); } } };
  for (const ids of ['', 'not-a-uuid', `${owner},`, `${owner},not-a-uuid`, `${owner},${other}`]) {
    const result = await authenticateOwnerRecognition(req, {
      env: { ...env, STACKR_OWNER_RECOGNITION_USER_IDS: ids }, supabase,
    });
    assert.equal(result.status, 503);
    assert.equal(result.code, 'owner_recognition_unconfigured');
  }
  assert.equal((await authenticateOwnerRecognition(req, { env: {}, supabase })).code, 'owner_recognition_disabled');
});

test('missing, invalid and expired tokens are denied even if auth returns user data', async () => {
  assert.equal((await authenticateOwnerRecognition({ headers: {} }, { env })).status, 401);
  for (const error of [{ message: 'invalid token' }, { message: 'expired token' }]) {
    const result = await authenticateOwnerRecognition(req, { env, supabase: client({ id: owner }, error) });
    assert.equal(result.status, 401);
    assert.equal(result.code, 'invalid_access_token');
  }
  assert.equal((await authenticateOwnerRecognition(req, { env, supabase: client(null) })).status, 401);
});

test('auth outages fail closed with a redacted response', async () => {
  for (const supabase of [undefined, { auth: { getUser: async () => { throw new Error('secret upstream detail'); } } }]) {
    const result = await authenticateOwnerRecognition(req, { env, supabase });
    assert.equal(result.status, 503);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});

test('scan lab owner mode permits owner and rejects other admins', async () => {
  const supabase = client({ id: owner });
  const response = recorder();
  const access = await requireScanLabAdmin(req, response, { env, supabase, uploadsEnabled: true });
  assert.equal(access.user.id, owner);
  assert.equal(access.supabase, supabase);
  const denied = recorder();
  assert.equal(await requireScanLabAdmin(req, denied, {
    env, supabase: client({ id: other, app_metadata: { stackr_admin: true } }), uploadsEnabled: true,
  }), null);
  assert.equal(denied.statusCode, 403);
});

test('scan lab preserves disabled uploads and legacy trusted admin mode', async () => {
  const denied = recorder();
  assert.equal(await requireScanLabAdmin(req, denied, { env, uploadsEnabled: false }), null);
  assert.equal(denied.statusCode, 403);
  const access = await requireScanLabAdmin(req, recorder(), {
    env: {}, supabase: client({ id: other, app_metadata: { stackr_admin: true } }), uploadsEnabled: true,
  });
  assert.equal(access.user.id, other, 'legacy admin access must not reference an undefined profile');
});

test('scan lab owner mode returns safe failures for missing configuration and invalid auth', async () => {
  for (const [options, status] of [
    [{ env: { STACKR_OWNER_RECOGNITION_ENABLED: 'true' }, supabase: client({ id: owner }) }, 503],
    [{ env, supabase: client(null, { message: 'expired' }) }, 401],
  ]) {
    const response = recorder();
    assert.equal(await requireScanLabAdmin(req, response, { ...options, uploadsEnabled: true }), null);
    assert.equal(response.statusCode, status);
  }
});
