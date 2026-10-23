import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolveCardHoloProfile } from '../lib/cardHoloProfile';
import { resolvePrintingMaterial } from '../lib/cardPrintingMaterial';
import { REVIEWED_PRINTING_MATERIALS } from '../lib/cardPrintingMaterialRegistry';
import { stackrSemanticColors } from '../lib/theme';

const raw = { language: 'ja', stackr: { canonical: true, cardId: 'printing-ja', defaultVariantId: 'foil-ja',
  variants: [{ variantId: 'foil-ja', variantCode: 'holo', finishCode: 'cosmos_holo' }] } };
const profile = resolveCardHoloProfile(raw, { cardId: 'printing-ja', languageCode: 'ja', selectedVariantId: 'foil-ja' });
assert.equal(profile.profile, 'cosmos');
assert.equal(REVIEWED_PRINTING_MATERIALS.length, 0, 'production registry must not contain synthetic study textures');
assert.equal(resolvePrintingMaterial(profile, 'https://catalogue.example/card.webp', REVIEWED_PRINTING_MATERIALS), null,
  'known finish metadata alone never authorizes a visual material');

const nativeSurface = fs.readFileSync('components/CardFoilSurface.native.tsx','utf8');
assert.doesNotMatch(nativeSurface,/CARD_FOIL_SHADER|CatalogueMaterial|CARD_FOIL_MODES/,
  'runtime native surface must not fall back to the generic procedural foil');
assert.match(nativeSurface,/resolvePrintingMaterial/);
assert.match(nativeSurface,/if \(props\.source !== 'catalogue' \|\| !material\) return null/);

const webSurface = fs.readFileSync('components/CardFoilSurface.tsx','utf8');
assert.match(webSurface,/return null/);
assert.doesNotMatch(webSurface,/LinearGradient|ReflectionSheet/,
  'web must not substitute a generic decorative foil');

const viewer = fs.readFileSync('components/CardInspectionViewer.tsx','utf8');
assert.doesNotMatch(viewer,/stageLight/,'purple showcase spotlight/surround is removed');
const stage = fs.readFileSync('components/CardInspectionStage.tsx', 'utf8');
const paletteSource = stage.match(/CARD_SHOWCASE_COLORS = (\{[\s\S]*?\}) as const/);
assert.ok(paletteSource);
const palette = vm.runInNewContext(`(${paletteSource[1]})`);
const luminance = (hex: string) => {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
assert.ok(luminance(palette.background) < 0.025, 'the Stackr stage stays dark');
assert.equal(palette.accent, stackrSemanticColors.brand, 'Showcase retains the existing brand purple');
assert.ok((luminance(palette.text) + 0.05) / (luminance(palette.stage) + 0.05) >= 7, 'card text stays readable on the stage');
assert.match(viewer,/backgroundColor: colors\.background/);
assert.match(viewer,/source=\{stackrBrand\.wordmark\}/, 'the actual brand asset identifies Showcase');
assert.match(viewer,/onSourceChange=\{setBaseArtworkUri\}/,'material selection follows the source StackrImage actually attempts to display');
assert.match(viewer,/displayedArtworkUri = fullLoaded && request\.fullImageUri \? request\.fullImageUri : baseArtworkUri/);
assert.match(viewer,/resolvePrintingMaterial\(profile, displayedArtworkUri, REVIEWED_PRINTING_MATERIALS\)/);
assert.match(viewer,/const foilEnabled = lightingEnabled && !unavailable && hasVerifiedMaterial/);
assert.match(viewer,/foilHaptics=\{foilEnabled\}/,'foil haptics require a verified material, not merely a finish label');
assert.match(viewer,/width - 32/,'portrait showcase allows the card to dominate the available width');
assert.match(viewer,/Studio lighting · catalogue artwork/,'neutral presentation lighting is labelled independently of physical foil');
assert.match(viewer,/foil preview unavailable/,'optional foil failure retains explicit wording');

const preview = fs.readFileSync('components/InteractiveCardPreview.tsx','utf8');
assert.match(preview,/nextCardFoilHapticState|FoilCrossingHaptics/);
assert.match(preview,/AppState\.currentState === 'active'/,'delayed haptics expire after backgrounding');
assert.match(preview,/cancelAnimation/,'motion is cancelled on suspension/unmount');

const evidence = fs.readFileSync('docs/releases/issue304-printing-material-evidence.md','utf8');
assert.match(evidence,/Cosmos Holofoil/);
assert.match(evidence,/Production material registry entry: \*\*none\*\*/);
assert.match(evidence,/licensed physical tilt\/macro reference pixels suitable for deriving maps: \*\*missing\*\*/);

console.log('Issue #304 showcase regressions passed: dark readable Stackr stage, neutral studio lighting, no generic foil fallback, exact displayed-source binding and truthful Shining Mew status.');
