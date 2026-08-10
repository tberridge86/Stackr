import { GatewayError } from './errors.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function input(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export class GatewayState {
  constructor(ctx) {
    this.ctx = ctx;
    this.storage = ctx.storage;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const payload = await input(request);
    if (path === '/rate') return this.rate(payload);
    if (path === '/idempotency/begin') return this.idempotencyBegin(payload);
    if (path === '/idempotency/commit') return this.idempotencyCommit(payload);
    if (path === '/idempotency/abort') return this.idempotencyAbort(payload);
    if (path === '/circuit/check') return this.circuitCheck();
    if (path === '/circuit/record') return this.circuitRecord(payload);
    if (path === '/catalogue/version') return this.catalogueVersion(payload);
    return json({ error: 'not_found' }, 404);
  }

  async rate(payload) {
    const limit = Math.max(1, Math.min(Number(payload.limit ?? 1), 10000));
    const windowMs = Math.max(1000, Math.min(Number(payload.windowSeconds ?? 60) * 1000, 24 * 60 * 60 * 1000));
    const now = Date.now();
    let result;
    const update = async (transaction) => {
      const previous = await transaction.get('rate');
      const state = !previous || now >= previous.resetAt
        ? { count: 0, resetAt: now + windowMs }
        : previous;
      state.count += 1;
      await transaction.put('rate', state);
      result = {
        allowed: state.count <= limit,
        remaining: Math.max(0, limit - state.count),
        retryAfter: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
        resetAt: state.resetAt,
      };
    };
    if (typeof this.storage.transaction === 'function') await this.storage.transaction(update);
    else await update(this.storage);
    return json(result);
  }

  async idempotencyBegin(payload) {
    const now = Date.now();
    const ttlMs = Math.max(60_000, Math.min(Number(payload.ttlSeconds ?? 86400) * 1000, 7 * 86400 * 1000));
    let record = await this.storage.get('idempotency');
    if (record && record.expiresAt <= now) {
      await this.storage.deleteAll();
      record = null;
    }
    if (record && record.fingerprint !== payload.fingerprint) {
      return json({ state: 'conflict' }, 409);
    }
    if (record?.status === 'complete') return json({ state: 'replay', response: record.response });
    if (record?.status === 'pending' && now - record.createdAt < 120_000) {
      return json({ state: 'pending' }, 409);
    }
    const next = {
      status: 'pending',
      fingerprint: payload.fingerprint,
      createdAt: now,
      expiresAt: now + ttlMs,
    };
    await this.storage.put('idempotency', next);
    await this.storage.setAlarm(next.expiresAt);
    return json({ state: 'new' });
  }

  async idempotencyCommit(payload) {
    const record = await this.storage.get('idempotency');
    if (!record || record.fingerprint !== payload.fingerprint) {
      return json({ state: 'missing' }, 409);
    }
    record.status = 'complete';
    record.response = payload.response;
    record.completedAt = Date.now();
    await this.storage.put('idempotency', record);
    return json({ state: 'complete' });
  }

  async idempotencyAbort(payload) {
    const record = await this.storage.get('idempotency');
    if (record?.fingerprint === payload.fingerprint && record.status === 'pending') {
      await this.storage.deleteAll();
    }
    return json({ state: 'cleared' });
  }

  async circuitCheck() {
    const state = await this.storage.get('circuit');
    const now = Date.now();
    if (state?.openUntil && state.openUntil > now) {
      return json({ open: true, retryAfter: Math.max(1, Math.ceil((state.openUntil - now) / 1000)) });
    }
    return json({ open: false, retryAfter: 0 });
  }

  async circuitRecord(payload) {
    const now = Date.now();
    const previous = await this.storage.get('circuit') ?? { failures: 0, openUntil: 0 };
    if (payload.success) {
      await this.storage.put('circuit', { failures: 0, openUntil: 0, updatedAt: now });
      return json({ open: false });
    }
    const failures = previous.openUntil > 0 && previous.openUntil <= now
      ? 1
      : previous.failures + 1;
    const threshold = Math.max(1, Math.min(Number(payload.threshold ?? 5), 20));
    const openMs = Math.max(1000, Math.min(Number(payload.openSeconds ?? 30) * 1000, 300_000));
    const openUntil = failures >= threshold ? now + openMs : 0;
    await this.storage.put('circuit', { failures, openUntil, updatedAt: now });
    return json({ open: openUntil > now, failures, openUntil });
  }

  async catalogueVersion(payload) {
    const current = await this.storage.get('catalogueVersion');
    if (payload.set) {
      const next = String(payload.set).slice(0, 160);
      const changed = next !== current;
      await this.storage.put('catalogueVersion', next);
      return json({ version: next, changed });
    }
    return json({ version: current ?? 'bootstrap', changed: false });
  }

  async alarm() {
    await this.storage.deleteAll();
  }
}

function stateStub(env, name) {
  if (!env.GATEWAY_STATE) {
    throw new GatewayError(503, 'gateway_state_unavailable', 'Gateway protection state is not configured.');
  }
  if (typeof env.GATEWAY_STATE.getByName === 'function') return env.GATEWAY_STATE.getByName(name);
  return env.GATEWAY_STATE.get(env.GATEWAY_STATE.idFromName(name));
}

export async function stateCall(env, name, path, payload = {}) {
  const response = await stateStub(env, name).fetch(`https://gateway-state${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

export async function enforceRateLimit(env, routeClass, keys, config) {
  let remaining = config.limit;
  let retryAfter = 0;
  for (const [scope, key] of Object.entries(keys)) {
    if (!key) continue;
    const result = await stateCall(env, `rate:${routeClass}:${scope}:${key}`, '/rate', config);
    remaining = Math.min(remaining, Number(result.body.remaining ?? 0));
    retryAfter = Math.max(retryAfter, Number(result.body.retryAfter ?? 0));
    if (!result.body.allowed) {
      throw new GatewayError(429, 'rate_limit_exceeded', 'Too many requests. Try again later.', {
        routeClass,
        retryAfter,
      });
    }
  }
  return { remaining, retryAfter };
}

export async function beginIdempotency(env, identity, key, fingerprint) {
  const result = await stateCall(env, `idempotency:${identity}:${key}`, '/idempotency/begin', {
    fingerprint,
    ttlSeconds: 86400,
  });
  if (result.body.state === 'conflict') {
    throw new GatewayError(409, 'idempotency_key_conflict', 'Idempotency-Key was already used for a different request.');
  }
  if (result.body.state === 'pending') {
    throw new GatewayError(409, 'idempotency_request_pending', 'A request with this Idempotency-Key is still being processed.');
  }
  return result.body;
}

export async function commitIdempotency(env, identity, key, fingerprint, response) {
  await stateCall(env, `idempotency:${identity}:${key}`, '/idempotency/commit', { fingerprint, response });
}

export async function abortIdempotency(env, identity, key, fingerprint) {
  await stateCall(env, `idempotency:${identity}:${key}`, '/idempotency/abort', { fingerprint });
}

export async function catalogueCacheVersion(env) {
  const result = await stateCall(env, 'catalogue-cache-meta', '/catalogue/version');
  return result.body.version ?? 'bootstrap';
}

export async function activateCatalogueCacheVersion(env, version) {
  const result = await stateCall(env, 'catalogue-cache-meta', '/catalogue/version', { set: version });
  return result.body;
}
