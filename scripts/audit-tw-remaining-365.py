#!/usr/bin/env python3
"""Bounded, read-only recovery of the saved 365-card Taiwan artwork cohort.
No database credentials, no production writes, no automatic publication.
Image hosting permission is NOT inferred from public availability.
"""
from __future__ import annotations
import concurrent.futures
import hashlib
import html
import io
import json
import re
import threading
import time
import unicodedata
import warnings
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener
from PIL import Image

ROOT = Path('tw-official-365')
BASE = 'https://asia.pokemon-card.com'
COHORT_HASH = 'a811f8ad254741b16aab1a22a3ac68a878ef1c0a5cdec4b850b1e57457f44fdd'
ALLOWED = {'asia.pokemon-card.com', 'api.tcgdex.net'}
MAX_REQUESTS = 1550
MIN_INTERVAL = 0.75
LOCK = threading.Lock()
LAST_REQUEST = [0.0]
REQUESTS = [0]
STOP = threading.Event()
Image.MAX_IMAGE_PIXELS = 12000000
warnings.simplefilter('error', Image.DecompressionBombWarning)


def stamp():
    return datetime.now(timezone.utc).isoformat()


def save(name, value):
    dest = ROOT / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp = dest.with_suffix(dest.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(dest)


def guard(url):
    p = urlsplit(url)
    if p.scheme != 'https' or p.hostname not in ALLOWED or p.username or p.password or p.port not in (None, 443):
        raise ValueError('URL outside the fixed public-source allowlist')
    return url


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        guard(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, limit=3000000):
    guard(url)
    for attempt in range(2):
        with LOCK:
            if STOP.is_set():
                raise RuntimeError('Source access stopped after a rate-limit/access response')
            if REQUESTS[0] >= MAX_REQUESTS:
                raise RuntimeError('Bounded request cap reached')
            pause = max(0.0, MIN_INTERVAL - (time.monotonic() - LAST_REQUEST[0]))
            if pause:
                time.sleep(pause)
            LAST_REQUEST[0] = time.monotonic()
            REQUESTS[0] += 1
        try:
            req = Request(url, headers={'User-Agent': 'StackrArtworkVerifier/2.0', 'Accept': '*/*'})
            with build_opener(SafeRedirect()).open(req, timeout=18) as response:
                data = response.read(limit + 1)
                if response.status != 200 or len(data) > limit:
                    raise ValueError('Unexpected HTTP response or oversized content')
                return data, response.headers.get_content_type(), response.geturl()
        except HTTPError as error:
            if error.code in (401, 403, 429):
                STOP.set()
            raise
        except (URLError, TimeoutError):
            if attempt:
                raise
            time.sleep(1.0)
    raise RuntimeError('Unreachable')


class Node:
    def __init__(self, tag='', attrs=None):
        self.tag, self.attrs, self.children = tag, dict(attrs or []), []
    def text(self):
        return ''.join(c.text() if isinstance(c, Node) else c for c in self.children)
    def direct_text(self):
        return ''.join(c for c in self.children if isinstance(c, str))
    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()
    def has_class(self, name):
        return name in self.attrs.get('class', '').split()


class Document(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.root = Node('root')
        self.stack = [self.root]
        self.feed(source)
    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)
    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                self.stack = self.stack[:index]
                break
    def handle_data(self, value):
        self.stack[-1].children.append(value)


def normalized_name(value):
    value = unicodedata.normalize('NFKC', html.unescape(value))
    value = re.sub(r'\[(?:支援者|物品|競技場|寶可夢道具)\]$', '', value)
    return re.sub(r'\s+', '', value).casefold()


def parse_list(source, page_url):
    doc = Document(source).root
    details = {}
    next_pages = []
    for node in doc.walk():
        if node.tag != 'a':
            continue
        url = urljoin(page_url, html.unescape(node.attrs.get('href', '')))
        p = urlsplit(url)
        if p.scheme != 'https' or p.hostname != 'asia.pokemon-card.com':
            continue
        match = re.fullmatch(r'/tw/card-search/detail/(\d+)/', p.path)
        if match:
            images = [i.attrs.get('data-original') or i.attrs.get('src') for i in node.walk() if i.tag == 'img']
            details[int(match.group(1))] = {'detail_url': url, 'listed_image_urls': [u for u in images if u]}
        elif p.path == '/tw/card-search/list/':
            if node.text().strip().casefold() == 'next':
                next_pages.append(url)
    return details, next_pages


def parse_detail(source, page_url):
    doc = Document(source).root
    headings = [n for n in doc.walk() if n.tag == 'h1' and n.has_class('cardDetail')]
    collectors = [n for n in doc.walk() if n.has_class('collectorNumber')]
    faces = [n for n in doc.walk() if n.has_class('cardImage')]
    if len(headings) != 1 or len(collectors) != 1 or len(faces) != 1:
        raise ValueError('Official detail schema is ambiguous')
    name = headings[0].direct_text().strip()
    match = re.fullmatch(r'\s*(\d+)\s*/\s*(\d+)\s*', collectors[0].text())
    if not name or not match:
        raise ValueError('No exact native name / collector numbering')
    images = [urljoin(page_url, n.attrs.get('src', '')) for n in faces[0].walk() if n.tag == 'img']
    if len(images) != 1:
        raise ValueError('Ambiguous primary card image')
    p = urlsplit(images[0])
    if p.hostname != 'asia.pokemon-card.com' or not re.fullmatch(r'/tw/card-img/tw\d+\.(?:png|jpg|jpeg|webp)', p.path):
        raise ValueError('Primary image is not a Taiwan card image')
    sets = set()
    marks = []
    for n in doc.walk():
        if n.tag == 'a':
            u = urlsplit(urljoin(page_url, html.unescape(n.attrs.get('href', ''))))
            if u.hostname == 'asia.pokemon-card.com' and u.path == '/tw/card-search/list/':
                sets.update(parse_qs(u.query).get('expansionCodes', []))
        if n.tag == 'img' and '/tw/card-img/mark/' in n.attrs.get('src', ''):
            marks.append(n.attrs['src'])
    return {'number': match.group(1).zfill(3), 'denominator': int(match.group(2)), 'official_native_name': name,
            'official_set_codes': sorted(sets), 'image_url': images[0], 'set_mark_urls': marks, 'detail_url': page_url}


def get_targets():
    # These exact ranges were calculated FROM remaining-365.json, not a guessed 354-card catalogue.
    # The roster hash covers set, number and native name and must equal the saved manifest.
    selection = {'SV4a': set(range(177, 355)), 'SV2a': set(range(21, 208))}
    targets = {}
    for code, nums in selection.items():
        data, _, _ = fetch('https://api.tcgdex.net/v2/zh-tw/sets/' + code)
        parsed = json.loads(data)
        if parsed['id'] != code:
            raise ValueError('Provider set identity changed')
        rows = [c for c in parsed['cards'] if int(c['localId']) in nums]
        if len(rows) != len(nums):
            raise ValueError('Saved cohort is no longer fully represented')
        for row in rows:
            key = (code, row['localId'].zfill(3))
            if key in targets:
                raise ValueError('Duplicate target identity')
            targets[key] = {'set_code': code, 'number': key[1], 'native_name': row['name'], 'language': 'zh-tw'}
    roster = sorted([[k[0], k[1], v['native_name']] for k, v in targets.items()])
    digest = hashlib.sha256(json.dumps(roster, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    if len(targets) != 365 or digest != COHORT_HASH:
        raise ValueError('Exact saved 365-card roster hash mismatch')
    save('target-manifest.json', {'sha256': digest, 'rows': list(targets.values())})
    return targets


def discover(code):
    page = BASE + '/tw/card-search/list/?expansionCodes=' + code
    details = {}
    seen = set()
    for _ in range(26):
        if page in seen:
            raise ValueError('Repeated pagination URL')
        seen.add(page)
        query = parse_qs(urlsplit(page).query)
        if query.get('expansionCodes') != [code]:
            raise ValueError('Pagination escaped the selected set')
        data, _, _ = fetch(page)
        source = data.decode('utf-8')
        found, next_pages = parse_list(source, page)
        if not found:
            raise ValueError('No official detail links on results page')
        details.update(found)
        save('lists/' + code + '-' + str(len(seen)) + '.json', {'url': page, 'entries': found, 'next': next_pages})
        if not next_pages:
            save(code + '-official-index.json', details)
            return details
        if len(set(next_pages)) != 1:
            raise ValueError('Ambiguous next-page link')
        page = next_pages[0]
    raise ValueError('Pagination cap reached before final page')


def read_identity(args):
    code, official_id, entry = args
    result = {'requested_set': code, 'official_id': official_id, 'detail_url': entry['detail_url'], 'checked_at': stamp()}
    try:
        raw, _, _ = fetch(entry['detail_url'])
        parsed = parse_detail(raw.decode('utf-8'), entry['detail_url'])
        result.update(parsed, status='detail_parsed')
        listed_images = entry.get('listed_image_urls', [])
        if parsed['image_url'] not in listed_images:
            raise ValueError('Detail image disagrees with the official result list')
        result['list_image_matched'] = True
        save('details/' + str(official_id) + '.json', result)
    except Exception as error:
        result.update(status='detail_failed', error=type(error).__name__ + ': ' + str(error)[:180])
    return result


def image_bytes(target, candidate):
    result = dict(target, official=candidate, checked_at=stamp(), publication_status='NOT_PUBLISHED',
                  source_permission_status='not_assessed_by_read_only_verifier', image_scope='primary_catalogue_face_not_finish_certification')
    try:
        data, mime, final = fetch(candidate['image_url'], limit=6000000)
        if mime not in ('image/png', 'image/jpeg', 'image/webp'):
            raise ValueError('Not a supported image MIME type')
        with Image.open(io.BytesIO(data)) as image:
            w, h = image.size
            fmt = image.format
            if w < 240 or h < 330 or not 0.60 < w / h < 0.82 or fmt not in ('PNG', 'JPEG', 'WEBP'):
                raise ValueError('Invalid card dimensions or format')
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            if len(set(image.convert('RGB').resize((16, 16)).getdata())) < 8:
                raise ValueError('Blank or near-uniform image')
        suffix = {'PNG': 'png', 'JPEG': 'jpg', 'WEBP': 'webp'}[fmt]
        relative = 'images/' + target['set_code'] + '/' + target['number'] + '.' + suffix
        path = ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        result.update(status='official_identity_and_image_verified', image_file=relative, width=w, height=h,
                      mime_type=mime, byte_size=len(data), sha256=hashlib.sha256(data).hexdigest(), final_url=final)
    except Exception as error:
        result.update(status='image_fetch_or_decode_failed', error=type(error).__name__ + ': ' + str(error)[:180])
    return result


def main():
    ROOT.mkdir(exist_ok=True)
    save('run-state.json', {'status': 'STARTED', 'production_writes': 0, 'started_at': stamp()})
    targets = get_targets()
    indexes = {code: discover(code) for code in ('SV4a', 'SV2a')}
    print('INDEX_READY', {c: len(v) for c, v in indexes.items()}, flush=True)
    # IDs of official number-001 pages observed in the previous discovery.
    # The offset ONLY prioritises URLs ALREADY FOUND in official result lists.
    # Every candidate still has to pass exact set/number/name/image checks.
    seed = {'SV4a': 9029, 'SV2a': 8124}
    primary = []
    for code, number in targets:
        candidate_id = seed[code] + int(number) - 1
        if candidate_id in indexes[code]:
            primary.append((code, candidate_id, indexes[code][candidate_id]))
    consumed = set()
    identities = []
    accepted = {}
    def consider(result):
        identities.append(result)
        consumed.add((result['requested_set'], result['official_id']))
        key = (result['requested_set'], result.get('number'))
        target = targets.get(key)
        if result.get('status') != 'detail_parsed' or not target:
            return
        checks = {'set_code': key[0] in result['official_set_codes'],
                  'collector_number': key[1] == result['number'],
                  'denominator': result['denominator'] == {'SV4a': 190, 'SV2a': 165}[key[0]],
                  'native_name': normalized_name(target['native_name']) == normalized_name(result['official_native_name']),
                  'list_image': result.get('list_image_matched', False)}
        result['identity_checks'] = checks
        if all(checks.values()):
            if key not in accepted or result['official_id'] < accepted[key]['official_id']:
                accepted[key] = result
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for count, result in enumerate(pool.map(read_identity, primary), 1):
            consider(result)
            if count % 40 == 0:
                save('identities-partial.json', identities)
                print('IDENTITY_PROGRESS', count, 'matched', len(accepted), flush=True)
        # Search remaining DISCOVERED detail links only if primary candidates failed.
        if len(accepted) < len(targets) and not STOP.is_set():
            rest = [(c, ident, row) for c, rows in indexes.items() for ident, row in sorted(rows.items())
                    if (c, ident) not in consumed and any(k[0] == c and k not in accepted for k in targets)]
            for start in range(0, len(rest), 18):
                if len(accepted) == len(targets) or STOP.is_set():
                    break
                for result in pool.map(read_identity, rest[start:start + 18]):
                    consider(result)
    save('identity-evidence.json', identities)
    print('IDENTITY_COMPLETE', len(accepted), 'of', len(targets), flush=True)
    results = []
    items = [(targets[k], v) for k, v in sorted(accepted.items())]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for count, result in enumerate(pool.map(lambda pair: image_bytes(*pair), items), 1):
            results.append(result)
            if count % 40 == 0:
                save('verification-partial.json', results)
                print('IMAGE_PROGRESS', count, dict(Counter(r['status'] for r in results)), flush=True)
    for key, target in targets.items():
        if key not in accepted:
            results.append(dict(target, status='identity_unresolved', publication_status='NOT_PUBLISHED'))
    hashes = defaultdict(list)
    for row in results:
        if row.get('sha256'):
            hashes[row['sha256']].append(row['set_code'] + '-' + row['number'])
    duplicates = {h: vals for h, vals in hashes.items() if len(vals) > 1}
    for row in results:
        if row.get('sha256') in duplicates:
            row['status'] = 'duplicate_bytes_identity_review'
    report = {'checked_at': stamp(), 'target_count': 365, 'target_roster_sha256': COHORT_HASH,
              'production_writes': 0, 'database_credentials_used': False, 'http_requests': REQUESTS[0],
              'summary': {c: dict(Counter(r['status'] for r in results if r['set_code'] == c)) for c in indexes},
              'duplicate_images': duplicates, 'rows': sorted(results, key=lambda r: (r['set_code'], r['number']))}
    save('verification.json', report)
    save('summary.json', {k: v for k, v in report.items() if k != 'rows'})
    save('run-state.json', {'status': 'COMPLETED_READ_ONLY', 'production_writes': 0, 'completed_at': stamp()})
    print('FINAL_SUMMARY', json.dumps({k: v for k, v in report.items() if k != 'rows'}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        ROOT.mkdir(exist_ok=True)
        save('run-state.json', {'status': 'FAILED', 'production_writes': 0, 'error': type(error).__name__ + ': ' + str(error)[:300]})
        raise
