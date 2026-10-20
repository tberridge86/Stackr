import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { check } from '../queue1-publish-20260927/publish.mjs';
import { publicationObjects, safePath, validateBytes } from '../artwork3303-publish-20260928/publish.mjs';
import { loadFrozen, COHORT_SHA, FRONTS, OBJECTS } from './frozen.mjs';

export async function verifyPackages(root) {
  check(root, 'Package directory required');
  const { rows } = await loadFrozen();
  const sharp = createRequire(new URL('../../backend/package.json', import.meta.url))('sharp');
  sharp.concurrency(2);
  const objects = publicationObjects(rows);
  check(objects.length === OBJECTS, 'Wrong one-hundred-ninety-two-file cohort');
  for (const object of objects) await validateBytes(sharp, await readFile(safePath(root, `${object.artifact_id}/${object.file}`)), object);
  return { status: 'all_frozen_files_fully_decoded', cohort_sha256: COHORT_SHA, fronts: FRONTS, derivatives: FRONTS * 3, files: objects.length, database_requests: 0, provider_requests: 0, storage_writes: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) verifyPackages(process.argv[2]).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
