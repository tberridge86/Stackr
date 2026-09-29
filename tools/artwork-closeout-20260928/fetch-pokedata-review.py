#!/usr/bin/env python3
"""Save bounded, public Japanese set metadata for offline identity reconciliation."""
import argparse,collections,hashlib,json,time,urllib.parse
from pathlib import Path
from scan import now,save
from pooled_http import get

def main():
 p=argparse.ArgumentParser();p.add_argument('--ledger',type=Path,required=True);p.add_argument('--exclude',type=Path,required=True);p.add_argument('--sets',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 ledger=json.loads(a.ledger.read_text());excluded={x['printing_id'] for x in json.loads(a.exclude.read_text())}
 targets=[r for r in ledger if r['language_code']=='ja' and r['category']=='Source needed' and r['printing_id'] not in excluded]
 codes={r['set_code'].casefold() for r in targets};names={r['set_english_display_name'] for r in targets}
 sets=[s for s in json.loads(a.sets.read_text()) if s.get('language')=='JAPANESE' and s.get('tcg')=='Pokemon' and (str(s.get('code') or '').casefold() in codes or s.get('name') in names)]
 assert all(isinstance(s['id'],int) and s['id']>0 and s['name'] for s in sets)
 records=[]
 for start in range(0,len(sets),50):
  for s in sets[start:start+50]:
   url='https://www.pokedata.io/api/cards?'+urllib.parse.urlencode({'set_id':s['id'],'set_name':s['name'],'tcg':'Pokemon','stats':'kwan'})
   path=a.output/('pokedata-set-'+str(s['id'])+'.json');receipt=path.with_suffix('.receipt.json')
   try:
    if path.exists() and receipt.exists():
     b=path.read_bytes();prev=json.loads(receipt.read_text());assert prev['url']==url and prev['sha256']==hashlib.sha256(b).hexdigest()
    else:
     b,mime,final=get(url,{'www.pokedata.io'},limit=12*1024*1024)
     final_parts=urllib.parse.urlsplit(final);url_parts=urllib.parse.urlsplit(url)
     if (final_parts.scheme,final_parts.hostname,final_parts.path)!=(url_parts.scheme,url_parts.hostname,url_parts.path) or urllib.parse.parse_qs(final_parts.query)!=urllib.parse.parse_qs(url_parts.query):raise ValueError('Unexpected redirect')
     value=json.loads(b)
     if not isinstance(value,list) or len(value)>2500:raise ValueError('Unexpected set response')
     for c in value:
      if c.get('language')!='JAPANESE' or c.get('tcg')!='Pokemon' or c.get('set_id')!=s['id'] or c.get('set_name')!=s['name']:raise ValueError('Response set or language mismatch')
     path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b)
     save(receipt,{'url':url,'at':now(),'sha256':hashlib.sha256(b).hexdigest(),'provider_set':s})
    records.append({'id':s['id'],'code':s.get('code'),'name':s['name'],'cards':len(json.loads(b)),'status':'metadata_saved'})
   except Exception as e:records.append({'id':s['id'],'name':s['name'],'status':'failed','error':str(e)})
   if len(records)%5==0:print(json.dumps({'checked_sets':len(records),'total_sets':len(sets),'counts':dict(collections.Counter(x['status'] for x in records))}),flush=True)
   time.sleep(.75)
  save(a.output/'pokedata-fetch-summary.json',{'at':now(),'sets':records,'production_writes':0})
 print(json.dumps({'complete':True,'sets':len(records),'counts':dict(collections.Counter(x['status'] for x in records))}),flush=True)
if __name__=='__main__':main()
