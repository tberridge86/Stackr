"""Freeze verified additional files in the existing publisher's object-plan format."""
import collections,gzip,hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
def read(p):return json.loads(p.read_text(encoding='utf8'))
def encode(x):return (json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode()
rows=read(root/'additional-prepared-manifest.json');allarchives={a['id']:a for a in read(root/'artifacts.json')};selected={};plan=[]
old=json.loads(gzip.decompress(Path('tools/artwork3303-publish-20260928/cohort.json.gz').read_bytes()))
assert not {r['printing_id'] for r in old}&{r['printing_id'] for r in rows}
for r in rows:
 aid=r['archive']['id'];a=allarchives[aid]
 selected[aid]={**{k:a[k] for k in ['id','name','size_in_bytes','expires_at']},'sha256':a['digest'].removeprefix('sha256:'),'download_url':r['archive']['download_url']}
 x={k:r[k] for k in ['printing_id','set_id','set_code','language_code','collector_number','card_native_name','catalogue_version_id','source_code']}
 if x['source_code']=='pokemon_official_taiwan_review_required':x['source_code']='pokemon_card_tw_official'
 x['image_url']=r['acquired_url']
 x['objects']=[{'role':'original','artifact_id':aid,'file':'acquired/'+r['image_file'],**{k:r[k] for k in ['sha256','byte_size','width','height','mime_type']}}]
 x['objects'] += [{**d,'artifact_id':aid,'file':'prepared/'+d['file']} for d in r['derivatives']]
 x['evidence']={'prepared_row_sha256':hashlib.sha256(encode(r)).hexdigest(),'identity_verification':r['identity_verification'],'source_declared_mime_type':r['source_declared_mime_type'],'decoded_mime_type':r['mime_type'],'permission_status':r['permission_status'],'exact_finish_verified':False}
 assert len(x['objects'])==4 and {o['role'] for o in x['objects']}=={'original','card-grid','search-result','detail-page'}
 plan.append(x)
plan.sort(key=lambda r:r['printing_id']);b=gzip.compress(encode(plan),mtime=0);digest=hashlib.sha256(b).hexdigest()
(out/'cohort.json.gz').write_bytes(b)
receipt={'cohort_sha256':digest,'fronts':len(plan),'derivatives':len(plan)*3,'image_files':len(plan)*4,'source_counts':dict(collections.Counter(r['source_code'] for r in plan)),'publication_status':'NOT_PUBLISHED','readiness':'Files verified and archived; supplemental release integration and rollback rehearsal pending','production_writes':0,'artifacts':list(selected.values()),'preserved_initial_cohort_sha256':'d047cb0475f5b676f2ee6e3bdab27352a3d5cad4c462b41e9acbf368014ee259'}
(out/'plan-receipt.json').write_bytes(encode(receipt))
(out/'approval.json').write_bytes(encode({'approved':False,'cohort_sha256':digest,'fronts':len(plan),'official_tw_fronts':sum(r['source_code']=='pokemon_card_tw_official' for r in plan),'store_resize_display_official_tw':False,'owner_statement':None,'approved_at':None}))
lines=['# Additional verified Stackr artwork downloads','',f"{len(plan):,} original fronts and {len(plan)*3:,} display derivatives. These are prepared files; none is published to production.",'','| Package | ZIP SHA-256 |','|---|---|']
lines += [f"| [{a['name']}]({a['download_url']}) | `{a['sha256']}` |" for a in selected.values()]
(out/'downloads.md').write_bytes(('\n'.join(lines)+'\n').encode())
(out/'SHA256SUMS.txt').write_bytes(('\n'.join(f"{a['sha256']}  {a['id']}.zip" for a in selected.values())+'\n').encode())
print(json.dumps({k:v for k,v in receipt.items() if k!='artifacts'}))
