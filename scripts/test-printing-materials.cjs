#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const zlib = require('node:zlib');
const ts = require(process.env.STACKR_TYPESCRIPT_PATH || 'typescript');
const { preparePack, decodeDataPng, crc32, sha256 } = require('./prepare-printing-material-pack.cjs');
const root = path.resolve(__dirname, '..');
function loadTs(relative) {
  const filename = path.join(root, relative); const mod = new Module(filename);
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, strict: true },
  });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  mod._compile(result.outputText, filename); return mod.exports;
}
const { isPrintingMaterial, resolvePrintingMaterial, containedMaterialRect } = loadTs('lib/cardPrintingMaterial.ts');
const { REVIEWED_PRINTING_MATERIALS } = loadTs('lib/cardPrintingMaterialRegistry.ts');
let passed = 0;
function test(name, action) { action(); passed++; console.log(`PASS ${name}`); }
function chunk(kind, content) {
  const data = Buffer.concat([Buffer.from(kind), content]);
  const length = Buffer.alloc(4); length.writeUInt32BE(content.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(data));
  return Buffer.concat([length, data, crc]);
}
function png(width, height, rgb, filter = 0, channels = 3) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = channels === 4 ? 6 : channels === 1 ? 0 : 2;
  const stride = width * channels; const rows = Buffer.alloc((stride + 1) * height);
  const pixels = Buffer.alloc(stride * height);
  for (let i = 0; i < pixels.length; i++) pixels[i] = rgb[i % channels];
  for (let y = 0; y < height; y++) {
    rows[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y ? pixels[(y - 1) * stride + x] : 0;
      const c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c; const ds = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const paeth = ds[0] <= ds[1] && ds[0] <= ds[2] ? a : ds[1] <= ds[2] ? b : c;
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth][filter];
      rows[y * (stride + 1) + 1 + x] = (pixels[y * stride + x] - prediction) & 255;
    }
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stackr-material-TEST-ONLY-'));
const write = (file, bytes) => { fs.writeFileSync(path.join(temp, file), bytes); return { file, sha256: sha256(bytes) }; };
const identity = { cardId: 'synthetic-test-only', languageCode: 'en', variantId: 'fixture-etched', variantCode: 'textured', finishCode: 'textured' };
const art = write('front.png', png(8, 12, [40, 70, 90]));
const refs = {
  front: art,
  tilt: write('test-only-tilt-reference.txt', Buffer.from('Synthetic test bytes. NOT A PHYSICAL CAPTURE.')),
  macro: write('test-only-macro-reference.txt', Buffer.from('Synthetic test bytes. NOT A VERIFIED MAP.')),
};
const evidence = { sourceType: 'physical-reference', identity, rightsRecord: 'SYNTHETIC TEST ONLY', ...refs,
  review: { identityMatch: true, foilBoundaryMatch: true, angularResponseMatch: true, textureMatch: true, artworkAlignmentMatch: true } };
const evidenceFile = write('test-evidence.json', Buffer.from(JSON.stringify(evidence)));
const manifest = {
  schemaVersion: 1, materialVersion: 'synthetic-test-only-v1', identity,
  artwork: { ...art, uri: 'https://example.invalid/synthetic-test-only.png' }, evidence: evidenceFile,
  review: { status: 'reference-reviewed', reviewer: 'SYNTHETIC TEST ONLY', reviewedAt: '2026-10-02T10:00:00Z', evidenceSha256: evidenceFile.sha256 },
  maps: { coverage: write('coverage.png', png(8, 12, [255], 0, 1)), surface: write('surface.png', png(8, 12, [128, 128, 255])),
    pattern: write('pattern.png', png(8, 12, [60, 150, 30])), optical: write('optical.png', png(8, 12, [70, 180, 200])) }, gain: 0.6,
};
const manifestPath = path.join(temp, 'manifest.json');
function pack(value = manifest) { fs.writeFileSync(manifestPath, JSON.stringify(value)); return preparePack(manifestPath); }
const profile = { profile: 'textured', confidence: 'verified_finish_generic_mask', identity,
  material: { foilStrength: 0.1, specularStrength: 0.1, textureStrength: 0.2, patternScale: 1 }, mask: { kind: 'full', provenance: 'generic' } };
