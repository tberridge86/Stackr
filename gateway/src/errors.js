export class GatewayError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorResponse(error, requestId, apiVersion = '1') {
  const status = Number(error?.status ?? 500);
  const publicMessage = status >= 500
    ? 'Stackr API request failed.'
    : String(error?.message ?? 'Stackr API request failed.');
  const body = {
    error: {
      code: String(error?.code ?? (status >= 500 ? 'internal_error' : 'request_error')),
      message: publicMessage,
      requestId,
      ...(status < 500 && error?.details ? { details: error.details } : {}),
    },
    meta: {
      apiVersion,
      generatedAt: new Date().toISOString(),
    },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
      'X-Stackr-Api-Version': apiVersion,
    },
  });
}
