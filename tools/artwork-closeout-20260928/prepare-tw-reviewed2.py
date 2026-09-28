"""Preserve two visually checked official fronts whose HTML pages are unavailable."""
import gzip,hashlib,json
from pathlib import Path
from acquire import image_info,numeric_equal
from pooled_http import get
from scan import save,now,norm
here=Path(__file__).parent;root=Path('tw-reviewed-package');root.mkdir()
encoded=(here/'tw-reviewed2-candidates.json.gz').read_bytes();assert hashlib.sha256(encoded).hexdigest()=='4d7a9cd0da5081fe55b46213a6bc7f41c5e0684fb90d439ec7bf88f8cc3c9739'
rows=json.loads(gzip.decompress(encoded))
assert len(rows)==2 and {r['collector_number'] for r in rows}=={'125','134'}
save(root/'candidates.json',rows);results=[]
for r in rows:
 review=r['visual_review']
 assert r['language_code']==review['verified_language']=='zh-tw' and r['source_code']=='pokemon_official_taiwan_review_required' and r['permission_status']=='REVIEW_REQUIRED'
 assert norm(r['card_native_name'])==norm(r['source_name'])==norm(review['verified_native_name'])
 assert r['set_code']==r['source_set']==review['verified_set_code']=='SV3'
 assert numeric_equal(r['collector_number'],r['source_number']) and r['collector_number']==review['verified_number']
 assert numeric_equal(r['printed_total'],r['source_total']) and numeric_equal(r['printed_total'],review['verified_printed_total'])
 b,mime,final=get(r['image_url'],{'asia.pokemon-card.com'},limit=12000000)
 assert final==r['image_url'] and final.startswith('https://asia.pokemon-card.com/tw/card-img/')
 info=image_info(b,mime);assert info['sha256']==review['source_sha256'],'Bytes differ from exact visual review'
 relative='originals/'+info['sha256']+'.png';assert info['format']=='PNG'
 p=root/'acquired'/relative;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
 result={**r,**info,'source_declared_mime_type':mime,'mime_type':'image/png','image_file':relative,'acquired_url':final,'identity_verification':{'visual_review':review,'metadata_source_revision':r['source_revision'],'metadata_source_file':r['source_file'],'metadata_source_file_sha256':r['source_file_sha256'],'checked_at':now(),'official_html_page_status':'UNAVAILABLE'},'status':'acquired_for_review','publication_status':'NOT_PUBLISHED','production_writes':0,'exact_finish_verified':False}
 save(root/'acquired/results'/(r['printing_id']+'.json'),result);results.append(result)
save(root/'acquired/manifest.json',results);save(root/'acquired/summary.json',{'verified_fronts':2,'production_writes':0,'permission_status':'REVIEW_REQUIRED'})
print(json.dumps({'visually_verified_fronts':len(results),'production_writes':0}))
