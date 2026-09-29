#!/usr/bin/env python3
"""Read-only, resumable artwork reconciliation. Does not publish or alter permissions."""
import argparse, collections, concurrent.futures, hashlib, io, json, re, time, unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import urlsplit, quote
from urllib.error import HTTPError
from PIL import Image

DATA_HOSTS={'api.tcgdex.net'}
IMAGE_HOSTS={'assets.tcgdex.net','images.pokemontcg.io','images.scrydex.com'}
def now(): return datetime.now(timezone.utc).isoformat()
def sha(b): return hashlib.sha256(b).hexdigest()
def norm(s):
    s=unicodedata.normalize('NFKC',s or '').casefold().replace('’',"'")
    s=re.sub(r'[‐‑–—-](ex|gx)\b',r' \1',s)
    return ' '.join(s.split())
def safe(url,hosts):
    u=urlsplit(url)
    if u.scheme!='https' or u.hostname not in hosts or u.username or u.password or u.port not in (None,443): raise ValueError('Unapproved URL host/scheme')
class Redirect(HTTPRedirectHandler):
    def __init__(self,hosts): self.hosts=hosts
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        safe(newurl,self.hosts)
        return super().redirect_request(req,fp,code,msg,headers,newurl)
def get(url,hosts,limit=4*1024*1024):
    safe(url,hosts)
    for attempt in range(2):
        try:
            with build_opener(Redirect(hosts)).open(Request(url,headers={'User-Agent':'Stackr-artwork-reconciliation/1.0'}),timeout=25) as r:
                b=r.read(limit+1)
                if len(b)>limit: raise ValueError('Response size limit')
                return b,r.headers.get_content_type(),r.geturl()
        except HTTPError as e:
            if e.code not in (429,500,502,503,504) or attempt: raise
            retry=e.headers.get('Retry-After','2')
            if not retry.isdigit() or int(retry)>30: raise
            time.sleep(max(2,int(retry)))
        except (TimeoutError,OSError):
            if attempt: raise
            time.sleep(2)
def save(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2));tmp.replace(path)
def metadata(group,out):
    lang,code=group;path=out/'metadata'/f'{lang}__{code}.json'
    if path.exists(): return json.loads(path.read_text())
    url=f'https://api.tcgdex.net/v2/{lang}/sets/{quote(code,safe="")}'
    try:
        b,mime,final=get(url,DATA_HOSTS);j=json.loads(b)
        if j.get('id')!=code or not isinstance(j.get('cards'),list): raise ValueError('Set identity mismatch')
        result={'language':lang,'set_code':code,'source_url':url,'checked_at':now(),'sha256':sha(b),'data':j,'status':'ok'}
    except Exception as e: result={'language':lang,'set_code':code,'source_url':url,'checked_at':now(),'status':'error','error':str(e)}
    save(path,result);return result
def match(row,meta,external):
    result={**row,'publication_status':'NOT_PUBLISHED','exact_finish_verified':False,'artwork_scope':'printing_front'}
    if meta['status']!='ok': return {**result,'status':'metadata_fetch_failed','reason':meta.get('error')}
    data=meta['data'];number=row['collector_number']
    hits=[c for c in data['cards'] if str(c.get('localId'))==number]
    if len(hits)!=1: return {**result,'status':'missing_or_ambiguous_number','source_url':meta['source_url']}
    c=hits[0]
    if c.get('id') not in external.get(row['printing_id'],set()): return {**result,'status':'provider_identity_unbound','provider_id':c.get('id')}
    # Never silently use Traditional Chinese URLs for Simplified Chinese records.
    if norm(data.get('name'))!=norm(row['set_native_name']):
        return {**result,'status':'set_name_conflict','provider_set_name':data.get('name'),'source_url':meta['source_url']}
    if norm(c.get('name')) not in {norm(row['card_native_name']),norm(row['card_english_display_name'])}:
        return {**result,'status':'card_name_conflict','provider_name':c.get('name'),'source_url':meta['source_url']}
    result.update(provider_id=c['id'],source_url=meta['source_url'],source_sha256=meta['sha256'],source_name=c['name'])
    base=c.get('image')
    if not base: return {**result,'status':'provider_has_no_image'}
    try:
        safe(base,{'assets.tcgdex.net'})
        prefix='/'+row['language_code']+'/'
        if not urlsplit(base).path.startswith(prefix): raise ValueError('Image language path differs from target')
    except ValueError as e: return {**result,'status':'image_language_or_host_conflict','reason':str(e),'candidate_image':base}
    return {**result,'status':'reference_candidate','image_url':base.rstrip('/')+'/low.webp','source_code':'tcgdex','reference_only':True}
