from __future__ import annotations

import hashlib
from pathlib import Path
from urllib.parse import quote

import requests

OUT=Path('build/image-proxy-probe'); OUT.mkdir(parents=True,exist_ok=True)
S=requests.Session(); S.headers.update({'User-Agent':'Mozilla/5.0'})
files=['SV9a_Hot_Wind_Arena_Logo.png','SV8a_Terastal_Fest_ex_Logo.png','S12a_VSTAR_Universe_Logo.png','S8b_VMAX_Climax_Logo.png']
for filename in files:
 d=hashlib.md5(filename.encode()).hexdigest()
 raw=f'https://archives.bulbagarden.net/media/upload/{d[0]}/{d[:2]}/{filename}'
 proxies=[
   f'https://images.weserv.nl/?url={quote(raw,safe="")}&output=png',
   f'https://wsrv.nl/?url={quote(raw,safe="")}&output=png',
   f'https://images.weserv.nl/?url=archives.bulbagarden.net/media/upload/{d[0]}/{d[:2]}/{quote(filename)}&output=png',
 ]
 for i,url in enumerate(proxies):
  try:
   r=S.get(url,timeout=60,allow_redirects=True)
   print(filename,i,r.status_code,r.headers.get('content-type'),len(r.content),r.url,flush=True)
   if r.status_code==200 and r.headers.get('content-type','').startswith('image/') and len(r.content)>500:
    (OUT/f'{i}_{filename}').write_bytes(r.content)
    break
  except Exception as e: print(filename,i,'ERROR',repr(e),flush=True)
