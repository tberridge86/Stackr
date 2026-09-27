#!/usr/bin/env python3
"""Queue 1 review-only acquisition. Never connects to a database or publishes assets."""
from __future__ import annotations
import argparse, concurrent.futures, csv, hashlib, io, json, re, time, unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parent
COUNTS = {'sm3.5':78,'sm7.5':78,'swsh4.5sv':122,'swsh12.5gg':70}
LANE = ['sm3.5','sm7.5','swsh4.5sv','swsh12.5gg']
DATA_HOSTS = {'api.tcgdex.net', 'raw.githubusercontent.com'}
IMAGE_HOSTS = {'assets.tcgdex.net', 'images.pokemontcg.io', 'images.scrydex.com'}
MAX_BYTES = 25 * 1024 * 1024
PARENTS = {'swsh4.5sv':('swsh4.5','Shining Fates'),'swsh12.5gg':('swsh12.5','Crown Zenith')}

def now(): return datetime.now(timezone.utc).isoformat()
def sha(raw): return hashlib.sha256(raw).hexdigest()
def blob_sha(raw): return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
def name_key(value):
    value = unicodedata.normalize('NFKC', value).casefold().replace('’', "'")
    value = re.sub(r'[‐‑–—-](ex|gx)\b', r' \1', value)
    return ' '.join(value.split())
def validate_url(url, hosts):
    u = urlsplit(url)
    if u.scheme != 'https' or u.hostname not in hosts or u.username or u.password or u.port not in (None,443):
        raise ValueError('URL outside exact HTTPS host allowlist')
class Redirect(HTTPRedirectHandler):
    def __init__(self, hosts): self.hosts = hosts
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl, self.hosts)
        return super().redirect_request(req, fp, code, msg, headers, newurl)
def get(url, hosts):
    validate_url(url, hosts)
    for attempt in range(2):
        try:
            with build_opener(Redirect(hosts)).open(Request(url, headers={'User-Agent':'Stackr-Queue1-Review/2.0'}), timeout=15) as response:
                raw = response.read(MAX_BYTES + 1)
                if len(raw) > MAX_BYTES: raise ValueError('Oversize source response')
                return raw, response.headers.get_content_type(), response.geturl()
        except HTTPError as exc:
            if attempt == 0 and exc.code in (429,500,502,503,504):
                pause = exc.headers.get('Retry-After','2')
                if not pause.isdigit() or int(pause) > 15: raise
                time.sleep(max(2,int(pause)))
            else: raise
        except (URLError, TimeoutError):
            if attempt: raise
            time.sleep(2)
    raise RuntimeError('Fetch failed')

def identity_sha(records):
    pairs = sorted([[str(c['number']),name_key(c['name'])] for c in records])
    return sha(json.dumps(pairs,ensure_ascii=False,separators=(',',':')).encode())

def scoped_provider_records(config, records):
    """Match the fixed target census; retain extra provider identities as out-of-scope evidence."""
    code = config['set_code']
    count = COUNTS[code]
    if code in ('sm3.5', 'sm7.5'):
        numbers = {str(i) for i in range(1, count + 1)}
    elif code == 'swsh4.5sv':
        numbers = {f'SV{i:03d}' for i in range(1, count + 1)}
    else:
        numbers = {f'GG{i:02d}' for i in range(1, count + 1)}
    if not isinstance(records, list): raise ValueError('Fallback dataset is not a list')
    if len({str(c['number']) for c in records}) != len(records):
        raise ValueError('Duplicate source collector number')
    if any(c['id'] != config['provider_dataset_id']+'-'+str(c['number']) for c in records):
        raise ValueError('Source ID inconsistency')
    selected = [c for c in records if str(c['number']) in numbers]
    extra = [dict(id=c['id'],number=c['number'],name=c['name']) for c in records if str(c['number']) not in numbers]
    digest = identity_sha(selected)
    if len(selected) != config['expected_count'] or digest != config['identity_sha256']:
        raise ValueError(f'Target identity census differs: count={len(selected)}, identity_sha256={digest}')
    return selected, extra

def load_manifest():
    configs = json.loads((ROOT / 'scope.json').read_text())
    if {c['set_code']:c['expected_count'] for c in configs} != COUNTS:
        raise ValueError('Scope mismatch')
    return {c['set_code']:c for c in configs}

