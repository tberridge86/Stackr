"""Retrieve the two frozen archives, checking every retained entry; no provider requests."""
import hashlib,json,subprocess,sys,zipfile
from pathlib import Path

def download(root):
    root.mkdir(parents=True,exist_ok=True)
    constants=json.loads(Path(__file__).with_name('frozen-constants.json').read_text(encoding='utf8'))
    for asset in constants['artifacts']:
        asset_id=asset['id']
        archive=root/f'{asset_id}.zip'
        if not archive.exists():
            partial=archive.with_suffix('.partial')
            with partial.open('wb') as f:
                subprocess.run(['gh','api',f'repos/tberridge86/Stackr/releases/assets/{asset_id}','-H','Accept: application/octet-stream'],stdout=f,check=True)
            partial.rename(archive)
        if archive.stat().st_size!=asset['size_in_bytes'] or hashlib.sha256(archive.read_bytes()).hexdigest()!=asset['sha256']:
            raise ValueError('Frozen archive checksum mismatch')
        target=(root/str(asset_id)).resolve()
        with zipfile.ZipFile(archive) as z:
            names=z.namelist()
            if len(names)!=len(set(names)) or z.testzip()is not None:raise ValueError('Invalid archive entries')
            for info in z.infolist():
                if not (target/info.filename).resolve().is_relative_to(target) or '\\' in info.filename or ((info.external_attr>>16)&0o170000)==0o120000:
                    raise ValueError('Unsafe archive entry')
            inventory_name='file-checksums.json' if asset_id==601817567 else 'tw8-package-manifest.json'
            inventory=json.loads(z.read(inventory_name))
            if isinstance(inventory,dict):inventory=inventory['files']
            if set(names)!={r['file'] for r in inventory}|{inventory_name}:raise ValueError('Incomplete inventory')
            for row in inventory:
                b=z.read(row['file'])
                if len(b)!=row['byte_size'] or hashlib.sha256(b).hexdigest()!=row['sha256']:raise ValueError('File checksum mismatch')
            z.extractall(target)
        print(json.dumps({'asset_id':asset_id,'status':'verified_and_extracted','entries':len(inventory)}))

if __name__=='__main__':download(Path(sys.argv[1]))
