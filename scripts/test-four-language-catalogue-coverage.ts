import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildFourLanguageCatalogueCoverage } from './audit-four-language-catalogue-coverage';
import { collectFourLanguageCoverageBaseline } from './collect-four-language-coverage-baseline';

const report = buildFourLanguageCatalogueCoverage({
  generatedAt: '2026-09-05T00:00:00.000Z', inputSha256: { catalogue: 'a'.repeat(64), provider: 'b'.repeat(64) },
  catalogue: {
    sets: [
      { id: 'same', language: 'en', name: 'English set', releaseDate: '2025-01-01', images: { logo: 'https://example.test/logo' } },
      { id: 'same', language: 'ja', localName: '日本語セット', englishDisplayName: 'Japanese Set', releaseDate: '2025-01-01', logoAvailability: 'verified_available' },
      { id: 'cn-only', language: 'zh-cn', localName: '中文套装' },
    ],
    cards: [
      { id: 'en-1', language: 'en', setId: 'same', name: 'Card', number: '1', rarity: 'Rare', releaseDate: '2025-01-01', imageUrl: 'https://example.test/card' },
      { id: 'ja-1', language: 'ja', setId: 'same', localName: 'カード', englishDisplayName: 'Card', number: '1', rarity: 'Rare', releaseDate: '2025-01-01', imageUrl: 'https://example.test/card', nativeImageAvailability: 'verified_available' },
      { id: 'cn-1', language: 'zh-cn', setId: 'cn-only', localName: '卡牌' },
      { id: 'orphan', language: 'zh-tw', name: '孤立卡' },
    ],
  },
  provider: {
    sets: [{ id: 'same', language: 'en' }, { id: 'same', language: 'ja' }, { id: 'provider-cn', language: 'zh-cn' }],
    cards: [{ id: 'expected-en', language: 'en', setId: 'same' }, { id: 'expected-ja', language: 'ja', setId: 'same' }, { id: 'missing-ja', language: 'ja', setId: 'same' }, { id: 'expected-cn', language: 'zh-cn', setId: 'provider-cn' }],
  },
});

assert.equal(report.readOnly, true);
assert.equal(report.networkAccessed, false);
assert.equal(report.databaseModified, false);
assert.equal(report.storageModified, false);
assert.equal(report.imageSemantics.includes('not load evidence'), true);
assert.deepEqual(report.crossLanguageSetIds, [{ setId: 'same', languages: ['en', 'ja'] }]);
const ja = report.sets.find((row) => row.language === 'ja' && row.setId === 'same')!;
assert.equal(ja.expectedCards, 2);
assert.equal(ja.observedCards, 1);
assert.equal(ja.missingObservedCards, 1, 'missing card records are distinct from missing images');
assert.equal(ja.cards.verifiedNativeImages, 1);
assert.equal(ja.cards.unverifiedImagePointers, 0);
const en = report.sets.find((row) => row.language === 'en' && row.setId === 'same')!;
assert.equal(en.cards.imagePointers, 1);
assert.equal(en.cards.verifiedNativeImages, 0);
assert.equal(en.cards.unverifiedImagePointers, 1, 'an image URL alone is not proof of a loaded native image');
const observedOnlyCn = report.sets.find((row) => row.language === 'zh-cn' && row.setId === 'cn-only')!;
assert.equal(observedOnlyCn.expectedCards, null);
assert.equal(observedOnlyCn.missingObservedCards, null);
assert.equal(observedOnlyCn.expectedSource, 'unknown');
assert.equal(observedOnlyCn.metadata.missingEnglishSupplement, true);
assert.equal(observedOnlyCn.cards.missingCollectorIdentity, 1);
assert.equal(report.byLanguage.find((row) => row.language === 'zh-tw')!.unknownCardDenominatorSets, 0);
assert.ok(report.conflicts.some((row) => row.type === 'observed_card_missing_set_identity'));

const noProvider = buildFourLanguageCatalogueCoverage({ catalogue: { sets: [{ id: 'tw', language: 'zh-tw', localName: '繁體' }], cards: [] } });
const tw = noProvider.sets.find((row) => row.language === 'zh-tw')!;
assert.equal(tw.expectedCards, null);
assert.equal(tw.expectedSource, 'unknown');
assert.equal(noProvider.byLanguage.find((row) => row.language === 'zh-tw')!.expectedCards, null);

// The converter must not compare canonical variants with provider card totals.
const root = mkdtempSync(resolve(tmpdir(), 'four-language-coverage-baseline-'));
try {
  const providerRoot = resolve(root, 'provider'); const evidenceRoot = resolve(root, 'evidence'); mkdirSync(resolve(providerRoot, 'raw'), { recursive: true }); mkdirSync(evidenceRoot);
  const hash = (body: string) => createHash('sha256').update(body).digest('hex');
  const rawFiles: { path: string; sha256: string }[] = [];
  for (const language of ['en', 'ja', 'zh-cn', 'zh-tw']) {
    const body = JSON.stringify(language === 'ja' ? [{ id: 'S1', name: 'セット', cardCount: { total: 2, official: 1 } }] : []);
    const path = `raw/${language}.sets.json`; writeFileSync(resolve(providerRoot, path), body); rawFiles.push({ path, sha256: hash(body) });
  }
  const reconciliation = `${JSON.stringify({ entityType: 'provider_set', language: 'ja', providerSetId: 'S1', status: 'matched_exact', canonical: { setId: 'canonical-ja' } })}\n`;
  writeFileSync(resolve(providerRoot, 'provider-baseline-row-reconciliation.jsonl'), reconciliation); rawFiles.push({ path: 'provider-baseline-row-reconciliation.jsonl', sha256: hash(reconciliation) });
  writeFileSync(resolve(providerRoot, 'manifest.json'), JSON.stringify({ generatedAt: '2026-08-14T12:00:00.000Z', files: rawFiles }));
  const ledger = `${JSON.stringify({ entityType: 'variant_identity', language: 'ja', facts: { setId: 'canonical-ja' } })}\n`;
  writeFileSync(resolve(evidenceRoot, 'canonical-catalogue-row-evidence.jsonl'), ledger);
  writeFileSync(resolve(evidenceRoot, 'manifest.json'), JSON.stringify({ observedAt: '2026-09-03T21:20:14.027Z', outputSha256: { 'canonical-catalogue-row-evidence.jsonl': hash(ledger) } }));
  const baseline = collectFourLanguageCoverageBaseline({ providerRoot, evidenceRoot, generatedAt: '2026-09-05T00:00:00.000Z' });
  const set = baseline.sets.find((row) => row.language === 'ja' && row.setId === 'canonical-ja')!;
  assert.equal(set.expectedCards, 2, 'full provider total is preferred over the narrower official count');
  assert.equal(set.observedVariants, 1);
  assert.equal(set.observedCards, null, 'variant identities are not card identities');
  assert.equal(set.missingObservedCards, null, 'mixed units must never produce a missing-card claim');
  assert.equal(baseline.readOnly, true);
  assert.equal(baseline.databaseModified, false);
  assert.equal(baseline.storageModified, false);
  assert.equal(baseline.baseline.productionModified, false);
  assert.equal(baseline.baseline.providerSnapshotGeneratedAt, '2026-08-14T12:00:00.000Z');
  assert.equal(baseline.baseline.canonicalEvidenceObservedAt, '2026-09-03T21:20:14.027Z');
} finally { rmSync(root, { recursive: true, force: true }); }

console.log('Four-language catalogue coverage tests passed.');
