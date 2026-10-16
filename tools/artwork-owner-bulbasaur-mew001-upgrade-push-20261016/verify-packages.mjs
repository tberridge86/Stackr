import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { validateBytes, safePath } from '../artwork3303-publish-20260928/publish.mjs';
import { loadFrozen, PLAN_SHA } from './frozen.mjs';
export async function verifyPackages(root, sharp) { const { plan } = await loadFrozen(); sharp ??= createRequire(new URL('../../backend/package.json', import.meta.url))('sharp'); sharp.concurrency(2); for (const o of plan.objects)
    await validateBytes(sharp, await readFile(safePath(root, String(plan.archive.id) + '/' + o.file)), o); return { status: 'PASS_FULL_DECODE_FOUR_FROZEN_IMAGES', cohort_sha256: PLAN_SHA, images: 4, sourceVariantId: plan.identity.normalVariantId, actualDetailDimensions: [655, 914], HDOriginalCertified: false, provider_requests: 0, database_requests: 0, storage_writes: 0 }; }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    verifyPackages(process.argv[2]).then(r => console.log(JSON.stringify(r))).catch(() => { console.error('PACKAGE_VERIFICATION_FAILED'); process.exitCode = 1; });
