import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRequireReleaseFeature,
  environmentFlagEnabled,
} from '../lib/releaseFeatureGate.js';

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

test('release feature flags require an explicit true value', () => {
  assert.equal(environmentFlagEnabled('FEATURE', {}), false);
  assert.equal(environmentFlagEnabled('FEATURE', { FEATURE: 'false' }), false);
  assert.equal(environmentFlagEnabled('FEATURE', { FEATURE: '1' }), false);
  assert.equal(environmentFlagEnabled('FEATURE', { FEATURE: ' TRUE ' }), true);
});

test('disabled release features fail closed before their handlers run', () => {
  const flagName = 'STACKR_TEST_RELEASE_FEATURE';
  delete process.env[flagName];
  const middleware = createRequireReleaseFeature({
    flagName,
    releaseApproved: true,
    code: 'feature_disabled',
    message: 'Feature is disabled.',
  });
  const res = responseRecorder();

  middleware({ headers: {}, stackrRequestId: 'req-disabled' }, res, () => {
    throw new Error('next must not run');
  });

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    error: 'Feature is disabled.',
    code: 'feature_disabled',
    requestId: 'req-disabled',
  });
});

test('an environment flag cannot override a missing source-code approval', () => {
  const flagName = 'STACKR_TEST_RELEASE_FEATURE';
  process.env[flagName] = 'true';
  const middleware = createRequireReleaseFeature({
    flagName,
    code: 'feature_disabled',
    message: 'Feature is disabled.',
  });
  const res = responseRecorder();

  try {
    middleware({ headers: {}, stackrRequestId: 'req-code-locked' }, res, () => {
      throw new Error('next must not run');
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'feature_disabled');
    assert.equal(res.body.requestId, 'req-code-locked');
  } finally {
    delete process.env[flagName];
  }
});

test('source approval and environment flag together continue the protected chain', () => {
  const flagName = 'STACKR_TEST_RELEASE_FEATURE';
  process.env[flagName] = 'true';
  const middleware = createRequireReleaseFeature({
    flagName,
    releaseApproved: true,
    code: 'feature_disabled',
    message: 'Feature is disabled.',
  });
  const res = responseRecorder();
  let nextCalled = false;

  try {
    middleware({ headers: {} }, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(res.body, null);
  } finally {
    delete process.env[flagName];
  }
});
