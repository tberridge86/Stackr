import { activateCatalogueCacheVersion, catalogueCacheVersion } from './state.js';

const CACHE_POLICIES = Object.freeze({
  catalogue: { freshSeconds: 60, staleSeconds: 300 },
  search: { freshSeconds: 30, staleSeconds: 120 },
  market: { freshSeconds: 60, staleSeconds: 300 },
});

// Only public GETs enter this map. Keep flights scoped to the cache instance and
// origin, and share bytes rather than request-owned streams between callers.
const refreshesByCache = new WeakMap();
const MAX_PENDING_REFRESHES = 256;

function sortedQuery(url) {
  return [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
}

function cacheRequest(request, version) {
  const source = new URL(request.url);
  const key = new URL('https://stackr-gateway-cache.invalid');
  key.pathname = source.pathname;
  for (const [name, value] of sortedQuery(source)) key.searchParams.append(name, value);
  key.searchParams.set('__stackr_cache_version', version);
  return new Request(key.toString(), { method: 'GET' });
}

function clientCacheControl(policy) {
  return `public, max-age=${policy.freshSeconds}, stale-while-revalidate=${policy.staleSeconds}, stale-if-error=${policy.staleSeconds}`;
}

function mayStore(response) {
  return response.status === 200
    && !response.headers.has('set-cookie')
    && !/(?:^|,)\s*(?:private|no-store)(?:\s|,|=|$)/i.test(response.headers.get('cache-control') ?? '')
    && !String(response.headers.get('vary') ?? '').split(',').some((value) => value.trim() === '*');
}

function responseForClient(response, policy, state) {
  const output = new Response(response.body, response);
  output.headers.set('Cache-Control', mayStore(response) ? clientCacheControl(policy) : 'no-store');
  output.headers.set('X-Stackr-Cache', state);
  output.headers.delete('X-Stackr-Cache-Stored-At');
  return output;
}

function notModified(request, response, policy, state) {
  if (!mayStore(response)) return null;
  const etag = response.headers.get('etag');
  const candidates = String(request.headers.get('if-none-match') ?? '').split(',').map((item) => item.trim());
  if (!etag || !candidates.includes(etag)) return null;
  return new Response(null, {
    status: 304,
    headers: {
      ETag: etag,
      'Cache-Control': clientCacheControl(policy),
      'X-Stackr-Cache': state,
    },
  });
}

async function manifestVersion(response) {
  try {
    const body = await response.clone().json();
    return body?.data?.currentCatalogueVersion ?? null;
  } catch {
    return null;
  }
}

async function storeResponse(cache, key, response, policy) {
  if (!mayStore(response)) return;
  const stored = new Response(response.body, response);
  stored.headers.set('Cache-Control', `public, max-age=${policy.freshSeconds + policy.staleSeconds}`);
  stored.headers.set('X-Stackr-Cache-Stored-At', String(Date.now()));
  stored.headers.delete('Access-Control-Allow-Origin');
  stored.headers.delete('X-Stackr-Cache');
  stored.headers.delete('Vary');
  await cache.put(key, stored);
}

function restoreResponse(snapshot) {
  return new Response(snapshot.body, {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: snapshot.headers,
  });
}

async function snapshotResponse(response) {
  return {
    body: [204, 205, 304].includes(response.status) ? null : await response.arrayBuffer(),
    status: response.status, statusText: response.statusText,
    headers: [...response.headers.entries()],
  };
}

function refreshOnce({ request, route, env, ctx, cache, fetchFresh, policy, version, key, cached }) {
  let flights = refreshesByCache.get(cache);
  if (!flights) {
    flights = new Map();
    refreshesByCache.set(cache, flights);
  }
  const source = new URL(request.url);
  // Include representation headers in the in-flight identity. Authentication
  // and cookies bypass this function entirely, even on catalogue routes.
  const identity = JSON.stringify([source.origin, route.id, key.url,
    request.headers.get('accept'), request.headers.get('accept-language'),
    request.headers.get('if-none-match')]);
  const pending = flights.get(identity);
  if (pending) return pending.then(async (snapshot) => {
    // Unexpected private/session responses must never be shared with another
    // anonymous caller, even though the route was marked publicly cacheable.
    if (!mayStore(restoreResponse(snapshot))) return snapshotResponse(await fetchFresh());
    return snapshot;
  });

  const retain = flights.size < MAX_PENDING_REFRESHES;
  let task;
  const release = () => {
    if (flights.get(identity) === task) flights.delete(identity);
  };
  task = (async () => {
    let response = await fetchFresh();
    const cachedEtag = cached?.headers.get('etag');
    const requestedTags = String(request.headers.get('if-none-match') ?? '').split(',').map((value) => value.trim());
    if (response.status === 304 && cachedEtag && requestedTags.includes(cachedEtag)
      && (!response.headers.get('etag') || response.headers.get('etag') === cachedEtag)) {
      // The origin confirmed this exact cached entity. Preserve its full body
      // while renewing freshness; never store a bodyless 304 as catalogue data.
      const headers = new Headers(cached.headers);
      for (const [name, value] of response.headers) headers.set(name, value);
      response = new Response(cached.body, { status: 200, headers });
    }
    // Consume inside the originating request context; every caller gets its
    // own Response and cannot consume another caller's stream.
    const snapshot = await snapshotResponse(response);
    const fresh = restoreResponse(snapshot);
    let nextKey = key;
    if (route.id === 'catalogue_manifest' && fresh.ok) {
      const nextVersion = await manifestVersion(fresh);
      if (nextVersion && nextVersion !== version) {
        await activateCatalogueCacheVersion(env, nextVersion);
        nextKey = cacheRequest(request, nextVersion);
      }
    }
    // Cache storage must not delay the response, or make a successful origin
    // read fail. Retain the flight until the write settles to cover that gap.
    const persistence = storeResponse(cache, nextKey, fresh, policy)
      .catch(() => undefined)
      .finally(release);
    ctx.waitUntil(persistence);
    return snapshot;
  })().catch((error) => {
    release();
    throw error;
  });
  if (retain) flights.set(identity, task);
  return task;
}

export async function cachedProxy({ request, route, env, ctx, cache, fetchFresh }) {
  const policy = CACHE_POLICIES[route.cache];
  if (!policy || request.method !== 'GET' || request.headers.has('range') || request.headers.has('authorization') || request.headers.has('cookie')) {
    const response = await fetchFresh();
    const output = new Response(response.body, response);
    output.headers.set('Cache-Control', 'no-store');
    output.headers.set('X-Stackr-Cache', 'BYPASS');
    return output;
  }

  const version = await catalogueCacheVersion(env);
  const key = cacheRequest(request, version);
  // A failed cache read is not a failed catalogue read.
  const cached = await cache.match(key).catch(() => undefined);
  if (cached) {
    const storedAt = Number(cached.headers.get('X-Stackr-Cache-Stored-At') ?? 0);
    const ageSeconds = Number.isFinite(storedAt) && storedAt > 0
      ? Math.max(0, (Date.now() - storedAt) / 1000) : Infinity;
    if (ageSeconds <= policy.freshSeconds + policy.staleSeconds) {
      const state = ageSeconds <= policy.freshSeconds ? 'HIT' : 'STALE';
      if (state === 'STALE') {
        // Schedule refresh BEFORE a possible 304 return. Conditional readers
        // must not keep a stale entry stuck until its hard expiration.
        ctx.waitUntil(refreshOnce({ request, route, env, ctx, cache, fetchFresh,
          policy, version, key, cached: cached.clone() }).catch(() => undefined));
      }
      return notModified(request, cached, policy, state) ?? responseForClient(cached, policy, state);
    }
  }

  const snapshot = await refreshOnce({ request, route, env, ctx, cache, fetchFresh,
    policy, version, key });
  const fresh = restoreResponse(snapshot);
  return notModified(request, fresh, policy, 'MISS') ?? responseForClient(fresh, policy, 'MISS');
}
