import { extractBearerToken } from './requestAuth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function denied(status, code, error) {
  return { ok: false, status, code, error };
}

// This allowlist is server configuration, never a client parameter or a JWT claim.
export async function authenticateOwnerRecognition(req, { supabase, env = process.env } = {}) {
  if (env.STACKR_OWNER_RECOGNITION_ENABLED !== 'true') {
    return denied(403, 'owner_recognition_disabled', 'Owner recognition is disabled.');
  }
  const ids = String(env.STACKR_OWNER_RECOGNITION_USER_IDS ?? '')
    .split(',').map((id) => id.trim().toLowerCase());
  if (ids.length !== 1 || !UUID.test(ids[0])) {
    return denied(503, 'owner_recognition_unconfigured', 'Owner recognition access is not configured.');
  }
  const token = extractBearerToken(req);
  if (!token) return denied(401, 'authentication_required', 'Sign in is required.');
  if (typeof supabase?.auth?.getUser !== 'function') {
    return denied(503, 'owner_auth_unavailable', 'Owner authentication is unavailable.');
  }
  let result;
  try {
    result = await supabase.auth.getUser(token);
  } catch {
    return denied(503, 'owner_auth_unavailable', 'Owner authentication is unavailable.');
  }
  if (result?.error || !result?.data?.user) {
    return denied(401, 'invalid_access_token', 'The access token is invalid or expired.');
  }
  const user = result.data.user;
  if (user.is_anonymous === true || !ids.includes(String(user.id ?? '').toLowerCase())) {
    return denied(403, 'owner_access_required', 'This feature is limited to its configured owner.');
  }
  return { ok: true, user };
}
