import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  defineTcgdexRuntimeImageOverlay,
  enforceTcgdexRuntimeImagePolicy,
  isTcgdexControlledCardReferenceUrl,
  hasTcgdexRuntimeImageOverlay,
  preserveExistingImageUrlBeforePersistence,
  preserveExistingTcgdexReferencesBeforePersistence,
  resolveTcgdexControlledCardReference,
  stripTcgdexReferenceBeforePersistence,
  stripTcgdexReferencesFromValueBeforePersistence,
  suppressTcgdexSetMark,
  TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY,
} from '../lib/tcgdexControlledCardReference';
import { hydrateForeignPokemonControlledCardReference } from '../lib/foreignPokemon';
import {
  getTcgdexControlledReferenceLookupIdentity,
  matchTcgdexProviderCardFromLiveSet,
  normalizeTcgdexCollectorIdentity,
} from '../lib/tcgdexControlledReferenceLookup';
import { selectTcgdexReferencePersistenceImage } from '../lib/tcgdexReferencePersistence';
import { sanitizeJapaneseCataloguePublicRows } from '../backend/lib/japaneseCatalogue.js';
import {
  isTcgdexAssetPointer,
  sanitizeTcgdexAssetPointersForPublicDisplay,
} from '../backend/lib/cataloguePublicAssetPolicy.js';
import { assertTcgdexRuntimeBoundaryCompatibility } from './tcgdex-boundary-compatibility';

const REGISTRY_PATH = 'catalogue/source-rights-registry.json';
const EVIDENCE_PATH = 'catalogue/rights-evidence/tcgdex-low-resolution-card-reference.2026-09-04.json';
const NOTICE_PATH = 'docs/third-party/tcgdex-card-reference-notice.md';
const DECISION_PATH = 'catalogue/rights-reviews/tcgdex-low-resolution-card-reference-green.2026-09-04.json';

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

type Decision = {
  decisionId: string;
  classification: string;
  status: string;
  activationAuthorized: boolean;
  publicRuntimeDisplayAuthorized: boolean;
  canonicalDatabaseWriteAuthorized: boolean;
  assetPersistenceAuthorized: boolean;
  scope: { rendition: string; languages: string[]; excludedUses: string[] };
  bindings: Record<string, string>;
  runtimeControls: {
    lowWebpOnly: boolean;
    memoryCacheOnly: boolean;
    visibleAttribution: string;
    sourceKillSwitches: string[];
    denylistEnvironmentVariable: string;
  };
};

const decision = readJson<Decision>(DECISION_PATH);
assertTcgdexRuntimeBoundaryCompatibility((path) => readFileSync(path));
assert.equal(decision.classification, 'green');
assert.equal(decision.status, 'authorized_under_internal_operating_boundary');
assert.equal(decision.activationAuthorized, true);
assert.equal(decision.publicRuntimeDisplayAuthorized, true);
assert.equal(decision.canonicalDatabaseWriteAuthorized, false);
assert.equal(decision.assetPersistenceAuthorized, false);
assert.deepEqual(decision.scope.languages, ['ja', 'zh-tw', 'zh-cn']);
assert.equal(decision.scope.rendition, 'low.webp');
for (const excludedUse of [
  'set_logo',
  'expansion_or_rarity_symbol',
  'pack_or_product_artwork',
  'high_resolution_or_zoom_delivery',
  'disk_cache_or_asset_mirror',
  'canonical_or_catalogue_asset_write',
  'image_derivative_generation',
  'model_training',
]) {
  assert.ok(decision.scope.excludedUses.includes(excludedUse), `decision must exclude ${excludedUse}`);
}
assert.equal(decision.bindings.operatingBoundarySha256, 'f93aa675f76aadbe77e58bbbb0e0a81fdeb4268de8ca4d7a8190e9a6df5efb1b');
assert.equal(decision.bindings.rightsRegistrySha256, sha256(REGISTRY_PATH));
assert.equal(decision.bindings.evidenceSha256, sha256(EVIDENCE_PATH));
assert.equal(decision.bindings.noticeSha256, sha256(NOTICE_PATH));
assert.equal(
  decision.bindings.boundaryCompatibilityReviewSha256,
  sha256(decision.bindings.boundaryCompatibilityReviewPath),
);
const boundaryCompatibility = readJson<Record<string, any>>(decision.bindings.boundaryCompatibilityReviewPath);
assert.equal(boundaryCompatibility.classification, 'green_binding_reconfirmation');
assert.equal(boundaryCompatibility.authority.sha256, decision.bindings.operatingBoundarySha256);
assert.equal(boundaryCompatibility.limits.activatesAmberUses, false);
assert.equal(boundaryCompatibility.limits.activatesRedUses, false);
assert.equal(boundaryCompatibility.limits.authorizesHighResolutionPublicDelivery, false);
assert.ok(boundaryCompatibility.reconfirmedGreenDecisions.includes(decision.decisionId));
assert.equal(TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.decisionSha256, sha256(DECISION_PATH));
assert.equal(TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.rendition, decision.scope.rendition);
assert.equal(TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.cachePolicy, 'memory');
assert.equal(TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.attributionText, decision.runtimeControls.visibleAttribution);
assert.deepEqual([...TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.languages], decision.scope.languages);
assert.equal(decision.runtimeControls.lowWebpOnly, true);
assert.equal(decision.runtimeControls.memoryCacheOnly, true);
assert.deepEqual(decision.runtimeControls.sourceKillSwitches, [
  'EXPO_PUBLIC_DISABLE_TCGDEX_CARD_REFERENCES',
  'STACKR_DISABLE_TCGDEX_CARD_REFERENCES',
]);
assert.equal(decision.runtimeControls.denylistEnvironmentVariable, 'EXPO_PUBLIC_TCGDEX_CARD_REFERENCE_DENYLIST');

