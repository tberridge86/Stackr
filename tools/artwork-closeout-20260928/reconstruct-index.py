"""Rebuild exact source candidates from the saved baseline; no production client."""
import collections, gzip, hashlib, json, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
root = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=True)
receipt = json.loads((HERE / 'reconstruction-baseline-receipt.json').read_text())
compressed = (HERE / 'reconstruction-baseline.json.gz').read_bytes()
assert hashlib.sha256(compressed).hexdigest() == receipt['sha256']
raw = gzip.decompress(compressed)
assert hashlib.sha256(raw).hexdigest() == receipt['uncompressed_sha256']
rows = json.loads(raw)
assert len(rows) == 12161 and len({r['printing_id'] for r in rows}) == 12161
(root / 'missing-baseline.json').write_bytes(raw)
subprocess.run([sys.executable, str(HERE / 'match_snapshots.py'), '--workspace', str(root)], check=True)
initial = json.loads((root / 'snapshot-matches.json').read_text())
ledger = [{**r, 'category': 'Source needed'} for r in initial if r['status'] != 'snapshot_exact_pointer']
(root / 'unresolved-ledger.json').write_text(json.dumps(ledger, ensure_ascii=False))
subprocess.run([sys.executable, str(HERE / 'reconcile-additional-jp.py'), '--ledger', str(root / 'unresolved-ledger.json'), '--metadata', str(root / 'PTCG-new'), '--revision', 'bc5a2698eb9af858feb0280d579fd5fd0f0273e2', '--output', str(output / 'additional')], check=True)
additional = json.loads((output / 'additional/candidates.json').read_text())
candidates = [r for r in initial if r['status'] == 'snapshot_exact_pointer' and r['language_code'] in ('ja', 'en')] + additional
assert len({r['printing_id'] for r in candidates}) == len(candidates)
assert len(candidates) <= 3000, 'Unexpected reconstructed scope; inspect instead of broadening acquisition'
matrix = []
for language in ('ja', 'en'):
    selected = sorted((r for r in candidates if r['language_code'] == language), key=lambda r: (r['set_code'], r['collector_number']))
    for start in range(0, len(selected), 500):
        name = f'{language}-{start // 500 + 1:02d}'
        (output / f'{name}.json').write_text(json.dumps(selected[start:start+500], ensure_ascii=False, indent=2))
        matrix.append({'name': name, 'language': language})
ids = {r['printing_id'] for r in candidates}
(output / 'baseline.json').write_bytes(raw)
(output / 'candidates.json').write_text(json.dumps(candidates, ensure_ascii=False, indent=2))
(output / 'unresolved.json').write_text(json.dumps([r for r in initial if r['printing_id'] not in ids], ensure_ascii=False, indent=2))
summary = {'baseline': len(rows), 'candidate_count': len(candidates), 'by_language': dict(collections.Counter(r['language_code'] for r in candidates)), 'batches': matrix, 'production_writes': 0, 'publication_status': 'NOT_PUBLISHED', 'restored_original_bytes': False, 'baseline_receipt': receipt}
(output / 'summary.json').write_text(json.dumps(summary, indent=2))
if os.environ.get('GITHUB_OUTPUT'):
    with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
        f.write('matrix=' + json.dumps({'include': matrix}) + '\n')
print(json.dumps(summary))
