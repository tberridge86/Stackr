// Read-only offline freeze/provenance verification. No network or database writes.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen } from './frozen.mjs';
import { snapshotHash } from './metadata-guard.mjs';
const root = process.argv[2]; check(root, 'Private evidence root required');
const descriptor = await readFile(new URL('./freeze-inputs.json', import.meta.url));
check(digest(descriptor) === '0f4193fb9d1a8fb8c37f749bdaacf8cf441d5029bd2661c31b3e14f333ccdcda', 'Frozen input descriptor changed');
const inputs = JSON.parse(descriptor);
for (const pin of inputs.private_inputs) check(digest(await readFile(resolve(root,pin.file))) === pin.sha256, 'External source/checkpoint authority changed');
for (const pin of inputs.unchanged_dependencies) check(digest(await readFile(new URL('../../'+pin.file,import.meta.url))) === pin.sha256, 'Shared dependency changed');
for (const [name,pin] of [[inputs.source_manifest_file,inputs.source_manifest_sha256],[inputs.package_receipt_file,inputs.package_receipt_sha256]]) check(digest(await readFile(resolve(root,name))) === pin, 'Private package changed');
const {rows,plan} = await loadFrozen();
for (const environment of ['production','staging']) {
  const baseline=JSON.parse(await readFile(resolve(root,`pcg2-three-wave001-sources-20261016-${environment}-before.json`)));
  baseline.sort((a,b)=>(a.scope+':'+a.identity).localeCompare(b.scope+':'+b.identity));
  check(snapshotHash(baseline)===plan.before_snapshot_hashes[environment], 'Full frozen metadata baseline hash changed');
}
console.log(JSON.stringify({fronts:rows.length,externalAuthorityPins:inputs.private_inputs.length,unchangedDependencies:inputs.unchanged_dependencies.length,databaseRequests:0,sourceRequests:0}));
