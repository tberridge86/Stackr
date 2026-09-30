"""Retrieve the frozen review archive; never contacts artwork providers."""
import hashlib,json,subprocess,sys,zipfile
from pathlib import Path

def download(root):
    root.mkdir(parents=True,exist_ok=True)
    constants=json.loads(Path(__file__).with_name('frozen-constants.json').read_text(encoding='utf8'))
    asset_id=constants['archive_id']
    archive=root/f'{asset_id}.zip'
    if not archive.exists():
        partial=archive.with_suffix('.partial')
        with partial.open('wb') as f:
            subprocess.run(['gh','api',f'repos/tberridge86/Stackr/releases/assets/{asset_id}','-H','Accept: application/octet-stream'],stdout=f,check=True)
        partial.rename(archive)
    if archive.stat().st_size!=constants['archive_bytes'] or hashlib.sha256(archive.read_bytes()).hexdigest()!=constants['archive_sha256']:
        raise ValueError('Frozen archive checksum mismatch')
    target=(root/str(asset_id)).resolve()
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            if not (target/info.filename).resolve().is_relative_to(target) or '\\' in info.filename or ((info.external_attr>>16)&0o170000)==0o120000:
                raise ValueError('Unsafe archive entry')
        for row in json.loads(z.read('file-checksums.json')):
            b=z.read(row['file'])
            if len(b)!=row['byte_size'] or hashlib.sha256(b).hexdigest()!=row['sha256']:raise ValueError('File checksum mismatch')
        z.extractall(target)
    print(json.dumps({'asset_id':asset_id,'status':'verified_and_extracted'}))

if __name__=='__main__':download(Path(sys.argv[1]))
