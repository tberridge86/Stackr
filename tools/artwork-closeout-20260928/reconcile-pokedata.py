#!/usr/bin/env python3
"""Image-only candidates with exact set/number and a Japanese name evidence chain.

The provider uses English names. Same-set, same-number official Japanese
records establish name pairings. Candidates retain exact set and number;
prefer a same-set pairing, otherwise require a globally unique observed pairing.
Live official anchor checks occur on acquire. Only the explicit Holofoil suffix
is removed from provider name comparisons; raw labels and finish limits remain.
No guessed set aliases, translated names, or ambiguous images are accepted.
"""
import argparse,collections,hashlib,json,re,subprocess,unicodedata
from pathlib import Path
from urllib.parse import urlsplit
from scan import now,save
from importlib import import_module
ALIASES=import_module('reconcile-additional-jp').ALIASES
def norm(s):return re.sub(r'\s+','',unicodedata.normalize('NFKC',str(s or ''))).casefold()
def provider_name(s):
 # This explicit provider suffix is finish metadata, not part of the name.
 # Keep the raw label and do not infer or certify the physical finish.
 return norm(re.sub(r' Holofoil$','',str(s or '')))
def num(s):
 s=str(s or '');return str(int(s)) if s.isdigit() else s
def valid_url(u):
 p=urlsplit(u or '')
 return p.scheme=='https' and p.hostname=='pokemoncardimages.pokedata.io' and not p.username and not p.password and p.path.startswith('/images/') and p.path.lower().endswith(('.webp','.png','.jpg','.jpeg')) and not p.path.lower().endswith('/placeholder.webp')
