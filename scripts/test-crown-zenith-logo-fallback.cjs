'use strict';
// Source-runtime regressions only. These fixtures do not prove storage/image or phone delivery.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const parentId = '42096fc0-51f2-4805-a114-e6f2811a0c49';
const galleryId = '8bb033f3-6059-4f5f-a021-c363241092a1';
const meeId = '6f4ff21c-f7e5-42bd-9ac1-ce0212ae1061';
const unrelatedId = '819d7be8-9fa9-4f20-975c-9328a7ffbd9c';
const root = 'https://catalogue.example.test/storage/v1/object/public/stackr-catalogue-public/';
const reviewedKey = 'public/set_logo/reviewed/catalogue/' + parentId
  + '/dcc01afe69d851972c3c5a05a64fb9c939d1a5df6906e8d0b4be33f682627c92/delivery.png';
const sourcePath = process.env.STACKR_LOGO_FALLBACK_SOURCE
  || path.join(__dirname, '../lib/publishedSetLogoFallbacks.ts');
const source = fs.readFileSync(sourcePath, 'utf8');

function load({ staleGallery = false, ownMeeLogo = false } = {}) {
  const logos = [
    { setId: parentId, language: 'en', setCode: 'swsh12.5', storageKey: 'old-crown.webp' },
    { setId: unrelatedId, language: 'en', setCode: 'swsh10', storageKey: 'astral.webp' },
    { setId: 'japanese-id', language: 'ja', setCode: 'M5', storageKey: 'japanese.png' },
    { setId: 'mega-parent-id', language: 'en', setCode: 'me01', storageKey: 'mega-parent.png' },
  ];
  if (staleGallery) logos.push({ setId: galleryId, language: 'en', setCode: 'swsh12.5gg', storageKey: 'stale-gallery.webp' });
  if (ownMeeLogo) logos.push({ setId: meeId, language: 'en', setCode: 'mee', storageKey: 'own-mee.png' });
  const modules = {
    './generated/publishedSetLogos.generated.json': { logos },
    './generated/publishedSimplifiedChineseCovers.generated.json': {
      covers: [{ setId: 'cover-id', storageKey: 'cover.png' }],
    },
    './mobileRuntimeConfig': { MOBILE_RUNTIME_CONFIG: { supabaseUrl: 'https://catalogue.example.test' } },
  };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    reportDiagnostics: true,
    fileName: sourcePath,
  });
  assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    exports: module.exports, module,
    require(id) {
      assert.ok(Object.hasOwn(modules, id), `Unexpected dependency: ${id}`);
      return modules[id];
    },
  }, { filename: sourcePath, timeout: 1000 });
  return module.exports;
}

for (const staleGallery of [false, true]) {
  test(`Crown and Gallery select the same reviewed PNG (stale child: ${staleGallery})`, () => {
    const { getPublishedSetLogoFallback: logo } = load({ staleGallery });
    for (const id of [parentId, galleryId]) {
      assert.equal(logo({ id, language: 'en' }), root + reviewedKey, id);
      assert.equal(logo({ setId: id }), root + reviewedKey, id);
      assert.equal(logo({ id: 'en:' + id }), root + reviewedKey, id);
    }
  });
}

test('canonical and verified legacy code spellings work with English aliases', () => {
  const { getPublishedSetLogoFallback: logo } = load({ staleGallery: true });
  for (const code of ['swsh12.5', 'swsh12pt5', 'swsh12.5gg', 'swsh12pt5gg']) {
    for (const language of ['en', 'en-GB', 'en_US', 'eng', 'English']) {
      assert.equal(logo({ id: code, language }), root + reviewedKey, code + ':' + language);
      assert.equal(logo({ setCode: code, language }), root + reviewedKey, code + ':' + language);
    }
    assert.equal(logo({ id: 'en:' + code }), root + reviewedKey, code);
  }
});

test('non-English identities and contradictory prefixes do not borrow Crown artwork', () => {
  const { getPublishedSetLogoFallback: logo } = load({ staleGallery: true });
  for (const language of ['ja', 'jp', 'zh-cn', 'zh-tw', 'ko', 'fr']) {
    for (const id of [parentId, galleryId, 'swsh12.5gg', 'swsh12pt5gg']) {
      assert.equal(logo({ id, language }), undefined, id + ':' + language);
      assert.equal(logo({ id: 'en:' + id, language }), undefined, id + ':' + language);
    }
  }
  assert.equal(logo({ id: 'ja:' + galleryId, language: 'en' }), undefined);
});

test('a known unrelated set wins over a conflicting supplied Crown code', () => {
  const { getPublishedSetLogoFallback: logo } = load();
  assert.equal(logo({ id: unrelatedId, setCode: 'swsh12.5gg', language: 'en' }), root + 'astral.webp');
  assert.equal(logo({ id: 'japanese-id', setCode: 'swsh12.5gg', language: 'en' }), undefined);
});

test('unknown or almost-matching codes stay unavailable rather than guessing', () => {
  const { getPublishedSetLogoFallback: logo } = load();
  for (const id of ['swsh12pt5gg-extra', 'swsh125gg', 'm6', 'm6a', 'unknown', '']) {
    assert.equal(logo({ id, language: 'en' }), undefined, id);
  }
  assert.equal(logo(null), undefined);
  assert.equal(logo(), undefined);
});

test('existing Japanese and MEE fallback behaviour is retained', () => {
  const { getPublishedSetLogoFallback: logo } = load();
  assert.equal(logo({ id: 'jp:M5' }), root + 'japanese.png');
  assert.equal(logo({ id: meeId }), root + 'mega-parent.png');
  assert.equal(logo({ id: 'mee', language: 'en' }), root + 'mega-parent.png');
  assert.equal(load({ ownMeeLogo: true }).getPublishedSetLogoFallback({ id: meeId, language: 'en' }), root + 'own-mee.png');
});

test('the separate cover fallback is unchanged', () => {
  const { getPublishedSetCoverFallback: cover } = load();
  assert.equal(cover({ id: 'cover-id', language: 'zh-cn' }), root + 'cover.png');
  assert.equal(cover({ id: 'cover-id', language: 'zh-hans' }), root + 'cover.png');
  assert.equal(cover({ id: 'cover-id', language: 'en' }), undefined);
  assert.equal(cover({ id: 'missing', language: 'zh-cn' }), undefined);
});

test('lookup never mutates the Gallery identity, membership or caller data', () => {
  const { getPublishedSetLogoFallback: logo } = load();
  const input = Object.freeze({ id: galleryId, language: 'en', setCode: 'swsh12.5gg', total: 70 });
  const before = JSON.stringify(input);
  assert.equal(logo(input), root + reviewedKey);
  assert.equal(JSON.stringify(input), before);
});
