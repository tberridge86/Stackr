"""Retrieve three frozen GitHub archives and verify their checksums; no provider requests."""
import hashlib, json, subprocess, sys, zipfile
from pathlib import Path

def download(root):
    root.mkdir(parents=True, exist_ok=True)
    constants = json.loads(Path(__file__).with_name('frozen-constants.json').read_text(encoding='utf8'))
    for artifact in constants['artifacts']:
        archive = root / f"{artifact['id']}.zip"
        if not archive.exists():
            partial = archive.with_suffix('.partial')
            with partial.open('wb') as handle:
                subprocess.run(['gh', 'api', f"repos/tberridge86/Stackr/releases/assets/{artifact['id']}", '-H', 'Accept: application/octet-stream'], stdout=handle, check=True)
            partial.rename(archive)
        if archive.stat().st_size != artifact['size_in_bytes'] or hashlib.sha256(archive.read_bytes()).hexdigest() != artifact['sha256']:
            raise ValueError('Frozen archive checksum mismatch')
        target = (root / str(artifact['id'])).resolve()
        with zipfile.ZipFile(archive) as zf:
            names = zf.namelist()
            if len(names) != len(set(names)) or zf.testzip() is not None: raise ValueError('Invalid archive entries')
            for info in zf.infolist():
                if not (target / info.filename).resolve().is_relative_to(target) or '\\' in info.filename or ((info.external_attr >> 16) & 0o170000) == 0o120000: raise ValueError('Unsafe archive entry')
            zf.extractall(target)
        print(json.dumps({'asset_id': artifact['id'], 'status': 'verified_and_extracted'}))
if __name__ == '__main__': download(Path(sys.argv[1]))
