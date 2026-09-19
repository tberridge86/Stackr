"""Decode the bounded public image probe list; never upload or mutate assets."""
import concurrent.futures
import datetime
import hashlib
import io
import json
import pathlib
import urllib.request

from PIL import Image

root = pathlib.Path('.tmp/master-set-artwork')
probes = json.loads((root / 'image-probes.json').read_text(encoding='utf-8'))


def check(probe):
    result = dict(probe, observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    try:
        with urllib.request.urlopen(probe['url'], timeout=12) as response:
            data = response.read(5_000_001)
            result.update(status=response.status, mime=response.headers.get('Content-Type'))
        if len(data) > 5_000_000:
            raise ValueError('Image exceeds probe byte budget')
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            result.update(decoded=True, width=image.width, height=image.height, format=image.format,
                          bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    except Exception as error:
        result.update(decoded=False, error=str(error))
    return result


with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(check, probes))
target = pathlib.Path('docs/releases/evidence/master-set-artwork-20260919/image-delivery.json')
target.write_text(json.dumps({'scope': 'Image file fetch and decode only; not native rendering.',
                             'attempts': len(results), 'decoded': sum(row['decoded'] for row in results),
                             'results': results}, indent=2) + '\n', encoding='utf-8')
print(f"Decoded {sum(row['decoded'] for row in results)}/{len(results)} sampled image files")
