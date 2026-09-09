import assert from 'node:assert/strict';
import {
  clearCallbackVerifiedRecoverySession,
  getPasswordResetScreenState,
  hasCallbackVerifiedRecoverySession,
  markCallbackVerifiedRecoverySession,
} from '../lib/passwordResetRecovery';

assert.equal(getPasswordResetScreenState({ checkingLink: true, recoverySessionReady: false }), 'checking');
assert.equal(getPasswordResetScreenState({ checkingLink: false, recoverySessionReady: true }), 'update_password');
assert.equal(getPasswordResetScreenState({ checkingLink: false, recoverySessionReady: false }), 'request_new_link');

clearCallbackVerifiedRecoverySession();
assert.equal(hasCallbackVerifiedRecoverySession('owner'), false);
markCallbackVerifiedRecoverySession('owner', 1_000);
assert.equal(hasCallbackVerifiedRecoverySession('owner', 1_001), true, 'A verified callback may establish a brief recovery intent for the same user.');
assert.equal(hasCallbackVerifiedRecoverySession('other-user', 1_001), false, 'A recovery intent must never authorize another user session.');
markCallbackVerifiedRecoverySession('owner', 1_000);
assert.equal(hasCallbackVerifiedRecoverySession('owner', 1_000 + (5 * 60 * 1000)), false, 'An expired recovery intent must not authorize a session.');
clearCallbackVerifiedRecoverySession();
assert.equal(hasCallbackVerifiedRecoverySession('owner'), false);

console.log('Password reset only exposes update controls after a verified recovery session.');
