import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { catalogueReadSignal, readCatalogueQuery } from './traceContext.js';

export const SEARCH_IDENTITY_RPC = 'catalogue_search_identity_page_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION = /^[0-9a-f]{32}$/;
const MAX_SELECTOR_READS = 64;
const OPTIONAL_TRANSLATION_MS = 450;
const unavailable = { continuationAvailable: false, unavailableReason: 'search_pagination_unavailable' };

// Bind cursors to the actual deployed algorithm and verified name data. A map
// redeployment must not join an old cursor to a different translation stream.
export const SEARCH_PIPELINE_REVISION = createHash('sha256').update([
  './catalogueSearchPagination.js', './stackrApiV1.js', './cardNameTranslations.js',
  './cardDisplayNames.js', './generated/publishedCardEnglishNames.js',
  './generated/ownerApprovedCardEnglishNames.js',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).join('\n')).digest('hex');

function failure(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
function keyOf(entry) {
  return { entityType: entry.entityType, entityId: entry.entityId };
}
function compareKeys(left, right) {
  return left.entityType.localeCompare(right.entityType) || left.entityId.localeCompare(right.entityId);
}
function validKey(key) {
  return key && ['card', 'set'].includes(key.entityType) && UUID.test(key.entityId);
}
function invalidCursor() {
  return failure(400, 'invalid_search_cursor', 'The search cursor does not match this query.');
}
function fingerprint(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
function decodeCursor(value, queryHash) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(value)) throw invalidCursor();
  let cursor;
  try { cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw invalidCursor(); }
  if (!cursor || cursor.version !== 1 || cursor.queryHash !== queryHash
    || cursor.pipeline !== SEARCH_PIPELINE_REVISION || !REVISION.test(cursor.revision)
    || typeof cursor.strategy !== 'string' || !['base', 'translation'].includes(cursor.nextLane)) throw invalidCursor();
  for (const name of ['base', 'translation']) {
    const lane = cursor[name];
    if (!lane || typeof lane.done !== 'boolean' || (lane.after !== null && !validKey(lane.after))) throw invalidCursor();
  }
  return cursor;
}
function missingFunction(error) {
  return ['PGRST202', '42883'].includes(error?.code)
    && [error.message, error.details].some(value => typeof value === 'string' && value.includes(SEARCH_IDENTITY_RPC));
}
function unavailableError() {
  return failure(503, 'search_pagination_unavailable', 'Further catalogue search results are temporarily unavailable. Please retry.');
}

/**
 * Complete canonical identities are selected before hydration inside the SQL
 * function. Its single JSON result cannot be silently cut by a REST row cap.
 * This is deliberately separate from the legacy first-page-only strategy code.
 */
