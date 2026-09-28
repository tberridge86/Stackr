import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {validatePlan,validateBytes,safePath,chunks} from './publish.mjs';
const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Packages and output paths required');
const receipt=JSON.parse(await readFile(new URL('./plan-receipt.json',import.meta.url)));
const rows=validatePlan(await readFile(new URL('./cohort.json.gz',import.meta.url)),receipt);
const require=createRequire(new URL('../../backend/package.json',import.meta.url)),sharp=require('sharp');sharp.concurrency(2);
let checked=0;
for(const batch of chunks(rows.flatMap(r=>r.objects),3)) {
 const results=await Promise.allSettled(batch.map(async o=>validateBytes(sharp,await readFile(safePath(root,`${o.artifact_id}/${o.file}`)),o)));
 const bad=results.find(r=>r.status==='rejected');if(bad)throw bad.reason;checked+=batch.length;
 if(checked%1500===0)console.log(JSON.stringify({verified_files:checked}));
}
const result={cohort_sha256:receipt.cohort_sha256,fronts:rows.length,derivatives:rows.length*3,verified_image_files:checked,production_writes:0,checked_at:new Date().toISOString()};
await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