def target_row(config, target):
    number, name, variant, finish = target
    return dict(set_code=config['set_code'],set_id=config['set_id'],set_name=config['set_name'],
        language_code='en',collector_number=number,card_name=name,variant_code=variant,finish_code=finish,
        artwork_scope='printing_front',exact_finish_verified=False,publication_eligible=False,
        staged=False,production_changes=0,status='not_attempted')

def source_data(config, output):
    code = config['set_code']; result = {'tcgdex':[], 'fallback':None, 'errors':[]}
    folder = output / 'source_data'; folder.mkdir(parents=True, exist_ok=True)
    candidates = [(code,config['set_name'])]
    if code in PARENTS: candidates.append(PARENTS[code])
    for set_id,set_name in candidates:
        url = 'https://api.tcgdex.net/v2/en/sets/' + quote(set_id, safe='')
        try:
            raw,_,_ = get(url, DATA_HOSTS); data = json.loads(raw)
            if data.get('id') != set_id or name_key(data.get('name','')) != name_key(set_name):
                raise ValueError('TCGdex set identity mismatch')
            if not isinstance(data.get('cards'),list): raise ValueError('TCGdex cards is not a list')
            (folder / f'tcgdex-{set_id}.json').write_bytes(raw)
            result['tcgdex'].append(dict(set_id=set_id,records=data['cards'],url=url,sha256=sha(raw)))
        except Exception as exc: result['errors'].append({'url':url,'error':str(exc)})
    # Registered fallback remains review-only; accessibility is not publication approval.
    try:
        url = config['dataset_url']; raw,_,_ = get(url, DATA_HOSTS)
        if blob_sha(raw) != config['provider_git_blob_sha1']: raise ValueError('Fallback dataset differs from audited Git blob')
        (folder / (config['provider_dataset_id']+'.json')).write_bytes(raw)
        records, extra = scoped_provider_records(config, json.loads(raw))
        (folder / (config['provider_dataset_id']+'-out-of-scope.json')).write_text(json.dumps(extra,ensure_ascii=False,indent=2))
        result['fallback'] = dict(records=records,url=url,sha256=sha(raw),out_of_scope=extra)
    except Exception as exc: result['errors'].append({'url':config['dataset_url'],'error':str(exc)})
    (folder / f'{code}-fetch-evidence.json').write_text(json.dumps({'at':now(),'errors':result['errors']},indent=2))
    return result

def resolve(row, config, data):
    number = row['collector_number']; candidates=[]; conflicts=[]
    for source in data['tcgdex']:
        hits=[r for r in source['records'] if str(r.get('localId')) == number]
        if len(hits)>1: conflicts.append('duplicate TCGdex collector identifier'); continue
        if not hits: continue
        c=hits[0]
        if c.get('id') != source['set_id']+'-'+number or name_key(c.get('name','')) != name_key(row['card_name']):
            conflicts.append('TCGdex ID/name conflict'); continue
        image=c.get('image')
        if image:
            try:
                validate_url(image,{'assets.tcgdex.net'})
                if not urlsplit(image).path.startswith('/en/'): raise ValueError('Image language not English')
                image=image.rstrip('/')+'/high.png'
                candidates.append(dict(provider='tcgdex',provider_card_id=c['id'],image_url=image,
                    source_url=source['url'],source_sha256=source['sha256'],provider_name=c['name'],
                    source_record_sha256=sha(json.dumps(c,sort_keys=True,ensure_ascii=False).encode())))
            except ValueError as exc: conflicts.append(str(exc))
    source=data['fallback']
    if source:
        expected=config['provider_dataset_id']+'-'+number
        hits=[c for c in source['records'] if c.get('id')==expected and str(c.get('number'))==number]
        if len(hits)>1: conflicts.append('duplicate fallback ID/number')
        elif hits:
            c=hits[0]
            if name_key(c.get('name','')) != name_key(row['card_name']): conflicts.append('Fallback name conflict')
            elif c.get('images',{}).get('large'):
                image=c['images']['large']
                try:
                    validate_url(image,IMAGE_HOSTS-{'assets.tcgdex.net'})
                    candidates.append(dict(provider='pokemon_tcg_api_review_only',provider_card_id=c['id'],
                        image_url=image,source_url=source['url'],source_sha256=source['sha256'],provider_name=c['name'],
                        source_record_sha256=sha(json.dumps(c,sort_keys=True,ensure_ascii=False).encode())))
                except ValueError as exc: conflicts.append(str(exc))
    if conflicts: return dict(row,status='hold_source_conflict',reason='; '.join(conflicts))
    if not candidates: return dict(row,status='hold_no_exact_image_source',reason=json.dumps(data['errors']))
    return dict(row,status='source_matched',candidates=candidates,source_checked_at=now())