function input(language: 'ja' | 'zh-tw' | 'zh-cn', pathSegment = 'cards') {
  const providerSetId = language === 'ja' ? 'sv1' : language === 'zh-tw' ? 's1h' : 'CS5.5';
  const localId = language === 'ja' ? '001' : language === 'zh-tw' ? '023' : '100';
  const providerCardId = `${providerSetId}-${localId}`;
  return {
    language,
    providerSetId,
    providerCardId,
    localId,
    providerImageBase: `https://assets.tcgdex.net/${language}/${pathSegment}/${providerSetId}/${localId}`,
    provenance: 'tcgdex_live_or_ttl_cached_provider_card_record' as const,
  };
}

const canonicalV1LookupCard = {
  number: '157/165',
  externalIds: {
    stackr: '4bf80c49-b001-49f7-9e58-27cb6405e6c9',
  },
  set: {
    id: '9f3bdca1-f34c-4ce0-b4f2-6ee7d28dca63',
  },
  raw_data: {
    localId: '157/165',
    set: {
      id: '9f3bdca1-f34c-4ce0-b4f2-6ee7d28dca63',
      set_code: 'sv2a',
    },
  },
};
const canonicalV1Lookup = getTcgdexControlledReferenceLookupIdentity(canonicalV1LookupCard, 'ja');
assert.deepEqual(canonicalV1Lookup, {
  providerCardId: null,
  providerSetId: 'sv2a',
  localId: '157/165',
  collectorKey: '157',
});
assert.equal(normalizeTcgdexCollectorIdentity('００１ / １６５'), '1');
assert.equal(normalizeTcgdexCollectorIdentity('TG01'), 'TG01');
assert.doesNotMatch(JSON.stringify(canonicalV1Lookup), /https?:|image|url/i);

const exactProviderLookup = getTcgdexControlledReferenceLookupIdentity({
  ...canonicalV1LookupCard,
  externalIds: {
    ...canonicalV1LookupCard.externalIds,
    tcgdex: 'sv2a-157',
  },
}, 'ja');
assert.deepEqual(exactProviderLookup, {
  providerCardId: 'sv2a-157',
  providerSetId: 'sv2a',
  localId: '157',
  collectorKey: '157',
});

const liveSetCard = {
  providerCardId: 'sv2a-157',
  language: 'ja',
  localId: '157',
  number: '157',
};
assert.equal(
  matchTcgdexProviderCardFromLiveSet(canonicalV1Lookup!, [liveSetCard], 'ja'),
  liveSetCard,
);
assert.equal(
  matchTcgdexProviderCardFromLiveSet(canonicalV1Lookup!, [
    liveSetCard,
    { ...liveSetCard },
  ], 'ja'),
  null,
  'duplicate set-and-collector matches must fail closed',
);
assert.equal(
  matchTcgdexProviderCardFromLiveSet(canonicalV1Lookup!, [
    { ...liveSetCard, providerCardId: 'other-157' },
  ], 'ja'),
  null,
);
assert.equal(
  matchTcgdexProviderCardFromLiveSet(canonicalV1Lookup!, [
    { ...liveSetCard, language: 'zh-cn' },
  ], 'ja'),
  null,
);
assert.equal(getTcgdexControlledReferenceLookupIdentity({
  ...canonicalV1LookupCard,
  raw_data: {
    ...canonicalV1LookupCard.raw_data,
    providerSetId: 'conflict-a',
    set: { ...canonicalV1LookupCard.raw_data.set, set_code: 'conflict-b' },
  },
}, 'ja'), null);
assert.equal(getTcgdexControlledReferenceLookupIdentity({
  ...canonicalV1LookupCard,
  externalIds: { tcgdex: 'sv2a-157', legacy: 'other-157' },
}, 'ja'), null);
assert.equal(getTcgdexControlledReferenceLookupIdentity({
  number: '157/165',
  set: { id: 'zh-cn:sv2a' },
}, 'ja'), null);

