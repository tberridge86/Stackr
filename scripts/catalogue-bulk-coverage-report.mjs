const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COUNT_FIELDS = ['total', 'supported', 'mapped', 'unmapped', 'priced', 'stale', 'missing_quote', 'retry', 'unsupported'];
const GROUP_STATUSES = new Set(['pending', 'running', 'failed', 'unmapped', 'complete']);
const RUN_STATUSES = new Set(['not_started', 'partial', 'needs_mapping', 'complete']);

function fail(message) {
  throw new Error(`Invalid catalogue bulk coverage page: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${name} must be a non-negative safe integer`);
  return value;
}

function sumCounts(left, right, name) {
  const total = left + right;
  if (!Number.isSafeInteger(total)) fail(`${name} exceeds the safe integer range`);
  return total;
}

function uuid(value, name) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(`${name} must be a UUID`);
  return value.toLowerCase();
}

function timestamp(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) fail(`${name} must be an ISO timestamp`);
  return value;
}

function normaliseCatalogueVersions(value) {
  if (!Array.isArray(value)) fail('catalogueVersions must be an array');
  const versions = value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.language_code !== 'string' || !entry.language_code.trim()) {
      fail(`catalogueVersions[${index}].language_code must be a non-empty string`);
    }
    return { language_code: entry.language_code, id: uuid(entry.id, `catalogueVersions[${index}].id`) };
  }).sort((a, b) => a.language_code.localeCompare(b.language_code) || a.id.localeCompare(b.id));
  if (new Set(versions.map((entry) => entry.language_code)).size !== versions.length) {
    fail('catalogueVersions must contain one version per language');
  }
  return versions;
}

function normaliseCards(value) {
  if (!Array.isArray(value)) fail('cards must be an array');
  const keys = new Set();
  return value.map((card, index) => {
    if (!isRecord(card) || typeof card.language_code !== 'string' || !card.language_code.trim()) {
      fail(`cards[${index}].language_code must be a non-empty string`);
    }
    const result = { language_code: card.language_code, set_id: uuid(card.set_id, `cards[${index}].set_id`) };
    for (const field of COUNT_FIELDS) result[field] = safeCount(card[field], `cards[${index}].${field}`);
    if (COUNT_FIELDS.some((field) => result[field] > result.total)) fail(`cards[${index}] count exceeds total`);
    if (result.stale > result.priced) fail(`cards[${index}].stale cannot exceed priced`);
    if (result.supported + result.unsupported !== result.total) fail(`cards[${index}].supported plus unsupported must equal total`);
    const key = `${result.language_code}\u0000${result.set_id}`;
    if (keys.has(key)) fail(`cards contains duplicate language_code:set_id (${result.language_code}:${result.set_id})`);
    keys.add(key);
    return result;
  });
}

function normaliseHealth(health, runId) {
  if (!isRecord(health)) throw new Error('A durable catalogue bulk health ledger is required');
  if (uuid(health.runId, 'health.runId') !== runId) throw new Error('Health ledger runId does not match coverage runId');
  if (!Array.isArray(health.groups)) throw new Error('Health ledger groups must be an array');
  if (!RUN_STATUSES.has(health.runStatus)) throw new Error('Health ledger runStatus is invalid');
  const groups = health.groups.map((group, index) => {
    if (!isRecord(group)) throw new Error(`Health ledger groups[${index}] must be an object`);
    const category_id = safeCount(group.categoryId, `health.groups[${index}].categoryId`);
    if (category_id < 1) throw new Error(`Health ledger groups[${index}].categoryId must be positive`);
    if (!GROUP_STATUSES.has(group.status)) throw new Error(`Health ledger groups[${index}].status is invalid`);
    return { category_id, status: group.status, total: safeCount(group.total, `health.groups[${index}].total`) };
  });
  return { groups, openRepairs: safeCount(health.openRepairs, 'health.openRepairs') };
}

export function deriveCatalogueBulkCoverageRunStatus(groups, cards, openRepairs) {
  if (!groups.length) return 'not_started';
  if (groups.some((group) => ['pending', 'running', 'failed'].includes(group.status))) return 'partial';
  if (groups.some((group) => group.status === 'unmapped') || cards.some((card) => card.unmapped > 0) || openRepairs > 0) return 'needs_mapping';
  return 'complete';
}

