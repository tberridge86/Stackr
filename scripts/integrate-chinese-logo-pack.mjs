#!/usr/bin/env node
/** Import the owner's existing PNGs; no redraw, network, Git push or release. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const clean = (value) => String(value ?? '').trim().toLowerCase();
const assetRoot = 'assets/rev2/12-chinese-set-logos';
const runtimePath = 'lib/simplifiedChineseSetLogos.ts';
const explorePath = 'app/(tabs)/explore.tsx';
const codeMarker = '  // Owner-supplied Chinese logos: keep set codes as live text.';
const runtimeHelpers = `
function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Exact catalogue identity plus explicit language; never a name-only match. */
export function getSimplifiedChineseSetLogoSourceForSet(
  input?: SimplifiedChineseSetLogoLookupInput | null,
  fallbackLanguage?: string | null,
): ImageSourcePropType | null {
  if (!input) return null;
  const language = normalized(input.language ?? fallbackLanguage).replace(/_/g, '-');
  if (!['zh-cn', 'zh-hans', 'zh-hans-cn'].includes(language)) return null;
  const id = normalized(input.id);
  const setId = normalized(input.setId);
  if (id && setId && id !== setId) return null;
  const key = id || setId;
  if (!Object.prototype.hasOwnProperty.call(LOGOS_BY_CANONICAL_ID, key)) return null;
  const match = LOGOS_BY_CANONICAL_ID[key];
  if (!match) return null;
  const codes = [input.setCode, input.externalIds?.setCode]
    .map(normalized).filter(Boolean);
  if (codes.some((code) => code !== match.code)) return null;
  return match.source;
}
`;

export function buildRuntime(records) {
  const entries = records.filter((r) => r.status === 'mapped').map((r) =>
    `  ${JSON.stringify(r.canonicalSetId)}: { code: ${JSON.stringify(r.code)}, source: require(${JSON.stringify('../' + assetRoot + '/' + r.logoFile)}) as ImageSourcePropType },`
  ).join('\n');
  return `// Generated from the owner's original transparent PNGs. Do not hand-edit.\n` +
    `import type { ImageSourcePropType } from 'react-native';\n\n` +
    `export type SimplifiedChineseSetLogoLookupInput = {\n` +
    `  id?: string | null; setId?: string | null; language?: string | null;\n` +
    `  setCode?: string | number | null; externalIds?: Record<string, unknown> | null;\n};\n\n` +
    `const LOGOS_BY_CANONICAL_ID: Record<string, { code: string; source: ImageSourcePropType }> = {\n` + entries + '\n};\n' + runtimeHelpers;
}

export function patchExplore(text) {
  const name = 'getSimplifiedChineseSetLogoSourceForSet';
  const importLine = `import { ${name} } from '../../lib/simplifiedChineseSetLogos';`;
  const anchor = '  const hasExistingBinder = Boolean(existingBinder);';
  const meta = "{getPokemonLanguageDescriptor(item.language)?.label ?? item.language ?? 'English'} · {item.total} cards · {item.releaseDate ?? ''}";
  const codePrefix = '{chineseSetDisplayCode ? chineseSetDisplayCode + \' · \' : \'\'}';
  const lookupTail = '  });\n  const logoUrl = logoSource ? null : (getPokemonSetVisualUrl(item) ?? getPokemonSetLogoUrl(item.id, item.language));';
  const fallback = '  }) ?? getSimplifiedChineseSetLogoSourceForSet({\n' +
    '    id: item.id, language: item.language, setCode: item.externalIds?.setCode, externalIds: item.externalIds,\n' +
    '  });\n  const logoUrl = logoSource ? null : (getPokemonSetVisualUrl(item) ?? getPokemonSetLogoUrl(item.id, item.language));';
  const lf = text.replace(/\r\n/g, '\n');
  if (lf.includes(importLine) && lf.includes(fallback) && lf.includes(codeMarker) && lf.includes(codePrefix + meta)) return text;
  if (lf.includes(name) || lf.includes('chineseSetDisplayCode') || lf.split(anchor).length !== 2 || lf.split(meta).length !== 2 || lf.split(lookupTail).length !== 2) {
    throw new Error('Discover Sets has changed. Preserve it and reconcile the bounded fallback/code-label patch manually.');
  }
  const insertion = codeMarker + '\n' +
    "  const chineseSetDisplayCode = normalizePokemonCardLanguage(item.language) === 'zh-cn'\n" +
    "    ? String(item.externalIds?.setCode ?? raw.set_code ?? '').trim().toUpperCase()\n" +
    "    : '';\n";
  const out = importLine + '\n' + lf.replace(lookupTail, fallback).replace(anchor, insertion + anchor).replace(meta, codePrefix + meta);
  return text.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out;
}

