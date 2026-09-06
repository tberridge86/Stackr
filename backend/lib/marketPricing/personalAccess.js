import { ApiError, requestIdFrom } from '../stackrApiV1.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PERSONAL_PRICING_CACHE_CONTROL = 'private, no-store';

function pathOf(path) {
  try { return decodeURIComponent(String(path ?? '').split('?')[0]); } catch { return ''; }
}

export function isV1PricingPath(path) {
  const value = pathOf(path).replace(/^\/v1(?=\/)/i, '');
  return /^\/market(?:\/|$)/i.test(value)
    || /^\/cards\/[^/]+\/price(?:-history|-refresh)?\/?$/i.test(value);
}

export function isLegacyPricingPath(path) {
  return /^\/(?:api\/(?:pricing|price|poketrace|pokemon-price-tracker)(?:\/|$)|price(?:\/|$)|market\/(?:cards|products)(?:\/|$)|api\/foreign\/cards\/[^/]+\/prices(?:\/|$))/i.test(pathOf(path));
}

export function personalPricingConfiguration(env = process.env) {
  const mode = String(env.STACKR_PRICING_ACCESS_MODE ?? 'personal').trim().toLowerCase();
  if (mode === 'public') return { mode, ownerId: null };
  if (mode !== 'personal') throw new ApiError(503, 'pricing_access_unconfigured', 'Pricing access is not configured.');
  const ownerId = String(env.STACKR_PRICING_OWNER_USER_ID ?? '').trim().toLowerCase();
  if (!UUID.test(ownerId)) throw new ApiError(503, 'pricing_owner_unconfigured', 'Personal pricing account is not configured.');
  return { mode, ownerId };
}

function bearerToken(req) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(String(req.headers.authorization ?? '').trim());
  return match?.[1] ?? null;
}

export async function verifiedPricingUserId(req, supabase) {
  const token = bearerToken(req);
  if (!token) throw new ApiError(401, 'authentication_required', 'Sign in to view or refresh your prices.');
  if (typeof supabase?.auth?.getUser !== 'function') throw new ApiError(503, 'pricing_auth_unavailable', 'Account verification is unavailable.');
  let result;
  try { result = await supabase.auth.getUser(token); }
  catch { throw new ApiError(503, 'pricing_auth_unavailable', 'Account verification is unavailable.'); }
  const user = result?.data?.user;
  if (result?.error || !UUID.test(String(user?.id ?? ''))) {
    throw new ApiError(401, 'invalid_access_token', 'Your sign-in session is not valid.');
  }
  if (user.is_anonymous === true) throw new ApiError(403, 'pricing_owner_required', 'Personal pricing is available only to its owner.');
  return user.id.toLowerCase();
}

/** Caller identity must come from server verification, never a forwarded ID or admin claim. */
export function createPersonalPricingMiddleware({
  env = process.env,
  matchesPath = isV1PricingPath,
  getAuthenticatedUserId,
} = {}) {
  return async (req, res, next) => {
    if (!matchesPath(req.path)) return next();
    // Even a failed or misconfigured personal request must not enter a shared cache.
    if (String(env.STACKR_PRICING_ACCESS_MODE ?? 'personal').trim().toLowerCase() !== 'public') {
      res.locals.personalPricing = true;
      res.setHeader('Cache-Control', PERSONAL_PRICING_CACHE_CONTROL);
      res.vary('Authorization');
    }
    try {
      const config = personalPricingConfiguration(env);
      if (config.mode === 'public') return next();
      if (!bearerToken(req)) throw new ApiError(401, 'authentication_required', 'Sign in to view or refresh your prices.');
      const userId = await getAuthenticatedUserId(req);
      if (!UUID.test(String(userId ?? '')) || userId.toLowerCase() !== config.ownerId) {
        throw new ApiError(403, 'pricing_owner_required', 'Personal pricing is available only to its owner.');
      }
      res.locals.pricingUserId = userId.toLowerCase();
      next();
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 503;
      res.status(status).json({ error: {
        code: error instanceof ApiError ? error.code : 'pricing_auth_unavailable',
        message: status >= 500 ? 'Personal pricing is temporarily unavailable.' : error.message,
        requestId: req.stackrRequestId ?? requestIdFrom(req),
      }, meta: { apiVersion: '1', generatedAt: new Date().toISOString() } });
    }
  };
}
