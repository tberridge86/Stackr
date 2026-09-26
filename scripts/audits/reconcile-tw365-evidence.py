"""Offline/remote evidence reconciliation only. Never publishes or approves assets."""
import concurrent.futures,hashlib,html,io,json,re,threading,time,unicodedata,warnings,shutil
from collections import Counter,defaultdict
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request,HTTPRedirectHandler,build_opener
from urllib.parse import urlsplit,urljoin
from urllib.robotparser import RobotFileParser
from PIL import Image
class Text(HTMLParser):
    def __init__(self):super().__init__();self.parts=[]
    def handle_data(self,data):self.parts.append(data)
def text(value):
    p=Text();p.feed(value);return ' '.join(p.parts)
def norm(value):return re.sub(r'\s+','',unicodedata.normalize('NFKC',html.unescape(value)))
def name_norm(value):return norm(re.sub(r'\[(?:支援者|物品|寶可夢道具|競技場)\]$','',value.strip()))
def parse_page(raw,code,url):
    head=re.search(r'<h1\b[^>]*>(.*?)</h1>',raw,re.S|re.I)
    num=re.search(r'<span\b[^>]*class=[\"\'][^\"\']*collectorNumber[^\"\']*[\"\'][^>]*>(.*?)</span>',raw,re.S|re.I)
    image=re.search(r'<div\b[^>]*class=[\"\']cardImage[\"\'][^>]*>\s*<img\b[^>]*src=[\"\']([^\"\']+)',raw,re.S|re.I)
    symbol=re.search(r'<span\b[^>]*class=[\"\']expansionSymbol[\"\'][^>]*>(.*?)</span>',raw,re.S|re.I)
    if not all([head,num,image,symbol]):raise ValueError('Detail structure missing')
    title=text(re.sub(r'<span\b[^>]*>.*?</span>','',head.group(1),flags=re.S|re.I)).strip()
    n=re.fullmatch(r'(\d+)/(\d+)',norm(text(num.group(1))))
    if not n:raise ValueError('Collector number malformed')
    source=html.unescape(urljoin(url,image.group(1)))
    if not re.fullmatch(r'https://asia\.pokemon-card\.com/tw/card-img/tw\d+\.png',source):raise ValueError('Wrong locality/source')
    if code.lower() not in html.unescape(symbol.group(1)).lower():raise ValueError('Wrong set symbol')
    denominator={'SV4a':190,'SV2a':165}[code]
    if int(n.group(2))!=denominator:raise ValueError('Wrong denominator')
    if {'SV4a':'閃色寶藏ex','SV2a':'寶可夢卡牌151'}[code] not in norm(text(raw)):raise ValueError('Wrong product')
    return dict(set_code=code,collector_number=n.group(1).zfill(3),native_name=title,source_url=source,identity_page=url,denominator=denominator,identity_page_sha256=hashlib.sha256(raw.encode()).hexdigest())
