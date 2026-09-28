"""Prepare exact official Taiwanese fronts for review; no public storage or database writes."""
import argparse,collections,concurrent.futures,hashlib,json,re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit,parse_qs,urljoin,unquote
from acquire import image_info,numeric_equal
from scan import save,now,norm,safe
from pooled_http import get
HOSTS={'asia.pokemon-card.com'}

class Page(HTMLParser):
 def __init__(self):
  super().__init__();self.stack=[];self.name=[];self.title=[];self.number=[];self.images=[];self.codes=[];self.symbols=[]
 def inside(self,cls):return any(cls in c for t,c in self.stack)
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);cls=a.get('class','').split()
  if tag=='img' and self.inside('cardImage'):self.images.append(urljoin('https://asia.pokemon-card.com',a.get('src','')))
  if tag=='img' and self.inside('expansionSymbol'):self.symbols.append(unquote(urlsplit(a.get('src','')).path).split('/')[-1])
  if tag=='a' and self.inside('expansionLinkColumn'):self.codes+=parse_qs(urlsplit(a.get('href','')).query).get('expansionCodes',[])
  if tag not in ('img','br','hr','meta','link','input','source','area','wbr'):self.stack.append((tag,cls))
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,-1,-1):
   if self.stack[i][0]==tag:self.stack=self.stack[:i];break
 def handle_data(self,data):
  if any(t=='title' for t,c in self.stack):self.title.append(data)
  if any(t=='h1' and 'cardDetail' in c for t,c in self.stack) and not self.inside('evolveMarker'):self.name.append(data)
  if self.inside('collectorNumber'):self.number.append(data)

def verify_page(raw,row):
 if row['language_code']!='zh-tw' or row['permission_status']!='REVIEW_REQUIRED':raise ValueError('Wrong review scope')
 for k,prefix in [('identity_url','/tw/card-search/detail/'),('image_url','/tw/card-img/')]:
  safe(row[k],HOSTS)
  if not urlsplit(row[k]).path.startswith(prefix):raise ValueError('Wrong native-language source URL')
 p=Page();p.feed(raw.decode('utf8'))
 name=''.join(p.name).strip();title=''.join(p.title).split('|')[0].strip()
 if norm(name)!=norm(row['card_native_name']) or norm(title)!=norm(row['card_native_name']) or norm(row['source_name'])!=norm(row['card_native_name']):raise ValueError('Native card name differs')
 code=row['source_set']
 if p.codes!=[code] or norm(code)!=norm(row['set_code']):raise ValueError('Official expansion differs')
 if len(p.symbols)!=1 or not re.match(re.escape(code)+r'(?:_|\.|@)',p.symbols[0]):raise ValueError('Printed set mark differs')
 parts=''.join(p.number).strip().split('/')
 if len(parts)!=2 or not numeric_equal(parts[0],row['collector_number']) or not numeric_equal(parts[0],row['source_number']):raise ValueError('Collector number differs')
 if not numeric_equal(parts[1],row['printed_total']) or not numeric_equal(parts[1],row['source_total']):raise ValueError('Printed denominator differs')
 if p.images!=[row['image_url']]:raise ValueError('Exact card-front URL differs')
 return {'identity_page_sha256':hashlib.sha256(raw).hexdigest(),'verified_name':name,'verified_set':code,'verified_number':parts[0],'verified_total':parts[1],'verified_set_mark':p.symbols[0],'checked_at':now()}

def acquire(row,out):
 try:
  page,mime,final=get(row['identity_url'],HOSTS,limit=3*1024*1024)
  if final!=row['identity_url'] or mime!='text/html':raise ValueError('Identity page redirect or MIME differs')
  proof=verify_page(page,row)
  file=out/'identity-pages'/(proof['identity_page_sha256']+'.html');file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(page)
  b,mime,final=get(row['image_url'],HOSTS,limit=12*1024*1024)
  if final!=row['image_url']:raise ValueError('Image redirected')
  info=image_info(b,mime);info['source_declared_mime_type']=mime;info['mime_type']={'PNG':'image/png','JPEG':'image/jpeg','WEBP':'image/webp'}[info['format']]
  relative='originals/'+info['sha256']+'.'+{'PNG':'png','JPEG':'jpg','WEBP':'webp'}[info['format']]
  file=out/relative;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(b)
  result={**row,**info,'identity_verification':proof,'identity_page_file':'identity-pages/'+proof['identity_page_sha256']+'.html','image_file':relative,'acquired_url':final,'status':'acquired_for_review','checked_at':now(),'publication_status':'NOT_PUBLISHED','production_writes':0,'exact_finish_verified':False,'source_approval_recheck_required':True}
 except Exception as e:result={**row,'status':'acquisition_failed','error':str(e),'checked_at':now(),'production_writes':0}
 save(out/'results'/(row['printing_id']+'.json'),result);return result

def main():
 p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();rows=json.loads(a.input.read_text(encoding='utf8'))
 if not 1<=len(rows)<=250 or len({r['printing_id'] for r in rows})!=len(rows):raise ValueError('Wrong bounded cohort')
 results=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  for result in pool.map(lambda r:acquire(r,a.output),rows):
   results.append(result)
   if len(results)%25==0:save(a.output/'manifest.json',results);print(json.dumps({'checked':len(results),'total':len(rows),'counts':dict(collections.Counter(r['status'] for r in results))}),flush=True)
 save(a.output/'manifest.json',results);summary={'at':now(),'targets':len(rows),'counts':dict(collections.Counter(r['status'] for r in results)),'production_writes':0,'publication_status':'NOT_PUBLISHED','permission_status':'REVIEW_REQUIRED'};save(a.output/'summary.json',summary);print(json.dumps(summary),flush=True)
if __name__=='__main__':main()
