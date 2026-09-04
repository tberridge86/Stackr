import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { hydrateScanCardRowsWithLiveTcgdexReferences } from '../lib/scanCardReferenceHydration';
import { resolveTcgdexControlledCardReference } from '../lib/tcgdexControlledCardReference';
import {
  serializeScanCardsForNavigation,
  toScanResultNavigationCard,
} from '../lib/scanNavigationSerialization';

const runtimeReference = 'https://assets.tcgdex.net/ja/cards/sv2a/157/low.webp';
const cardsJson = serializeScanCardsForNavigation([{
  id: 'ja:sv2a-157',
  image_small: runtimeReference,
  raw_data: { images: { small: runtimeReference } },
}]);

assert.doesNotMatch(cardsJson, /assets\.tcgdex\.net/);
assert.deepEqual(JSON.parse(cardsJson), [{
  id: 'ja:sv2a-157',
  image_small: null,
  raw_data: { images: { small: null } },
}]);

const navigationCard = toScanResultNavigationCard({
  id: '2f90a197-2d4d-43f6-9047-e29509c27daa',
  name: 'ミュウツー',
  number: '157',
  set_id: 'ja:sv2a',
  set_name: 'ポケモンカード151',
  language: 'ja',
  external_ids: { tcgdex: 'sv2a-157', tcgdexSet: 'sv2a' },
  image_small: runtimeReference,
  raw_data: { images: { small: runtimeReference }, set: { id: 'ja:sv2a' } },
});
const parsedNavigationCards = JSON.parse(serializeScanCardsForNavigation([navigationCard]));
assert.deepEqual(parsedNavigationCards[0].external_ids, { tcgdex: 'sv2a-157', tcgdexSet: 'sv2a' });
assert.equal(parsedNavigationCards[0].image_small, null);
assert.doesNotMatch(JSON.stringify(parsedNavigationCards), /assets\.tcgdex\.net/);

async function assertNavigationRehydration() {
  const issuedRuntimeReference = resolveTcgdexControlledCardReference({
    language: 'ja',
    providerCardId: 'sv2a-157',
    providerSetId: 'sv2a',
    localId: '157',
    providerLowResolutionUri: runtimeReference,
    provenance: 'tcgdex_live_or_ttl_cached_provider_card_record',
  })?.uri;
  assert.equal(issuedRuntimeReference, runtimeReference);
  const hydratedCards = await hydrateScanCardRowsWithLiveTcgdexReferences(
    parsedNavigationCards,
    async (cards) => cards.map((card) => {
      assert.equal(card.externalIds?.tcgdex, 'sv2a-157');
      return { ...card, images: { ...card.images, small: issuedRuntimeReference } };
    }),
    1,
  );
  assert.equal(hydratedCards[0].image_small, runtimeReference);
  assert.equal(Object.getOwnPropertyDescriptor(hydratedCards[0], 'image_small')?.enumerable, false);
  assert.doesNotMatch(JSON.stringify(hydratedCards), /assets\.tcgdex\.net/);

  const resultScreen = readFileSync('app/scan/result.tsx', 'utf8');
  assert.match(resultScreen, /hydrateScanCardRowsWithLiveTcgdexReferences/);
  assert.match(resultScreen, /attachLiveTcgdexCardReferences/);
  assert.match(resultScreen, /setCards\(hydratedCards\)/);
  assert.match(resultScreen, /non-enumerable overlay/);

  const scanScreen = readFileSync('features/scan/ScanScreen.tsx', 'utf8');
  assert.match(scanScreen, /toScanResultNavigationCard as toResultCard/);
  assert.match(scanScreen, /cardsJson:\s*serializeScanCardsForNavigation\(\[card\]\)/);
  assert.match(scanScreen, /cardsJson:\s*serializeScanCardsForNavigation\(cards\)/);
}

void assertNavigationRehydration().then(() => {
  console.log('Scan navigation serialization excludes and safely rehydrates runtime-only TCGdex references.');
});
