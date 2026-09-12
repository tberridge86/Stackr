from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote

import requests

OUT=Path('build/bulbapedia-json-probe'); OUT.mkdir(parents=True,exist_ok=True)
DATA='https://raw.githubusercontent.com/pokemon-tcg-collection/pokemon-tcg-collection.github.io/main/src/model/data/bulbapedia-ja-sets.json'
S=requests.Session(); S.headers.update({'User-Agent':'Mozilla/5.0 (compatible; StackrLogoResearch/1.0)'})
r=S.get(DATA,timeout=60); print('JSON',r.status_code,len(r.content),flush=True); r.raise_for_status()
rows=r.json()
print('ROWS',len(rows),flush=True)
for row in rows[-80:]:
    if row.get('logo_url'):
        print('ENTRY',json.dumps({k:row.get(k) for k in row.keys() if k in ('series','no','name','name_original','logo_url','bulbapedia_url','code','id')},ensure_ascii=False),flush=True)

need=['SV9a_Hot_Wind_Arena_Logo.png','SV8a_Terastal_Fest_ex_Logo.png','S12a_VSTAR_Universe_Logo.png','S8b_VMAX_Climax_Logo.png']
for filename in need:
    matches=[row for row in rows if filename.replace('_',' ')[:-4].lower() in str(row).replace('_',' ').lower() or filename.lower() in str(row).lower()]
    print('MATCH',filename,len(matches),flush=True)
    for row in matches[:3]: print(json.dumps(row,ensure_ascii=False)[:1500],flush=True)

# Try every exact logo URL from current SV/SWSH entries through direct and proxy.
selected=[]
for row in rows:
    u=row.get('logo_url') or ''
    text=(str(row.get('name',''))+' '+str(row.get('name_original',''))+' '+u).lower()
    if any(tok in text for tok in ('hot wind arena','terastal fest','vstar universe','vmax climax')):
        selected.append((row.get('name',''),u))
for name,u in selected:
    print('TRY',name,u,flush=True)
    urls=[u,
      f'https://images.weserv.nl/?url={quote(u,safe="")}&output=png',
      f'https://wsrv.nl/?url={quote(u,safe="")}&output=png']
    for i,url in enumerate(urls):
        try:
            rr=S.get(url,timeout=60,allow_redirects=True)
            print('RESULT',i,rr.status_code,rr.headers.get('content-type'),len(rr.content),rr.url,flush=True)
            if rr.status_code==200 and rr.headers.get('content-type','').startswith('image/') and len(rr.content)>500:
                safe=''.join(c if c.isalnum() else '-' for c in str(name))
                (OUT/f'{safe}-{i}.png').write_bytes(rr.content)
                break
        except Exception as e: print('ERROR',i,repr(e),flush=True)
