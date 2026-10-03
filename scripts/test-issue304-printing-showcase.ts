import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveCardHoloProfile } from '../lib/cardHoloProfile';
import { resolvePrintingMaterial } from '../lib/cardPrintingMaterial';
import { REVIEWED_PRINTING_MATERIALS } from '../lib/cardPrintingMaterialRegistry';

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
assert.match(viewer,/colors=\{\['#17161A', '#0E0E11', '#09090B'\]\}/,'showcase background stays restrained and neutral');
assert.match(viewer,/onSourceChange=\{setBaseArtworkUri\}/,'material selection follows the source StackrImage actually attempts to display');
assert.match(viewer,/displayedArtworkUri = fullLoaded && request\.fullImageUri \? request\.fullImageUri : baseArtworkUri/);
assert.match(viewer,/resolvePrintingMaterial\(profile, displayedArtworkUri, REVIEWED_PRINTING_MATERIALS\)/);
assert.match(viewer,/foilHaptics=\{hasVerifiedMaterial && lightingEnabled\}/,'foil haptics require a verified material, not merely a finish label');
assert.match(viewer,/width - 32/,'portrait showcase allows the card to dominate the available width');
assert.match(viewer,/no verified material pack for this printing yet/,'unsupported finishes remain explicit');

const preview = fs.readFileSync('components/InteractiveCardPreview.tsx','utf8');
assert.match(preview,/nextCardFoilHapticState|FoilCrossingHaptics/);
assert.match(preview,/AppState\.currentState === 'active'/,'delayed haptics expire after backgrounding');
assert.match(preview,/cancelAnimation/,'motion is cancelled on suspension/unmount');

const evidence = fs.readFileSync('docs/releases/issue304-printing-material-evidence.md','utf8');
assert.match(evidence,/Cosmos Holofoil/);
assert.match(evidence,/Production material registry entry: \*\*none\*\*/);
assert.match(evidence,/licensed physical tilt\/macro reference pixels suitable for deriving maps: \*\*missing\*\*/);

console.log('Issue #304 showcase regressions passed: no purple surround, no generic foil fallback, displayed-source binding, verified-only haptics and truthful Shining Mew status.');