def reconcile(prior_root,output_root):
    targets=json.loads((prior_root/'target-manifest.json').read_text());previous=json.loads((prior_root/'verification.json').read_text())
    assert len(targets)==365 and len(previous['rows'])==365
    expected_hash={'SV4a':'02680e1283ec663376bc1ad723ccd143','SV2a':'bd6e655a8c328ed73c759106cfe2f2bc'}
    for code in expected_hash:
        rows=sorted([r for r in targets if r['set_code']==code],key=lambda r:r['collector_number'])
        assert hashlib.md5('\n'.join(r['collector_number']+'|'+r['native_name'] for r in rows).encode()).hexdigest()==expected_hash[code]
    output_root.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(prior_root/'target-manifest.json',output_root/'target-manifest.json')
    lock=threading.Lock();last=[0.0]
    robot=RobotFileParser();robot.parse((prior_root/'robots.txt').read_text().splitlines())
    Image.MAX_IMAGE_PIXELS=8000000;warnings.simplefilter('error',Image.DecompressionBombWarning)
    def allowed(url):
        p=urlsplit(url)
        if p.scheme!='https' or p.hostname!='asia.pokemon-card.com' or p.username or p.password or p.port not in (None,443):raise ValueError('Outside official host')
        if not robot.can_fetch('StackrArtworkVerifier',url):raise ValueError('Robots disallow')
    class SafeRedirect(HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,url):
            allowed(url);return super().redirect_request(req,fp,code,msg,headers,url)
    def fetch(url,limit=5000000):
        allowed(url)
        with lock:
            pause=max(0,.75-(time.monotonic()-last[0]))
            if pause:time.sleep(pause)
            last[0]=time.monotonic()
        with build_opener(SafeRedirect()).open(Request(url,headers={'User-Agent':'StackrArtworkVerifier/1.0','Cache-Control':'no-cache'}),timeout=16) as r:
            b=r.read(limit+1)
            if len(b)>limit or r.status!=200:raise ValueError('Invalid response')
            return b,r.headers.get_content_type(),r.geturl()
    page_index=defaultdict(dict);raw_pages={};parse_failures=[]
    def index_page(raw,code,url):
        p=parse_page(raw,code,url);page_index[(p['set_code'],p['collector_number'])][p['source_url']]=p;raw_pages[url]=(raw,code);return p
    for r in previous['rows']:
        path=prior_root/'identity-pages'/r['set_code']/(r['collector_number']+'.html')
        if path.exists():
            try:index_page(path.read_text(),r['set_code'],r['candidate_detail_url'])
            except Exception as e:parse_failures.append({'path':str(path),'error':str(e)})
    # Edge page confirmed on the official site; acceptance still requires exact fields.
    for code,url in [('SV4a','https://asia.pokemon-card.com/tw/card-search/detail/9383/')]:
        try:
            body,_,_=fetch(url,2000000);index_page(body.decode('utf-8'),code,url)
        except Exception as e:parse_failures.append({'url':url,'error':str(e)})
    for t in targets:
        key=(t['set_code'],t['collector_number'])
        if page_index.get(key):continue
        base_id=int(t['candidate_detail_url'].rstrip('/').split('/')[-1])
        for offset in (1,-1,2,-2):
            url=f'https://asia.pokemon-card.com/tw/card-search/detail/{base_id+offset}/'
            if url in raw_pages:continue
            try:
                body,_,_=fetch(url,2000000);index_page(body.decode('utf-8'),t['set_code'],url)
            except Exception as e:parse_failures.append({'url':url,'error':str(e)})
            if page_index.get(key):break
    existing={}
    for r in previous['rows']:
        path=prior_root/str(r.get('evidence_file','NO_FILE'))
        if r.get('image_verified') and path.is_file() and r.get('source_url'):
            data=path.read_bytes()
            if hashlib.sha256(data).hexdigest()==r.get('sha256'):existing[r['source_url']]=(data,r['mime_type'],r['checked_at'])
    def verify(t):
        key=(t['set_code'],t['collector_number'])
        out=dict(t,checked_at=datetime.now(timezone.utc).isoformat(),publication_status='NOT_UPLOADED',source_permission_status='REVIEW_REQUIRED',finish_evidence='CATALOGUE_FRONT_NOT_EXACT_FOIL_CERTIFICATION',status='UNRESOLVED',image_verified=False,identity_verified=False)
        candidates=[p for p in page_index.get(key,{}).values() if name_norm(p['native_name'])==name_norm(t['native_name'])]
        if len(candidates)!=1:
            out.update(status='IDENTITY_REVIEW_REQUIRED',candidate_count=len(candidates),candidates=list(page_index.get(key,{}).values()));return out
        p=candidates[0];out.update(p);out['target_native_name']=t['native_name'];out['identity_verified']=True
        try:
            if p['source_url'] in existing:
                data,mime,at=existing[p['source_url']];method='reused_verified_bytes';out['original_fetch_at']=at
            else:data,mime,_=fetch(p['source_url']);method='fetched_verified_original'
            if mime not in ('image/png','image/jpeg','image/webp'):raise ValueError('Invalid MIME')
            with Image.open(io.BytesIO(data)) as im:
                width,height=im.size;fmt=im.format
                if width<320 or height<440 or not .6<width/height<.82:raise ValueError('Invalid dimensions')
                im.verify()
            with Image.open(io.BytesIO(data)) as im:
                im.load()
                if len(set(im.convert('RGB').resize((16,16)).getdata()))<12:raise ValueError('Blank image')
            suffix={'PNG':'.png','JPEG':'.jpg','WEBP':'.webp'}[fmt]
            relative=Path('source-images')/t['set_code']/(t['collector_number']+suffix)
            dest=output_root/relative;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
            page=output_root/'identity-pages'/t['set_code']/(t['collector_number']+'.html');page.parent.mkdir(parents=True,exist_ok=True);page.write_text(raw_pages[p['identity_page']][0])
            out.update(status='IDENTITY_AND_IMAGE_VERIFIED_SOURCE_REVIEW_REQUIRED',image_verified=True,sha256=hashlib.sha256(data).hexdigest(),width=width,height=height,byte_size=len(data),mime_type=mime,source_file=str(relative),byte_method=method)
        except Exception as e:out.update(status='IMAGE_VERIFICATION_FAILED',error=type(e).__name__+': '+str(e)[:200])
        return out
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for i,r in enumerate(pool.map(verify,targets),1):
            results.append(r)
            with (output_root/'results.jsonl').open('a') as f:f.write(json.dumps(r,ensure_ascii=False)+'\n')
            if i%30==0:print('RECONCILED',i,dict(Counter(x['status'] for x in results)),flush=True)
    hashes=defaultdict(list)
    for r in results:
        if r.get('sha256'):hashes[r['sha256']].append(r['provider_id'])
    duplicates={h:ids for h,ids in hashes.items() if len(ids)>1}
    for r in results:
        if r.get('sha256') in duplicates:r['status']='DUPLICATE_BYTES_REVIEW_REQUIRED'
    report={'created_at':datetime.now(timezone.utc).isoformat(),'production_writes':0,'target_count':365,'source_permission_status':'REVIEW_REQUIRED','publication_status':'NOT_UPLOADED','by_set':{c:dict(Counter(r['status'] for r in results if r['set_code']==c)) for c in ['SV4a','SV2a']},'counts':dict(Counter(r['status'] for r in results)),'duplicate_image_hashes':duplicates,'page_parse_failures':parse_failures,'rows':results}
    (output_root/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k not in ['rows','page_parse_failures']},ensure_ascii=False),flush=True)
if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--prior',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    reconcile(args.prior,args.output)
