#!/usr/bin/env python3
"""Acquire precisely reconciled images for review; never calls a database or publishes."""
import argparse,concurrent.futures,collections,json,io,re,html,hashlib,time
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin
from PIL import Image
from scan import safe,sha,norm,save,now
from pooled_http import get
JP={'www.pokemon-card.com'}
EN={'images.pokemontcg.io','images.scrydex.com'}
class Page(HTMLParser):
    def __init__(self):
        super().__init__();self.stack=[];self.name=[];self.subtext=[];self.image=None;self.code=None;self.symbols=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);cls=a.get('class','').split()
        if 'pcg-prismstar' in cls and any(t=='h1' and 'Heading1' in c for t,c in self.stack):self.symbols.append('prismstar')
        if tag=='img':
            if 'fit' in cls:self.image=urljoin('https://www.pokemon-card.com',a.get('src',''))
            if 'img-regulation' in cls:self.code=a.get('alt')
        if tag not in ('img','br','hr','meta','link','input','source','area','wbr'):
            self.stack.append((tag,cls))
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i][0]==tag:self.stack=self.stack[:i];break
    def handle_data(self,data):
        if any(t=='h1' and 'Heading1' in c for t,c in self.stack):self.name.append(data)
        if any(t=='div' and 'subtext' in c for t,c in self.stack):self.subtext.append(data)
def numeric_equal(a,b):
    a=str(a);b=str(b)
    return int(a)==int(b) if a.isdigit() and b.isdigit() else a==b
def verify_page(raw,row):
    p=Page();p.feed(raw.decode('utf-8'));name=' '.join(p.name).strip();sub=' '.join(p.subtext)
    m=re.search(r'([A-Za-z]*\d+[A-Za-z]*)\s*/\s*(\d+|[A-Za-z][A-Za-z0-9-]*)',sub)
    expected=norm(row['source_name']);actual=norm(name)
    if row.get('name_match_rule')=='prism_symbol_spelling':
        if p.symbols!=['prismstar']:raise ValueError('Live official prism symbol missing or ambiguous')
        actual+='prismstar'
    elif row.get('name_match_rule')=='reviewed_character_qualifier':
        if (row.get('set_code'),row.get('collector_number')) not in {('S8b','266'),('S8b','268')}:raise ValueError('Unreviewed character qualifier')
        expected=re.sub(r'\([^()]+\)$','',expected)
    if actual!=expected:raise ValueError('Live official name differs')
    if p.code!=row['source_set']:raise ValueError('Live official set differs')
    if not m or not numeric_equal(m[1],row['source_number']):raise ValueError('Live official number differs')
    if row.get('source_total') not in (None,'',-1,'-1') and not numeric_equal(m[2],row['source_total']):raise ValueError('Live official denominator differs')
    if p.image!=row['image_url']:raise ValueError('Live official image URL differs')
    safe(p.image,JP)
    return {'identity_page_sha256':sha(raw),'identity_checked_at':now(),'verified_name':name,'verified_symbols':p.symbols,'verified_set':p.code,'verified_number':m[1],'verified_total':m[2]}
def image_info(b,mime):
    if not mime.startswith('image/'):raise ValueError('Non-image MIME')
    with Image.open(io.BytesIO(b)) as im:im.verify()
    with Image.open(io.BytesIO(b)) as im:
        im.load();w,h=im.size;fmt=im.format
    if fmt not in ('PNG','JPEG','WEBP') or w<240 or h<330 or not .60<=w/h<=.85:raise ValueError(f'Unexpected card-front dimensions {w}x{h}')
    return {'sha256':sha(b),'width':w,'height':h,'byte_size':len(b),'mime_type':mime,'format':fmt}
def acquire(row,out):
    cache=out/'results'/(row['printing_id']+'.json')
    if cache.exists():
        old=json.loads(cache.read_text())
        if old.get('status')=='acquired_for_review':
            path=out/old['image_file']
            if path.exists() and sha(path.read_bytes())==old['sha256']:return old
    try:
        evidence={}
        if row['language_code']=='ja':
            page=out/'identity-pages'/(row['printing_id']+'.html')
            if page.exists():b=page.read_bytes()
            else:
                b,_,_=get(row['identity_url'],JP);page.parent.mkdir(parents=True,exist_ok=True);page.write_bytes(b)
            evidence=verify_page(b,row)
        hosts=JP if row['language_code']=='ja' else EN
        urls=[row['image_url']]
        if row['language_code']=='en' and row.get('image_fallback_url') and row['image_fallback_url'] not in urls:urls.append(row['image_fallback_url'])
        attempts=[]
        for selected_url in urls:
            try:
                b,mime,final=get(selected_url,hosts,limit=12*1024*1024);info=image_info(b,mime)
                break
            except Exception as e:
                attempts.append({'url':selected_url,'error':str(e)})
        else:raise ValueError(json.dumps(attempts))
        ext={'PNG':'png','JPEG':'jpg','WEBP':'webp'}[info['format']];file=Path('originals')/(info['sha256']+'.'+ext)
        (out/file).parent.mkdir(parents=True,exist_ok=True)
        if (out/file).exists() and sha((out/file).read_bytes())!=info['sha256']:raise ValueError('Local content-addressed file conflict')
        (out/file).write_bytes(b)
        result={**row,**info,**evidence,'image_file':str(file),'acquired_url':selected_url,'final_url':final,'failed_url_attempts':attempts,'source_rendition':'small' if selected_url!=row['image_url'] else 'original','checked_at':now(),'status':'acquired_for_review','publication_status':'NOT_PUBLISHED','source_approval_recheck_required':True,'exact_finish_verified':False}
    except Exception as e:result={**row,'status':'acquisition_failed','error':str(e),'checked_at':now()}
    save(cache,result);return result
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--input',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--language',choices=['ja','en'],required=True);ap.add_argument('--workers',type=int,default=3);args=ap.parse_args()
    assert 1<=args.workers<=4
    rows=[r for r in json.loads(args.input.read_text()) if r['language_code']==args.language and r['status']=='snapshot_exact_pointer']
    assert len({r['printing_id'] for r in rows})==len(rows)
    results=[]
    # The source adapter's established maximum batch size is 500.
    for start in range(0,len(rows),500):
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures=[pool.submit(acquire,r,args.output) for r in rows[start:start+500]]
            for f in concurrent.futures.as_completed(futures):
                results.append(f.result())
                if len(results)%25==0:
                    save(args.output/'manifest.json',results)
                    print(json.dumps({'checked':len(results),'total':len(rows),'counts':dict(collections.Counter(r['status'] for r in results))}),flush=True)
        save(args.output/'manifest.json',results)
    summary={'at':now(),'language':args.language,'targets':len(rows),'counts':dict(collections.Counter(r['status'] for r in results)),'production_writes':0}
    save(args.output/'summary.json',summary);print(json.dumps(summary),flush=True)
if __name__=='__main__':main()
