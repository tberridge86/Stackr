import { timingSafeEqual } from 'node:crypto';

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''), 'utf8');
  const rightBuffer = Buffer.from(String(right ?? ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function failure(res, status, code, message, requestId) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  res.status(status).json({
    error: {
      code,
      message,
      requestId,
    },
    meta: {
      apiVersion: '1',
      generatedAt: new Date().toISOString(),
    },
  });
}

export function createGatewayOriginAuth(options = {}) {
  const environment = String(options.environment ?? process.env.NODE_ENV ?? 'development').trim().toLowerCase();
  const defaultMode = environment === 'production' ? 'required' : 'disabled';
  const mode = String(options.mode ?? process.env.STACKR_GATEWAY_ORIGIN_AUTH_MODE ?? defaultMode).trim().toLowerCase();
  const expected = String(options.originKey ?? process.env.STACKR_GATEWAY_ORIGIN_KEY ?? '').trim();
  return (req, res, next) => {
    if (mode === 'disabled') return next();
    const requestId = String(req.headers['x-request-id'] ?? '').trim() || 'origin-request';
    if (mode !== 'required' || !expected) {
      failure(res, 503, 'gateway_origin_auth_unconfigured', 'Gateway origin authentication is not configured.', requestId);
      return;
    }
    if (!safeEqual(req.headers['x-stackr-origin-key'], expected)) {
      failure(res, 401, 'gateway_origin_auth_required', 'This Stackr origin route is available through api.stackrtcg.com only.', requestId);
      return;
    }
    next();
  };
}

export default createGatewayOriginAuth;
