"""Acquire a bounded, previously bound TCGdex cohort with fresh set evidence."""
import collections,concurrent.futures,hashlib,json,sys
from pathlib import Path
from acquire import image_info,numeric_equal
from scan import norm,save,now,safe
from pooled_http import get

def run(root):
 rows=json.loads((root/'candidates.json').read_text(encoding='utf8'))
 if not 1<=len(rows)<=100 or len({r['printing_id'] for r in rows})!=len(rows):raise ValueError('Invalid bounded cohort')
 evidence={}
 for url in sorted({r['identity_url'] for r in rows}):
  b,mime,final=get(url,{'api.tcgdex.net'},limit=5000000)
  if final!=url:raise ValueError('Unexpected metadata redirect')
  evidence[url]=(json.loads(b),hashlib.sha256(b).hexdigest())
  save(root/'source-evidence'/(evidence[url][1]+'.json'),json.loads(b))
 def acquire(r):
  try:
   data,digest=evidence[r['identity_url']]
   if data['id']!=r['provider_set_code'] or norm(data['name']) not in {norm(r['set_native_name']),norm(r['set_english_display_name'])}:raise ValueError('Provider set differs')
   hits=[c for c in data['cards'] if c['id']==r['provider_id']]
   if len(hits)!=1:raise ValueError('Provider identity absent or ambiguous')
   c=hits[0]
   if not numeric_equal(c['localId'],r['collector_number']) or norm(c['name'])!=norm(r['card_native_name']) or c.get('image')!=r['provider_image_base']:raise ValueError('Exact bound identity changed')
   safe(c['image'],{'assets.tcgdex.net'})
   if not c['image'].startswith('https://assets.tcgdex.net/'+r['language_code']+'/'):raise ValueError('Image language differs')
   errors=[]
   for rendition in ['high.webp','high.png','low.webp','low.png']:
    url=c['image']+'/'+rendition
    try:
     b,mime,final=get(url,{'assets.tcgdex.net'},limit=12000000)
     if final!=url:raise ValueError('Unexpected image redirect')
     info=image_info(b,mime);break
    except Exception as e:errors.append({'url':url,'error':str(e)})
   else:raise ValueError(json.dumps(errors))
   info['source_declared_mime_type']=mime;info['mime_type']={'PNG':'image/png','JPEG':'image/jpeg','WEBP':'image/webp'}[info['format']]
   rel='originals/'+info['sha256']+'.'+{'PNG':'png','JPEG':'jpg','WEBP':'webp'}[info['format']]
   f=root/'acquired'/rel;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(b)
   result={**r,**info,'image_file':rel,'acquired_url':url,'rendition_attempts':errors,'identity_verification':{'metadata_sha256':digest,'provider_id':c['id'],'name':c['name'],'number':c['localId'],'checked_at':now()},'status':'acquired_for_review','production_writes':0,'publication_status':'NOT_PUBLISHED','exact_finish_verified':False,'source_approval_recheck_required':True}
  except Exception as e:result={**r,'status':'acquisition_failed','error':str(e),'production_writes':0}
  save(root/'acquired/results'/(r['printing_id']+'.json'),result);return result
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(acquire,rows))
 save(root/'acquired/manifest.json',results)
 summary={'targets':len(rows),'counts':dict(collections.Counter(r['status'] for r in results)),'production_writes':0,'checked_at':now()}
 save(root/'acquired/summary.json',summary);print(json.dumps(summary))
if __name__=='__main__':run(Path(sys.argv[1]))
