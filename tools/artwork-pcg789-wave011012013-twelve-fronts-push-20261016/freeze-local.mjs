// Read-only offline freeze/provenance verification. No network or database writes.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen } from './frozen.mjs';
import { snapshotHash } from './metadata-guard.mjs';
const root = process.argv[2]; check(root, 'Private evidence root required');
const descriptor = await readFile(new URL('./freeze-inputs.json', import.meta.url));
check(digest(descriptor) === "75cc385364f3e35b6cbe3adf380e49bce31f185d73267461fd36cedc90782136", 'Frozen input descriptor changed');
const inputs = JSON.parse(descriptor);
for (const pin of inputs.private_inputs) check(digest(await readFile(resolve(root,pin.file))) === pin.sha256, 'External source/checkpoint authority changed');
for (const pin of inputs.unchanged_dependencies) check(digest(await readFile(new URL('../../'+pin.file,import.meta.url))) === pin.sha256, 'Shared dependency changed');
for (const [name,pin] of [[inputs.source_manifest_file,inputs.source_manifest_sha256],[inputs.package_receipt_file,inputs.package_receipt_sha256]]) check(digest(await readFile(resolve(root,name))) === pin, 'Private package changed');
const {rows,plan} = await loadFrozen();
for (const environment of ['production','staging']) {
  const baseline=JSON.parse(await readFile(resolve(root,`source-batches/pcg789-wave011012013-twelve-root-current-facts-20261016/pcg789-twelve-wave011012013-sources-20261016-${environment}-before.json`)));
  baseline.sort((a,b)=>(a.scope+':'+a.identity).localeCompare(b.scope+':'+b.identity));
  check(snapshotHash(baseline)===plan.before_snapshot_hashes[environment], 'Full frozen metadata baseline hash changed');
}
const validatorBytes = await readFile(resolve(root,'pcg789-wave011012013-twelve-private-preparation-20261016/pcg789-source-contract.mjs'));
check(digest(validatorBytes) === '9f7a132ec7c2e8f508d19d1869836a3cdb9b521e1c0723cde68fc87098ff7f75', 'Exact twelve-row strict validator required separately from unchanged ZIP');
const bindingBytes = await readFile(resolve(root,'pcg789-wave011012013-twelve-private-preparation-20261016/validator-contract-binding.json'));
check(digest(bindingBytes) === '65e7faabea24c378950eae3e0f9f4b1524888c09c06506444e3e7dd5e0784e90', 'Exact external twelve-row validator binding required');
console.log(JSON.stringify({fronts:rows.length,externalAuthorityPins:inputs.private_inputs.length,unchangedDependencies:inputs.unchanged_dependencies.length,databaseRequests:0,sourceRequests:0}));