for (const language of ['ja', 'zh-tw', 'zh-cn'] as const) {
  const candidate = input(language);
  const resolved = resolveTcgdexControlledCardReference(candidate);
  assert.deepEqual(resolved, {
    uri: `${candidate.providerImageBase}/low.webp`,
    sourceCode: 'tcgdex',
    attributionText: 'TCGdex reference',
    cachePolicy: 'memory',
    denialKey: `${language}:${candidate.providerSetId}:${candidate.providerCardId}`,
  });
  assert.equal(isTcgdexControlledCardReferenceUrl(resolved?.uri), true);
}

// Hash-bound 2026-08-14 provider-baseline snapshots document the following
// CJK series paths: JA S/S12a, JA SV/SV3, zh-TW S/S7D, zh-TW SV/SVD. Any
// safe single provider namespace can be used only when the exact live/TTL
// card record supplies it; the last-mile guard accepts it only after issuance.
for (const { language, segment, setId, localId } of [
  { language: 'ja', segment: 'S', setId: 'S12a', localId: '001' },
  { language: 'ja', segment: 'SV', setId: 'SV3', localId: '001' },
  { language: 'zh-tw', segment: 'S', setId: 'S7D', localId: '001' },
  { language: 'zh-tw', segment: 'SV', setId: 'SVD', localId: '001' },
] as const) {
  const seriesCandidate = {
    ...input(language, segment),
    providerSetId: setId,
    providerCardId: `${setId}-${localId}`,
    localId,
    providerImageBase: `https://assets.tcgdex.net/${language}/${segment}/${setId}/${localId}`,
  };
  const resolved = resolveTcgdexControlledCardReference(seriesCandidate);
  assert.equal(resolved?.uri, `${seriesCandidate.providerImageBase}/low.webp`);
  assert.equal(isTcgdexControlledCardReferenceUrl(resolved?.uri), true);
}

const syntheticNamespaceCandidate = {
  ...input('ja', 'promo_2026-special'),
  providerImageBase: 'https://assets.tcgdex.net/ja/promo_2026-special/sv1/001',
};
const syntheticNamespaceResolved = resolveTcgdexControlledCardReference(syntheticNamespaceCandidate);
assert.equal(syntheticNamespaceResolved?.uri, `${syntheticNamespaceCandidate.providerImageBase}/low.webp`);
assert.equal(isTcgdexControlledCardReferenceUrl(syntheticNamespaceResolved?.uri), true);

const issuedRuntimeUri = resolveTcgdexControlledCardReference(input('ja'))!.uri;
const runtimeOverlay = {
  image_small: issuedRuntimeUri,
  raw_data: { image_small: 'https://reviewed.example.test/stored-card.webp' },
};
defineTcgdexRuntimeImageOverlay(runtimeOverlay, 'image_small', issuedRuntimeUri);
assert.equal(runtimeOverlay.image_small, issuedRuntimeUri, 'runtime overlays remain directly readable');
assert.equal(Object.prototype.propertyIsEnumerable.call(runtimeOverlay, 'image_small'), false);
assert.equal(hasTcgdexRuntimeImageOverlay(runtimeOverlay, 'image_small'), false);
assert.equal(JSON.stringify(runtimeOverlay).includes(issuedRuntimeUri), false);
assert.equal(Object.prototype.hasOwnProperty.call({ ...runtimeOverlay }, 'image_small'), false);
assert.equal(runtimeOverlay.raw_data.image_small, 'https://reviewed.example.test/stored-card.webp');
const runtimeCardOverlay = { images: { small: issuedRuntimeUri, large: null } };
defineTcgdexRuntimeImageOverlay(runtimeCardOverlay, 'images', runtimeCardOverlay.images, issuedRuntimeUri);
assert.equal(runtimeCardOverlay.images.small, issuedRuntimeUri);
assert.equal(hasTcgdexRuntimeImageOverlay(runtimeCardOverlay, 'images'), true);
assert.equal(JSON.stringify(runtimeCardOverlay).includes(issuedRuntimeUri), false);
assert.equal(Object.prototype.hasOwnProperty.call({ ...runtimeCardOverlay }, 'images'), false);
const storedOverlay = { image_small: 'https://reviewed.example.test/stored-card.webp' };
defineTcgdexRuntimeImageOverlay(storedOverlay, 'image_small', storedOverlay.image_small);
assert.equal(Object.prototype.propertyIsEnumerable.call(storedOverlay, 'image_small'), true);

