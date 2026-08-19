/* eslint-env node */
import { fetchJsonWithPolicy, UpstreamHttpError } from './upstreamJson.js';

const DEFAULT_BASE_URL = 'https://api.pokemontcg.io/v2';
const MAX_PAGE_SIZE = 250;
const DEFAULT_TIMEOUT_MS = Number(process.env.POKEMON_TCG_SEARCH_TIMEOUT_MS || 15_000);
const DEFAULT_MAX_ATTEMPTS = Number(process.env.POKEMON_TCG_MAX_ATTEMPTS || 3);

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function safeQueryValue(value) {
  return String(value ?? '').replace(/([+\-!(){}\[\]^"~*?:\\/])/g, '\\$1');
}

function responseEnvelope(result, resource) {
  const body = result.value;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new UpstreamHttpError(`Pokemon TCG API returned an invalid ${resource} response.`, {
      code: 'pokemon_tcg_invalid_response',
      provider: 'pokemon-tcg-api',
      status: result.status,
    });
  }
  if (!Array.isArray(body.data)) {
    throw new UpstreamHttpError(`Pokemon TCG API response is missing data[].`, {
      code: 'pokemon_tcg_invalid_response',
      provider: 'pokemon-tcg-api',
      status: result.status,
    });
  }

  const page = positiveInteger(body.page, 1);
  const pageSize = positiveInteger(body.pageSize, Math.max(body.data.length, 1), MAX_PAGE_SIZE);
  const count = Number.isInteger(Number(body.count)) ? Number(body.count) : body.data.length;
  const totalCount = Number.isInteger(Number(body.totalCount)) ? Number(body.totalCount) : null;
  if (count !== body.data.length || count < 0 || (totalCount != null && totalCount < count)) {
    throw new UpstreamHttpError(`Pokemon TCG API returned inconsistent pagination metadata.`, {
      code: 'pokemon_tcg_pagination_inconsistent',
      provider: 'pokemon-tcg-api',
      status: result.status,
    });
  }

  return {
    data: body.data,
    page,
    pageSize,
    count,
    totalCount,
    metadata: result.metadata,
  };
}

export function createPokemonTcgApiClient({
  baseUrl = process.env.POKEMON_TCG_API_BASE_URL || DEFAULT_BASE_URL,
  apiKey = process.env.POKEMON_TCG_API_KEY || null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  fetchImpl = globalThis.fetch,
  sleepImpl,
  random,
} = {}) {
  const root = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');

  async function request(path, query = {}) {
    const url = new URL(`${root}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(query)) {
      if (value == null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    const headers = { Accept: 'application/json' };
    const key = clean(apiKey);
    if (key) headers['X-Api-Key'] = key;
    return fetchJsonWithPolicy(url.toString(), {
      provider: 'pokemon-tcg-api',
      headers,
      timeoutMs,
      maxAttempts,
      fetchImpl,
      ...(sleepImpl ? { sleepImpl } : {}),
      ...(random ? { random } : {}),
    });
  }

  async function fetchPage(resource, {
    q = null,
    page = 1,
    pageSize = MAX_PAGE_SIZE,
    orderBy = 'id',
    select = null,
  } = {}) {
    if (resource !== 'cards' && resource !== 'sets') {
      throw new Error(`Unsupported Pokemon TCG API resource: ${resource}`);
    }
    const result = await request(`/${resource}`, {
      q: clean(q),
      page: positiveInteger(page, 1),
      pageSize: positiveInteger(pageSize, MAX_PAGE_SIZE, MAX_PAGE_SIZE),
      orderBy: clean(orderBy),
      select: clean(select),
    });
    return responseEnvelope(result, resource);
  }

  async function fetchAll(resource, options = {}) {
    const pageSize = positiveInteger(options.pageSize, MAX_PAGE_SIZE, MAX_PAGE_SIZE);
    const startPage = positiveInteger(options.page, 1);
    const maxPages = positiveInteger(options.maxPages, 2000, 2000);
    const maxRecords = positiveInteger(options.maxRecords, 100_000, 100_000);
    const records = [];
    const seenIds = new Set();
    let expectedTotal = null;

    for (let page = startPage; page < startPage + maxPages; page += 1) {
      const batch = await fetchPage(resource, { ...options, page, pageSize });
      if (batch.page !== page) {
        throw new UpstreamHttpError(`Pokemon TCG API returned page ${batch.page} while page ${page} was requested.`, {
          code: 'pokemon_tcg_page_mismatch',
          provider: 'pokemon-tcg-api',
          status: 200,
        });
      }
      if (expectedTotal == null) expectedTotal = batch.totalCount;
      if (expectedTotal != null && batch.totalCount != null && batch.totalCount !== expectedTotal) {
        throw new UpstreamHttpError('Pokemon TCG API totalCount changed during pagination.', {
          code: 'pokemon_tcg_total_changed',
          provider: 'pokemon-tcg-api',
          status: 200,
          retryable: true,
        });
      }

      for (const row of batch.data) {
        const id = clean(row?.id);
        if (!id) {
          throw new UpstreamHttpError('Pokemon TCG API returned a record without an id.', {
            code: 'pokemon_tcg_record_id_missing',
            provider: 'pokemon-tcg-api',
            status: 200,
          });
        }
        if (seenIds.has(id)) {
          throw new UpstreamHttpError(`Pokemon TCG API returned duplicate id ${id} across pages.`, {
            code: 'pokemon_tcg_duplicate_record',
            provider: 'pokemon-tcg-api',
            status: 200,
            retryable: true,
          });
        }
        seenIds.add(id);
        records.push(row);
        if (records.length >= maxRecords) return records;
      }

      if (batch.count === 0) break;
      if (batch.totalCount != null && (page * pageSize) >= batch.totalCount) break;
      if (batch.count < pageSize) break;
    }

    if (expectedTotal != null && startPage === 1 && records.length < Math.min(expectedTotal, maxRecords)) {
      throw new UpstreamHttpError(
        `Pokemon TCG API pagination ended at ${records.length} of ${expectedTotal} records.`,
        {
          code: 'pokemon_tcg_pagination_incomplete',
          provider: 'pokemon-tcg-api',
          status: 200,
          retryable: true,
        },
      );
    }
    return records;
  }

  async function getCard(id) {
    const cardId = clean(id);
    if (!cardId) return null;
    const result = await request(`/cards/${encodeURIComponent(cardId)}`);
    return result.value?.data ?? null;
  }

  async function getSet(id) {
    const setId = clean(id);
    if (!setId) return null;
    const result = await request(`/sets/${encodeURIComponent(setId)}`);
    return result.value?.data ?? null;
  }

  return {
    baseUrl: root,
    fetchPage,
    fetchAll,
    getCard,
    getSet,
    fetchCardsBySet: (setId, options = {}) => fetchAll('cards', {
      ...options,
      q: `set.id:${safeQueryValue(setId)}`,
    }),
    fetchSets: (options = {}) => fetchAll('sets', options),
  };
}

export const pokemonTcgApi = createPokemonTcgApiClient();

export const pokemonTcgApiInternals = {
  MAX_PAGE_SIZE,
  positiveInteger,
  responseEnvelope,
  safeQueryValue,
};
