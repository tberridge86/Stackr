import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTcgdexControlledCardReference } from '../lib/tcgdex.js';

function card({ language = 'ja', segment = 'S', setId = 'S12a', localId = '001', image = null } = {}) {
  return {
    id: `${setId}-${localId}`,
    localId,
    set: { id: setId },
    image: image ?? `https://assets.tcgdex.net/${language}/${segment}/${setId}/${localId}`,
  };
}

test('issues low-resolution references for provider-issued CJK series paths', () => {
  for (const fixture of [
    { language: 'ja', segment: 'S', setId: 'S12a', localId: '001' },
    { language: 'ja', segment: 'SV', setId: 'SV3', localId: '001' },
    { language: 'zh-tw', segment: 'S', setId: 'S7D', localId: '001' },
    { language: 'zh-tw', segment: 'SV', setId: 'SVD', localId: '001' },
  ]) {
    const reference = resolveTcgdexControlledCardReference(card(fixture), fixture.language);
    assert.equal(
      reference?.uri,
      `https://assets.tcgdex.net/${fixture.language}/${fixture.segment}/${fixture.setId}/${fixture.localId}/low.webp`,
    );
  }
});

test('permits a safe provider-supplied series namespace without inferring one', () => {
  const fixture = {
    language: 'ja', segment: 'promo_2026-special', setId: 'sv1', localId: '001',
  };
  assert.equal(
    resolveTcgdexControlledCardReference(card(fixture), fixture.language)?.uri,
    'https://assets.tcgdex.net/ja/promo_2026-special/sv1/001/low.webp',
  );
});

test('keeps legacy cards paths and rejects non-card or mismatched identities', () => {
  assert.equal(
    resolveTcgdexControlledCardReference(card({ segment: 'cards' }), 'ja')?.uri,
    'https://assets.tcgdex.net/ja/cards/S12a/001/low.webp',
  );
  assert.equal(resolveTcgdexControlledCardReference(card({ segment: 'sets' }), 'ja'), null);
  assert.equal(resolveTcgdexControlledCardReference(card({ segment: '..' }), 'ja'), null);
  assert.equal(
    resolveTcgdexControlledCardReference(card({ image: 'https://assets.tcgdex.net/ja/S/other/001' }), 'ja'),
    null,
  );
  assert.equal(resolveTcgdexControlledCardReference(card({ language: 'zh-tw' }), 'ja'), null);
});
