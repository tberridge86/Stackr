/* eslint-env node */

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

export function requestIdFrom(req) {
  return clean(req?.stackrRequestId)
    ?? clean(req?.headers?.['x-request-id'])
    ?? null;
}

export function extractBearerToken(req) {
  const header = clean(req?.headers?.authorization);
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return clean(match?.[1]);
}

export function sendRequestError(req, res, status, code, message, details = undefined) {
  const requestId = requestIdFrom(req);
  const body = {
    error: message,
    code,
    requestId,
  };
  if (details !== undefined) body.details = details;
  return res.status(status).json(body);
}

export function createRequireAuthenticatedUser({ supabase, logger = console } = {}) {
  if (!supabase?.auth || typeof supabase.auth.getUser !== 'function') {
    throw new Error('A Supabase client with auth.getUser is required.');
  }

  return async function requireAuthenticatedUser(req, res, next) {
    const token = extractBearerToken(req);
    if (!token) {
      return sendRequestError(
        req,
        res,
        401,
        'authentication_required',
        'Sign in is required for this request.',
      );
    }

    try {
      const { data, error } = await supabase.auth.getUser(token);
      const user = data?.user ?? null;
      if (error || !user?.id) {
        logger.warn?.({
          event: 'stackr_auth_rejected',
          requestId: requestIdFrom(req),
          reason: error?.message ?? 'missing_user',
        });
        return sendRequestError(
          req,
          res,
          401,
          'invalid_access_token',
          'Your sign-in session is invalid or has expired.',
        );
      }

      req.stackrUser = user;
      req.stackrAccessToken = token;
      return next();
    } catch (error) {
      logger.error?.({
        event: 'stackr_auth_dependency_failed',
        requestId: requestIdFrom(req),
        error: error instanceof Error ? error.message : String(error),
      });
      return sendRequestError(
        req,
        res,
        503,
        'authentication_unavailable',
        'Sign-in verification is temporarily unavailable.',
      );
    }
  };
}

export function authenticatedUserId(req) {
  return clean(req?.stackrUser?.id);
}

export function requireMatchingAuthenticatedUser(req, res, suppliedUserId, fieldName = 'userId') {
  const authenticatedId = authenticatedUserId(req);
  if (!authenticatedId) {
    sendRequestError(
      req,
      res,
      401,
      'authentication_required',
      'Sign in is required for this request.',
    );
    return false;
  }

  const supplied = clean(suppliedUserId);
  if (supplied && supplied !== authenticatedId) {
    sendRequestError(
      req,
      res,
      403,
      'identity_mismatch',
      `${fieldName} does not match the signed-in account.`,
    );
    return false;
  }

  return true;
}

export const requestAuthInternals = { clean };
