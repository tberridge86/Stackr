import { sendRequestError } from './requestAuth.js';

export function environmentFlagEnabled(flagName, environment = process.env) {
  return String(environment?.[flagName] ?? '').trim().toLowerCase() === 'true';
}

export function createRequireReleaseFeature({ flagName, code, message } = {}) {
  if (!flagName || !code || !message) {
    throw new Error('flagName, code and message are required.');
  }

  return function requireReleaseFeature(req, res, next) {
    if (!environmentFlagEnabled(flagName)) {
      return sendRequestError(req, res, 503, code, message);
    }

    return next();
  };
}
