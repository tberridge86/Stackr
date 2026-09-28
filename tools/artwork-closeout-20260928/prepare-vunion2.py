"""Prepare only two visually verified single-front replacements, never composites."""
import gzip,hashlib,importlib,json
from pathlib import Path
m=importlib.import_module('acquire-pokedata');here=Path(__file__).parent;root=Path('package');root.mkdir()
b=(here/'vunion2-candidates.json.gz').read_bytes();assert hashlib.sha256(b).hexdigest()=='d2380a210c28fce2b2416b2000f13c37d3a49baef1c13438efe356190adfa97b'
rows=json.loads(gzip.decompress(b));assert len(rows)==2 and {r['collector_number'] for r in rows}=={'056','226'}
source=gzip.decompress((here/'vunion2-provider-response.json.gz').read_bytes());assert hashlib.sha256(source).hexdigest()=='31e990cfdd44f94a1cbaeffe6580d67195cbd174112faa33c906b59691ffe68f'
(root/'source-evidence').mkdir();(root/'source-evidence/pokedata-set-173.json').write_bytes(source)
(root/'candidates.json').write_bytes((json.dumps(rows,ensure_ascii=False,indent=2)+'\n').encode())
review=json.loads((here/'vunion2-review.json').read_text(encoding='utf8'));expected={r['printing_id']:r for r in review['records']}
assert {r['printing_id'] for r in rows}==set(expected)
results=[]
for r in rows:
 result=m.acquire(r,root/'acquired')
 assert result['status']=='acquired_for_review',result.get('error')
 assert result['sha256']==expected[r['printing_id']]['replacement_sha256'] and result['sha256']!=expected[r['printing_id']]['old_composite_sha256'],'Image differs from visual review'
 result['image_file']=result['image_file'].replace('\\','/')
 result['source_declared_mime_type']=result['mime_type'];result['mime_type']={'JPEG':'image/jpeg','PNG':'image/png','WEBP':'image/webp'}[result['format']]
 result['identity_verification']={'official_name_anchor':result['official_name_anchor_verification'],'visual_review':expected[r['printing_id']]}
 m.save(root/'acquired/results'/(r['printing_id']+'.json'),result);results.append(result)
m.save(root/'acquired/manifest.json',results);m.save(root/'visual-review.json',review)
print(json.dumps({'verified_single_card_replacements':len(results),'production_writes':0}))
