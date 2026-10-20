// Read-only offline freeze/provenance verification. No network or database writes.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen } from './frozen.mjs';
import { snapshotHash } from './metadata-guard.mjs';
const root = process.argv[2]; check(root, 'Private evidence root required');
const descriptor = await readFile(new URL('./freeze-inputs.json', import.meta.url));
check(digest(descriptor) === '6cc68a772f20f886780220e5b23ace7d63a56e4da2c8470fe408f1d6f0934c4b', 'Frozen input descriptor changed');
const inputs = JSON.parse(descriptor);
for (const pin of inputs.private_inputs) check(digest(await readFile(resolve(root,pin.file))) === pin.sha256, 'External source/checkpoint authority changed');
for (const pin of inputs.unchanged_dependencies) check(digest(await readFile(new URL('../../'+pin.file,import.meta.url))) === pin.sha256, 'Shared dependency changed');
for (const [name,pin] of [[inputs.source_manifest_file,inputs.source_manifest_sha256],[inputs.package_receipt_file,inputs.package_receipt_sha256]]) check(digest(await readFile(resolve(root,name))) === pin, 'Private package changed');
const {rows,plan} = await loadFrozen();
for (const environment of ['production','staging']) {
  const baseline=JSON.parse(await readFile(resolve(root,`source-batches/pcg6-wave008009010-ten-root-fresh-facts-20261016/pcg6-ten-wave008009010-sources-20261016-${environment}-before.json`)));
  baseline.sort((a,b)=>(a.scope+':'+a.identity).localeCompare(b.scope+':'+b.identity));
  check(snapshotHash(baseline)===plan.before_snapshot_hashes[environment], 'Full frozen metadata baseline hash changed');
}
const validatorBytes = await readFile(resolve(root,'pcg6-wave008009010-ten-private-preparation-v2-20261016/pcg6-source-contract.mjs'));
check(digest(validatorBytes) === '8d234aae1a181aa47da915f71d3091ffed8237f56295b5cf298daa341157c479', 'Corrected v2 validator required separately from unchanged ZIP');
const bindingBytes = await readFile(resolve(root,'pcg6-wave008009010-ten-private-preparation-v2-20261016/v2-validator-contract-binding.json'));
check(digest(bindingBytes) === 'e5ea926d9fc6ef91bfcf94b998800ce2a6d1f659c2a373982344f9b4722c9a35', 'Exact external v2 validator binding required');
console.log(JSON.stringify({fronts:rows.length,externalAuthorityPins:inputs.private_inputs.length,unchangedDependencies:inputs.unchanged_dependencies.length,databaseRequests:0,sourceRequests:0}));
