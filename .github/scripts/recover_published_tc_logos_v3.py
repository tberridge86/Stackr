"""Retrieve published images only. Filenames may use simplified characters; the image must be reviewed for Traditional Chinese content."""
from __future__ import annotations
import ast,concurrent.futures as cf,hashlib,io,json,re
from pathlib import Path
from urllib.parse import quote
import requests
from PIL import Image
from opencc import OpenCC
OUT=Path('build/tc-published-recovery-v3')
(OUT/'images').mkdir(parents=True,exist_ok=True);(OUT/'metadata').mkdir(exist_ok=True)
source=ast.parse(Path(__file__).with_name('recover_published_tc_logos.py').read_text())
raw=next(ast.literal_eval(n.value) for n in source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='RAW' for t in n.targets))
NAMES=dict(line.split('|',1) for line in raw.splitlines())
simple=OpenCC('t2s');trad=OpenCC('s2t')
HEAD={'User-Agent':'Mozilla/5.0','Referer':'https://wiki.52poke.com/'}
EXACT={
'S6a':['伊布英雄_中文logo.png'],
'S6H':['银白战枪_中文logo.png'],
'S12a':['TCG_剑&盾_天地万物VSTAR_繁中logo.png'],
'SV4M':['TCG_朱&紫_未来闪光_繁中logo.png'],
'SV6a':['TCG_朱&紫_黑夜漫游者_繁中logo.png'],
'SV1a':['TCG_朱&紫_三连音爆_繁中logo.png'],
'SI':['TCG_初阶牌组100_中文logo.png'],
'SVHM':['TCG_起始组合_未来密勒顿ex_繁中logo.png'],
'SVHK':['TCG_起始组合_古代故勒顿ex_繁中logo.png'],
}

def try_file(code,filename):
 filename=filename.replace(' ','_');h=hashlib.md5(filename.encode()).hexdigest()
 url=f'https://s1.52poke.com/wiki/{h[0]}/{h[:2]}/'+quote(filename,safe='')
 try:
  r=requests.get(url,headers=HEAD,timeout=(5,10))
  if r.status_code!=200:return None
  im=Image.open(io.BytesIO(r.content));im.load()
  if im.width<70 or im.height<15:return None
  digest=hashlib.sha256(r.content).hexdigest()
  out=f'images/{code}_{digest[:12]}.png'
  (OUT/out).write_bytes(r.content)
  return {'code':code,'name':NAMES[code],'filename_on_source':filename,'url':url,'page_url':'https://wiki.52poke.com/zh-hant/'+quote(simple.convert(NAMES[code])+'（TCG）'),'file':out,'width':im.width,'height':im.height,'sha256':digest,'status':'published_logo_candidate_pending_visual_check'}
 except Exception:return None

def resolve(pair):
 code,name=pair
 era='朱&紫' if code.startswith('SV') else '剑&盾'
 ns=list(dict.fromkeys([simple.convert(name),name,simple.convert(name).replace('祕','秘').replace('撃','击').replace('Ｑ','Q')]))
 if code=='S8b':ns+=['VMAX绝群压轴','VMAX 絕群壓軸','VMAX绝群压轴']
 if code=='S5I':ns+=['一击大师','一擊大師']
 if code=='S5R':ns+=['连击大师','連擊大師']
 if code=='SCC':ns+=['V起始牌组_进化']
 if code in ('SVAL','SVAM','SVAW'):
  ns += [n.replace('ex ','ex_') for n in ns]
 candidates=list(EXACT.get(code,[]))
 for n in ns:
  candidates += [f'TCG_{era}_{n}_繁中logo.png',f'TCG_{n}_繁中logo.png',f'{n}_中文logo.png',f'TCG_{n}_中文logo.png',f'TCG_{era}_{n}_中文logo.png',f'{n}_繁中logo.png']
 candidates=list(dict.fromkeys(candidates))[:22]
 for filename in candidates:
  x=try_file(code,filename)
  if x:
   print('FOUND',code,filename,x['width'],x['height'],flush=True);return x
 print('MISS',code,len(candidates),flush=True)
 return {'code':code,'name':name,'status':'not_resolved_by_published_filename_patterns','tested_filenames':candidates}
with cf.ThreadPoolExecutor(max_workers=4) as ex:results=list(ex.map(resolve,NAMES.items()))
(OUT/'metadata/results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('FINISHED',sum('file' in x for x in results),'/',len(results),'logos retrieved',flush=True)
