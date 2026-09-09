export type PasswordResetScreenState = 'checking' | 'update_password' | 'request_new_link';

// The callback has already exchanged a valid recovery link before it routes to
// reset-password, so the original one-time code is intentionally no longer in
// the route. Keep that acknowledgement in process memory, bound to the exact
// recovered user and a short lifetime, rather than trusting a route parameter
// or any ordinary signed-in session.
const CALLBACK_RECOVERY_TTL_MS = 5 * 60 * 1000;
let callbackVerifiedRecoverySession: { userId: string; expiresAt: number } | null = null;

export function markCallbackVerifiedRecoverySession(userId: string, now = Date.now()) {
  callbackVerifiedRecoverySession = { userId, expiresAt: now + CALLBACK_RECOVERY_TTL_MS };
}

export function hasCallbackVerifiedRecoverySession(userId: string, now = Date.now()) {
  const marker = callbackVerifiedRecoverySession;
  if (!marker || marker.userId !== userId || marker.expiresAt <= now) {
    callbackVerifiedRecoverySession = null;
    return false;
  }
  return true;
}

export function clearCallbackVerifiedRecoverySession() {
  callbackVerifiedRecoverySession = null;
}

/** Never expose password-update controls without a verified recovery session. */
export function getPasswordResetScreenState(input: {
  checkingLink: boolean;
  recoverySessionReady: boolean;
}): PasswordResetScreenState {
  if (input.checkingLink) return 'checking';
  return input.recoverySessionReady ? 'update_password' : 'request_new_link';
}
