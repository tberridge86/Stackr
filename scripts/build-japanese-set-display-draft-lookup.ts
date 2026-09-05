/** Builds a review-only, rights-gated Japanese set translation candidate lookup. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readCjkEditorialSetTranslationRightsGate } from './cjk-editorial-set-translation-rights-gate';

const SOURCE_PATH = resolve('catalogue/japanese-set-display-drafts-source.json');
const CLIENT_OUTPUT = resolve('lib/generated/japaneseSetDisplayDrafts.generated.ts');
const BACKEND_OUTPUT = resolve('backend/lib/generated/japaneseSetDisplayDrafts.generated.mjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_EXCLUSIONS = ['DP4', 'DP5', 'SA', 'MG', 'CLF', 'DP1', 'PPP', 'CLL', 'DPP', 'DPtP', 'CLK', 'LP'];
const PINNED_TCGDEX_NATIVE_TITLE_SHA256: Record<string, string> = {
  PCG1: '3573099ff83929a1da1dd1e7fad056e9e4cee52933cd8c0f540b33f860e5ae0d', PCG2: '36c8284e21fadfd63c1dcc0eec8f48fd734fa0f2a97a803057b025849eb2db24', PCG3: 'b8f0ba1aa96d01e4e79ca975691499a4acc6780f89e3126efe93df7408997382', PCG4: 'd90d274df69b494681de6473cf3683524a826332ba92d0b821c7d9bc5bdad252', PCG5: '053e7f712902b4cf61e27ebb1b0cc8b65965d8ac4b3534ece0e93f59bcf7be9b', PCG6: 'b72e5c77398253df002db08153ab7bb398b1be53f75b173ec3b40d141fca42a3', PCG7: '820b328486358b6d18d73f92410ed09103f4a0a6259f8ee20224ed37d062a39a', PCG8: 'ca1437d3327093bfd70c0d98f1a6008a7130be15057f11c22dece6214bedf98e', PCG9: 'b1fa39349b5b06a691159959719e26a12af20e2b7f28acb439a03f065832ab94', PCG10: '9d6253339276e1c076faa7514f50d91d0c878d1ec7054870b020792d5dd7cf07', M6: 'bb57cf15269a31ab857e526903e2db03bba1ff09e1a198a96c2e51439800e2a2',
};

type SourceEntry = { canonicalSetId: string; setCode: string; nativeName: string; englishTranslation: string; sourceUrl: string; sourceKind?: string; sourcePath?: string; sourceSha256?: string };
type Source = { schemaVersion: string; policy: Record<string, unknown>; pinnedTcgdex: { repository: string; commit: string; licence: string }; exclusions: { ambiguousVariantCodes: string[]; needsVariantReviewCodes: string[] }; entries: SourceEntry[] };
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const normalizeJapaneseSetDisplayDraftCode = (value: unknown) => String(value ?? '').trim().replace(/\+/g, 'p').toLowerCase().replace(/[^a-z0-9.]+/g, '');
const normalizeNativeName = (value: string) => value.normalize('NFKC').replace(/\s+/gu, '');

function validText(value: unknown, label: string, allowJapanese = true) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 500 || /[\u0000-\u001f\u007f]/u.test(text) || (!allowJapanese && /[\u3040-\u30ff\u3400-\u9fff]/u.test(text))) throw new Error(`Invalid ${label}`);
  return text;
}

function readSource(sourcePath = SOURCE_PATH) {
  const body = readFileSync(sourcePath, 'utf8');
  const source = JSON.parse(body) as Source;
  if (source.schemaVersion !== 'stackr-japanese-set-display-drafts-source-v3') throw new Error('Unexpected Japanese display draft source schema.');
  const policy = source.policy;
  if (policy?.use !== 'review_only_quarantined_pending_amber_approval' || policy?.nativeNameRemainsPrimary !== true || policy?.canonicalDatabaseWriteAuthorized !== false || policy?.artworkAuthorized !== false || policy?.activationAuthorized !== false || policy?.publicRuntimeImportAuthorized !== false || policy?.sourceOfNativeName !== 'pinned_tcgdex_source_only' || policy?.removedRedOfficialPageRecordCount !== 26 || policy?.removedRedOfficialPageSourceSha256 !== 'b592f6a61aff3cec174a8dbe734d82c602a70708c6b14314771d8ece57f21b97') throw new Error('Unsafe Japanese display draft policy.');
  if (source.pinnedTcgdex?.repository !== 'tcgdex/cards-database' || source.pinnedTcgdex?.commit !== 'dd4fc9460b54b91c25df750c68ca36b9946448e2' || source.pinnedTcgdex?.licence !== 'MIT') throw new Error('Unexpected pinned TCGdex provenance.');
  const excluded = [...(source.exclusions?.ambiguousVariantCodes ?? []), ...(source.exclusions?.needsVariantReviewCodes ?? [])];
  if (JSON.stringify(excluded) !== JSON.stringify(EXPECTED_EXCLUSIONS)) throw new Error('Japanese display draft exclusions changed; review required.');
  if (!Array.isArray(source.entries) || source.entries.length !== 11) throw new Error('Expected exactly 11 amber Japanese display draft entries.');
  const lookup: Record<string, { canonicalSetId: string; setCode: string; nativeName: string; normalizedNativeName: string; englishTranslation: string; sourceUrl: string; sourceKind: string; sourceSha256: string | null }> = {};
  for (const entry of source.entries) {
    const code = normalizeJapaneseSetDisplayDraftCode(entry.setCode);
    if (!code || code !== normalizeJapaneseSetDisplayDraftCode(entry.setCode) || excluded.map(normalizeJapaneseSetDisplayDraftCode).includes(code)) throw new Error(`Invalid or excluded Japanese set code: ${entry.setCode}`);
    if (!UUID.test(entry.canonicalSetId)) throw new Error(`Invalid canonical set ID for ${entry.setCode}`);
    const nativeName = validText(entry.nativeName, `native name for ${entry.setCode}`);
    const englishTranslation = validText(entry.englishTranslation, `English translation for ${entry.setCode}`, false);
    const sourceKind = entry.sourceKind;
    const sourceUrl = String(entry.sourceUrl ?? '');
    let sourceSha256: string | null = null;
    if (sourceKind === 'pinned_tcgdex_native_title') {
      const expectedPath = entry.setCode === 'M6' ? 'data-asia/M/M6.ts' : `data-asia/PCG/${entry.setCode}.ts`;
      const expectedUrl = `https://github.com/tcgdex/cards-database/blob/${source.pinnedTcgdex.commit}/${expectedPath}`;
      if (!PINNED_TCGDEX_NATIVE_TITLE_SHA256[entry.setCode] || entry.sourcePath !== expectedPath || sourceUrl !== expectedUrl || entry.sourceSha256 !== PINNED_TCGDEX_NATIVE_TITLE_SHA256[entry.setCode]) throw new Error(`Invalid pinned TCGdex source for ${entry.setCode}`);
      sourceSha256 = String(entry.sourceSha256);
    } else throw new Error(`Unknown source kind for ${entry.setCode}`);
    if (lookup[code]) throw new Error(`Duplicate normalized Japanese set code: ${entry.setCode}`);
    lookup[code] = { canonicalSetId: entry.canonicalSetId.toLowerCase(), setCode: entry.setCode, nativeName, normalizedNativeName: normalizeNativeName(nativeName), englishTranslation, sourceUrl, sourceKind, sourceSha256 };
  }
  return { body, source, lookup: Object.fromEntries(Object.entries(lookup).sort(([a], [b]) => a.localeCompare(b))) };
}

function render(typeSyntax: string, readonlySyntax: string, sourcePath = SOURCE_PATH) {
  const { body, source, lookup } = readSource(sourcePath);
  const rightsGate = readCjkEditorialSetTranslationRightsGate([
    'japanese_editorial_set_translation_candidates',
  ]);
  const metadata = {
    schemaVersion: 'stackr-japanese-set-display-draft-lookup-v1',
    sourcePath: 'catalogue/japanese-set-display-drafts-source.json',
    sourceSha256: sha256(body),
    language: 'ja',
    count: Object.keys(lookup).length,
    displayLabel: 'English translation:',
    status: 'model_translation_draft',
    provenance: 'pinned_tcgdex_native_title_and_stackr_editorial_translation_candidate',
    englishDisplayNameAuthoritative: false,
    rightsGate,
    policy: source.policy,
    exclusions: source.exclusions,
    englishTextStatus: 'stackr_non_authoritative_editorial_translation_candidate',
  };
  return ['// Generated review-only Japanese set translation candidates. Public runtime import is rights-gated.', `export const JAPANESE_SET_DISPLAY_DRAFT_LOOKUP_METADATA = ${stable(metadata).trimEnd()}${readonlySyntax};`, `export const JAPANESE_SET_DISPLAY_DRAFTS_BY_CODE${typeSyntax} = ${stable(lookup).trimEnd()}${readonlySyntax};`, ''].join('\n');
}

export function buildJapaneseSetDisplayDraftLookup(args: { check?: boolean; sourcePath?: string; clientOutput?: string; backendOutput?: string } = {}) {
  const sourcePath = args.sourcePath ?? SOURCE_PATH;
  const client = render(': Record<string, { canonicalSetId: string; setCode: string; nativeName: string; normalizedNativeName: string; englishTranslation: string; sourceUrl: string; sourceKind: string; sourceSha256: string | null }>', ' as const', sourcePath);
  const backend = render('', '', sourcePath);
  const outputs = [[args.clientOutput ?? CLIENT_OUTPUT, client], [args.backendOutput ?? BACKEND_OUTPUT, backend]] as const;
  if (args.check) for (const [path, expected] of outputs) { if (readFileSync(path, 'utf8') !== expected) throw new Error(`Generated Japanese display draft lookup is stale: ${path}`); }
  else for (const [path, body] of outputs) writeFileSync(path, body, 'utf8');
  const { body, lookup } = readSource(sourcePath);
  return { count: Object.keys(lookup).length, sourceSha256: sha256(body) };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(buildJapaneseSetDisplayDraftLookup({ check: process.argv.includes('--check') }), null, 2)}\n`);
