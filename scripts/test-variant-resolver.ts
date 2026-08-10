import assert from 'node:assert/strict';
import {
  buildVariantRegionExtractionPlan,
  getVariantFamilyRegister,
  identifyCandidateFamilies,
  resolveExactVariant,
  type VariantCandidateIdentity,
  type VariantFamilyDefinition,
  type VariantRegionObservation,
} from '../lib/recognition/variantResolver';

const register = getVariantFamilyRegister();

function family(id: string): VariantFamilyDefinition {
  const found = register.families.find((candidate) => candidate.familyId === id);
  assert.ok(found, `missing family ${id}`);
  return found;
}

function base(overrides: Partial<VariantCandidateIdentity> = {}): VariantCandidateIdentity {
  return {
    canonicalCardId: 'sv1-025',
    artworkId: 'art-pikachu-001',
    collectorNumber: '025',
    setId: 'sv1',
    layoutId: 'standard-pokemon',
    language: 'en',
    variantId: 'standard',
    cardName: 'Pikachu',
    ...overrides,
  };
}

function obs(
  discriminator: VariantRegionObservation['discriminator'],
  value: VariantRegionObservation['value'],
  confidence = 0.9
): VariantRegionObservation {
  return {
    discriminator,
    region: discriminator === 'collector_number_formatting' ? 'collectorNumber' : 'artwork',
    value,
    confidence,
    source: 'template',
  };
}

function candidateFamiliesSplitByLanguage() {
  const families = identifyCandidateFamilies([
    base({ canonicalCardId: 'en-standard', language: 'en', variantId: 'standard' }),
    base({ canonicalCardId: 'en-reverse', language: 'en', variantId: 'reverse_holo' }),
    base({ canonicalCardId: 'ja-standard', language: 'ja', variantId: 'standard' }),
  ]);
  assert.equal(families.length, 1);
  assert.equal(families[0].candidates.length, 2);
  assert.equal(families[0].candidates.every((candidate) => candidate.language === 'en'), true);
}

function standardVersusReverseHolo() {
  const resolved = resolveExactVariant({
    baseCandidate: base({ variantId: 'reverse_holo' }),
    candidateFamily: family('template-standard-vs-reverse-holo'),
    observations: [obs('reverse_holo_pattern', 'reverse holo pattern'), obs('foil_area', 'foil', 0.8)],
  });
  assert.equal(resolved.outcome, 'resolved_variant');
  assert.equal(resolved.exactVariant?.variantId, 'reverse_holo');

  const unresolved = resolveExactVariant({
    baseCandidate: base(),
    candidateFamily: family('template-standard-vs-reverse-holo'),
    observations: [],
  });
  assert.equal(unresolved.outcome, 'unresolved_variant');
  assert.equal(unresolved.exactVariant, null);
  assert.equal(unresolved.tiltCaptureRecommended, true);
}

function pokeballVersusMasterball() {
  const masterball = resolveExactVariant({
    baseCandidate: base({ variantId: 'masterball_holo', language: 'ja' }),
    candidateFamily: family('template-pokeball-vs-masterball'),
    observations: [obs('masterball_pattern', 'master ball pattern')],
  });
  assert.equal(masterball.outcome, 'resolved_variant');
  assert.equal(masterball.exactVariant?.variantId, 'masterball_holo');

  const pokeball = resolveExactVariant({
    baseCandidate: base({ variantId: 'pokeball_holo', language: 'ja' }),
    candidateFamily: family('template-pokeball-vs-masterball'),
    observations: [obs('pokeball_pattern', 'poke ball pattern')],
  });
  assert.equal(pokeball.outcome, 'resolved_variant');
  assert.equal(pokeball.exactVariant?.variantId, 'pokeball_holo');
}