def main():
 p=argparse.ArgumentParser();p.add_argument('--ledger',type=Path,required=True);p.add_argument('--exclude',type=Path,required=True);p.add_argument('--sources',type=Path,required=True);p.add_argument('--metadata',type=Path,required=True);p.add_argument('--revision',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=a.metadata,text=True).strip()==a.revision
 assert not subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=a.metadata,text=True).strip()
 ledger=json.loads(a.ledger.read_text());excluded={x['printing_id'] for x in json.loads(a.exclude.read_text())};targets=[r for r in ledger if r['language_code']=='ja' and r['category']=='Source needed' and r['printing_id'] not in excluded]
 descriptors=json.loads((a.sources/'pokedata-sets.json').read_text());groups=collections.defaultdict(list)
 for s in descriptors:
  if s.get('language')=='JAPANESE' and s.get('tcg')=='Pokemon' and s.get('code'):groups[s['code'].casefold()].append(s)
 global_anchors=collections.defaultdict(list)
 for key,descs in groups.items():
  if len(descs)!=1:continue
  s=descs[0];file=a.sources/f'pokedata-set-{s["id"]}.json';receipt=file.with_suffix('.receipt.json')
  if not file.exists() or not receipt.exists():continue
  b=file.read_bytes();ev=json.loads(receipt.read_text());assert hashlib.sha256(b).hexdigest()==ev['sha256'];cards=json.loads(b);idx=collections.defaultdict(list)
  for c in cards:
   assert c['language']=='JAPANESE' and c['tcg']=='Pokemon' and c['set_id']==s['id'] and c['set_name']==s['name']
   if c.get('id') and c.get('name') and valid_url(c.get('img_url')):idx[num(c['num'])].append(c)
  target_codes={r['set_code'] for r in targets if r['set_code'].casefold()==key}
  if len(target_codes)!=1:continue
  canonical_code=next(iter(target_codes));jpcode=ALIASES.get(canonical_code,canonical_code)
  for f in sorted((a.metadata/'data_jp'/jpcode).glob('*.json')):
   raw=f.read_bytes();j=json.loads(raw);hit=idx[num(j.get('number'))]
   if j.get('set_name')!=jpcode or not j.get('name') or not j.get('url') or not j.get('img') or len({provider_name(c['name']) for c in hit})!=1:continue
   c=hit[0]
   anchor={'source_name':j['name'],'source_set':jpcode,'source_number':j['number'],'source_total':j['set_total'],'identity_url':j['url'],'image_url':j['img'],'source_file':str(f.relative_to(a.metadata)),'source_file_sha256':hashlib.sha256(raw).hexdigest(),'source_revision':a.revision,'provider_name':c['name'],'provider_card_id':c['id'],'provider_number':c['num'],'provider_set_id':s['id'],'provider_set_name':s['name'],'provider_response_file':str(file.resolve()),'provider_response_sha256':ev['sha256']}
   global_anchors[(provider_name(c['name']),norm(j['name']))].append(anchor)
 native_by_provider=collections.defaultdict(set)
 native_by_provider_set=collections.defaultdict(set)
 for (en,jp),proofs in global_anchors.items():
  native_by_provider[en].add(jp)
  for proof in proofs:native_by_provider_set[(proof['provider_set_id'],en)].add(jp)
 candidates=[];remaining=[]
 for code,rows in __import__('itertools').groupby(sorted(targets,key=lambda r:r['set_code']),key=lambda r:r['set_code']):
  rows=list(rows);sets=groups[code.casefold()]
  if len(sets)!=1:
   remaining.extend({'printing_id':r['printing_id'],'reason':'No unambiguous provider set code; no alias invented'} for r in rows);continue
  s=sets[0];file=a.sources/f'pokedata-set-{s["id"]}.json';receipt=file.with_suffix('.receipt.json')
  if not file.exists() or not receipt.exists():
   remaining.extend({'printing_id':r['printing_id'],'reason':'Provider response unavailable'} for r in rows);continue
  raw=file.read_bytes();ev=json.loads(receipt.read_text());assert hashlib.sha256(raw).hexdigest()==ev['sha256'];cards=json.loads(raw);by_num=collections.defaultdict(list)
  for c in cards:
   assert c['language']=='JAPANESE' and c['tcg']=='Pokemon' and c['set_id']==s['id'] and c['set_name']==s['name']
   assert str(c.get('set_code') or '').casefold()==code.casefold()
   if c.get('id') and c.get('name') and valid_url(c.get('img_url')):by_num[num(c['num'])].append(c)
  for r in rows:
   hits=by_num[num(r['collector_number'])];eligible=[]
   for c in hits:
    key=(provider_name(c['name']),norm(r['card_native_name']));proof=global_anchors[key]
    same=[x for x in proof if x['provider_set_id']==s['id'] and str(x['source_total']).isdigit() and str(r.get('printed_total')).isdigit() and int(x['source_total'])==int(r['printed_total'])]
    proof=same or proof
    if proof and ((same and len(native_by_provider_set[(s['id'],key[0])])==1) or len(native_by_provider[key[0]])==1):eligible.append((c,proof[0]))
   if len({c['img_url'] for c,anchor in eligible})!=1:
    remaining.append({'printing_id':r['printing_id'],'reason':'No exact Japanese-name anchor or ambiguous provider images','provider_candidates':[{'id':c['id'],'name':c['name'],'num':c['num'],'image_url':c['img_url']} for c in hits]});continue
   c,anchor=eligible[0]
   candidates.append({**r,'source_code':'pokedata_japanese','source_provider_set_id':s['id'],'source_provider_set_name':s['name'],'source_provider_card_id':c['id'],'source_name':c['name'],'source_set':s['code'],'source_number':c['num'],'image_url':c['img_url'],'identity_url':ev['url'],'provider_response_file':str(file.resolve()),'provider_response_sha256':ev['sha256'],'provider_response_fetched_at':ev['at'],'official_name_anchor':anchor,'name_match_rule':'official_number_name_anchor_same_set' if anchor['provider_set_id']==s['id'] else 'official_number_name_anchor_cross_set','permission_status':'existing_source_recheck','status':'snapshot_exact_pointer','publication_status':'NOT_PUBLISHED','exact_finish_verified':False,'artwork_scope':'printing_front','production_writes':0})
 assert len(candidates)+len(remaining)==len(targets)
 save(a.output/'candidates.json',candidates);save(a.output/'remaining.json',remaining)
 summary={'at':now(),'targets':len(targets),'candidate_count':len(candidates),'unresolved':len(remaining),'by_set':dict(collections.Counter(r['set_code'] for r in candidates)),'production_writes':0};save(a.output/'matching-summary.json',summary);print(json.dumps(summary))
if __name__=='__main__':main()
