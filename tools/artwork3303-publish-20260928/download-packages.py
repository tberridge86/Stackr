"""Retrieve immutable GitHub recovery artifacts; never contacts image providers."""
import hashlib,json,subprocess,sys,zipfile
from pathlib import Path

def download(receipt,root):
    root.mkdir(parents=True,exist_ok=True)
    for a in receipt['artifacts']:
        archive=root/(str(a['id'])+'.zip')
        if not archive.exists():
            partial=archive.with_suffix('.partial')
            with partial.open('wb') as f:
                subprocess.run(['gh','api',f'repos/tberridge86/Stackr/actions/artifacts/{a["id"]}/zip'],stdout=f,check=True)
            partial.rename(archive)
        with archive.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
        if sha!=a['sha256'] or archive.stat().st_size!=a['size_in_bytes']:raise ValueError('Artifact bytes changed')
        target=(root/str(a['id'])).resolve()
        with zipfile.ZipFile(archive) as z:
            for info in z.infolist():
                if not (target/info.filename).resolve().is_relative_to(target) or '\\' in info.filename or ((info.external_attr>>16)&0o170000)==0o120000:raise ValueError('Unsafe artifact entry')
            z.extractall(target)
        print(json.dumps({'artifact_id':a['id'],'sha256':sha,'status':'verified_and_extracted'}),flush=True)

if __name__=='__main__':
    receipt=json.loads(Path(__file__).with_name('plan-receipt.json').read_text(encoding='utf8'))
    download(receipt,Path(sys.argv[1]))