try {
  let material;
  test('local pack round trip', () => { material = pack(); assert.ok(isPrintingMaterial(material)); });
  test('production registry contains no invented material', () => assert.deepEqual(REVIEWED_PRINTING_MATERIALS, []));
  test('exact printing and exact artwork selects material', () => assert.equal(resolvePrintingMaterial(profile, manifest.artwork.uri, [material]), material));
  for (const key of Object.keys(identity)) test(`wrong ${key} cannot borrow a material`, () => assert.equal(resolvePrintingMaterial({ ...profile, identity: { ...identity, [key]: 'wrong' } }, manifest.artwork.uri, [material]), null));
  test('different source/crop does not select maps', () => assert.equal(resolvePrintingMaterial(profile, 'https://example.invalid/other.png', [material]), null));
  test('missing artwork URI fails closed', () => assert.equal(resolvePrintingMaterial(profile, undefined, [material]), null));
  test('ambiguous versions fail closed', () => assert.equal(resolvePrintingMaterial(profile, manifest.artwork.uri, [material, { ...material, materialVersion: 'v2' }]), null));
  test('normal card stays unmapped', () => assert.equal(resolvePrintingMaterial({ ...profile, profile: 'plain' }, manifest.artwork.uri, [material]), null));
  test('invalid canonical payload stays unmapped', () => assert.equal(resolvePrintingMaterial({ ...profile, identity: null }, manifest.artwork.uri, [material]), null));
  test('unknown finish stays unmapped', () => assert.equal(resolvePrintingMaterial({ ...profile, confidence: 'unknown_finish' }, manifest.artwork.uri, [material]), null));
  for (const role of Object.keys(material.maps)) test(`missing ${role} rejected`, () => assert.equal(isPrintingMaterial({ ...material, maps: { ...material.maps, [role]: null } }), false));
  for (const gain of [0, -1, 1.01, NaN, Infinity]) test(`unsafe gain ${gain} rejected`, () => assert.equal(isPrintingMaterial({ ...material, gain }), false));
  test('pending review cannot be activated', () => assert.equal(isPrintingMaterial({ ...material, review: { ...material.review, status: 'pending' } }), false));
  test('bad map digest rejected', () => assert.equal(isPrintingMaterial({ ...material, maps: { ...material.maps, surface: { ...material.maps.surface, sha256: 'bad' } } }), false));
  test('bad base64 rejected', () => assert.equal(isPrintingMaterial({ ...material, maps: { ...material.maps, pattern: { ...material.maps.pattern, base64: 'https://untrusted.invalid/map.png' } } }), false));
  test('dimension mismatch rejected', () => assert.equal(isPrintingMaterial({ ...material, maps: { ...material.maps, optical: { ...material.maps.optical, width: 20 } } }), false));
  test('unreviewed intake fails instead of approving', () => assert.throws(() => pack({ ...manifest, review: { ...manifest.review, status: 'pending' } }), /review missing/));
  test('tampered source hash rejected', () => assert.throws(() => pack({ ...manifest, artwork: { ...manifest.artwork, sha256: 'a'.repeat(64) } }), /Checksum/));
  test('wrong physical evidence identity rejected', () => assert.throws(() => pack({ ...manifest, identity: { ...identity, languageCode: 'ja' } }), /Evidence printing/));
  test('outside-root reference rejected', () => assert.throws(() => pack({ ...manifest, artwork: { ...manifest.artwork, file: __filename } }), /escapes pack/));
  test('intake preserves every original map byte', () => { for (const entry of Object.values(manifest.maps)) assert.equal(sha256(fs.readFileSync(path.join(temp, entry.file))), entry.sha256); });
  for (let filter = 0; filter <= 4; filter++) test(`PNG filter ${filter} round trip`, () => {
    const decoded = decodeDataPng(png(7, 11, [23, 94, 207], filter));
    for (let i = 0; i < decoded.pixels.length; i++) assert.equal(decoded.pixels[i], [23, 94, 207][i % 3]);
  });
  test('RGBA opaque data accepted', () => assert.equal(decodeDataPng(png(2, 3, [1, 2, 3, 255], 0, 4)).channels, 4));
  test('alpha-multiplied data rejected', () => assert.throws(() => decodeDataPng(png(2, 3, [1, 2, 3, 100], 0, 4)), /opaque/));
  test('PNG CRC failure rejected', () => { const data = png(2, 3, [0, 0, 0]); data[31] ^= 1; assert.throws(() => decodeDataPng(data), /CRC/); });
  test('truncated PNG rejected', () => assert.throws(() => decodeDataPng(png(2, 3, [0, 0, 0]).subarray(0, 50))));
  test('trailing PNG data rejected', () => assert.throws(() => decodeDataPng(Buffer.concat([png(2, 3, [0, 0, 0]), Buffer.from('x')])), /trailing/));
  test('data colour profile rejected', () => {
    const data = png(2, 3, [0, 0, 0]); const gamma = Buffer.alloc(4); gamma.writeUInt32BE(45455);
    assert.throws(() => decodeDataPng(Buffer.concat([data.subarray(0, 33), chunk('gAMA', gamma), data.subarray(33)])), /colour/);
  });
  test('invalid normal map rejected', () => {
    const bad = write('bad-normal.png', png(8, 12, [0, 0, 0]));
    assert.throws(() => pack({ ...manifest, maps: { ...manifest.maps, surface: bad } }), /unit normal/);
  });
  test('contain transform preserves image margins', () => assert.deepEqual(containedMaterialRect(100, 200, 100, 100), { x: 0, y: 50, width: 100, height: 100 }));
  test('contain transform rejects invalid dimensions', () => assert.equal(containedMaterialRect(0, 2, 1, 1), null));
  const shader = loadTs('lib/cardPrintingMaterialShader.ts').CARD_PRINTING_MATERIAL_SHADER;
  test('shader consumes all four independent maps', () => { for (const role of Object.keys(manifest.maps)) assert.ok(shader.includes(`uniform shader ${role}Map;`)); });
  test('exact shader has no timer or procedural noise', () => { assert.ok(!/uniform.*time|hash21|random|fract\(/i.test(shader)); });
  test('shader protects zero-coverage artwork', () => assert.ok(shader.includes('if (coverage < 0.0001) return half4(0.0);')));
  test('shader returns bounded premultiplied output', () => assert.ok(shader.includes('clamp(colour, 0.0, 1.0) * alpha, alpha')));
  for (const filename of ['components/CardPrintingMaterial.native.tsx', 'components/CardFoilSurface.native.tsx', 'components/CardInspectionViewer.tsx']) test(`TSX syntax ${filename}`, () => {
    const result = ts.transpileModule(fs.readFileSync(path.join(root, filename), 'utf8'), { fileName: filename, reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } });
    assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  });
  test('native integration preserves catalogue-only boundary', () => {
    const code = fs.readFileSync(path.join(root, 'components/CardFoilSurface.native.tsx'), 'utf8');
    assert.ok(code.includes("if (props.source !== 'catalogue' || !material) return null;"));
    assert.ok(code.includes('resolvePrintingMaterial(props.profile, props.artworkUri, REVIEWED_PRINTING_MATERIALS)'));
  });
  test('viewer supplies current configured artwork source', () => {
    const code = fs.readFileSync(path.join(root, 'components/CardInspectionViewer.tsx'), 'utf8');
    assert.ok(code.includes('onSourceChange={setBaseArtworkUri}'));
    assert.ok(code.includes('artworkUri={displayedArtworkUri}'));
    assert.ok(code.includes('resolvePrintingMaterial(profile, displayedArtworkUri, REVIEWED_PRINTING_MATERIALS)'));
  });
  console.log(JSON.stringify({ passed, failed: 0, scope: 'synthetic local intake, identity, PNG decode and source/syntax checks', nativeShaderCompile: 'not run', physicalCardsVerified: 0 }));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
