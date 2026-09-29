"""Select only failed identities from the immutable first-pass evidence."""
import hashlib,io,json,os,subprocess,zipfile
from pathlib import Path
run=int(os.environ.get('SOURCE_RUN','36480589353'))
assert run in {36480589353,36482384653}
batch=int(os.environ['BATCH_NUMBER'])
assert 1<=batch<=19
name=f'artwork-tw4564-evidence-{batch}-{run}'
data=json.loads(subprocess.check_output(['gh','api',f'repos/tberridge86/Stackr/actions/runs/{run}/artifacts?per_page=100']))
hits=[a for a in data['artifacts'] if a['name']==name and not a['expired']]
assert len(hits)==1
a=hits[0]
b=subprocess.check_output(['gh','api',f"repos/tberridge86/Stackr/actions/artifacts/{a['id']}/zip"])
assert 'sha256:'+hashlib.sha256(b).hexdigest()==a['digest'] and len(b)==a['size_in_bytes']
with zipfile.ZipFile(io.BytesIO(b)) as z:
 matches=[n for n in z.namelist() if n=='verification.json']
 assert len(matches)==1
 report=json.loads(z.read(matches[0]))
rows=report['failures']
assert len(rows)<=250 and len({r['printing_id'] for r in rows})==len(rows)
root=Path('package');root.mkdir()
(root/'candidates.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
(root/'retry-provenance.json').write_text(json.dumps({'source_run':run,'artifact':a,'first_pass_verified':report['verified_fronts'],'retry_candidates':len(rows)},indent=2))
print(json.dumps({'batch':batch,'retry_candidates':len(rows),'preserved_first_pass':report['verified_fronts']}))
