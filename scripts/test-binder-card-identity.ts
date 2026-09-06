import assert from 'node:assert/strict';

import { findSavedBinderCardMatch } from '../lib/binderCardIdentity';

const canonicalS12a = 'd6a23ad9-7d3d-482c-a477-304584a335e3';
const legacyS12a = 'S12a';
const aliases = [canonicalS12a, legacyS12a, 'ja:S12a'];
const savedJapanese = {
  id: 'saved-japanese',
  set_id: legacyS12a,
  card_id: 'S12a-001',
  card_number: '００１/１７２',
  language: 'ja',
  owned: true,
  owned_quantity: 3,
};

assert.strictEqual(
  findSavedBinderCardMatch({
    savedRows: [savedJapanese],
    cardId: 'a86cc1a7-3f22-4eb9-a347-a503ce36c689',
    collectorNumber: '001',
    language: 'ja',
    setReferences: aliases,
    allowCollectorMatch: true,
  }),
  savedJapanese,
  'canonical binder identity must preserve the original legacy saved row and quantity',
);

const nestedNumberSaved = { ...savedJapanese, id: 'nested-number', card_number: null, card: { raw_data: { localId: '001' } } };
assert.strictEqual(
  findSavedBinderCardMatch({
    savedRows: [nestedNumberSaved],
    collectorNumber: '001',
    language: 'ja',
    setReferences: aliases,
    allowCollectorMatch: true,
  }),
  nestedNumberSaved,
  'legacy rows without card_number use their nested card collector fallback',
);

assert.strictEqual(
  findSavedBinderCardMatch({
    savedRows: [savedJapanese],
    cardId: 'S12a-001',
    language: 'zh-tw',
    setReferences: aliases,
  }),
  null,
  'an explicit saved-row language cannot cross-match another edition sharing a set code',
);

assert.strictEqual(
  findSavedBinderCardMatch({
    savedRows: [{ ...savedJapanese, set_id: 'SV3' }],
    cardId: 'S12a-001',
    language: 'ja',
    setReferences: aliases,
  }),
  null,
  'a row outside the resolved set aliases cannot match',
);

const japaneseAndTraditionalSameCode = [
  savedJapanese,
  { ...savedJapanese, id: 'saved-traditional', language: 'zh-tw', set_id: 'zh-tw:S12a' },
];
assert.strictEqual(
  findSavedBinderCardMatch({
    savedRows: japaneseAndTraditionalSameCode,
    cardId: 'S12a-001',
    language: null,
    setReferences: aliases,
  }),
  null,
  'a shared JA/TW code without a selected language must remain unresolved',
);
assert.strictEqual(
  findSavedBinderCardMatch({
    savedRows: japaneseAndTraditionalSameCode,
    cardId: 'not-an-exact-card-id',
    collectorNumber: '001',
    language: 'ja',
    setReferences: aliases,
    allowCollectorMatch: true,
  }),
  savedJapanese,
  'the selected language disambiguates shared JA/TW set codes',
);

assert.strictEqual(
  findSavedBinderCardMatch({
    savedRows: [savedJapanese, { ...savedJapanese, id: 'duplicate-number', card_id: 'S12a-001b' }],
    cardId: 'different-card',
    collectorNumber: '001',
    language: 'ja',
    setReferences: aliases,
    allowCollectorMatch: true,
  }),
  null,
  'duplicate collector numbers must not select a first saved row',
);

const lowercaseUuid = 'a86cc1a7-3f22-4eb9-a347-a503ce36c689';
const uuidSaved = { ...savedJapanese, id: 'uuid-row', card_id: lowercaseUuid, card_number: '999' };
assert.strictEqual(
  findSavedBinderCardMatch({
    savedRows: [uuidSaved],
    cardId: lowercaseUuid.toUpperCase(),
    language: 'ja',
    setReferences: aliases,
  }),
  uuidSaved,
  'canonical UUID card IDs are case-insensitive',
);

assert.strictEqual(
  findSavedBinderCardMatch({
    savedRows: [{ ...savedJapanese, card_id: 'S12a-TG01', card_number: 'TG01/TG30' }],
    collectorNumber: '001',
    language: 'ja',
    setReferences: aliases,
    allowCollectorMatch: true,
  }),
  null,
  'TG/GG-style collector identifiers never collapse into plain numeric slots',
);

console.log('Binder saved-card identity matching remains alias-aware, language-safe, and ambiguity-safe.');
