#!/usr/bin/env python3
"""Acquire exact Japanese image-only candidates, with live official name anchors."""
import argparse,collections,concurrent.futures,hashlib,json
from pathlib import Path
from acquire import image_info,verify_page
from scan import now,save
from pooled_http import get
from importlib import import_module
valid_url=import_module('reconcile-pokedata').valid_url
norm=import_module('reconcile-pokedata').norm
provider_name=import_module('reconcile-pokedata').provider_name
number=import_module('reconcile-pokedata').num
def verify_record(row):
 if row['language_code']!='ja' or row['source_code']!='pokedata_japanese':raise ValueError('Wrong source or language scope')
 if number(row['collector_number'])!=number(row['source_number']):raise ValueError('Canonical number mismatch')
 b=Path(row['provider_response_file']).read_bytes()
 if hashlib.sha256(b).hexdigest()!=row['provider_response_sha256']:raise ValueError('Provider response drift')
 hits=[c for c in json.loads(b) if c.get('id')==row['source_provider_card_id']]
 if len(hits)!=1:raise ValueError('Missing or duplicate provider card')
 c=hits[0]
 for field,expected in [('language','JAPANESE'),('tcg','Pokemon'),('set_id',row['source_provider_set_id']),('set_name',row['source_provider_set_name']),('name',row['source_name']),('num',row['source_number']),('img_url',row['image_url'])]:
  if c.get(field)!=expected:raise ValueError('Provider identity mismatch: '+field)
 if str(c.get('set_code','')).casefold()!=row['set_code'].casefold():raise ValueError('Provider set code mismatch')
 if not valid_url(row['image_url']):raise ValueError('Unsafe provider image URL')
 a=row['official_name_anchor']
 if provider_name(a['provider_name'])!=provider_name(c['name']) or norm(a['source_name'])!=norm(row['card_native_name']):raise ValueError('Japanese name anchor mismatch')
 anchor_raw=Path(a['provider_response_file']).read_bytes()
 if hashlib.sha256(anchor_raw).hexdigest()!=a['provider_response_sha256']:raise ValueError('Anchor response drift')
 anchor_hits=[x for x in json.loads(anchor_raw) if x.get('id')==a['provider_card_id'] and x.get('num')==a['provider_number'] and x.get('name')==a['provider_name'] and x.get('set_id')==a['provider_set_id'] and x.get('set_name')==a['provider_set_name'] and x.get('language')=='JAPANESE' and x.get('tcg')=='Pokemon']
 if len(anchor_hits)!=1:raise ValueError('Missing provider name anchor')
 return a
def acquire(row,out):
 cache=out/'results'/(row['printing_id']+'.json')
 try:
  anchor=verify_record(row)
  if cache.exists():
   old=json.loads(cache.read_text());p=out/old.get('image_file','missing')
   unchanged=all(old.get(k)==row.get(k) for k in ['printing_id','collector_number','card_native_name','source_provider_card_id','image_url','provider_response_sha256','official_name_anchor'])
   if unchanged and old.get('status')=='acquired_for_review' and p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==old['sha256']:return old
  # A reconstructed candidate may select a different valid official name anchor.
  # Bind cached HTML to the actual anchor URL, not the target printing alone.
  page=out/'identity-pages'/(hashlib.sha256(anchor['identity_url'].encode()).hexdigest()+'.html')
  if page.exists():raw=page.read_bytes()
  else:
   raw,_,_=get(anchor['identity_url'],{'www.pokemon-card.com'},limit=2*1024*1024);page.parent.mkdir(parents=True,exist_ok=True);page.write_bytes(raw)
  # This page corroborates the native name only; the acquired front is separately
  # bound to its exact provider card ID/number, never the anchor's composite image.
  evidence=verify_page(raw,anchor,name_anchor_only=True)
  evidence['verification_scope']='native_name_anchor_only'
  b,mime,final=get(row['image_url'],{'pokemoncardimages.pokedata.io'},limit=12*1024*1024)
  info=image_info(b,mime);ext={'PNG':'png','JPEG':'jpg','WEBP':'webp'}[info['format']];image_file=Path('originals')/(info['sha256']+'.'+ext);(out/image_file).parent.mkdir(parents=True,exist_ok=True);(out/image_file).write_bytes(b)
  result={**row,**info,'official_name_anchor_verification':evidence,'image_file':str(image_file),'acquired_url':row['image_url'],'final_url':final,'source_rendition':'provider_original','checked_at':now(),'status':'acquired_for_review','publication_status':'NOT_PUBLISHED','source_approval_recheck_required':True,'exact_finish_verified':False,'production_writes':0}
 except Exception as e:result={**row,'status':'acquisition_failed','error':str(e),'checked_at':now()}
 save(cache,result);return result
def main():
 p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();rows=json.loads(a.input.read_text());assert len(rows)<=500 and len({r['printing_id'] for r in rows})==len(rows)
 results=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for result in pool.map(lambda r:acquire(r,a.output),rows):
   results.append(result)
   if len(results)%25==0:save(a.output/'manifest.json',results);print(json.dumps({'checked':len(results),'total':len(rows),'counts':dict(collections.Counter(x['status'] for x in results))}),flush=True)
 save(a.output/'manifest.json',results);summary={'at':now(),'targets':len(rows),'counts':dict(collections.Counter(x['status'] for x in results)),'production_writes':0};save(a.output/'summary.json',summary);print(json.dumps(summary),flush=True)
if __name__=='__main__':main()
