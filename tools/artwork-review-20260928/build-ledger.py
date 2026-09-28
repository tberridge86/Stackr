"""Account once for every frozen gap, retaining exact identity and archive evidence."""
import argparse,collections,gzip,hashlib,json
from pathlib import Path
from datetime import datetime,timezone

def read(p):return json.loads(p.read_text(encoding='utf8'))
def packed(p):return json.loads(gzip.decompress(p.read_bytes()))
def write(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(json.dumps(x,ensure_ascii=False,indent=2).encode())
def main():
 p=argparse.ArgumentParser();p.add_argument('workspace',type=Path);p.add_argument('evidence',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
 repo=Path.cwd();base=read(a.workspace/'reconstruction-index/baseline.json');un={r['printing_id']:r for r in read(a.workspace/'reconstruction-index/unresolved.json')}
 oldfile=repo/'tools/artwork-review-20260928/initial3303/cohort.json.gz'
 if not oldfile.exists():oldfile=repo/'tools/artwork3303-publish-20260928/cohort.json.gz'
 old=packed(oldfile);oldids={r['printing_id'] for r in old}
 pending={r['printing_id']:r for name in ['tw4564','tcgdex47','vunion2'] for r in packed(repo/f'tools/artwork-closeout-20260928/{name}-candidates.json.gz')}
 replacements={r['printing_id']:r for r in read(repo/'tools/artwork-closeout-20260928/vunion2-review.json')['records']}
 exclusions={r['printing_id']:r for r in read(repo/'tools/artwork-review-20260928/publication-exclusions.json')['records']}
 known={r['printing_id']:r for r in read(repo/'docs/releases/artwork3303-source-exceptions-20260928.json')['records']}
 review_file=a.workspace/'additional-identity-exceptions/review.json'
 identity_reviews={r['printing_id']:r for r in read(review_file)} if review_file.exists() else {}
 prepared={};failures={};archives=[]
 for f in sorted(a.evidence.glob('*/artifact-index.json')):
  index=read(f);archives.extend(index)
  for item in index:
   if '-evidence-' in item['name']:
    package=f.parent/item['name']
    for required in ['verification.json','acquired/manifest.json','prepared/manifest.json']:
     assert (package/required).is_file(),'Evidence download is incomplete: '+str(package/required)
 for f in sorted(a.evidence.glob('*/artwork-*-evidence-*/prepared/manifest.json')):
  package=f.parent.parent;verification=read(package/'verification.json');manifest=read(f)
  assert set(verification['printing_ids'])=={r['printing_id'] for r in manifest}
  assert verification['verified_derivatives']==len(manifest)*3
  for r in manifest:
   pid=r['printing_id'];assert pid in pending and (pid not in oldids or pid in replacements) and pid not in prepared
   if pid in replacements:assert r['sha256']==replacements[pid]['replacement_sha256']
   for k in ['language_code','set_id','set_code','collector_number','card_native_name','image_url','source_code']:assert r.get(k)==pending[pid].get(k)
   assert len(r['derivatives'])==3 and r['publication_status']=='NOT_PUBLISHED' and r['production_writes']==0
   run=int(package.name.rsplit('-',1)[-1]);name=package.name.replace('-evidence-','-')
   hits=[x for x in archives if x['name']==name and x['workflow_run']['id']==run];assert len(hits)==1
   r={**r,'archive':{'id':hits[0]['id'],'name':name,'sha256':hits[0]['digest'].removeprefix('sha256:'),'download_url':f'https://github.com/tberridge86/Stackr/actions/runs/{run}/artifacts/{hits[0]["id"]}','expires_at':hits[0]['expires_at']}}
   prepared[pid]=r
 for f in sorted(a.evidence.glob('*/artwork-*-evidence-*/acquired/manifest.json')):
  for r in read(f):
   if r['status']!='acquired_for_review':failures[r['printing_id']]=r
 for pid,review in exclusions.items():
  if pid in prepared:
   assert prepared[pid]['sha256']==review['image_sha256'],'Excluded source bytes changed; review again'
   del prepared[pid]
 rows=[]
 for b in base:
  pid=b['printing_id'];s=un.get(pid,{});r={**b,'publication_status':'NOT_PUBLISHED','production_writes':0,'artwork_scope':'printing_front','exact_finish_verified':False}
  if pid in exclusions:r.update(category='Source image conflict',reason=exclusions[pid]['reason'],action=exclusions[pid]['action'],evidence=exclusions[pid])
  elif pid in oldids and pid not in replacements:r.update(category='Prepared initial release',reason='Original and three derivatives archived, identity checked and staging rollback rehearsal passed.',action='Owner approval followed by the protected artwork3303 release lane.')
  elif pid in prepared:
   ev=prepared[pid];r.update(category='Prepared additional queue',reason='Original and three derivatives verified; fresh provider identity and production catalogue identity match.',action='Freeze the supplemental publication plan; retain source permission review before protected release.',source_code=ev['source_code'],permission_status=ev['permission_status'],source_url=ev['acquired_url'],sha256=ev['sha256'],archive=ev['archive'])
  elif pid in pending:
   if pid in failures and pid in identity_reviews:
    review=identity_reviews[pid];r.update(category='Composite artwork review',reason='The official image page covers multiple physical cards: '+review['official_page_number']+'. This record is only '+r['collector_number']+'.',action='Supply the exact individual Traditional Chinese card front; do not attach the combined V-UNION image.',source_url=pending[pid]['image_url'],evidence=review)
   elif pid in failures:r.update(category='Image acquisition exception',reason=failures[pid]['error'],action='Inspect exact source failure or supply the matching native-language front.',source_url=pending[pid]['image_url'])
   else:r.update(category='Preparation pending',reason='Exact identity matches; image preparation has not completed.',action='Complete the active preparation job.')
  elif pid in known:
   ev=known[pid];r.update(category=ev['classification'],reason=ev.get('reason',ev.get('error','Exact source exception')),action='Resolve identity against authoritative evidence.' if ev['classification']=='identity_conflict' else 'Supply a usable exact native-language front.',evidence=ev)
  elif s.get('status')=='wrong_language_catalogue_candidate':r.update(category='Language identity conflict',reason='Simplified Chinese target matches a Traditional Chinese source; attaching this image would mislabel the card.',action='Confirm the physical language and canonical set before selecting artwork.',evidence=s)
  elif s.get('status')=='printed_total_conflict':r.update(category='Printed denominator conflict',reason=f"Catalogue printed total {b['printed_total']} differs from source total {s.get('source_total')}.",action='Confirm the printed set denominator and exact card identity.',evidence=s)
  elif s.get('status')=='multiple_image_candidates':r.update(category='Artwork choice',reason='Multiple source images share this set, number and name.',action='Check printing or finish to choose the correct front.',evidence=s)
  elif s.get('status')=='snapshot_name_conflict':r.update(category='Card name conflict',reason='Canonical name differs from the source for this set and card number.',action='Resolve the native card name against authoritative evidence.',evidence=s)
  elif s.get('status')=='no_snapshot_match':r.update(category='Exact source needed',reason='No exact usable front in the reviewed metadata snapshot or bound provider references.',action='Supply a verified native-language scan or exact source with matching set, number and name.',evidence=s)
  else:raise ValueError('Unaccounted printing '+pid)
  rows.append(r)
 assert len(rows)==12161 and len({r['printing_id'] for r in rows})==12161
 count=sum(r['category'].startswith('Prepared') for r in rows)
 summary={'observed_at':datetime.now(timezone.utc).isoformat(),'scope':'Frozen 12,161 printing-level artwork gaps from 27 September; not a fresh whole-catalogue completeness census','total':len(rows),'categories':dict(collections.Counter(r['category'] for r in rows)),'prepared_originals':count,'prepared_derivatives':count*3,'newly_published':0,'production_writes':0,'installed_client_verified':False,'by_language':{l:dict(collections.Counter(r['category'] for r in rows if r['language_code']==l)) for l in sorted({r['language_code'] for r in rows})}}
 write(a.output/'summary.json',summary);write(a.output/'card-ledger.json',rows);write(a.output/'additional-prepared-manifest.json',list(prepared.values()));write(a.output/'artifacts.json',archives)
 exceptions=[r for r in rows if not r['category'].startswith('Prepared')];write(a.output/'exceptions.json',exceptions)
 lines=['# Stackr artwork exceptions','',f'{len(exceptions):,} records outside the verified prepared queue. Each card retains its canonical identity; no metadata is changed.','']
 for key,group in __import__('itertools').groupby(sorted(exceptions,key=lambda r:(r['category'],r['language_code'],r['set_code'],r['collector_number'])),key=lambda r:(r['category'],r['language_code'],r['set_code'])):
  rs=list(group);lines+=['## '+ ' / '.join(key), '',rs[0]['reason'],'',rs[0]['action'],'','| Number | Card | Printing ID |','|---|---|---|']
  lines += [f"| {r['collector_number']} | {r['card_native_name'].replace('|','/')} | {r['printing_id']} |" for r in rs];lines+=['']
 (a.output/'exceptions.md').write_bytes('\n'.join(lines).encode())
 print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':main()