function stampedVersusUnstamped() {
  const stamped = resolveExactVariant({
    baseCandidate: base({ variantId: 'stamped' }),
    candidateFamily: family('template-stamped-vs-unstamped'),
    observations: [obs('promo_stamp', 'promo stamp')],
  });
  assert.equal(stamped.outcome, 'resolved_variant');
  assert.equal(stamped.exactVariant?.variantId, 'stamped');

  const unstamped = resolveExactVariant({
    baseCandidate: base({ variantId: 'unstamped' }),
    candidateFamily: family('template-stamped-vs-unstamped'),
    observations: [obs('promo_stamp', 'absent', 0.92)],
  });
  assert.equal(unstamped.outcome, 'resolved_variant');
  assert.equal(unstamped.exactVariant?.variantId, 'unstamped');
}

function firstEditionVersusUnlimited() {
  const firstEdition = resolveExactVariant({
    baseCandidate: base({ setId: 'base1', variantId: 'first_edition' }),
    candidateFamily: family('template-first-edition-vs-unlimited'),
    observations: [obs('edition_stamp', '1st edition')],
  });
  assert.equal(firstEdition.outcome, 'resolved_variant');
  assert.equal(firstEdition.exactVariant?.variantId, 'first_edition');

  const unlimited = resolveExactVariant({
    baseCandidate: base({ setId: 'base1', variantId: 'unlimited' }),
    candidateFamily: family('template-first-edition-vs-unlimited'),
    observations: [obs('edition_stamp', 'absent', 0.93)],
  });
  assert.equal(unlimited.outcome, 'resolved_variant');
  assert.equal(unlimited.exactVariant?.variantId, 'unlimited');
}

function sameArtPromoRelease() {
  const promo = resolveExactVariant({
    baseCandidate: base({ setId: 'svp', variantId: 'promo' }),
    candidateFamily: family('template-promo-vs-set-release'),
    observations: [obs('promo_stamp', 'black star promo')],
  });
  assert.equal(promo.outcome, 'resolved_variant');
  assert.equal(promo.exactVariant?.variantId, 'promo');

  const unresolved = resolveExactVariant({
    baseCandidate: base({ variantId: 'promo' }),
    candidateFamily: family('template-promo-vs-set-release'),
    observations: [],
  });
  assert.equal(unresolved.outcome, 'unresolved_variant');
}

function textureVersusNonTexture() {
  const textured = resolveExactVariant({
    baseCandidate: base({ variantId: 'texture' }),
    candidateFamily: family('template-texture-vs-non-texture'),
    observations: [obs('texture', true)],
  });
  assert.equal(textured.outcome, 'resolved_variant');
  assert.equal(textured.exactVariant?.variantId, 'texture');

  const unresolved = resolveExactVariant({
    baseCandidate: base({ variantId: 'texture' }),
    candidateFamily: family('template-texture-vs-non-texture'),
    observations: [],
  });
  assert.equal(unresolved.outcome, 'unresolved_variant');
  assert.equal(unresolved.exactVariant, null);
}

function regionPlanUsesHighResolutionRectifiedImage() {
  const plan = buildVariantRegionExtractionPlan({
    rectifiedImage: {
      uri: 'file:///rectified-full.png',
      width: 1400,
      height: 2000,
      role: 'rectified_full',
      mimeType: 'image/png',
    },
    family: family('template-first-edition-vs-unlimited'),
  });
  assert.equal(plan.sourceWidth, 1400);
  assert.equal(plan.sourceHeight, 2000);
  assert.ok(plan.regions.some((region) => region.id === 'regulationCopyright'));
  assert.ok(plan.regions.every((region) => region.rect.width > 0 && region.rect.height > 0));
}

candidateFamiliesSplitByLanguage();
standardVersusReverseHolo();
pokeballVersusMasterball();
stampedVersusUnstamped();
firstEditionVersusUnlimited();
sameArtPromoRelease();
textureVersusNonTexture();
regionPlanUsesHighResolutionRectifiedImage();

console.log('variant resolver tests passed');
