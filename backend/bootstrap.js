/* eslint-env node */
import express from 'express';

const originalJson = express.json;

// StackR's main server predates Stripe settlement webhooks and installs one
// global JSON parser. Stripe signature verification needs the exact request
// bytes, so retain a bounded copy only for the webhook route before importing
// the existing server. Ordinary API requests are unaffected.
express.json = function stackrJson(options = {}) {
  const existingVerify = options.verify;
  return originalJson({
    ...options,
    verify(req, res, buffer, encoding) {
      const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
      if (path === '/api/stripe/webhook') {
        req.stackrRawBody = Buffer.from(buffer);
      }
      if (typeof existingVerify === 'function') {
        existingVerify(req, res, buffer, encoding);
      }
    },
  });
};

await import('./server.js');