def inspect_image(raw, mime):
    from PIL import Image
    if not mime.startswith('image/'): raise ValueError('Non-image MIME')
    with Image.open(io.BytesIO(raw)) as im: im.verify()
    with Image.open(io.BytesIO(raw)) as im:
        im.load(); width,height=im.size; fmt=im.format
    if fmt not in ('PNG','JPEG','WEBP') or width<400 or height<550 or not .60<=width/height<=.85:
        raise ValueError(f'Invalid card image format/dimensions: {fmt} {width}x{height}')
    return dict(width=width,height=height,image_format=fmt,mime_type=mime,byte_size=len(raw),image_sha256=sha(raw))

def acquire(row, output):
    if row['status']!='source_matched': return row
    errors=[]
    for candidate in row['candidates']:
        try:
            raw,mime,final=get(candidate['image_url'], IMAGE_HOSTS); info=inspect_image(raw,mime)
            ext={'PNG':'png','JPEG':'jpg','WEBP':'webp'}[info['image_format']]
            path=output/'images'/f'{info["image_sha256"]}.{ext}';path.parent.mkdir(exist_ok=True)
            if path.exists() and sha(path.read_bytes())!=info['image_sha256']: raise ValueError('Existing file hash mismatch')
            path.write_bytes(raw)
            return dict(row,**candidate,**info,status='downloaded_review_only',image_file=str(path.relative_to(output)),
                image_http_checked=True,image_decoded=True,image_checked_at=now(),final_image_url=final,
                previous_source_errors=errors)
        except Exception as exc: errors.append({'url':candidate['image_url'],'error':str(exc)})
    return dict(row,status='hold_image_fetch_or_decode',reason=json.dumps(errors))

def save(output, rows):
    hashes=defaultdict(list)
    for r in rows:
        if r.get('image_sha256'): hashes[r['image_sha256']].append(r)
    for group in hashes.values():
        if len(group)>1:
            for r in group: r.update(status='hold_identical_image_bytes',reason='Distinct target identities share exact bytes; review required')
    (output/'receipts.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
    fields=list(dict.fromkeys(k for r in rows for k in r))
    with (output/'receipts.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
        for row in rows: writer.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else v for k,v in row.items()})
    summary={'at':now(),'cohort':348,'attempted':len(rows),'downloaded_decoded':sum(r.get('image_decoded',False) for r in rows),
        'review_candidates':sum(r['status']=='downloaded_review_only' for r in rows),'statuses':dict(Counter(r['status'] for r in rows)),
        'by_set':{c:dict(Counter(r['status'] for r in rows if r['set_code']==c)) for c in LANE},
        'database_writes':0,'staged':0,'published':0,'device_verified':0,'excluded_pocket':131}
    (output/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)
    return summary

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--fetch',action='store_true');p.add_argument('--output',type=Path,default=Path('queue1-review'))
    args=p.parse_args();configs=load_manifest()
    if not args.fetch: print('Manifest verified: exactly 348 physical cards.');return 0
    output=args.output.resolve()
    if (output/'receipts.json').exists(): raise ValueError('Use a new output directory; preserve previous receipts')
    output.mkdir(parents=True,exist_ok=True);rows=[]
    for code in LANE:
        config=configs[code];data=source_data(config,output)
        if data['fallback'] is None:
            (output/'identity-blocker.json').write_text(json.dumps({'set':code,'errors':data['errors']},indent=2))
            save(output,rows);print(json.dumps(data['errors']),flush=True);print('Pinned identity census unavailable; stopping safely.',flush=True);return 2
        targets=[[str(c['number']),c['name'],config['variant_code'],config['finish_code']] for c in data['fallback']['records']]
        candidates=[resolve(target_row(config,t),config,data) for t in targets]
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            results=list(pool.map(lambda r:acquire(r,output),candidates))
        rows.extend(results);save(output,rows)
        if code==LANE[0] and any(r['status']!='downloaded_review_only' for r in results):
            print('First-set acceptance not passed; later sets not attempted.',flush=True);return 2
    summary=save(output,rows)
    return 0 if summary['review_candidates']==348 else 2
if __name__=='__main__': raise SystemExit(main())
