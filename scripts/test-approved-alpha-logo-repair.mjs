import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repair = await readFile(new URL('./deploy/repair-approved-alpha-set-logos.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/repair-approved-alpha-set-logos.yml', import.meta.url), 'utf8');
const audit = await readFile(new URL('./deploy/audit-production-current-asset-links.mjs', import.meta.url), 'utf8');

assert.match(repair, /PRODUCTION_REF = 'oakdbbzdqwurpjnoqhmu'/, 'repair must name the only production project');
assert.match(repair, /--target=production/, 'repair must fail closed without an explicit target');
assert.match(repair, /REPAIR APPROVED ALPHA SET LOGOS/, 'repair must require the exact write confirmation');
assert.match(repair, /MAX_CANDIDATES = 150/, 'repair must retain a bounded candidate cohort');
assert.match(repair, /Expected \$\{expected\} currently published JPEG\/WebP candidates/, 'repair must stop when the audited candidate count changes');
assert.match(repair, /source\.metadata\.hasAlpha/, 'repair must skip opaque WebP sources');
assert.match(repair, /\.eq\('updated_at', asset\.updated_at\)/, 'repair must use optimistic asset updates');
assert.match(repair, /await persistReceipt\(\)/, 'repair must persist a receipt before and after every candidate');
assert.match(repair, /manifest\.some/, 'repair must verify every current manifest row for the repaired asset');
assert.match(workflow, /environment: production/, 'production workflow must require the production environment gate');
assert.match(workflow, /EXPECTED_MAIN_SHA/, 'workflow must lock execution to an exact reviewed main revision');
assert.match(workflow, /SUPABASE_PRODUCTION_SECRET_KEY/, 'workflow must use a production-only secret');
assert.match(workflow, /catalogue-public-set-link-completeness-20260909\.csv/, 'workflow must retain per-set delivery evidence');
assert.doesNotMatch(audit, /readFile/, 'per-set audit must not depend on a gitignored local inventory');
assert.match(audit, /api'\)\.from\('catalogue_sets'/, 'per-set audit must read canonical current set membership');
assert.match(audit, /order\('catalogue_version_id'/, 'per-set pagination must use a deterministic version key');
assert.match(audit, /order\('variant_id'/, 'card pagination must use a deterministic variant key');
assert.match(audit, /order\('asset_row_id'/, 'asset pagination must use the manifest row identity');
assert.match(audit, /variants\.get\(key\)\?\.has\(link\.variant_id\)/, 'asset counts must intersect currently published variants');
assert.match(audit, /api'\)\.from\('catalogue_cards'/, 'per-set audit must count current published variants');
assert.match(audit, /api'\)\.from\('asset_manifest'/, 'per-set audit must count public manifest links');

console.log('Approved alpha-logo repair guards passed.');