const liveDescriptorCard = {
  id: 'live1-007',
  providerCardId: 'live1-007',
  language: 'ja' as const,
  region: 'JP',
  localId: '007',
  number: '007',
  name: 'ライブカード',
  localName: 'ライブカード',
  englishDisplayName: 'Live Card',
  image: null,
  imageSmall: null,
  imageBase: null,
  raw: {
    image: 'https://assets.tcgdex.net/ja/cards/live1/007',
    images: { small: 'https://assets.tcgdex.net/ja/cards/live1/007/low.webp' },
    nested: { artwork: 'https://assets.tcgdex.net/ja/cards/live1/007/high.webp' },
    set: { logo: 'https://assets.tcgdex.net/ja/sets/live1/logo' },
  },
  controlledReference: {
    uri: 'https://assets.tcgdex.net/ja/cards/live1/007/low.webp',
    sourceCode: 'tcgdex' as const,
    attributionText: 'TCGdex reference' as const,
    cachePolicy: 'memory' as const,
    providerCardId: 'live1-007',
    providerSetId: 'live1',
    localId: '007',
    provenance: 'tcgdex_live_or_ttl_cached_provider_card_record' as const,
  },
};
const rejectedEnvelope = hydrateForeignPokemonControlledCardReference(liveDescriptorCard, {
  source: 'not-tcgdex',
  language: 'ja',
  providerSetId: 'live1',
});
assert.equal(rejectedEnvelope.imageSmall, null);
assert.equal(enforceTcgdexRuntimeImagePolicy(liveDescriptorCard.controlledReference.uri), null);
const hydratedLiveCard = hydrateForeignPokemonControlledCardReference(liveDescriptorCard, {
  source: 'tcgdex',
  language: 'ja',
  providerSetId: 'live1',
});
assert.equal(hydratedLiveCard.imageSmall, liveDescriptorCard.controlledReference.uri);
assert.equal(isTcgdexControlledCardReferenceUrl(hydratedLiveCard.imageSmall), true);
assert.doesNotMatch(JSON.stringify((hydratedLiveCard as typeof liveDescriptorCard).raw), /assets\.tcgdex\.net/);

