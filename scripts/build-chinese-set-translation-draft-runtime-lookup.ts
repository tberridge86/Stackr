/**
 * Emits a display-only lookup from the unsigned Chinese set translation
 * drafts. This is deliberately separate from canonical metadata: consumers
 * receive provenance and must label the value as a translation draft.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readCjkEditorialSetTranslationRightsGate } from './cjk-editorial-set-translation-rights-gate';

import { CHINESE_SET_ENGLISH_MODEL_TRANSLATION_DRAFTS } from './build-chinese-set-translation-draft-review-pack';
import { readTcgdexChineseSetIdentityDisplaySource } from './build-tcgdex-chinese-set-identity-display-source';

const CLIENT_OUTPUT = resolve('lib/generated/chineseSetTranslationDrafts.generated.ts');
const BACKEND_OUTPUT = resolve('backend/lib/generated/chineseSetTranslationDrafts.generated.mjs');
const NATIVE_NAME_SOURCE_PATH = resolve('catalogue/chinese-set-translation-draft-native-name-source.json');
const PROVIDER_BASELINE_PATH = 'reports/catalogue/provider-baseline/2026-08-14/raw/{zh-cn,zh-tw}.sets.json';

type Language = 'zh-cn' | 'zh-tw';
type DraftEntry = { nativeName: string; normalizedNativeName: string; englishTranslation: string };
type NativeNameEntry = Pick<DraftEntry, 'nativeName' | 'normalizedNativeName'>;

function stable(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeCode(value: unknown) {
  const text = String(value ?? '').trim();
  return text
    .replace(/^(zh-cn|zh_cn|zhcn|zh-hans|zh-tw|zh_tw|zhtw|zh-hant|zh):/i, '')
    .replace(/\+/g, 'p')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '');
}

function normalizeNativeName(value: unknown) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
}

function readNativeNameSource() {
  const body = readFileSync(NATIVE_NAME_SOURCE_PATH, 'utf8');
  const source = JSON.parse(body) as {
    schemaVersion?: unknown;
    sourceSnapshot?: { providerBaselinePath?: unknown; baselineSha256?: unknown };
    nativeNames?: Partial<Record<Language, Record<string, NativeNameEntry>>>;
  };
  if (source.schemaVersion !== 'stackr-chinese-set-translation-draft-native-name-source-v1') {
    throw new Error(`Unexpected native-name source schema: ${NATIVE_NAME_SOURCE_PATH}`);
  }
  if (!source.nativeNames?.['zh-cn'] || !source.nativeNames?.['zh-tw']) {
    throw new Error(`Missing Chinese language entries in native-name source: ${NATIVE_NAME_SOURCE_PATH}`);
  }
  if (source.sourceSnapshot?.providerBaselinePath !== PROVIDER_BASELINE_PATH) {
    throw new Error(`Unexpected provider baseline path in native-name source: ${NATIVE_NAME_SOURCE_PATH}`);
  }
  const baselineSha256 = source.sourceSnapshot.baselineSha256 as Partial<Record<Language, unknown>> | undefined;
  for (const language of ['zh-cn', 'zh-tw'] as const) {
    if (!/^[a-f0-9]{64}$/.test(String(baselineSha256?.[language] ?? ''))) {
      throw new Error(`Invalid ${language} provider baseline SHA-256 in native-name source`);
    }
    for (const [code, entry] of Object.entries(source.nativeNames[language] ?? {})) {
      const nativeName = String(entry?.nativeName ?? '').trim();
      if (code !== normalizeCode(code) || !nativeName || entry?.normalizedNativeName !== normalizeNativeName(nativeName)) {
        throw new Error(`Invalid native-name source entry for ${language}:${code}`);
      }
    }
  }
  return { source, sha256: sha256(body) };
}

function source() {
  const rightsGate = readCjkEditorialSetTranslationRightsGate([
    'chinese_editorial_set_translation_candidates',
  ]);
  const nativeNameSource = readNativeNameSource();
  const identityDisplaySource = readTcgdexChineseSetIdentityDisplaySource();
  const lookup: Record<Language, Record<string, DraftEntry>> = { 'zh-cn': {}, 'zh-tw': {} };
  const exclusionCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(CHINESE_SET_ENGLISH_MODEL_TRANSLATION_DRAFTS)) {
    const [language, ...codeParts] = key.split(':');
    const code = normalizeCode(codeParts.join(':'));
    if ((language !== 'zh-cn' && language !== 'zh-tw') || !code || !value.trim()) {
      throw new Error(`Invalid Chinese translation draft key: ${key}`);
    }
    const baselineEntry = nativeNameSource.source.nativeNames?.[language]?.[code];
    const overrideEntry = language === 'zh-cn'
      ? identityDisplaySource.entries[code as keyof typeof identityDisplaySource.entries]
      : undefined;
    if (baselineEntry && overrideEntry) {
      throw new Error(`Pinned identity override overlaps provider baseline: ${language}:${code}`);
    }
    const nativeEntry = baselineEntry ?? overrideEntry;
    if (!nativeEntry) {
      exclusionCounts.baseline_native_name_missing = (exclusionCounts.baseline_native_name_missing ?? 0) + 1;
      continue;
    }
    const nativeName = String(nativeEntry.nativeName ?? '').trim();
    const normalizedNativeName = normalizeNativeName(nativeName);
    if (!nativeName || !normalizedNativeName || nativeEntry.normalizedNativeName !== normalizedNativeName) {
      throw new Error(`Invalid native-name binding for ${language}:${code}`);
    }
    lookup[language][code] = { nativeName, normalizedNativeName, englishTranslation: value };
  }
  for (const language of Object.keys(lookup) as Language[]) {
    lookup[language] = Object.fromEntries(Object.entries(lookup[language]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return {
    metadata: {
      schemaVersion: 'stackr-chinese-set-model-translation-draft-lookup-v1',
      status: 'model_translation_draft',
      provenance: 'scripts/build-chinese-set-translation-draft-review-pack.ts',
      nativeNameSource: 'catalogue/chinese-set-translation-draft-native-name-source.json',
      nativeNameSourceSha256: nativeNameSource.sha256,
      providerBaselineSnapshot: nativeNameSource.source.sourceSnapshot ?? null,
      tcgdexChineseIdentityDisplaySource: {
        path: 'catalogue/tcgdex-chinese-set-identity-display-source.json',
        sha256: identityDisplaySource.bodySha256,
        count: Object.keys(identityDisplaySource.entries).length,
        upstream: identityDisplaySource.frozen.source,
        policy: identityDisplaySource.frozen.policy,
        reviewedResolutionEvidence: identityDisplaySource.frozen.reviewedResolutionEvidence,
      },
      nativeNameRemainsPrimary: true,
      englishDisplayNameAuthoritative: false,
      rightsGate,
      displayLabel: 'English translation:',
      languages: ['zh-cn', 'zh-tw'],
      counts: Object.fromEntries(Object.entries(lookup).map(([language, entries]) => [language, Object.keys(entries).length])),
      exclusionCounts,
    },
    lookup,
  };
}

function render(typeSyntax: string, readonlySyntax: string) {
  const data = source();
  const draftHash = sha256(stable(CHINESE_SET_ENGLISH_MODEL_TRANSLATION_DRAFTS));
  return [
    '// Generated review-only model-translation candidates. Public runtime import is rights-gated.',
    `// Source draft SHA-256: ${draftHash}.`,
    `export const CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA = ${stable(data.metadata).trimEnd()}${readonlySyntax};`,
    `export const CHINESE_SET_TRANSLATION_DRAFTS_BY_LANGUAGE${typeSyntax} = ${stable(data.lookup).trimEnd()}${readonlySyntax};`,
    '',
  ].join('\n');
}

export function buildChineseSetTranslationDraftRuntimeLookup(args: { check?: boolean } = {}) {
  const client = render(': Record<\'zh-cn\' | \'zh-tw\', Record<string, { nativeName: string; normalizedNativeName: string; englishTranslation: string }>>', ' as const');
  const backend = render('', '');
  const outputs = [[CLIENT_OUTPUT, client], [BACKEND_OUTPUT, backend]] as const;
  if (args.check) {
    for (const [path, expected] of outputs) {
      if (readFileSync(path, 'utf8') !== expected) throw new Error(`Generated Chinese translation lookup is stale: ${path}`);
    }
  } else {
    for (const [path, body] of outputs) writeFileSync(path, body, 'utf8');
  }
  return source().metadata;
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  process.stdout.write(`${JSON.stringify(buildChineseSetTranslationDraftRuntimeLookup({ check }), null, 2)}\n`);
}
