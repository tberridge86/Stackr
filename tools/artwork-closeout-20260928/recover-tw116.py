"""Recover saved TW116 bytes; do not reacquire images or write catalogue data."""
import gzip, hashlib, json, shutil, sys, unicodedata
from pathlib import Path
from PIL import Image

source, output = map(Path, sys.argv[1:3])
here = Path(__file__).resolve().parent
receipt = json.loads((here / 'reconstruction-baseline-receipt.json').read_text())
raw = (here / 'reconstruction-baseline.json.gz').read_bytes()
assert hashlib.sha256(raw).hexdigest() == receipt['sha256']
baseline = json.loads(gzip.decompress(raw))
index = {(r['language_code'],r['set_code'],r['collector_number']):r for r in baseline}
report = json.loads((source / 'verification.json').read_text())
assert report['production_writes'] == 0 and not report['duplicates']
saved = [r for r in report['rows'] if r['status'] == 'bytes_verified_identity_review_required']
assert len(saved) == 116
tw365 = {r['production_printing_id'] for r in json.loads((here / 'tw365-cohort.json').read_text())}
meta = json.loads((source / 'SV4a-metadata.json').read_text())
assert meta['id'] == 'SV4a'
meta_index = {r['id']:r for r in meta['cards']}
rows = []
for r in saved:
    b = index[(r['language'],r['set_code'],r['number'])]
    assert b['printing_id'] not in tw365 and r['set_code'] == 'SV4a' and r['language'] == 'zh-tw'
    m = meta_index[r['provider_id']]
    assert m['localId'] == r['number'] and m['name'] == r['native_name']
    assert unicodedata.normalize('NFKC', m['name']) == unicodedata.normalize('NFKC', b['card_native_name'])
    assert r['provider_id'] == 'SV4a-' + r['number']
    assert r['url'] == r['final_url'] == f"https://assets.tcgdex.net/zh-tw/SV/SV4a/{r['number']}/high.webp"
    file = source / 'images' / 'SV4a' / (r['number'] + '.webp')
    data = file.read_bytes()
    assert hashlib.sha256(data).hexdigest() == r['sha256'] and len(data) == r['byte_size']
    with Image.open(file) as im:
        im.load()
        assert im.format == 'WEBP' and im.size == (r['width'], r['height'])
    relative = 'originals/' + r['sha256'] + '.webp'
    target = output / 'acquired' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(file, target)
    row = {**b, 'provider_id':r['provider_id'], 'image_url':r['url'], 'acquired_url':r['url'], 'source_code':'tcgdex', 'source_name':r['native_name'], 'source_number':r['number'], 'source_set':'SV4a', 'sha256':r['sha256'], 'byte_size':r['byte_size'], 'width':r['width'], 'height':r['height'], 'mime_type':'image/webp', 'image_file':relative, 'status':'acquired_for_review', 'source_artifact_id':10915501836, 'source_verification_status':r['status'], 'metadata_identity_verified':True, 'visual_identity_review_restored':False, 'permission_status':'existing_cohort_recheck', 'publication_status':'NOT_PUBLISHED', 'production_writes':0, 'exact_finish_verified':False}
    dest = output / 'acquired/results' / (b['printing_id']+'.json')
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(row, ensure_ascii=False, indent=2))
    rows.append(row)
assert len({r['printing_id'] for r in rows}) == 116
(output/'candidates.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
(output/'acquired/manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
(output/'acquired/summary.json').write_text(json.dumps({'recovered_fronts':116,'original_hashes_verified':116,'canonical_metadata_matches':116,'private_visual_decisions_restored':False,'production_writes':0}))
shutil.copytree(source, output/'source-evidence', dirs_exist_ok=True)
print(json.dumps({'recovered':116,'production_writes':0}))
