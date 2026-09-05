/**
 * Freezes the two reviewed Simplified-Chinese set identities that the
 * provider baseline cannot represent safely: CSV1C is duplicated there and
 * CBB1C is absent because its pinned source module declares the wrong ID.
 *
 * This source is display-only. It may bind an English translation draft to
 * an exact native name; it never authorizes a canonical set-code repair.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_PATH = resolve('catalogue/tcgdex-chinese-set-identity-display-source.json');
const REPOSITORY = 'tcgdex/cards-database';
const PINNED_COMMIT = 'dd4fc9460b54b91c25df750c68ca36b9946448e2';

export type ChineseSetIdentityDisplayEntry = {
  effectiveCode: 'CSV1C' | 'CBB1C';
  providerPath: string;
  sourceSha256: string;
  declaredCode: 'CSV1C';
  nativeName: string;
  normalizedNativeName: string;
  officialCardCount: number;
  releaseDate: '2025-01-17';
  resolution: 'exact_source_code' | 'path_stem_rekey_of_reviewed_internal_id_typo';
};

type FrozenSource = {
  schemaVersion: 'stackr-tcgdex-chinese-set-identity-display-source-v1';
  source: {
    repository: typeof REPOSITORY;
    pinnedCommit: typeof PINNED_COMMIT;
    licence: 'MIT';
  };
  policy: {
    use: 'runtime_translation_draft_native_identity_only';
    nativeNameRemainsPrimary: true;
    strictLanguageCodeAndNativeNameMatchRequired: true;
    pathStemRekeyAllowedOnlyForReviewedCbb1cTypo: true;
    canonicalDatabaseWriteAuthorized: false;
  };
  reviewedResolutionEvidence: typeof REVIEWED_RESOLUTION_EVIDENCE;
  entries: Record<'cbb1c' | 'csv1c', ChineseSetIdentityDisplayEntry>;
};

const REVIEWED_RESOLUTION_EVIDENCE = {
  evidenceId: 'provider-resolution:2026-08-14:42a5f7613be7f7e92c71d286',
  files: {
    'catalogue/provider-resolution-evidence-contract.2026-08-14.json': 'd525dbe9939f40823e30a2b8b16dcba1b4187cec986175574058d66013619fed',
    'reports/catalogue/provider-resolution/2026-08-14/manifest.json': '36bb85d319cfb1b17bede1ac06f99ba428b560c8a34e9b6b690607e00a2e7560',
    'reports/catalogue/provider-resolution/2026-08-14/resolved-provider-baseline-evidence.json': '84afd5d01a71017efca3e2052c6b61499d0be51e5c29c499d2be5188ecb0d1b5',
    'reports/catalogue/provider-resolution/2026-08-14/provider-set-resolution-ledger.jsonl': '59fef5159f65dd4b4ff9fce5dc5245b1b70cda5ea2b63e177b8c8d3eaa22b089',
    'reports/catalogue/provider-resolution/2026-08-14/raw/github-source-CSV1C.json': '1224d60892407d81b0eacbdd0550a88f3fe75b348427e829d9842f4151ba098d',
    'reports/catalogue/provider-resolution/2026-08-14/raw/github-source-CBB1C.json': 'bd9a27ada31dcc71197ba253476999fae00e3b309a4724e03bfd8669bd553818',
  },
} as const;

const EXPECTED_ENTRIES: FrozenSource['entries'] = {
  cbb1c: {
    effectiveCode: 'CBB1C',
    providerPath: 'data-asia/SV/CBB1C.ts',
    sourceSha256: '9abfe118c4b63298bc8afe3fc3c5d1432c35a2128654881209075a2fc8074224',
    declaredCode: 'CSV1C',
    nativeName: '宝石包 第一卷',
    normalizedNativeName: '宝石包第一卷',
    officialCardCount: 9,
    releaseDate: '2025-01-17',
    resolution: 'path_stem_rekey_of_reviewed_internal_id_typo',
  },
  csv1c: {
    effectiveCode: 'CSV1C',
    providerPath: 'data-asia/SV/CSV1C.ts',
    sourceSha256: 'b03f3e0bac65af408a7c8a9764569e8d844cb7c33446dfb9d5a6ff7294589211',
    declaredCode: 'CSV1C',
    nativeName: '亘古开来',
    normalizedNativeName: '亘古开来',
    officialCardCount: 127,
    releaseDate: '2025-01-17',
    resolution: 'exact_source_code',
  },
};

const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const normalizeNativeName = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').trim();

function assertPinnedModule(body: string, expected: ChineseSetIdentityDisplayEntry) {
  if (sha256(body) !== expected.sourceSha256) {
    throw new Error(`Pinned TCGdex source SHA-256 mismatch: ${expected.providerPath}`);
  }
  const declaredCode = body.match(/\bid:\s*['"]([^'"]+)['"]/)?.[1];
  const nativeName = body.match(/['"]zh-cn['"]:\s*['"]([^'"]+)['"]/)?.[1];
  const officialCardCount = Number(body.match(/\bofficial:\s*(\d+)/)?.[1]);
  const releaseDate = body.match(/\breleaseDate:\s*['"]([^'"]+)['"]/)?.[1];
  if (declaredCode !== expected.declaredCode
    || nativeName !== expected.nativeName
    || normalizeNativeName(nativeName) !== expected.normalizedNativeName
    || officialCardCount !== expected.officialCardCount
    || releaseDate !== expected.releaseDate) {
    throw new Error(`Pinned TCGdex Chinese set identity changed: ${expected.providerPath}`);
  }
  if (expected.effectiveCode === 'CBB1C'
    && (expected.providerPath !== 'data-asia/SV/CBB1C.ts'
      || expected.declaredCode !== 'CSV1C'
      || expected.resolution !== 'path_stem_rekey_of_reviewed_internal_id_typo')) {
    throw new Error('Unsafe CBB1C path-stem resolution.');
  }
}

function importFrozenSource(sourceRoot: string) {
  const root = resolve(sourceRoot);
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
  }).trim().toLowerCase();
  if (commit !== PINNED_COMMIT) throw new Error(`Pinned TCGdex commit mismatch: ${commit}`);

  for (const entry of Object.values(EXPECTED_ENTRIES)) {
    const body = execFileSync('git', ['-C', root, 'show', `HEAD:${entry.providerPath}`], {
      encoding: 'utf8',
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: 1024 * 1024,
    });
    assertPinnedModule(body, entry);
  }

  const frozen: FrozenSource = {
    schemaVersion: 'stackr-tcgdex-chinese-set-identity-display-source-v1',
    source: { repository: REPOSITORY, pinnedCommit: PINNED_COMMIT, licence: 'MIT' },
    policy: {
      use: 'runtime_translation_draft_native_identity_only',
      nativeNameRemainsPrimary: true,
      strictLanguageCodeAndNativeNameMatchRequired: true,
      pathStemRekeyAllowedOnlyForReviewedCbb1cTypo: true,
      canonicalDatabaseWriteAuthorized: false,
    },
    reviewedResolutionEvidence: REVIEWED_RESOLUTION_EVIDENCE,
    entries: EXPECTED_ENTRIES,
  };
  writeFileSync(SOURCE_PATH, stable(frozen), 'utf8');
}

export function readTcgdexChineseSetIdentityDisplaySource(sourcePath = SOURCE_PATH, verifyReviewedResolutionEvidence = true) {
  const resolvedSourcePath = resolve(sourcePath);
  if (!existsSync(resolvedSourcePath)) throw new Error(`Missing Chinese set identity display source: ${resolvedSourcePath}`);
  const body = readFileSync(resolvedSourcePath, 'utf8');
  const frozen = JSON.parse(body) as FrozenSource;
  if (frozen.schemaVersion !== 'stackr-tcgdex-chinese-set-identity-display-source-v1'
    || frozen.source?.repository !== REPOSITORY
    || frozen.source?.pinnedCommit !== PINNED_COMMIT
    || frozen.source?.licence !== 'MIT') {
    throw new Error('Unexpected TCGdex Chinese set identity provenance.');
  }
  if (frozen.policy?.use !== 'runtime_translation_draft_native_identity_only'
    || frozen.policy?.nativeNameRemainsPrimary !== true
    || frozen.policy?.strictLanguageCodeAndNativeNameMatchRequired !== true
    || frozen.policy?.pathStemRekeyAllowedOnlyForReviewedCbb1cTypo !== true
    || frozen.policy?.canonicalDatabaseWriteAuthorized !== false) {
    throw new Error('Unsafe TCGdex Chinese set identity display policy.');
  }
  if (stable(frozen.reviewedResolutionEvidence) !== stable(REVIEWED_RESOLUTION_EVIDENCE)) {
    throw new Error('Unexpected reviewed CBB1C resolution evidence binding.');
  }
  if (verifyReviewedResolutionEvidence) {
    for (const [path, expectedSha256] of Object.entries(REVIEWED_RESOLUTION_EVIDENCE.files)) {
      if (!existsSync(resolve(path)) || sha256(readFileSync(resolve(path))) !== expectedSha256) {
        throw new Error(`Reviewed CBB1C resolution evidence changed: ${path}`);
      }
    }
  }
  if (stable(frozen.entries) !== stable(EXPECTED_ENTRIES)) {
    throw new Error('Unexpected TCGdex Chinese set identity entries.');
  }
  return { frozen, entries: frozen.entries, sourcePath: resolvedSourcePath, bodySha256: sha256(body) };
}

export function buildTcgdexChineseSetIdentityDisplaySource(args: { importSourceRoot?: string } = {}) {
  if (args.importSourceRoot) importFrozenSource(args.importSourceRoot);
  return readTcgdexChineseSetIdentityDisplaySource();
}

if (require.main === module) {
  const sourceRootArg = process.argv.find((arg) => arg.startsWith('--import-source-root='));
  const result = buildTcgdexChineseSetIdentityDisplaySource({
    importSourceRoot: sourceRootArg?.slice('--import-source-root='.length),
  });
  process.stdout.write(`${JSON.stringify({ count: Object.keys(result.entries).length, sourceSha256: result.bodySha256 }, null, 2)}\n`);
}
