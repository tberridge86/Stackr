/**
 * Builds the runtime-only Japanese set English-name fallback from a frozen,
 * MIT-licensed TCGdex translation map. Existing reviewed/manual runtime names
 * keep precedence; this lookup only fills exact Japanese set-code misses.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readTcgdexJapaneseSetGreenGate } from './tcgdex-metadata-green-gate';

const SOURCE_PATH = resolve('catalogue/tcgdex-japanese-set-english-display-source.json');
const CLIENT_OUTPUT = resolve('lib/generated/tcgdexJapaneseSetEnglishNames.generated.ts');
const BACKEND_OUTPUT = resolve('backend/lib/generated/tcgdexJapaneseSetEnglishNames.generated.mjs');
const REPOSITORY = 'tcgdex/cards-database';
const PINNED_COMMIT = 'dd4fc9460b54b91c25df750c68ca36b9946448e2';
const MAP_PATH = 'scripts/utils-data/jp_set_translations.ts';
const MAP_SHA256 = '8420715261c1a3b2237c822294e7ea3fe8e544ad970c8c0d60612752967957f5';
const SHA = /^[a-f0-9]{64}$/;

type FrozenSource = {
  schemaVersion: 'stackr-tcgdex-japanese-set-english-display-source-v1';
  source: {
    repository: typeof REPOSITORY;
    pinnedCommit: typeof PINNED_COMMIT;
    path: typeof MAP_PATH;
    sha256: typeof MAP_SHA256;
    licence: 'MIT';
  };
  policy: {
    use: 'runtime_english_display_supplement_only';
    nativeNameRemainsPrimary: true;
    existingReviewedRuntimeMapWins: true;
    canonicalDatabaseWriteAuthorized: false;
  };
  entries: Record<string, string>;
};

const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function normalizeSetCode(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/^(?:ja|jp):/i, '')
    .replace(/\+/g, 'p')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '');
}

function assertEnglishName(value: unknown, label: string) {
  const name = String(value ?? '').trim();
  if (!name
    || name.length > 300
    || /[\u0000-\u001f\u007f]/u.test(name)
    || /[\u3040-\u30ff\u3400-\u9fff]/u.test(name)) {
    throw new Error(`Invalid English set name for ${label}`);
  }
  return name;
}

function parsePinnedMap(sourceRoot: string) {
  const root = resolve(sourceRoot);
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
  }).trim().toLowerCase();
  if (commit !== PINNED_COMMIT) throw new Error(`Pinned TCGdex commit mismatch: ${commit}`);

  const source = execFileSync('git', ['-C', root, 'show', `HEAD:${MAP_PATH}`], {
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (sha256(source) !== MAP_SHA256) throw new Error('Pinned TCGdex Japanese set map SHA-256 mismatch.');

  const entries: Record<string, string> = {};
  for (const match of source.matchAll(/\[\s*['"]([^'"]+)['"]\s*,\s*(['"])((?:\\.|(?!\2).)*)\2\s*\]/gs)) {
    const code = normalizeSetCode(match[1]);
    const name = assertEnglishName(match[3].replace(/\\(['"\\])/g, '$1'), match[1]);
    if (!code) throw new Error(`Invalid Japanese set code: ${match[1]}`);
    if (entries[code] && entries[code] !== name) throw new Error(`Conflicting normalized Japanese set code: ${code}`);
    entries[code] = name;
  }
  if (Object.keys(entries).length < 200) throw new Error('Pinned Japanese set map is unexpectedly small.');
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
}

function importFrozenSource(sourceRoot: string) {
  const frozen: FrozenSource = {
    schemaVersion: 'stackr-tcgdex-japanese-set-english-display-source-v1',
    source: {
      repository: REPOSITORY,
      pinnedCommit: PINNED_COMMIT,
      path: MAP_PATH,
      sha256: MAP_SHA256,
      licence: 'MIT',
    },
    policy: {
      use: 'runtime_english_display_supplement_only',
      nativeNameRemainsPrimary: true,
      existingReviewedRuntimeMapWins: true,
      canonicalDatabaseWriteAuthorized: false,
    },
    entries: parsePinnedMap(sourceRoot),
  };
  writeFileSync(SOURCE_PATH, stable(frozen), 'utf8');
}

function readFrozenSource() {
  const body = readFileSync(SOURCE_PATH, 'utf8');
  const frozen = JSON.parse(body) as FrozenSource;
  if (frozen.schemaVersion !== 'stackr-tcgdex-japanese-set-english-display-source-v1') throw new Error('Unexpected Japanese set source schema.');
  if (frozen.source?.repository !== REPOSITORY
    || frozen.source?.pinnedCommit !== PINNED_COMMIT
    || frozen.source?.path !== MAP_PATH
    || frozen.source?.sha256 !== MAP_SHA256
    || frozen.source?.licence !== 'MIT') throw new Error('Unexpected Japanese set source provenance.');
  if (frozen.policy?.use !== 'runtime_english_display_supplement_only'
    || frozen.policy?.nativeNameRemainsPrimary !== true
    || frozen.policy?.existingReviewedRuntimeMapWins !== true
    || frozen.policy?.canonicalDatabaseWriteAuthorized !== false) throw new Error('Unsafe Japanese set display policy.');

  const entries: Record<string, string> = {};
  for (const [rawCode, rawName] of Object.entries(frozen.entries ?? {})) {
    const code = normalizeSetCode(rawCode);
    const name = assertEnglishName(rawName, rawCode);
    if (!code || code !== rawCode) throw new Error(`Japanese set source code is not normalized: ${rawCode}`);
    if (entries[code] && entries[code] !== name) throw new Error(`Duplicate Japanese set source code: ${code}`);
    entries[code] = name;
  }
  if (Object.keys(entries).length < 200) throw new Error('Frozen Japanese set source is unexpectedly small.');
  return { frozen, entries, bodySha256: sha256(body) };
}

function render(typeSyntax: string, readonlySyntax: string) {
  const { frozen, entries, bodySha256 } = readFrozenSource();
  const rightsGate = readTcgdexJapaneseSetGreenGate();
  const metadata = {
    schemaVersion: 'stackr-tcgdex-japanese-set-english-runtime-lookup-v1',
    sourcePath: 'catalogue/tcgdex-japanese-set-english-display-source.json',
    sourceSha256: bodySha256,
    upstream: frozen.source,
    policy: frozen.policy,
    rightsGate,
    language: 'ja',
    count: Object.keys(entries).length,
  };
  return [
    '// Generated from pinned TCGdex metadata under a hash-bound, green, native-primary display gate.',
    `export const TCGDEX_JAPANESE_SET_ENGLISH_LOOKUP_METADATA = ${stable(metadata).trimEnd()}${readonlySyntax};`,
    `export const TCGDEX_JAPANESE_SET_ENGLISH_NAMES${typeSyntax} = ${stable(entries).trimEnd()}${readonlySyntax};`,
    '',
  ].join('\n');
}

export function buildJapaneseSetEnglishRuntimeLookup(args: {
  check?: boolean;
  importSourceRoot?: string;
} = {}) {
  if (args.importSourceRoot) importFrozenSource(args.importSourceRoot);
  if (!existsSync(SOURCE_PATH)) throw new Error(`Missing frozen Japanese set source: ${SOURCE_PATH}`);

  const client = render(': Record<string, string>', ' as const');
  const backend = render('', '');
  const outputs = [[CLIENT_OUTPUT, client], [BACKEND_OUTPUT, backend]] as const;
  if (args.check) {
    for (const [path, expected] of outputs) {
      if (readFileSync(path, 'utf8') !== expected) throw new Error(`Generated Japanese set lookup is stale: ${path}`);
    }
  } else {
    for (const [path, body] of outputs) writeFileSync(path, body, 'utf8');
  }
  return readFrozenSource();
}

if (require.main === module) {
  const sourceRootArg = process.argv.find((arg) => arg.startsWith('--import-source-root='));
  const result = buildJapaneseSetEnglishRuntimeLookup({
    check: process.argv.includes('--check'),
    importSourceRoot: sourceRootArg?.slice('--import-source-root='.length),
  });
  process.stdout.write(`${JSON.stringify({ count: Object.keys(result.entries).length, sourceSha256: result.bodySha256 }, null, 2)}\n`);
}
