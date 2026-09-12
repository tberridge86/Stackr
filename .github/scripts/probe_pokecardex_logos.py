from __future__ import annotations

import concurrent.futures
import json
from pathlib import Path

import requests

OUT=Path('build/pokecardex-logo-probe'); OUT.mkdir(parents=True,exist_ok=True)
CODES=['SV10','SV9a','SV9','SV8a','SV8','SV7a','SV7','SV6a','SV6','SV5a','SV5K','SV5M','SV4a','SV4K','SV4M','SV3a','SV3','SV2a','SV2D','SV2P','SV1a','SV1S','SV1V','S12a','S12','S11a','S11','S10b','S10a','S10D','S10P','S9a','S9','S8b','S8a','S8','S7D','S7R','S6a','S6H','S6K','S5a','S5I','S5R','S4a','S4','S3','S1W','S1H','SC2a','SC2b','SC1a','SC1b']
BASES=[
 'https://pokecardex.b-cdn.net/assets/images/logos_jp/{code}.png',
 'https://pokecardex.b-cdn.net/assets/images/logos_jp/{code}.webp',
 'https://pokecardex.b-cdn.net/assets/images/logos/{code}.png',
 'https://pokecardex.com/assets/images/logos_jp/{code}.png',
]
HEAD={'User-Agent':'Mozilla/5.0','Accept':'image/avif,image/webp,image/png,image/*,*/*;q=0.8'}

def probe(code):
 out=[]
 variants=list(dict.fromkeys([code,code.lower(),code.upper(),code.replace('a','A'),code.replace('b','B')]))
 for variant in variants:
  for pat in BASES:
   url=pat.format(code=variant)
   try:
    r=requests.get(url,headers=HEAD,timeout=20,allow_redirects=True)
    if r.status_code==200 and r.headers.get('content-type','').startswith('image/') and len(r.content)>200:
     ext='png' if 'png' in r.headers.get('content-type','') else 'webp' if 'webp' in r.headers.get('content-type','') else 'img'
     path=OUT/f'{code}.{ext}'
     path.write_bytes(r.content)
     print('HIT',code,r.status_code,r.headers.get('content-type'),len(r.content),url,flush=True)
     return {'code':code,'url':url,'status':r.status_code,'content_type':r.headers.get('content-type'),'bytes':len(r.content),'file':str(path)}
    if r.status_code not in (403,404): print('MISS',code,r.status_code,len(r.content),url,flush=True)
   except Exception as e: out.append(repr(e))
 print('NONE',code,flush=True)
 return {'code':code,'url':'','errors':out}

with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
 rows=list(ex.map(probe,CODES))
(OUT/'results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print('SUMMARY',sum(bool(r.get('url')) for r in rows),'of',len(rows),flush=True)
