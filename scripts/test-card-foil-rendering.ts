import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import CanvasKitInit from 'canvaskit-wasm';
import { CARD_FOIL_MODES, CARD_FOIL_SHADER } from '../lib/cardFoilShader';
import { resolveCardHoloProfile } from '../lib/cardHoloProfile';
import fixtures from '../data/fixtures/card-holo-profile.synthetic.json';

/** Compiles the actual native SkSL using the Skia version bundled with Skia RN.
 * CPU/WASM pixel evidence is not a native GPU/frame-rate measurement.
 */
async function main() {
  const kit = await CanvasKitInit({ locateFile: file => path.join(path.dirname(require.resolve('canvaskit-wasm')), file) });
  let compilerError = '';
  const effect = kit.RuntimeEffect.Make(CARD_FOIL_SHADER, error => { compilerError = error; });
  assert.ok(effect, `SkSL must compile: ${compilerError}`);
  let cases = 1;
  const width = 180, height = 250;
  const surface = kit.MakeSurface(width, height)!;
  assert.ok(surface);
  const canvas = surface.getCanvas();
  const pixels = (mode: number, x: number, y: number, maskKind = 1, foil = 0.3, neutral = 0.06) => {
    canvas.clear(kit.TRANSPARENT);
    const uniforms = [width, height, x, y, mode, foil, neutral, 0.7, 1, maskKind, 1,
      0.12, 0.16, 0.76, 0.38, ...Array(12).fill(0)];
    const shader = effect.makeShader(uniforms);
    const paint = new kit.Paint(); paint.setShader(shader);
    canvas.drawPaint(paint); surface.flush();
    paint.delete(); shader.delete();
    const image = surface.makeImageSnapshot();
    const result = image.readPixels(0, 0, { width, height, colorType: kit.ColorType.RGBA_8888, alphaType: kit.AlphaType.Premul, colorSpace: kit.ColorSpace.SRGB });
    image.delete();
    assert.ok(result instanceof Uint8Array);
    return result;
  };
  const neutral = pixels(0, 0, 0, 0, 0);
  for (let i = 0; i < neutral.length; i += 4) {
    assert.equal(neutral[i], neutral[i + 1]); assert.equal(neutral[i], neutral[i + 2]);
  }
  cases++;
  assert.deepEqual(pixels(5, 0.5, 0.5, 0, 0.3), pixels(0, 0.5, 0.5, 0, 0), 'missing mask removes every coloured pixel');
  cases++;
  const signatures = new Set<string>();
  for (const [name, mode] of Object.entries(CARD_FOIL_MODES)) {
    const still = pixels(mode, 0, 0, 1, mode ? 0.3 : 0);
    const tilted = pixels(mode, 0.75, -0.55, 1, mode ? 0.3 : 0);
    assert.notDeepEqual(tilted, still, `${name}: light responds to movement`);
    assert.deepEqual(tilted, pixels(mode, 0.75, -0.55, 1, mode ? 0.3 : 0), `${name}: no time/random animation`);
    assert.ok(tilted.every((value, index) => index % 4 !== 3 || value <= 113), `${name}: bounded opacity keeps artwork legible`);
    signatures.add(Buffer.from(tilted).toString('base64'));
    cases += 3;
  }
  assert.equal(signatures.size, 6, 'each profile produces a distinct material'); cases++;
  const art = pixels(1, 0.4, 0.4, 2, 0.4, 0);
  const reverse = pixels(2, 0.4, 0.4, 3, 0.4, 0);
  const alphaAt = (data: Uint8Array, x: number, y: number) => data[(y * width + x) * 4 + 3];
  assert.equal(alphaAt(art, 90, 200), 0, 'artwork masks preserve text region'); cases++;
  assert.equal(alphaAt(reverse, 90, 80), 0, 'reverse masks preserve artwork interior'); cases++;
  assert.ok(alphaAt(reverse, 90, 200) > 0, 'reverse treatment appears outside artwork'); cases++;

  if (process.argv.includes('--write-fixtures')) {
    const output = path.resolve('outputs/holographic-inspection'); mkdirSync(output, { recursive: true });
    const sheet = kit.MakeSurface(width * 7, height * 3)!;
    const sheetCanvas = sheet.getCanvas();
    const base = new kit.Paint();
    // Original geometric material swatches, deliberately not fake card scans.
    const names = fixtures.cases.map(fixture => fixture.id);
    fixtures.cases.forEach((fixture, column) => {
      const profile = resolveCardHoloProfile({ language: 'en', stackr: {
        canonical: true, cardId: 'synthetic-rendering-test', defaultVariantId: fixture.id,
        variants: [{ variantId: fixture.id, variantCode: fixture.finishCode, finishCode: fixture.finishCode }],
      } }, { masks: fixture.expectedMaskKind === 'regions' || fixture.expectedMaskKind === 'outside-artwork' ? [{
        kind: 'template', cardId: 'synthetic-rendering-test', languageCode: 'en', variantId: fixture.id,
        coverage: fixture.coverage === 'exclude' ? 'exclude' : 'include', regions: [fixtures.normalizedRegion],
      }] : [] });
      [[-0.7, -0.4], [0, 0], [0.7, 0.4]].forEach(([x, y], row) => {
        const mode = CARD_FOIL_MODES[profile.profile];
        canvas.clear(kit.parseColorString('#D6C5A4'));
        const artWindow = fixtures.normalizedRegion;
        base.setColor(kit.parseColorString('#355E67')); canvas.drawRect(kit.XYWHRect(artWindow.x * width, artWindow.y * height, artWindow.width * width, artWindow.height * height), base);
        base.setColor(kit.parseColorString('#203743')); canvas.drawCircle(88, 106, 25, base);
        base.setColor(kit.parseColorString('#534B50'));
        for (let line = 0; line < 4; line++) canvas.drawRect(kit.XYWHRect(24, 190 + line * 13, 110 - line * 9, 3), base);
        const maskKind = profile.mask.kind === 'none' ? 0 : profile.mask.kind === 'full' ? 1 : profile.mask.kind === 'outside-artwork' ? 3 : 2;
        const regions = Array.from({ length: 4 }, (_, i) => {
          const r = profile.mask.regions?.[i]; return r ? [r.x,r.y,r.width,r.height] : [0,0,0,0];
        }).flat();
        const material = profile.material;
        const shader = effect.makeShader([width,height,x,y,mode,material.foilStrength,material.specularStrength,material.textureStrength,material.patternScale,maskKind,profile.mask.regions?.length ?? 0,...regions]);
        const foilPaint = new kit.Paint(); foilPaint.setShader(shader); canvas.drawPaint(foilPaint); surface.flush();
        const snapshot = surface.makeImageSnapshot();
        sheetCanvas.drawImage(snapshot, column * width, row * height);
        snapshot.delete(); foilPaint.delete(); shader.delete();
      });
    });
    sheet.flush(); const snapshot = sheet.makeImageSnapshot();
    writeFileSync(path.join(output, 'material-contact-sheet.png'), snapshot.encodeToBytes()!);
    writeFileSync(path.join(output, 'README.txt'), `Actual SkSL and resolver material parameters rendered by Skia CPU/WASM. NOT native device evidence or catalogue metadata.\nColumns: ${names.join(', ')}.\nRows: tilt (-0.7,-0.4), neutral, tilt (0.7,0.4).\nOriginal geometric swatch, not Pokemon artwork; masks deliberately synthetic shader test inputs. The runtime verified registry is empty, so regional materials remain neutral on actual catalogue cards.\n`);
    snapshot.delete(); sheet.delete(); base.delete();
  }
  surface.delete(); effect.delete();
  console.log(`Card foil rendering: ${cases} cases passed, 0 failed (Skia CPU/WASM, not native GPU).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
