"""Branch-only transport; removed from the resulting UI candidate commit."""
from pathlib import Path
import base64
import gzip
import hashlib
import json
import os
import subprocess

BRANCH = 'agent/release/card-first-browse-ui'
assert os.environ.get('GITHUB_REPOSITORY') == 'tberridge86/Stackr'
assert os.environ.get('GITHUB_REF') == 'refs/heads/' + BRANCH
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == os.environ['GITHUB_SHA']
assert not subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip()
sha = lambda data: hashlib.sha256(data).hexdigest()
payload = Path('scripts/.card-first-edits.b64').read_text().strip()
# Verified artifact readback identified two transport-only character errors.
if sha(payload.encode()) == '623fecd3e00eb93b795126a222c7451a3cba1321b400582ea9ad84895c30e2c6':
    assert payload[6471:6472] == 'F' and payload[294:295] == 'D'
    payload = payload[:6471] + 'X' + payload[6472:]
    payload = payload[:294] + payload[295:]
assert sha(payload.encode()) == 'e7dcbbf2349b000c5bde7f990cf522055e9f72bae3d65f0c78d2ff75554d643c'
changes = json.loads(gzip.decompress(base64.b64decode(payload, validate=True)))
allowed = {
    '.github/workflows/card-first-ui.yml', 'app/(tabs)/binder.tsx',
    'app/(tabs)/explore.tsx', 'app/(tabs)/search.tsx', 'app/_layout.tsx',
    'app/binder/new.tsx', 'app/set/[id].tsx', 'components/HomeCollectorSections.tsx',
    'components/HomeCommandCenter.tsx', 'components/PremiumUI.tsx',
    'components/StackrBrowseControls.tsx', 'features/binder/BinderDetailScreen.tsx',
    'features/home/HubScreen.tsx', 'features/market/MarketTabScreen.tsx',
    'scripts/test-home-collector-sections.ts', 'scripts/test-home-release-integration.ts',
    'scripts/test-card-first-ui.cjs', 'docs/releases/card-first-ui-20260912.md',
}
assert set(changes) == allowed
outputs = {}
for name, change in changes.items():
    target = Path(name)
    assert not target.is_symlink()
    if change['before'] is None:
        assert not target.exists(), name
        original = ''
    else:
        data = target.read_bytes()
        assert sha(data) == change['before'], 'Source drift: ' + name
        original = data.decode('utf-8')
    previous_end = 0
    for start, end, text in change['edits']:
        assert previous_end <= start <= end <= len(original)
        previous_end = end
    updated = original
    for start, end, text in reversed(change['edits']):
        updated = updated[:start] + text + updated[end:]
    assert sha(updated.encode('utf-8')) == change['after'], 'Result mismatch: ' + name
    outputs[target] = updated
# No file changes until the complete source and result inventory validates.
for target, updated in outputs.items():
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(updated.encode('utf-8'))
transport = ['scripts/.apply-card-first-edits.py', 'scripts/.card-first-edits.b64', '.github/workflows/card-first-ui-apply.yml']
for name in transport:
    Path(name).unlink()
subprocess.run(['git', 'add', '--', *sorted(allowed), *transport], check=True)
staged = set(subprocess.check_output(['git', 'diff', '--cached', '--name-only', '-z']).decode().strip('\0').split('\0'))
assert staged == allowed | set(transport), staged
subprocess.run(['git', 'diff', '--cached', '--check'], check=True)
subprocess.run(['git', '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', 'Make browsing card-first across native screens and unify binder actions'], check=True)
print('Committed source candidate:', subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip())
print('Validated', len(allowed), 'exact source outputs; no production or native release performed.')
