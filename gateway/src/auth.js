import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { GatewayError } from './errors.js';

const remoteKeySets = new Map();

function bearerToken(request) {
  const header = String(request.headers.get('authorization') ?? '').trim();
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
}

function issuerFor(supabaseUrl) {
  return `${String(supabaseUrl).replace(/\/$/, '')}/auth/v1`;
}

function keySetFor(issuer) {
  if (!remoteKeySets.has(issuer)) {
    remoteKeySets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)));
  }
  return remoteKeySets.get(issuer);
}

function normalizeClaims(payload) {
  return {
    sub: String(payload.sub ?? ''),
    role: String(payload.role ?? ''),
    sessionId: typeof payload.session_id === 'string' ? payload.session_id : null,
    appMetadata: payload.app_metadata && typeof payload.app_metadata === 'object' ? payload.app_metadata : {},
    raw: payload,
  };
}

async function verifyWithAuthServer(token, env, fetchImpl) {
  const supabaseUrl = String(env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (!publishableKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(env.AUTH_TIMEOUT_MS ?? 2_000));
  try {
    const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publishableKey,
      },
    });
    if (!response.ok) return null;
    const user = await response.json();
    return {
      sub: String(user.id ?? ''),
      role: 'authenticated',
      sessionId: null,
      appMetadata: user.app_metadata && typeof user.app_metadata === 'object' ? user.app_metadata : {},
      raw: { sub: user.id, role: 'authenticated', app_metadata: user.app_metadata ?? {} },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifySupabaseRequest(request, env, options = {}) {
  const token = bearerToken(request);
  if (!token) throw new GatewayError(401, 'authentication_required', 'A Supabase user access token is required.');
  const supabaseUrl = String(env.SUPABASE_URL ?? '').trim();
  if (!supabaseUrl) throw new GatewayError(503, 'auth_unavailable', 'Authentication is not configured.');
  const issuer = issuerFor(supabaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const protectedHeader = decodeProtectedHeader(token);
    if (protectedHeader.alg === 'HS256') {
      const fallback = await verifyWithAuthServer(token, env, fetchImpl);
      if (fallback?.sub) return { token, claims: fallback };
      throw new Error('legacy token rejected');
    }
    const { payload } = await jwtVerify(token, options.jwks ?? keySetFor(issuer), {
      issuer,
      audience: 'authenticated',
      algorithms: ['RS256', 'ES256'],
      clockTolerance: 5,
    });
    const claims = normalizeClaims(payload);
    if (!claims.sub || claims.role !== 'authenticated') throw new Error('missing authenticated subject');
    return { token, claims };
  } catch {
    throw new GatewayError(401, 'invalid_access_token', 'The Supabase access token is invalid or expired.');
  }
}

export function hasAdminRole(claims) {
  const metadata = claims?.appMetadata ?? {};
  const role = String(metadata.role ?? '');
  if (['admin', 'catalog_admin'].includes(role)) return true;
  if (Array.isArray(metadata.roles)) return metadata.roles.some((item) => ['admin', 'catalog_admin'].includes(String(item)));
  if (metadata.roles && typeof metadata.roles === 'object') {
    return Boolean(metadata.roles.admin || metadata.roles.catalog_admin);
  }
  return false;
}

export function requireAdmin(claims) {
  if (!hasAdminRole(claims)) {
    throw new GatewayError(403, 'admin_scope_required', 'This route requires a Stackr administrator role.');
  }
}
