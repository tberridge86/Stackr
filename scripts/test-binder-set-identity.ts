import assert from 'node:assert/strict';

import {
  resolveBinderSetIdentity,
  type BinderSetIdentityCandidate,
} from '../lib/binderSetIdentity';

const japaneseS12a: BinderSetIdentityCandidate = {
  id: 'd6a23ad9-7d3d-482c-a477-304584a335e3',
  language: 'ja',
  setCode: 'S12a',
  localName: 'VSTARユニバース',
  englishDisplayName: 'VSTAR Universe',
};

const traditionalChineseS12a: BinderSetIdentityCandidate = {
  id: 'eed3fcbd-fd4c-4b7f-9b75-a68e15d61476',
  language: 'zh-tw',
  setCode: 'S12a',
  localName: '天地萬物VSTAR',
  englishDisplayName: 'VSTAR Universe',
};

const englishBase: BinderSetIdentityCandidate = {
  id: '11111111-1111-4111-8111-111111111111',
  language: 'en',
  setCode: 'base1',
  name: 'Base Set',
  englishDisplayName: 'Base Set',
};

// Explicit persisted language is authoritative, including against a conflicting
// legacy prefix, and resolves the matching candidate where it is available.
assert.deepEqual(
  resolveBinderSetIdentity({
    language: 'zh-tw',
    sourceSetId: 'ja:S12a',
    candidates: [japaneseS12a, traditionalChineseS12a],
  }),
  {
    status: 'resolved',
    source: 'explicit-language',
    setId: traditionalChineseS12a.id,
    language: 'zh-tw',
    candidateSetIds: [japaneseS12a.id, traditionalChineseS12a.id],
  },
);

assert.deepEqual(
  resolveBinderSetIdentity({
    sourceSetId: 'ja:S12a',
    candidates: [traditionalChineseS12a, japaneseS12a],
  }),
  {
    status: 'resolved',
    source: 'prefixed-set-id',
    setId: japaneseS12a.id,
    language: 'ja',
    candidateSetIds: [traditionalChineseS12a.id, japaneseS12a.id],
  },
  'candidate order must not override a persisted language prefix',
);

assert.deepEqual(
  resolveBinderSetIdentity({
    sourceSetId: japaneseS12a.id.toUpperCase(),
    candidates: [traditionalChineseS12a, japaneseS12a],
  }),
  {
    status: 'resolved',
    source: 'canonical-set-id',
    setId: japaneseS12a.id,
    language: 'ja',
    candidateSetIds: [japaneseS12a.id],
  },
  'canonical UUID matching must be case insensitive',
);

assert.deepEqual(
  resolveBinderSetIdentity({
    sourceSetId: 'S12a',
    candidates: [traditionalChineseS12a, japaneseS12a],
  }),
  {
    status: 'ambiguous',
    source: 'ambiguous',
    setId: null,
    language: null,
    candidateSetIds: [traditionalChineseS12a.id, japaneseS12a.id],
  },
  'an unprefixed cross-language code must not silently become English or select the first row',
);

assert.deepEqual(
  resolveBinderSetIdentity({
    sourceSetId: 'S12a',
    storedNativeSetName: 'VSTARユニバース',
    candidates: [traditionalChineseS12a, japaneseS12a],
  }),
  {
    status: 'resolved',
    source: 'candidate-native-name',
    setId: japaneseS12a.id,
    language: 'ja',
    candidateSetIds: [japaneseS12a.id],
  },
  'native set identity can safely disambiguate an otherwise shared code',
);

assert.deepEqual(
  resolveBinderSetIdentity({
    sourceSetId: 'base1',
    candidates: [englishBase],
  }),
  {
    status: 'resolved',
    source: 'candidate-unique-reference',
    setId: englishBase.id,
    language: 'en',
    candidateSetIds: [englishBase.id],
  },
  'a unique English set remains compatible when an old binder has no language',
);

assert.deepEqual(
  resolveBinderSetIdentity({
    sourceSetId: 'missing-set',
    candidates: [japaneseS12a, traditionalChineseS12a, englishBase],
  }),
  {
    status: 'unresolved',
    source: 'unresolved',
    setId: null,
    language: null,
    candidateSetIds: [],
  },
  'no match must remain recoverable and must never fall back to English',
);

console.log('binder set identity resolution passed');
assert.equal(resolveBinderSetIdentity({
  sourceSetId: japaneseS12a.id, language: 'zh-tw', candidates: [japaneseS12a],
}).status, 'ambiguous', 'a conflicting UUID/language must not fetch the wrong printed edition');
assert.equal(resolveBinderSetIdentity({
  sourceSetId: 'S12a', language: 'ja', candidates: [japaneseS12a, { ...japaneseS12a, id: englishBase.id }],
}).status, 'ambiguous', 'duplicate set identities must not silently choose the first record');
assert.equal(resolveBinderSetIdentity({
  sourceSetId: 'S12a', candidates: [{ ...japaneseS12a, id: 'S12a' }, { ...traditionalChineseS12a, id: 'S12a' }],
}).status, 'ambiguous', 'same provider code in two languages must not collapse during deduplication');
