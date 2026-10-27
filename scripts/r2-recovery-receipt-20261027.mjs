import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const RUN_ID = 'production-recovered-20261027a';
const fail = code => { throw Object.assign(new Error(code), { code }); };
// The production composition supplies no override. The argument is a local-test
// seam, not an environment variable or command-line bypass.
export function createRecoveryReceiptStore({ parent = '/data/r2-catalogue-migration' } = {}) {
  if (!path.isAbsolute(parent)) fail('recovery_receipt_parent_invalid');
  async function assertParent() {
    if (await realpath(parent) !== parent || !(await lstat(parent)).isDirectory()) fail('recovery_receipt_parent_invalid');
  }
  return {
    async successorExists() {
      await assertParent();
      try { await lstat(path.join(parent, RUN_ID)); return true; }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    },
    async persistAcceptance(acceptance) {
      if (acceptance?.schemaVersion !== 1 || acceptance.kind !== 'stackr-r2-linked-continuation'
        || acceptance.runId !== RUN_ID || acceptance.parentEvidencePreserved !== true
        || acceptance.sourceObjectsDeleted !== 0) fail('recovery_receipt_invalid');
      const bytes = Buffer.from(JSON.stringify(acceptance, null, 2) + '\n');
      if (bytes.length > 65536) fail('recovery_receipt_bound');
      await assertParent();
      // Exclusive append-only evidence: an existing receipt is never overwritten,
      // removed, relabelled, or reused automatically after an interrupted launch.
      const filename = path.join(parent, RUN_ID + '.acceptance.json');
      const handle = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); }
      finally { await handle.close(); }
      const directory = await open(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await directory.sync(); }
      finally { await directory.close(); }
      return createHash('sha256').update(bytes).digest('hex');
    },
  };
}