export async function readPagedCatalogueBulkCoverage({ readPage, health, runId, pageLimit = 2000, maxPages = 100 }) {
  if (typeof readPage !== 'function') throw new TypeError('readPage must be a function');
  const canonicalRunId = uuid(runId, 'runId');
  if (!Number.isSafeInteger(pageLimit) || pageLimit < 1 || pageLimit > 5000) throw new RangeError('pageLimit must be an integer from 1 to 5000');
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new RangeError('maxPages must be an integer from 1 to 100');
  const ledger = normaliseHealth(health, canonicalRunId);
  const merged = new Map();
  let after = null;
  let pages = 0;
  let scanned = 0;
  let expectedVersions = null;
  let observedAtBegin = null;
  let observedAtEnd = null;

  while (pages < maxPages) {
    let page;
    try {
      page = await readPage({ after, limit: pageLimit, runId: canonicalRunId });
    } catch (error) {
      throw new Error(`Catalogue bulk coverage page request failed: ${error?.message ?? String(error)}`, { cause: error });
    }
    if (!isRecord(page)) fail('page must be an object');
    if (uuid(page.runId, 'runId') !== canonicalRunId) fail('runId changed while paging');
    const pageScanned = safeCount(page.scanned, 'scanned');
    if (pageScanned > pageLimit) fail('scanned exceeds requested page limit');
    if (typeof page.complete !== 'boolean') fail('complete must be a boolean');
    const versions = normaliseCatalogueVersions(page.catalogueVersions);
    const versionKey = JSON.stringify(versions);
    if (expectedVersions !== null && expectedVersions !== versionKey) fail('catalogueVersions changed while paging');
    expectedVersions ??= versionKey;
    const observedAt = timestamp(page.observedAt, 'observedAt');
    observedAtBegin ??= observedAt;
    if (Date.parse(observedAt) < Date.parse(observedAtEnd ?? observedAt)) fail('observedAt regressed while paging');
    observedAtEnd = observedAt;
    const cards = normaliseCards(page.cards);
    const versionLanguages = new Set(versions.map((version) => version.language_code));
    for (const card of cards) {
      if (!versionLanguages.has(card.language_code)) fail(`cards language ${card.language_code} is absent from catalogueVersions`);
    }
    for (const card of cards) {
      const key = `${card.language_code}\u0000${card.set_id}`;
      const current = merged.get(key) ?? { language_code: card.language_code, set_id: card.set_id, ...Object.fromEntries(COUNT_FIELDS.map((field) => [field, 0])) };
      for (const field of COUNT_FIELDS) current[field] = sumCounts(current[field], card[field], `merged ${field}`);
      merged.set(key, current);
    }
    pages += 1;
    scanned = sumCounts(scanned, pageScanned, 'scanned');
    if (page.complete) {
      if (pageScanned >= pageLimit) fail('terminal page must scan fewer rows than the requested page limit');
      if (pageScanned === 0) {
        if (page.nextAfter !== null || cards.length !== 0) fail('empty terminal page must have null nextAfter and no cards');
      } else {
        const terminalAfter = uuid(page.nextAfter, 'nextAfter');
        if (after !== null && terminalAfter <= after) fail('terminal page did not advance its cursor');
      }
      return {
        cards: [...merged.values()].sort((a, b) => a.language_code.localeCompare(b.language_code) || a.set_id.localeCompare(b.set_id)),
        groups: [...ledger.groups].sort((a, b) => a.category_id - b.category_id || a.status.localeCompare(b.status)),
        openRepairs: ledger.openRepairs,
        runStatus: deriveCatalogueBulkCoverageRunStatus(ledger.groups, [...merged.values()], ledger.openRepairs),
        diagnostics: { pages, scanned, catalogueVersions: versions, observedAtBegin, observedAtEnd, atomic: false }
      };
    }
    const nextAfter = uuid(page.nextAfter, 'nextAfter');
    if (pageScanned === 0 || (after !== null && nextAfter <= after)) fail('nonterminal page did not advance its cursor');
    after = nextAfter;
  }
  throw new Error(`Catalogue bulk coverage exceeded maxPages (${maxPages}) before completion`);
}
