from __future__ import annotations

import json
from pathlib import Path

import requests

OUT=Path('build/hikaru-collections-probe'); OUT.mkdir(parents=True,exist_ok=True)
S=requests.Session(); S.headers.update({'User-Agent':'Mozilla/5.0','Accept':'application/json,text/html,*/*'})
urls=[
 'https://hikarudistribution.com/collections.json?limit=250',
 'https://hikarudistribution.com/collections/all?view=json',
]
for url in urls:
 try:
  r=S.get(url,timeout=60,allow_redirects=True)
  print('URL',r.status_code,r.headers.get('content-type'),len(r.content),r.url,flush=True)
  print(r.text[:1000],flush=True)
  (OUT/(str(len(list(OUT.glob('*'))))+'-response.txt')).write_text(r.text,encoding='utf-8',errors='replace')
  if r.status_code==200 and 'json' in r.headers.get('content-type',''):
   data=r.json(); (OUT/'collections.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
   cols=data.get('collections',data if isinstance(data,list) else [])
   for c in cols:
    text=' '.join(str(c.get(k,'')) for k in ('title','handle','description','image'))
    if any(tok.lower() in text.lower() for tok in ['sv9','sv8','sv7','sv6','sv5','sv4','sv3','sv2','sv1','s12','s11','s10','s9','s8','s7','s6','s5','s4']):
     print('COL',json.dumps(c,ensure_ascii=False)[:1500],flush=True)
 except Exception as e: print('ERROR',url,repr(e),flush=True)