export async function readCatalogueSearchPage({
  client, input, strategies, translationSelector, verifyTranslation, toResult, toSetResult,
}) {
  const queryHash = fingerprint({ ...input, cursor: undefined, pipeline: SEARCH_PIPELINE_REVISION });
  const cursor = decodeCursor(input.cursor, queryHash);
  const api = typeof client?.schema === 'function' ? client.schema('api') : null;
  if (typeof api?.rpc !== 'function') {
    if (cursor) throw unavailableError();
    return null;
  }
  let revision = cursor?.revision ?? null;
  let readCount = 0;
  const limit = input.limit;
  async function fetchPage(selector, after = null, exclude = null, signal) {
    if (++readCount > MAX_SELECTOR_READS) {
      throw failure(503, 'search_page_budget_exceeded', 'Search could not establish a complete page. Please retry.');
    }
    const { data, error } = await readCatalogueQuery(api.rpc(SEARCH_IDENTITY_RPC, {
      p_selector: selector, p_after: after, p_limit: limit,
      p_expected_revision: revision, p_exclude_selector: exclude,
    }), signal);
    if (error) {
      if (missingFunction(error)) throw unavailableError();
      throw error;
    }
    if (!data || typeof data !== 'object' || !REVISION.test(data.revision)
      || !Array.isArray(data.entries) || data.entries.length > limit || typeof data.hasMore !== 'boolean') {
      throw failure(502, 'invalid_search_page', 'Catalogue search returned an inconsistent page.');
    }
    if (revision && data.revision !== revision) {
      throw failure(409, 'search_catalogue_changed', 'The catalogue changed. Restart this search.');
    }
    revision = data.revision;
    if (data.hasMore && data.entries.length === 0) {
      throw failure(502, 'invalid_search_page', 'Catalogue search did not advance.');
    }
    let previous = after;
    for (const entry of data.entries) {
      if (!validKey(entry) || (previous && compareKeys(previous, entry) >= 0)
        || (entry.entityType === 'card' && entry.cardRow?.variant_id !== entry.entityId)
        || (entry.entityType === 'set' && (entry.setRow?.set_id ?? entry.setRow?.id) !== entry.entityId)) {
        throw failure(502, 'invalid_search_page', 'Catalogue search returned inconsistent identities.');
      }
      const row = entry.entityType === 'card' ? entry.cardRow : entry.setRow;
      if ((input.language && row.language_code !== input.language)
        || (input.setId && (entry.entityType === 'card' ? row.set_id : entry.entityId) !== input.setId)) {
        throw failure(502, 'invalid_search_page', 'Catalogue search returned an identity outside its scope.');
      }
      previous = entry;
    }
    return data;
  }

  let strategy;
  let initialPage;
  try {
    if (cursor) {
      strategy = strategies.find(item => item.id === cursor.strategy);
      if (!strategy) throw invalidCursor();
      strategy = { ...strategy, selector: await strategy.select() };
      if (!strategy.selector) throw invalidCursor();
      if (cursor.selectorHash !== fingerprint(strategy.selector)) throw invalidCursor();
    } else {
      for (const candidate of strategies) {
        const selector = await candidate.select();
        if (!selector) continue;
        const page = await fetchPage(selector);
        if (page.entries.length) {
          strategy = { ...candidate, selector };
          initialPage = page;
          break;
        }
      }
    }
  } catch (error) {
    if (!cursor && error.code === 'search_pagination_unavailable') return null;
    throw error;
  }
  if (!strategy) {
    return { results: [], pagination: { limit, nextCursor: null, continuationAvailable: true } };
  }

  function lane(selector, state, page, translated = false, exclude = null) {
    let entries = page?.entries ?? [];
    let offset = 0;
    let pageHasMore = page?.hasMore ?? true;
    let loaded = Boolean(page);
    const current = { after: state?.after ?? null, done: state?.done ?? false };
    async function peek(signal) {
      while (!current.done) {
        if (offset >= entries.length) {
          if (loaded && !pageHasMore) { current.done = true; break; }
          const response = await fetchPage(selector, current.after, exclude, signal);
          entries = response.entries;
          pageHasMore = response.hasMore;
          offset = 0;
          loaded = true;
          if (!entries.length) { current.done = true; break; }
        }
        const entry = entries[offset];
        const result = translated ? verifyTranslation(entry.cardRow)
          : entry.entityType === 'set' ? toSetResult(entry.setRow, strategy)
            : toResult(entry.cardRow, strategy, entry);
        if (result) return result;
        current.after = keyOf(entry);
        offset++;
      }
      return null;
    }
    function consume() {
      current.after = keyOf(entries[offset++]);
      if (offset >= entries.length && !pageHasMore) current.done = true;
    }
    return { current, peek, consume };
  }

  const translatedBase = strategy.id === 'translations';
  const base = lane(strategy.selector, cursor?.base, initialPage, translatedBase);
  let translation = null;
  let continuationAvailable = true;
  let translationTimer;
  const translationController = new AbortController();
  const translationDeadline = new Promise((_, reject) => {
    if (!translatedBase && strategy.includeTranslations && translationSelector) {
      translationTimer = setTimeout(() => {
        translationController.abort();
        reject(unavailableError());
      }, OPTIONAL_TRANSLATION_MS);
    }
  });
  // The same deadline covers every optional candidate page and consumes late
  // failures even when the stored lane fills the response before it expires.
  void translationDeadline.catch(() => undefined);
  async function optionalTranslation(read) {
    try { return await Promise.race([read(), translationDeadline]); }
    catch (error) {
      catalogueReadSignal()?.throwIfAborted();
      if (error.code === 'search_catalogue_changed') throw error;
      if (cursor) throw unavailableError();
      continuationAvailable = false;
      translation = null;
      translationController.abort();
      return null;
    }
  }
  try {
    if (!translatedBase && strategy.includeTranslations && translationSelector) {
      const page = cursor?.translation.done ? null : await optionalTranslation(() =>
        fetchPage(translationSelector, cursor?.translation.after ?? null, strategy.selector, translationController.signal));
      if (continuationAvailable) translation = lane(translationSelector, cursor?.translation, page, true, strategy.selector);
    }
    async function peek(name) {
      if (name === 'base') return base.peek();
      return translation ? optionalTranslation(() => translation.peek(translationController.signal)) : null;
    }
    let nextLane = cursor?.nextLane ?? 'base';
    const results = [];
    const seen = new Set();
    while (results.length < limit) {
      let selectedName = nextLane;
      let result = await peek(selectedName);
      if (!result) {
        selectedName = selectedName === 'base' ? 'translation' : 'base';
        result = await peek(selectedName);
      }
      if (!result) break;
      const id = result.type + ':' + (result.variantId ?? result.setId);
      if (seen.has(id)) throw failure(502, 'invalid_search_page', 'Catalogue search repeated a canonical identity.');
      seen.add(id);
      results.push(result);
      (selectedName === 'base' ? base : translation).consume();
      nextLane = selectedName === 'base' ? 'translation' : 'base';
    }
    // hasMore in the SQL page already proves unconsumed candidate work. Do not
    // dispatch another full identity page merely to peek across a page boundary.
    const hasMore = !base.current.done || Boolean(translation && !translation.current.done);
    const nextCursor = continuationAvailable && hasMore ? Buffer.from(JSON.stringify({
      version: 1, queryHash, pipeline: SEARCH_PIPELINE_REVISION, revision,
      strategy: strategy.id, selectorHash: fingerprint(strategy.selector),
      nextLane, base: base.current,
      translation: translation?.current ?? { after: null, done: true },
    })).toString('base64url') : null;
    return { results, pagination: { limit, nextCursor,
      ...(continuationAvailable ? { continuationAvailable: true } : unavailable) } };
  } finally {
    clearTimeout(translationTimer);
    translationController.abort();
  }
}
