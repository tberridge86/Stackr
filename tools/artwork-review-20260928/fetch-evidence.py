"""Save immutable artifact metadata and checksum-verified small evidence archives."""
import hashlib,io,json,subprocess,sys,zipfile
from pathlib import Path
root=Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
for run in sys.argv[2:]:
 data=json.loads(subprocess.check_output(['gh','api',f'repos/tberridge86/Stackr/actions/runs/{int(run)}/artifacts?per_page=100']))
 assert data['total_count']<=100
 folder=root/run;folder.mkdir(exist_ok=True)
 (folder/'artifact-index.json').write_bytes(json.dumps(data['artifacts'],indent=2).encode())
 for a in data['artifacts']:
  if '-evidence-' not in a['name']:continue
  assert not a['expired'];dest=folder/a['name'];archive=folder/(a['name']+'.zip')
  if archive.exists():b=archive.read_bytes()
  else:
   b=subprocess.check_output(['gh','api',f"repos/tberridge86/Stackr/actions/artifacts/{a['id']}/zip"]);archive.write_bytes(b)
  assert 'sha256:'+hashlib.sha256(b).hexdigest()==a['digest'] and len(b)==a['size_in_bytes']
  dest.mkdir(exist_ok=True)
  with zipfile.ZipFile(io.BytesIO(b)) as z:
   for item in z.infolist():
    target=(dest/item.filename).resolve()
    assert target.is_relative_to(dest.resolve()) and not ((item.external_attr>>16)&0o170000)==0o120000
   z.extractall(dest)
 print(json.dumps({'run':run,'artifacts':len(data['artifacts']),'verified_evidence':sum('-evidence-' in a['name'] for a in data['artifacts'])}),flush=True)
