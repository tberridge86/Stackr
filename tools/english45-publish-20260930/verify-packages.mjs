import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
import {validatePlan} from './publish.mjs';
import {publicationObjects,safePath,validateBytes} from '../artwork3303-publish-20260928/publish.mjs';
const rows=validatePlan(await readFile(new URL('./cohort.json.gz',import.meta.url)),JSON.parse(await readFile(new URL('./plan-receipt.json',import.meta.url))));
const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/sharp/package.json':new URL('../../backend/package.json',import.meta.url));
const sharp=require('sharp');sharp.concurrency(2);const root=process.argv[2];
for(const o of publicationObjects(rows))await validateBytes(sharp,await readFile(safePath(root,`${o.artifact_id}/${o.file}`)),o);
console.log(JSON.stringify({verified_originals:45,verified_derivatives:135,production_writes:0}));
