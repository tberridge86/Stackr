#!/usr/bin/env python3
"""Reconcile only unresolved Japanese fronts; never changes a published catalogue."""
import argparse,collections,hashlib,json,re,subprocess,unicodedata
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import urlsplit

ALIASES={'SM1+':'SM1p','SM2+':'SM2p','SM3+':'SM3p','SM4+':'SM4p','SM5+':'SM5p'}
def norm(s):return re.sub(r'\s+','',unicodedata.normalize('NFKC',str(s or '')))
def number(s):
 s=str(s or '').split('/')[0]
 return str(int(s)) if s.isdigit() else s
def save(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2))
def match(row,hits):
 exact=[x for x in hits if norm(x[0].get('name'))==norm(row['card_native_name'])];rule='exact_name'
 if not exact:
  exact=[x for x in hits if norm(x[0].get('name')).endswith('prismstar') and norm(x[0]['name'])[:-9]==norm(row['card_native_name']).rstrip('♢◇')]
  if exact:rule='prism_symbol_spelling'
 return exact,rule
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--ledger',type=Path,required=True);ap.add_argument('--metadata',type=Path,required=True);ap.add_argument('--revision',required=True);ap.add_argument('--output',type=Path,required=True);a=ap.parse_args()
 head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=a.metadata,text=True).strip()
 if head!=a.revision or not re.fullmatch(r'[0-9a-f]{40}',a.revision):raise ValueError('Metadata revision mismatch')
 if subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=a.metadata,text=True).strip():raise ValueError('Modified source metadata')
 ledger=json.loads(a.ledger.read_text());targets=[r for r in ledger if r['language_code']=='ja' and r['category']=='Source needed']
 assert len({r['printing_id'] for r in targets})==len(targets)
 wanted={ALIASES.get(r['set_code'],r['set_code']) for r in targets};index=collections.defaultdict(list)
 for code in sorted(wanted):
  folder=a.metadata/'data_jp'/code
  if not folder.is_dir():continue
  for file in sorted(folder.glob('*.json')):
   raw=file.read_bytes();j=json.loads(raw)
   if j.get('set_name')!=code or not j.get('img') or not j.get('url'):continue
   index[(code,number(j.get('number')))].append((j,str(file.relative_to(a.metadata)),hashlib.sha256(raw).hexdigest()))
 candidates=[];remaining=[]
 for r in targets:
  code=ALIASES.get(r['set_code'],r['set_code']);hits=index[(code,number(r['collector_number']))];exact,rule=match(r,hits)
  if code!=r['set_code']:
   exact=[x for x in exact if any(norm(r['set_native_name']) in norm(s.get('name')) for s in x[0].get('sources',[]))]
  urls={j['img'] for j,_,_ in exact}
  reason='No exact pointer in the selected official metadata'
  if len(urls)>1:reason='Multiple exact-name/number artwork candidates; manual choice retained'
  if len(urls)==1:
   j,f,h=exact[0]
   if not(str(j.get('set_total')).isdigit() and str(r.get('printed_total')).isdigit() and int(j['set_total'])==int(r['printed_total'])):
    remaining.append({'printing_id':r['printing_id'],'reason':'Printed denominator mismatch or missing','source_files':[x[1] for x in exact]});continue
   for url in [j['img'],j['url']]:
    u=urlsplit(url);assert u.scheme=='https' and u.hostname=='www.pokemon-card.com' and not u.username and not u.password
   candidates.append({**r,'status':'snapshot_exact_pointer','image_url':j['img'],'identity_url':j['url'],'source_name':j['name'],'source_set':code,'source_number':j['number'],'source_total':j['set_total'],'source_file':f,'source_file_sha256':h,'source_repository':'type-null/PTCG-database','source_revision':head,'source_code':'pokemon_card_jp_official','permission_status':'existing_source_recheck','name_match_rule':rule,'set_alias_evidence':j.get('sources') if code!=r['set_code'] else None,'production_writes':0,'exact_finish_verified':False,'artwork_scope':'printing_front'})
  else:remaining.append({'printing_id':r['printing_id'],'reason':reason,'source_files':[x[1] for x in exact]})
 assert len(candidates)+len(remaining)==len(targets)
 summary={'at':datetime.now(timezone.utc).isoformat(),'metadata_revision':head,'targets':len(targets),'exact_candidates':len(candidates),'by_set':dict(collections.Counter(r['set_code'] for r in candidates)),'unresolved':len(remaining),'source_approval':'Existing official Japanese source; recheck before publication','production_writes':0}
 save(a.output/'candidates.json',candidates);save(a.output/'remaining.json',remaining);save(a.output/'matching-summary.json',summary);print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':main()