const valid = input('ja');
for (const invalid of [
  { ...valid, language: 'en' },
  { ...valid, provenance: null },
  { ...valid, providerCardId: 'sv1-002' },
  { ...valid, providerSetId: 'sv2' },
  { ...valid, localId: '002' },
  { ...valid, providerImageBase: 'http://assets.tcgdex.net/ja/cards/sv1/001' },
  { ...valid, providerImageBase: 'https://cdn.assets.tcgdex.net/ja/cards/sv1/001' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net:8443/ja/cards/sv1/001' },
  { ...valid, providerImageBase: 'https://user@assets.tcgdex.net/ja/cards/sv1/001' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net/ja/cards/sv1/001?size=low' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net/ja/cards/sv1/001#fragment' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net/ja/cards/sv1/001/low.webp' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net/ja/sets/sv1/logo' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net/ja/sets/sv1/001' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net/ja/%2F/sv1/001' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net/ja/../sv1/001' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net/ja/S/sv2/001' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net/zh-tw/S/sv1/001' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net/ja/cards/sv2/001' },
  { ...valid, providerImageBase: 'https://assets.tcgdex.net/ja/cards/sv1/001/not-card' },
]) {
  assert.equal(resolveTcgdexControlledCardReference(invalid), null, `must reject ${invalid.providerImageBase}`);
}

const environmentKeys = [
  'EXPO_PUBLIC_DISABLE_TCGDEX_CARD_REFERENCES',
  'STACKR_DISABLE_TCGDEX_CARD_REFERENCES',
  'EXPO_PUBLIC_TCGDEX_CARD_REFERENCE_DENYLIST',
] as const;
const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
try {
  process.env.EXPO_PUBLIC_DISABLE_TCGDEX_CARD_REFERENCES = 'true';
  assert.equal(resolveTcgdexControlledCardReference(valid), null);
  delete process.env.EXPO_PUBLIC_DISABLE_TCGDEX_CARD_REFERENCES;

  process.env.STACKR_DISABLE_TCGDEX_CARD_REFERENCES = 'true';
  assert.equal(resolveTcgdexControlledCardReference(valid), null);
  delete process.env.STACKR_DISABLE_TCGDEX_CARD_REFERENCES;

  process.env.EXPO_PUBLIC_TCGDEX_CARD_REFERENCE_DENYLIST = 'JA:SV1:SV1-001';
  assert.equal(resolveTcgdexControlledCardReference(valid), null);
  assert.equal(enforceTcgdexRuntimeImagePolicy('https://assets.tcgdex.net/ja/cards/sv1/001/low.webp'), null);
  process.env.EXPO_PUBLIC_TCGDEX_CARD_REFERENCE_DENYLIST = 'x'.repeat(16_385);
  assert.equal(resolveTcgdexControlledCardReference(valid), null);
  delete process.env.EXPO_PUBLIC_TCGDEX_CARD_REFERENCE_DENYLIST;

  const controlled = 'https://assets.tcgdex.net/ja/cards/sv1/001/low.webp';
  assert.equal(enforceTcgdexRuntimeImagePolicy(controlled), controlled);
  for (const unsafe of [
    'https://assets.tcgdex.net/ja/cards/sv1/001',
    'https://assets.tcgdex.net/ja/cards/sv1/001/high.webp',
    'https://assets.tcgdex.net/ja/sets/sv1/logo',
    'https://assets.tcgdex.net/ja/sets/sv1/symbol',
    'https://assets.tcgdex.net/ja/cards/sv1/001/low.webp?cache=bypass',
    'https://assets.tcgdex.net./ja/cards/sv1/001/high.webp',
    'https://assets.tcgdex.net/en/cards/base1/001/high.webp',
    'https://assets.tcgdex.net/zh-cn/cards/never-issued/999/low.webp',
  ]) {
    assert.equal(enforceTcgdexRuntimeImagePolicy(unsafe), null, `last-mile guard must reject ${unsafe}`);
  }
  assert.equal(enforceTcgdexRuntimeImagePolicy('https://images.example.test/card.webp'), 'https://images.example.test/card.webp');
  assert.equal(suppressTcgdexSetMark('https://assets.tcgdex.net/ja/sets/sv1/logo'), undefined);
  assert.equal(suppressTcgdexSetMark('https://assets.tcgdex.net./ja/sets/sv1/logo'), undefined);
  assert.equal(suppressTcgdexSetMark('https://images.example.test/logo.webp'), 'https://images.example.test/logo.webp');
  assert.equal(stripTcgdexReferenceBeforePersistence(controlled), null);
  assert.equal(stripTcgdexReferenceBeforePersistence('https://assets.tcgdex.net./ja/cards/sv1/001/high.webp'), null);
  assert.equal(stripTcgdexReferenceBeforePersistence('https://images.example.test/card.webp'), 'https://images.example.test/card.webp');
  const historicalProviderPointer = 'https://assets.tcgdex.net/ja/cards/legacy/001/high.webp';
  assert.equal(
    preserveExistingImageUrlBeforePersistence(controlled, historicalProviderPointer),
    historicalProviderPointer,
    'a display-only candidate must not erase an existing at-rest pointer',
  );
  assert.equal(
    preserveExistingImageUrlBeforePersistence(controlled, 'https://reviewed.example.test/card.webp'),
    'https://reviewed.example.test/card.webp',
  );
  assert.equal(preserveExistingImageUrlBeforePersistence(controlled, null), null);
  assert.equal(
    preserveExistingImageUrlBeforePersistence('https://reviewed.example.test/new.webp', historicalProviderPointer),
    'https://reviewed.example.test/new.webp',
  );
  assert.equal(
    preserveExistingImageUrlBeforePersistence(null, historicalProviderPointer),
    historicalProviderPointer,
  );
  assert.deepEqual(
    preserveExistingTcgdexReferencesBeforePersistence(
      {
        image: controlled,
        nested: { existing: null, introduced: controlled },
        name: 'Native card name',
      },
      {
        image: historicalProviderPointer,
        nested: { existing: historicalProviderPointer },
        omittedImage: historicalProviderPointer,
        omittedMetadata: { nativeName: 'カード名', collectorNumber: '001' },
        name: 'Older name',
      },
    ),
    {
      image: historicalProviderPointer,
      nested: { existing: historicalProviderPointer, introduced: null },
      omittedImage: historicalProviderPointer,
      omittedMetadata: { nativeName: 'カード名', collectorNumber: '001' },
      name: 'Native card name',
    },
    'partial JSON updates must retain omitted at-rest pointers and metadata while rejecting newly introduced provider URLs',
  );
  assert.deepEqual(stripTcgdexReferencesFromValueBeforePersistence({
    label: ' preserve surrounding whitespace ',
    image: controlled,
    nested: [{ high: 'https://assets.tcgdex.net/ja/cards/sv1/001/high.webp' }],
    safe: 'https://images.example.test/card.webp',
  }), {
    label: ' preserve surrounding whitespace ',
    image: null,
    nested: [{ high: null }],
    safe: 'https://images.example.test/card.webp',
  });
} finally {
  for (const key of environmentKeys) {
    const previous = originalEnvironment.get(key);
    if (previous == null) delete process.env[key];
    else process.env[key] = previous;
  }
}

const runtimeSource = readFileSync('lib/tcgdexControlledCardReference.ts', 'utf8');
for (const forbiddenDependency of ['supabase', 'AsyncStorage', 'expo-file-system', 'fetch(']) {
  assert.equal(runtimeSource.includes(forbiddenDependency), false, `pure controlled route must not use ${forbiddenDependency}`);
}

const imageSource = readFileSync('components/StackrImage.tsx', 'utf8');
assert.match(imageSource, /enforceTcgdexRuntimeImagePolicy/);
assert.match(imageSource, /isTcgdexControlledCardReferenceUrl/);
assert.match(imageSource, /cachePolicy:\s*'memory'/);
assert.match(imageSource, /TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY\.attributionText/);
assert.match(imageSource, /sanitizeImageSource/);

const adapterSource = readFileSync('lib/stackrDomainAdapter.ts', 'utf8');
assert.match(adapterSource, /enforceTcgdexRuntimeImagePolicy/);
assert.doesNotMatch(adapterSource, /provenance:\s*'tcgdex_/);

const foreignSource = readFileSync('lib/foreignPokemon.ts', 'utf8');
assert.match(foreignSource, /resolveTcgdexControlledCardReference/);
assert.match(foreignSource, /tcgdex_live_or_ttl_cached_provider_card_record/);
assert.match(foreignSource, /envelope\.source !== 'tcgdex'/);

const lookupSource = readFileSync('lib/tcgdexControlledReferenceLookup.ts', 'utf8');
assert.doesNotMatch(lookupSource, /assets\.tcgdex\.net|\/low\.webp|\/high\.webp/);
assert.match(lookupSource, /No provider card ID or image URL is synthesised/);
assert.match(lookupSource, /rawSet\.set_code/);
const pokemonTcgSource = readFileSync('lib/pokemonTcg.ts', 'utf8');
assert.match(pokemonTcgSource, /fetchForeignPokemonCard/);
assert.match(pokemonTcgSource, /matchTcgdexProviderCardFromLiveSet/);
assert.match(
  pokemonTcgSource,
  /defineTcgdexRuntimeImageOverlay\(displayCard, 'images', displayCard\.images, uri\)/,
  'live card references must be attached as non-enumerable display overlays',
);
assert.match(
  pokemonTcgSource,
  /const storedImages = \{[\s\S]*?image_small_url[\s\S]*?const images = \{[\s\S]*?enforceTcgdexRuntimeImagePolicy\(storedImages\.small\)[\s\S]*?raw_data: \{[\s\S]*?images: storedImages/,
  'canonical reads must preserve stored raw pointers while filtering only the public image projection',
);

for (const displaySurface of [
  'features/scan/ScanScreen.tsx',
  'features/home/HubScreen.tsx',
  'app/value-history.tsx',
  'app/prices/index.tsx',
  'app/offer/index.tsx',
  'app/offer/new.tsx',
  'app/offers.tsx',
  'lib/marketSearchDataCache.ts',
]) {
  assert.match(
    readFileSync(displaySurface, 'utf8'),
    /hydrate(?:ScanCardRows|CardReferenceRowMap|MarketCardDetails)WithLiveTcgdexReferences/,
    `${displaySurface} must resolve controlled references only in its in-memory display path`,
  );
}
assert.match(
  readFileSync('features/inventory/InventoryScreen.tsx', 'utf8'),
  /searchLocalPokemonCards/,
  'inventory card search must use the shared live-reference-aware search path',
);

const binderSource = readFileSync('lib/binders.ts', 'utf8');
const persistenceSelectorSource = readFileSync('lib/tcgdexReferencePersistence.ts', 'utf8');
assert.match(persistenceSelectorSource, /stripTcgdexReferenceBeforePersistence/);
assert.match(persistenceSelectorSource, /preserveExistingImageUrlBeforePersistence/);
assert.equal(
  selectTcgdexReferencePersistenceImage('https://assets.tcgdex.net/ja/cards/sv2a/157/low.webp'),
  null,
  'a newly-issued controlled display reference must never become a stored image',
);
assert.equal(
  selectTcgdexReferencePersistenceImage(
    'https://assets.tcgdex.net/ja/cards/sv2a/157/low.webp',
    'https://cdn.example.test/stored-card.jpg',
  ),
  'https://cdn.example.test/stored-card.jpg',
  'an update must retain the existing stored image when the candidate is display-only',
);
assert.equal(
  selectTcgdexReferencePersistenceImage('https://cdn.example.test/user-card.jpg'),
  'https://cdn.example.test/user-card.jpg',
  'ordinary stored images must remain unchanged',
);
assert.match(binderSource, /selectTcgdexReferencePersistenceImage/);
assert.match(binderSource, /function binderImageUrlForPersistence/);
assert.match(binderSource, /image_url:\s*binderImageUrlForPersistence/);
assert.match(binderSource, /owned_quantity, card_name, image_url/);
assert.doesNotMatch(binderSource, /assets\\\.tcgdex\\\.net[\s\S]{0,180}low\\\.webp/);

const scanHydrationSource = readFileSync('lib/scanCardReferenceHydration.ts', 'utf8');
assert.match(scanHydrationSource, /defineTcgdexRuntimeImageOverlay\(displayRow, 'image_small', newSmall\)/);
assert.match(scanHydrationSource, /defineTcgdexRuntimeImageOverlay\(displayRow, 'image_large', newLarge\)/);

const cardSearchSource = readFileSync('lib/cardSearch.ts', 'utf8');
assert.match(cardSearchSource, /attachLiveTcgdexCardReferences\(await searchStackrCards/);

const listingSource = readFileSync('features/listing/CreateListingScreen.tsx', 'utf8');
assert.match(
  listingSource,
  /function listingCardForPersistence[\s\S]*?selectTcgdexReferencePersistenceImage/,
  'listing drafts must pass image fields through the shared display-only selector',
);
assert.match(listingSource, /const stockImageUrl = selectTcgdexReferencePersistenceImage/);
assert.doesNotMatch(listingSource, /card\.imageBase[\s\S]{0,100}\/(?:low|high)\.webp/);

for (const persistencePath of [
  'app/scan/result.tsx',
  'lib/inventory.ts',
]) {
  assert.match(
    readFileSync(persistencePath, 'utf8'),
    /selectTcgdexReferencePersistenceImage/,
    `${persistencePath} must apply the shared controlled-reference persistence selector`,
  );
}
const scanResultSource = readFileSync('app/scan/result.tsx', 'utf8');
assert.match(scanResultSource, /persistedImageUrl[\s\S]{0,500}\? \{ image_url: persistedImageUrl \} : \{\}/);
const inventorySource = readFileSync('lib/inventory.ts', 'utf8');
assert.match(inventorySource, /function inventorySnapshotForPersistence/);
assert.match(inventorySource, /function inventoryMovementForPersistence/);
assert.match(inventorySource, /function inventorySaleForPersistence/);
assert.match(inventorySource, /p_inventory:[\s\S]*?inventorySnapshotForPersistence/);
assert.match(inventorySource, /p_binder_deltas:[\s\S]*?selectTcgdexReferencePersistenceImage/);

const inventoryScreenSource = readFileSync('features/inventory/InventoryScreen.tsx', 'utf8');
assert.match(inventoryScreenSource, /searchLocalPokemonCards/);

const offerComposeSource = readFileSync('app/offer/new.tsx', 'utf8');
const offerSubmission = offerComposeSource.match(/createTradeOffer\(\{([\s\S]*?)\n\s*\}\s+as any\);/)?.[1] ?? '';
assert.ok(offerSubmission, 'offer submission payload must remain statically inspectable');
assert.doesNotMatch(
  offerSubmission,
  /image(?:_|Url)|english_(?:name|set)/i,
  'display references and supplements must not enter the trade-offer persistence payload',
);

const legacyCatalogueSource = readFileSync('backend/lib/tcgdexCatalogue.js', 'utf8');
assert.match(legacyCatalogueSource, /controlled_provider_live_reference_only/);
assert.doesNotMatch(legacyCatalogueSource, /`\$\{clean\}\/high\.(?:webp|png|jpe?g)`/);
assert.ok(
  (legacyCatalogueSource.match(/return sanitizeTcgdexCataloguePublicPayload\s*\(/g) ?? []).length >= 3,
  'every legacy public catalogue set/card response shape must retain the TCGdex asset sanitizer',
);
assert.match(legacyCatalogueSource, /sanitizeTcgdexAssetPointersForPublicDisplay/);
assert.match(legacyCatalogueSource, /CONTROLLED_CARD_REFERENCE_LANGUAGES\.has\(languageKey\)/);
assert.doesNotMatch(legacyCatalogueSource, /const fallbackCoverImageUrl = controlledReferenceLanguage \? null/);
assert.doesNotMatch(legacyCatalogueSource, /controlledReferenceLanguage \? Promise\.resolve\(new Map\(\)\) : fetchLatestImages/);
assert.doesNotMatch(
  legacyCatalogueSource,
  /raw_payload: CONTROLLED_CARD_REFERENCE_LANGUAGES\.has[^?]+\? undefined/,
);
assert.match(
  legacyCatalogueSource,
  /const providerPointerBlocked = controlledReferenceLanguage && isTcgdexAssetPointer\(imageUrl\)/,
);
const stackrLogo = 'https://cdn.stackrtcg.com/catalogue/ja/sv2a/logo.webp';
const bundledCover = 'assets/rev2/11-japanese-set-logo/logos/sv2a.png';
assert.equal(isTcgdexAssetPointer('https://assets.tcgdex.net/ja/cards/sv2a/157/low.webp'), true);
assert.equal(isTcgdexAssetPointer('https://assets.tcgdex.net./ja/cards/sv2a/157/low.webp'), true);
assert.equal(isTcgdexAssetPointer(stackrLogo), false);
assert.equal(isTcgdexAssetPointer(bundledCover), false);
const sanitizedCjkCatalogueDto = sanitizeTcgdexAssetPointersForPublicDisplay({
  language: 'zh-tw',
  image_status: 'resolved',
  image_small_url: stackrLogo,
  logo_url: bundledCover,
  nested: {
    provider_reference: 'https://assets.tcgdex.net/zh-tw/cards/csv1c/001/low.webp',
    reviewed_cover: 'https://images.example.org/reviewed/csv1c.webp',
  },
});
assert.equal(sanitizedCjkCatalogueDto.image_status, 'resolved');
assert.equal(sanitizedCjkCatalogueDto.image_small_url, stackrLogo);
assert.equal(sanitizedCjkCatalogueDto.logo_url, bundledCover);
assert.equal(sanitizedCjkCatalogueDto.nested.provider_reference, null);
assert.equal(sanitizedCjkCatalogueDto.nested.reviewed_cover, 'https://images.example.org/reviewed/csv1c.webp');
const japaneseCatalogueSource = readFileSync('backend/lib/japaneseCatalogue.js', 'utf8');
assert.doesNotMatch(japaneseCatalogueSource, /withWebpAsset|withSetWebpAsset|\/high\.webp/);
assert.ok(
  (japaneseCatalogueSource.match(/assertLegacyJapaneseCatalogueSyncDisabled\(\);/g) ?? []).length >= 5,
  'every exported legacy Japanese sync surface must fail closed',
);
assert.ok(
  (japaneseCatalogueSource.match(/sanitizeJapaneseCataloguePublicRows?\(/g) ?? []).length >= 9,
  'every public Japanese catalogue response shape must apply the exact provider-pointer sanitizer',
);
const sanitizedJapaneseDto = sanitizeJapaneseCataloguePublicRows({
  id: 'ja:sv2a',
  image_status: 'resolved',
  logo_url: stackrLogo,
  cover_image_url: bundledCover,
  image_small_url: 'https://assets.tcgdex.net/ja/cards/sv2a/157/low.webp',
  nested: {
    artwork: 'https://assets.tcgdex.net./ja/cards/sv2a/157/high.webp',
    asset_status: 'reviewed',
    other_provider_image: 'https://images.example.org/reviewed/sv2a.webp',
  },
});
assert.equal(sanitizedJapaneseDto.image_status, 'resolved');
assert.equal(sanitizedJapaneseDto.logo_url, stackrLogo);
assert.equal(sanitizedJapaneseDto.cover_image_url, bundledCover);
assert.equal(sanitizedJapaneseDto.image_small_url, null);
assert.equal(sanitizedJapaneseDto.nested.artwork, null);
assert.equal(sanitizedJapaneseDto.nested.asset_status, 'reviewed');
assert.equal(sanitizedJapaneseDto.nested.other_provider_image, 'https://images.example.org/reviewed/sv2a.webp');
const backendServerSource = readFileSync('backend/server.js', 'utf8');
assert.match(backendServerSource, /app\.post\('\/admin\/catalogue\/jp\/sync'[\s\S]{0,500}res\.status\(410\)/);
assert.doesNotMatch(backendServerSource, /syncJapaneseCatalogue\(supabase/);

console.log('TCGdex controlled low-resolution card-reference route remains green-gated, memory-only, attributed, and fail-closed.');
