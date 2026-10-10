import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ApiError, parseLimit } from './stackrApiV1.js';

// This reviewed server snapshot keeps third-party availability off the browse
// path. Updating it is a release operation, never work triggered by a viewer.
const snapshot = JSON.parse(readFileSync(new URL('../data/pokedex-index.json', import.meta.url), 'utf8'));
const entries = snapshot.entries;
if (snapshot.schemaVersion !== 1 || !Array.isArray(entries) || entries.length !== snapshot.entryLimit
  || new Set(entries.map((entry) => entry.id)).size !== entries.length
  || entries.some((entry) => !Number.isSafeInteger(entry.id) || entry.id < 1
    || typeof entry.name !== 'string' || !/^[-a-z0-9]+$/.test(entry.name))
  || createHash('sha256').update(JSON.stringify(entries)).digest('hex') !== snapshot.contentSha256) {
  throw new Error('The published Pokédex index failed integrity validation.');
}

export function readPublishedPokedexIndex(query = {}) {
  const rawOffset = query.offset ?? 0;
  const offset = Number(rawOffset);
  if (!/^\d+$/.test(String(rawOffset)) || !Number.isSafeInteger(offset) || offset < 0) {
    throw new ApiError(400, 'invalid_offset', 'offset must be a non-negative integer.');
  }
  const limit = parseLimit(query.limit, 151, snapshot.entryLimit);
  return {
    count: entries.length,
    indexVersion: snapshot.indexVersion,
    results: entries.slice(offset, offset + limit).map(({ id, name }) => ({
      name,
      url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
    })),
  };
}
