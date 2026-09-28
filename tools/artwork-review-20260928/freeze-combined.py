"""Join verified queues into the existing bounded release after preparation ends.

Preserves the original 3303 plan unchanged as historical evidence. No database,
storage, acquisition, source-policy, or approval operation is performed here.
"""
import collections,gzip,hashlib,json,shutil,subprocess,sys
from pathlib import Path
additional=Path(sys.argv[1]);ledger=Path(sys.argv[2]);target=Path('tools/artwork3303-publish-20260928');saved=Path('tools/artwork-review-20260928/initial3303')
replacement_run=int(sys.argv[3]);assert replacement_run>36482868316
def read(p):return json.loads(p.read_text(encoding='utf8'))
def encoded(x):return (json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode()
for run in [36480589353,36482384653,36482868316,replacement_run]:
 state=json.loads(subprocess.check_output(['gh','run','view',str(run),'--repo','tberridge86/Stackr','--json','status,conclusion']))
 if state!={'conclusion':'success','status':'completed'}:raise ValueError('Preparation is not complete: '+str(run))
summary=read(ledger/'summary.json')
assert summary['total']==12161 and summary['categories'].get('Preparation pending',0)==0
artifact_index=read(ledger/'artifacts.json')
for run,expected in [(36480589353,38),(36482384653,40),(36482868316,4),(replacement_run,2)]:
 actual=[a for a in artifact_index if a['workflow_run']['id']==run]
 assert len(actual)==expected and len({a['id'] for a in actual})==expected,'Incomplete downloaded evidence index'
if not saved.exists():
 assert hashlib.sha256((target/'cohort.json.gz').read_bytes()).hexdigest()=='d047cb0475f5b676f2ee6e3bdab27352a3d5cad4c462b41e9acbf368014ee259'
 saved.mkdir()
 for name in ['cohort.json.gz','plan-receipt.json','approval.json']:shutil.copyfile(target/name,saved/name)
original=read(saved/'plan-receipt.json');supplement=read(additional/'plan-receipt.json')
rows=[];replacement_reviews={r['printing_id']:r for r in read(Path('tools/artwork-closeout-20260928/vunion2-review.json'))['records']}
for p,receipt in [(saved,original),(additional,supplement)]:
 b=(p/'cohort.json.gz').read_bytes();assert hashlib.sha256(b).hexdigest()==receipt['cohort_sha256']
 incoming=json.loads(gzip.decompress(b))
 for r in incoming:
  if r['printing_id'] in replacement_reviews:
   review=replacement_reviews[r['printing_id']]
   assert r['objects'][0]['sha256']==review['old_composite_sha256' if p==saved else 'replacement_sha256']
   if p==saved:continue
  rows.append(r)
assert set(replacement_reviews)<={r['printing_id'] for r in rows}
assert len(rows)==len({r['printing_id'] for r in rows})==summary['prepared_originals']
ids={r['printing_id'] for r in rows};assert ids=={r['printing_id'] for r in read(ledger/'card-ledger.json') if r['category'].startswith('Prepared')}
archives={}
for a in original['artifacts']+supplement['artifacts']:
 if a['id'] in archives:assert archives[a['id']]==a
 archives[a['id']]=a
for r in rows:
 assert len(r['objects'])==4
 for o in r['objects']:assert o['artifact_id'] in archives
rows.sort(key=lambda r:r['printing_id']);b=gzip.compress(encoded(rows),mtime=0);digest=hashlib.sha256(b).hexdigest()
receipt={'cohort_sha256':digest,'fronts':len(rows),'derivatives':len(rows)*3,'image_files':len(rows)*4,'source_counts':dict(collections.Counter(r['source_code'] for r in rows)),'publication_status':'NOT_PUBLISHED','production_writes':0,'artifacts':list(archives.values()),'original_cohort_sha256':original['cohort_sha256'],'additional_cohort_sha256':supplement['cohort_sha256'],'preparation_runs':[36480589353,36482384653,36482868316,replacement_run],'single_card_replacements':list(replacement_reviews.values()),'unresolved_records':12161-len(rows)}
(target/'cohort.json.gz').write_bytes(b);(target/'plan-receipt.json').write_bytes(encoded(receipt))
(target/'approval.json').write_bytes(encoded({'approved':False,'cohort_sha256':digest,'fronts':len(rows),'official_tw_fronts':receipt['source_counts']['pokemon_card_tw_official'],'store_resize_display_official_tw':False,'owner_statement':None,'approved_at':None,'status':'Prepared combined queue; final owner publication approval and bounded official Taiwan source permission remain pending'}))
print(json.dumps({k:v for k,v in receipt.items() if k!='artifacts'}))