export function planImport({ source, repo, snapshot }) {
  const sourceRoot = fs.realpathSync(source);
  const repoRoot = fs.realpathSync(repo);
  const manifestBytes = fs.readFileSync(path.join(sourceRoot, 'manifest.json'));
  if (hash(manifestBytes) !== snapshot.sourceManifestSha256) throw new Error('Wrong source manifest. Use the original supplied pack, not regenerated sheets.');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.generated_sheets_used !== false || manifest.records.length !== 134) throw new Error('Unexpected source pack.');
  const names = new Set();
  const ids = new Set();
  const outputs = new Map();
  const records = [];
  for (const sourceRow of manifest.records) {
    const logoFile = sourceRow.logo_file;
    if (!/^logos\/[a-z0-9][a-z0-9._-]*\.png$/.test(logoFile) || names.has(logoFile)) throw new Error('Unsafe or duplicate asset path.');
    names.add(logoFile);
    if (sourceRow.language !== 'zh-cn') throw new Error('Unexpected language in this Simplified Chinese pack.');
    const filename = path.join(sourceRoot, logoFile);
    const real = fs.realpathSync(filename);
    if (!real.startsWith(sourceRoot + path.sep)) throw new Error('Source asset escapes pack directory.');
    const bytes = fs.readFileSync(real);
    if (hash(bytes) !== sourceRow.logo_sha256 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Asset checksum/type mismatch: ${logoFile}`);
    const [width, height] = sourceRow.logo_dimensions_px;
    if (bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height) throw new Error(`Asset dimensions changed: ${logoFile}`);
    const code = clean(sourceRow.set_code_as_shown);
    const canonicalSetId = snapshot.activePublishedIdsByCode[code] ?? null;
    if (canonicalSetId && ids.has(canonicalSetId)) throw new Error(`Duplicate canonical identity: ${canonicalSetId}`);
    if (canonicalSetId) ids.add(canonicalSetId);
    records.push({
      assetId: sourceRow.id, language: 'zh-cn', code,
      sourceCode: sourceRow.set_code_as_shown,
      sourceName: sourceRow.english_name_as_shown,
      canonicalSetId, logoFile, sha256: sourceRow.logo_sha256, width, height,
      status: canonicalSetId ? 'mapped' : 'unresolved',
      reason: canonicalSetId ? 'Exact case-insensitive set code in active published zh-cn catalogue; UUID preserved.' :
        (snapshot.unresolvedReasons[sourceRow.id] ?? 'No exact active published code. Do not infer a new identity.'),
    });
    outputs.set(`${assetRoot}/${logoFile}`, bytes);
  }
  if (ids.size !== 123) throw new Error(`Expected 123 reviewed exact identities; found ${ids.size}.`);
  const receipt = {
    schemaVersion: 1, source: 'Owner-supplied screenshot cutouts; no generative redraw',
    sourceManifestSha256: snapshot.sourceManifestSha256,
    sourcePackSha256: snapshot.sourcePackSha256,
    catalogueObservedAt: snapshot.observedAt, projectId: snapshot.projectId,
    catalogueVersion: snapshot.catalogueVersion,
    sourceRevisionReviewed: snapshot.sourceRevisionReviewed,
    importedAssetCount: records.length, mappedCount: ids.size, unresolvedCount: records.length - ids.size,
    releaseStatus: 'source prepared; not proof of merge, build, release or installed-device rendering', records,
  };
  outputs.set(`${assetRoot}/manifest.json`, Buffer.from(JSON.stringify(receipt, null, 2) + '\n'));
  outputs.set(runtimePath, Buffer.from(buildRuntime(records)));
  for (const [file, patcher] of [[explorePath, patchExplore]]) {
    outputs.set(file, Buffer.from(patcher(fs.readFileSync(path.join(repoRoot, file), 'utf8'))));
  }
  // Never follow an existing repository symlink outside the approved worktree.
  for (const file of outputs.keys()) {
    let parent = path.join(repoRoot, file);
    while (!fs.existsSync(parent)) parent = path.dirname(parent);
    const real = fs.realpathSync(parent);
    if (real !== repoRoot && !real.startsWith(repoRoot + path.sep)) throw new Error(`Destination escapes worktree: ${file}`);
  }
  const changed = [...outputs].filter(([file, bytes]) => {
    const target = path.join(repoRoot, file);
    if (!fs.existsSync(target)) return true;
    const old = fs.readFileSync(target);
    if (old.equals(bytes)) return false;
    if (file !== explorePath) throw new Error(`Refusing to replace an existing different asset/mapping: ${file}`);
    return true;
  });
  return { repoRoot, outputs, changed, receipt };
}

export function applyPlan(plan) {
  if (!plan.changed.length) return;
  const original = new Map(plan.changed.map(([file]) => {
    const target = path.join(plan.repoRoot, file);
    return [file, fs.existsSync(target) ? fs.readFileSync(target) : null];
  }));
  const touched = [];
  try {
    for (const [file, bytes] of plan.changed) {
      const target = path.join(plan.repoRoot, file);
      touched.push(file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      if (hash(fs.readFileSync(target)) !== hash(bytes)) throw new Error(`Write verification failed: ${file}`);
    }
  } catch (error) {
    for (const file of touched.reverse()) {
      const target = path.join(plan.repoRoot, file);
      const previous = original.get(file);
      if (previous === null) fs.rmSync(target, { force: true });
      else fs.writeFileSync(target, previous);
    }
    throw error;
  }
}

function main() {
  const args = process.argv.slice(2);
  const read = (flag) => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1]; };
  const allowed = new Set(['--source', '--repo', '--snapshot', '--apply']);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Unknown argument: ${args[i]}`);
    if (args[i] !== '--apply' && (!args[++i] || args[i].startsWith('--'))) throw new Error('Missing argument value.');
  }
  const repo = path.resolve(read('--repo') ?? process.cwd());
  const source = read('--source');
  if (!source) throw new Error('Usage: node scripts/integrate-chinese-logo-pack.mjs --source <extracted-pack-folder> [--repo <worktree>] [--apply]');
  const snapshotFile = read('--snapshot') ?? path.join(repo, 'docs/releases/chinese-logo-pack-20260917.json');
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const plan = planImport({ repo, source, snapshot });
  if (args.includes('--apply') && plan.changed.length) {
    const branch = execFileSync('git', ['-C', repo, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
    if (!branch || ['main', 'master'].includes(branch)) throw new Error('Apply only in the approved isolated integration branch, not main or detached HEAD.');
    const root = execFileSync('git', ['-C', repo, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    if (fs.realpathSync(root) !== plan.repoRoot) throw new Error('--repo must be the worktree root.');
    const changedPaths = plan.changed.map(([file]) => file);
    const dirty = execFileSync('git', ['-C', repo, 'status', '--porcelain', '--', ...changedPaths], { encoding: 'utf8' }).trim();
    if (dirty) throw new Error('Target files have uncommitted work. Preserve it and let the existing integrator reconcile; nothing was written.\n' + dirty);
    applyPlan(plan);
  }
  console.log(JSON.stringify({ mode: args.includes('--apply') ? 'applied-to-local-worktree' : 'dry-run',
    assetCount: 134, exactMatches: 123, unresolved: 11, changedFiles: plan.changed.length,
    unresolvedAssets: plan.receipt.records.filter((r) => r.status === 'unresolved').map((r) => ({ name: r.sourceName, code: r.sourceCode, reason: r.reason })),
    uploaded: false, merged: false, released: false, deviceVerified: false }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
