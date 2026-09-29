"""Verify every original and derivative before saving a reconstruction artifact."""
import hashlib, json, sys
from pathlib import Path
from PIL import Image

def verify_file(root, relative, expected):
    root = root.resolve()
    file = (root / relative).resolve()
    if not file.is_relative_to(root) or not file.is_file():
        raise ValueError('Missing or unsafe image path')
    data = file.read_bytes()
    if len(data) != expected['byte_size'] or hashlib.sha256(data).hexdigest() != expected['sha256']:
        raise ValueError('Image byte/hash mismatch')
    with Image.open(file) as im:
        im.load()
        if im.size != (expected['width'], expected['height']):
            raise ValueError('Decoded image dimensions differ')
    return {'file': str(file.relative_to(root)), 'sha256': expected['sha256'], 'bytes': len(data)}

def verify(root):
    prepared = json.loads((root / 'prepared/manifest.json').read_text())
    acquired = json.loads((root / 'acquired/manifest.json').read_text())
    candidates = json.loads((root / 'candidates.json').read_text())
    candidate_ids = {r['printing_id'] for r in candidates}
    candidate_by_id = {r['printing_id']: r for r in candidates}
    if len(candidate_ids) != len(candidates) or len(candidates) > 500:
        raise ValueError('Duplicate or overlarge candidate batch')
    prepared_ids = {r['printing_id'] for r in prepared}
    if len(prepared_ids) != len(prepared) or not prepared_ids <= candidate_ids:
        raise ValueError('Prepared cohort changed')
    if len(acquired) != len(candidates) or {r['printing_id'] for r in acquired} != candidate_ids:
        raise ValueError('Acquisition cohort changed')
    if {r['printing_id'] for r in acquired if r['status'] == 'acquired_for_review'} != prepared_ids:
        raise ValueError('Successful acquisition missing from preparation')
    files = []
    for r in prepared:
        expected = candidate_by_id[r['printing_id']]
        for key in ('language_code', 'set_id', 'set_code', 'collector_number', 'card_native_name', 'image_url', 'source_code'):
            if r.get(key) != expected.get(key):
                raise ValueError('Prepared card identity drift: ' + key)
        files.append(verify_file(root / 'acquired', r['image_file'], r))
        roles = {d['role'] for d in r['derivatives']}
        if len(r['derivatives']) != 3 or roles != {'card-grid', 'search-result', 'detail-page'}:
            raise ValueError('Missing or duplicate display role')
        for d in r['derivatives']:
            files.append(verify_file(root / 'prepared', d['file'], d))
        if r['production_writes'] != 0 or r['publication_status'] != 'NOT_PUBLISHED':
            raise ValueError('Unexpected publication state')
    failures = [r for r in acquired if r['status'] != 'acquired_for_review']
    if len(prepared) + len(failures) != len(candidates):
        raise ValueError('Unaccounted acquisition result')
    report = {'candidates': len(candidates), 'verified_fronts': len(prepared), 'verified_derivatives': len(prepared)*3, 'verified_image_files': len(files), 'failures': failures, 'printing_ids': sorted(prepared_ids), 'production_writes': 0, 'publication_status': 'NOT_PUBLISHED', 'files': files}
    (root / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({k:v for k,v in report.items() if k not in ('failures','printing_ids','files')}))
    return report

if __name__ == '__main__':
    verify(Path(sys.argv[1]))
