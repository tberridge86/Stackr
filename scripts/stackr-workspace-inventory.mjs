import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// This command records recovery requirements only. It never moves, removes,
// cleans, resets, checks out, fetches, or changes a repository or Git ref.
const destination = process.argv[2];
if (!destination || !path.win32.isAbsolute(destination)) {
  throw new Error('Supply an absolute private output directory under D:/Stackr-organization.');
}
const output = path.resolve(destination);
const archiveRoot = path.resolve('D:/Stackr-organization');
const relative = path.relative(archiveRoot, output);
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output must stay within Stackr-organization.');
mkdirSync(output, { recursive: true });

function git(root, args, raw = false) {
  try {
    return { ok: true, value: execFileSync('git', ['--no-optional-locks', '-C', root, ...args], {
      encoding: raw ? undefined : 'utf8', timeout: 20000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }) };
  } catch (error) {
    return { ok: false, error: error.killed ? 'metadata_deadline' : 'git_metadata_unavailable' };
  }
}
const extraRoots = ['CodexTemp', 'CodexLogoWork', '41 BRANDFALLBACKS', 'MISSING ARTWORK', 'traditional_chinese_pokemon_set_logos_6_per_page'];
const roots = readdirSync('D:/', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && (/^Stackr(?:-|$)/i.test(entry.name) || extraRoots.includes(entry.name)))
  .map((entry) => path.join('D:/', entry.name)).sort();
const common = git('D:/Stackr-1', ['worktree', 'list', '--porcelain']);
const remoteMain = git('D:/Stackr', ['rev-parse', 'origin/main']);
const inventory = [];
for (const root of roots) {
  const marker = path.join(root, '.git');
  const entry = { root, kind: 'data_or_artifacts', deletionApproved: false, moveApprovedByThisTool: false };
  if (existsSync(marker)) {
    entry.kind = lstatSync(marker).isDirectory() ? 'independent_repository' : 'linked_worktree';
    for (const [field, args] of Object.entries({
      head: ['rev-parse', 'HEAD'], branch: ['symbolic-ref', '--quiet', '--short', 'HEAD'],
      commonDir: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      status: ['status', '--porcelain=v1', '--untracked-files=normal'],
    })) {
      const result = git(root, args);
      if (field === 'status') {
        const lines = result.ok ? result.value.split('\n').filter(Boolean) : [];
        entry.statusEntries = result.ok ? lines.length : null;
        entry.trackedChanges = result.ok ? lines.filter((line) => !line.startsWith('?? ')).length : null;
        entry.untrackedEntries = result.ok ? lines.filter((line) => line.startsWith('?? ')).length : null;
        entry.statusRead = result.ok;
      } else entry[field] = result.ok ? result.value.trim() || null : null;
    }
    const preservation = path.join(output, path.basename(root));
    mkdirSync(preservation, { recursive: true });
    // Binary patches preserve tracked staged/unstaged changes separately.
    for (const [file, args] of [
      ['unstaged.patch', ['diff', '--binary', '--no-ext-diff', '--no-textconv']],
      ['staged.patch', ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv']],
      ['untracked.paths.txt', ['ls-files', '--others', '--exclude-standard']],
    ]) {
      const result = git(root, args, file.endsWith('.patch'));
      if (result.ok) writeFileSync(path.join(preservation, file), result.value);
      else entry.preservationReadFailed = true;
    }
    entry.preservation = 'metadata_and_binary_patches_only';
    entry.restoreVerified = false;
    entry.retirementHold = 'Preserve Git objects/refs, actual untracked and necessary ignored files, verify restore, and check active/path dependencies first.';
  } else {
    entry.retirementHold = 'Classify original assets, captures, models, backups and generated files before any move or deletion.';
  }
  inventory.push(entry);
  console.log(`${path.basename(root)}: ${entry.kind}; changes=${entry.statusEntries ?? 'not_assessed'}`);
}
writeFileSync(path.join(output, 'registered-worktrees.txt'), common.ok ? common.value : 'unavailable\n');
writeFileSync(path.join(output, 'inventory.json'), JSON.stringify({
  schemaVersion: 1, observedAt: new Date().toISOString(), canonicalCode: 'D:/Stackr',
  remoteMain: remoteMain.ok ? remoteMain.value.trim() : null, output,
  scope: 'D-root Stackr directories and explicitly named source/cache folders; registered nested/C-drive dependencies listed separately',
  contentScan: 'No recursive data, model, catalogue, artwork or node_modules scan',
  caveat: 'Patches and path lists are not complete recovery snapshots. Nothing is approved for retirement by this inventory.',
  roots: inventory,
}, null, 2) + '\n');
writeFileSync(path.join(output, 'cleanup-proposal.json'), JSON.stringify({
  schemaVersion: 1, observedAt: new Date().toISOString(), permanentDeletionApproved: false,
  deletionCandidates: [], safeToDeleteClaim: false,
  reason: 'No repository or asset root is disposable solely because it is clean or old. Complete recovery and exact duplicate/cache manifests are required.',
  stages: ['Independent canonical repository', 'Private inventory and binary patches', 'Git bundle plus unique/ignored source preservation', 'Restore verification', 'Exact path/hash/size duplicate and reproducible-cache list', 'Approved Git-aware retirement; legacy primary last'],
}, null, 2) + '\n');
