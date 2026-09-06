import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const directory = 'assets/Pokemon_Magazine_Cover_Art_PNGs';
const publications = {
  'CoroCoro Comic': { language: 'ja', count: 69 },
  'CoroCoro Ichiban': { language: 'ja', count: 1 },
  'Pokemon Fan Japan': { language: 'ja', count: 1 },
  'Pokemon Fan US': { language: 'en', count: 10 },
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function auditMagazineSetCoverPack() {
  const files = [];
  for (const [publication, { language, count }] of Object.entries(publications)) {
    const folder = resolve(root, directory, publication);
    const entries = readdirSync(folder, { withFileTypes: true });
    if (entries.length !== count || entries.some((entry) => !entry.isFile() || !entry.name.endsWith('.png'))) {
      throw new Error('unexpected_magazine_cover_population');
    }
    for (const entry of entries) {
      const fullPath = resolve(folder, entry.name);
      const bytes = readFileSync(fullPath);
      if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('invalid_magazine_cover_png');
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (width < 1 || height < 1) throw new Error('invalid_magazine_cover_dimensions');
      files.push({ path: relative(root, fullPath).split(sep).join('/'), publication, language,
        bytes: bytes.length, width, height, sha256: digest(bytes) });
    }
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {
    schemaVersion: 1, assetType: 'magazine_issue_set_cover', source: 'owner_supplied_local_files',
    assetCount: files.length, totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    aggregateFileLedgerSha256: digest(files.map((file) => `${file.path}\t${file.sha256}\n`).join('')),
    files,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(auditMagazineSetCoverPack(), null, 2)}\n`);
}
