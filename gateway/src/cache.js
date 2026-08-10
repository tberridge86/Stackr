import { activateCatalogueCacheVersion, catalogueCacheVersion } from './state.js';

const CACHE_POLICIES = Object.freeze({
  catalogue: { freshSeconds: 60, staleSeconds: 300 },
  search: { freshSeconds: 30, staleSeconds: 120 },
  market: { freshSeconds: 60, staleSeconds: 300 },
});

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

function responseForClient(response, policy, state) {
  const output = new Response(response.body, response);
  output.headers.set('Cache-Control', clientCacheControl(policy));
  output.headers.set('X-Stackr-Cache', state);
  output.headers.delete('X-Stackr-Cache-Stored-At');
  return output;
}

function notModified(request, response, policy, state) {
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
  if (response.status !== 200 || response.headers.has('set-cookie')) return;
  const stored = new Response(response.body, response);
  stored.headers.set('Cache-Control', `public, max-age=${policy.freshSeconds + policy.staleSeconds}`);
  stored.headers.set('X-Stackr-Cache-Stored-At', String(Date.now()));
  stored.headers.delete('Access-Control-Allow-Origin');
  stored.headers.delete('X-Stackr-Cache');
  stored.headers.delete('Vary');
  await cache.put(key, stored);
}

export async function cachedProxy({ request, route, env, ctx, cache, fetchFresh }) {
  const policy = CACHE_POLICIES[route.cache];
  if (!policy || request.headers.has('authorization') || request.headers.has('cookie')) {
    const response = await fetchFresh();
    const output = new Response(response.body, response);
    output.headers.set('Cache-Control', 'no-store');
    output.headers.set('X-Stackr-Cache', 'BYPASS');
    return output;
  }

  let version = await catalogueCacheVersion(env);
  let key = cacheRequest(request, version);
  const cached = await cache.match(key);
  if (cached) {
    const storedAt = Number(cached.headers.get('X-Stackr-Cache-Stored-At') ?? 0);
    const ageSeconds = Math.max(0, (Date.now() - storedAt) / 1000);
    const state = ageSeconds <= policy.freshSeconds ? 'HIT' : 'STALE';
    const conditional = notModified(request, cached, policy, state);
    if (conditional) return conditional;
    if (state === 'STALE') {
      const revalidate = async () => {
        const fresh = await fetchFresh();
        let nextKey = key;
        if (route.id === 'catalogue_manifest' && fresh.ok) {
          const nextVersion = await manifestVersion(fresh);
          if (nextVersion && nextVersion !== version) {
            await activateCatalogueCacheVersion(env, nextVersion);
            nextKey = cacheRequest(request, nextVersion);
          }
        }
        await storeResponse(cache, nextKey, fresh.clone(), policy);
      };
      ctx.waitUntil(revalidate().catch(() => undefined));
    }
    return responseForClient(cached, policy, state);
  }

  const fresh = await fetchFresh();
  if (route.id === 'catalogue_manifest' && fresh.ok) {
    const nextVersion = await manifestVersion(fresh);
    if (nextVersion && nextVersion !== version) {
      await activateCatalogueCacheVersion(env, nextVersion);
      version = nextVersion;
      key = cacheRequest(request, version);
    }
  }
  await storeResponse(cache, key, fresh.clone(), policy);
  const conditional = notModified(request, fresh, policy, 'MISS');
  return conditional ?? responseForClient(fresh, policy, 'MISS');
}