def probe(row,out):
    if row['status']!='reference_candidate': return row
    cache=out/'probes'/(row['printing_id']+'.json')
    if cache.exists(): return {**row,**json.loads(cache.read_text())}
    errors=[]
    # A documented provider format fallback preserves exactly the same image identity.
    for url in [row['image_url'],row['image_url'].replace('/low.webp','/low.png')]:
        try:
            b,mime,final=get(url,IMAGE_HOSTS)
            if not mime.startswith('image/'): raise ValueError('Non-image MIME')
            with Image.open(io.BytesIO(b)) as im: im.verify()
            with Image.open(io.BytesIO(b)) as im:
                im.load();w,h=im.size;fmt=im.format
            if fmt not in ('PNG','JPEG','WEBP') or w<80 or h<100 or not .60<=w/h<=.85: raise ValueError('Not a card-front image')
            checked={'status':'reference_http_decoded','checked_at':now(),'image_url':url,'final_url':final,'width':w,'height':h,'sha256':sha(b),'bytes':len(b),'mime_type':mime,'prior_errors':errors}
            # No provider image bytes retained in this runtime-reference-only lane.
            save(cache,checked);return {**row,**checked}
        except Exception as e: errors.append({'url':url,'error':str(e)})
    checked={'status':'image_fetch_failed','checked_at':now(),'errors':errors};save(cache,checked);return {**row,**checked}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--input-dir',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--probe',action='store_true');args=ap.parse_args()
    rows=json.loads((args.input_dir/'missing-baseline.json').read_text());vs=json.loads((args.input_dir/'missing-variants.json').read_text());es=json.loads((args.input_dir/'missing-external.json').read_text())
    variants={v['id']:v['printing_id'] for v in vs};external=collections.defaultdict(set)
    for e in es:
        if e['source_code']=='tcgdex' and e['is_current'] and not e['deprecated_at']:
            p=e['printing_id'] or variants.get(e['variant_id'])
            if p: external[p].add(e['external_id'])
    groups=collections.Counter((r['language_code'],r['provider_set_code'] or r['set_code']) for r in rows)
    metas={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures={pool.submit(metadata,k,args.output):k for k,_ in groups.most_common()}
        for future in concurrent.futures.as_completed(futures):
            k=futures[future];metas[k]=future.result()
            if len(metas)%20==0: print(json.dumps({'phase':'metadata','sets_checked':len(metas),'total':len(groups)}),flush=True)
    results=[match(r,metas[(r['language_code'],r['provider_set_code'] or r['set_code'])],external) for r in rows]
    save(args.output/'reference-results.json',results)
    print(json.dumps({'phase':'matched','counts':collections.Counter(r['status'] for r in results)}),flush=True)
    if args.probe:
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures={pool.submit(probe,r,args.output):i for i,r in enumerate(results) if r['status']=='reference_candidate'}
            for n,f in enumerate(concurrent.futures.as_completed(futures),1):
                results[futures[f]]=f.result()
                if n%100==0:
                    save(args.output/'reference-results.json',results)
                    print(json.dumps({'phase':'image_probes','checked':n,'total':len(futures)}),flush=True)
    save(args.output/'reference-results.json',results)
    summary={'at':now(),'target_printings':len(rows),'sets':len(groups),'counts':dict(collections.Counter(r['status'] for r in results)),'production_writes':0}
    save(args.output/'summary.json',summary);print(json.dumps(summary),flush=True)
if __name__=='__main__': main()
