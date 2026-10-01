import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {publishFrozenCohort,createTransferPolicy} from './publish.mjs';

test('publisher persists an initialized transfer journal when guarded database setup fails',async()=>{
  const prefix=path.join(tmpdir(),'stackr-publication-journal-'),root=await mkdtemp(prefix);
  const previous=process.env.SUPABASE_STAGING_DB_URL;
  try {
    const require=createRequire(new URL('../../backend/package.json',import.meta.url));
    const bytes=await require('sharp')({create:{width:2,height:3,channels:3,background:'#ffffff'}}).png().toBuffer();
    await mkdir(path.join(root,'fixture'));await writeFile(path.join(root,'fixture','front.png'),bytes);
    const object={role:'original',artifact_id:'fixture',file:'front.png',sha256:createHash('sha256').update(bytes).digest('hex'),byte_size:bytes.length,width:2,height:3,mime_type:'image/png'};
    // The existing connection guard rejects this scheme before constructing a
    // client or opening a connection, so the real publisher runs fully offline.
    process.env.SUPABASE_STAGING_DB_URL='https://example.invalid';
    await assert.rejects(publishFrozenCohort({rows:[{printing_id:'11111111-1111-4111-8111-111111111111',objects:[object]}],receipt:{cohort_sha256:'frozen'},approval:{},root,output:path.join(root,'output'),transferPolicy:createTransferPolicy()}),/invalid_postgres_connection_scheme/);
    const saved=JSON.parse(await readFile(path.join(root,'output','receipt.json'),'utf8'));
    assert.equal(saved.status,'failed_before_publication');assert.equal(saved.error,'invalid_postgres_connection_scheme');
    assert.equal(saved.local_files_verified,1);assert.deepEqual(saved.objects,[]);
    assert.deepEqual(saved.assets,[]);assert.deepEqual(saved.links,[]);
    assert.equal(saved.metadata_changes,0);assert.equal(saved.ownership_changes,0);assert.equal(saved.pricing_changes,0);
    assert.deepEqual(saved.transfer_policy,{concurrency:2,min_interval_ms:700});
  } finally {
    if(previous===undefined)delete process.env.SUPABASE_STAGING_DB_URL;else process.env.SUPABASE_STAGING_DB_URL=previous;
    assert.ok(path.resolve(root).startsWith(path.resolve(prefix))&&path.dirname(path.resolve(root))===path.resolve(tmpdir()));
    await rm(root,{recursive:true,force:true});
  }
});

