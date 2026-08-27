import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRequireAuthenticatedUser,
  extractBearerToken,
  requireMatchingAuthenticatedUser,
} from '../lib/requestAuth.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('extractBearerToken accepts Bearer tokens and rejects other schemes', () => {
  assert.equal(extractBearerToken({ headers: { authorization: 'Bearer access-token' } }), 'access-token');
  assert.equal(extractBearerToken({ headers: { authorization: 'bearer   access-token  ' } }), 'access-token');
  assert.equal(extractBearerToken({ headers: { authorization: 'Basic abc' } }), null);
  assert.equal(extractBearerToken({ headers: {} }), null);
});

test('authenticated middleware rejects missing and invalid access tokens', async () => {
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: new Error('invalid token') }),
    },
  };
  const warnings = [];
  const middleware = createRequireAuthenticatedUser({
    supabase,
    logger: { warn: (entry) => warnings.push(entry), error: () => {} },
  });

  const missingResponse = responseRecorder();
  await middleware({ headers: {}, stackrRequestId: 'req-missing' }, missingResponse, () => {
    throw new Error('next must not run');
  });
  assert.equal(missingResponse.statusCode, 401);
  assert.equal(missingResponse.body.code, 'authentication_required');
  assert.equal(missingResponse.body.requestId, 'req-missing');

  const invalidResponse = responseRecorder();
  await middleware({
    headers: { authorization: 'Bearer invalid' },
    stackrRequestId: 'req-invalid',
  }, invalidResponse, () => {
    throw new Error('next must not run');
  });
  assert.equal(invalidResponse.statusCode, 401);
  assert.equal(invalidResponse.body.code, 'invalid_access_token');
  assert.equal(warnings.length, 1);
  assert.equal(JSON.stringify(warnings).includes('Bearer invalid'), false, 'access tokens must never be logged');
});

test('authenticated middleware attaches the Supabase-validated user', async () => {
  const expectedUser = { id: 'user-1', email: 'collector@example.com' };
  const middleware = createRequireAuthenticatedUser({
    supabase: {
      auth: {
        getUser: async (token) => {
          assert.equal(token, 'valid-token');
          return { data: { user: expectedUser }, error: null };
        },
      },
    },
    logger: { warn: () => {}, error: () => {} },
  });
  const req = {
    headers: { authorization: 'Bearer valid-token' },
    stackrRequestId: 'req-valid',
  };
  const res = responseRecorder();
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.stackrUser, expectedUser);
  assert.equal(req.stackrAccessToken, 'valid-token');
  assert.equal(res.body, null);
});

test('identity matching rejects a user id supplied for another account', () => {
  const req = {
    stackrUser: { id: 'signed-in-user' },
    stackrRequestId: 'req-mismatch',
    headers: {},
  };
  const res = responseRecorder();
  assert.equal(requireMatchingAuthenticatedUser(req, res, 'different-user', 'buyerId'), false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'identity_mismatch');
  assert.equal(res.body.requestId, 'req-mismatch');
});
