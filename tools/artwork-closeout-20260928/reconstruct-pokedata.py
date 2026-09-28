"""Rebuild saved PokeData name anchors through the existing public card endpoint."""
import collections, hashlib, json, subprocess, sys, time, urllib.parse
from pathlib import Path
from pooled_http import get
from scan import save, now

index, metadata, output = map(Path, sys.argv[1:4])
here = Path(__file__).resolve().parent
targets = [{**r,'category':'Source needed'} for r in json.loads((index/'unresolved.json').read_text()) if r['language_code']=='ja' and r['status']=='no_snapshot_match']
output.mkdir(parents=True,exist_ok=True)
save(output/'ledger.json', targets)
save(output/'exclude.json', [])
sources = output/'sources';sources.mkdir(exist_ok=True)
groups=collections.defaultdict(list)
for r in targets: groups[r['set_code']].append(r)
assert len(groups)<=100, 'Unexpected set acquisition scope'
descriptors=[];failures=[]
for code, rows in sorted(groups.items()):
    names={r['set_english_display_name'] for r in rows if r.get('set_english_display_name')}
    if len(names)!=1:
        failures.append({'set_code':code,'reason':'No unique saved English set name'});continue
    name=next(iter(names))
    url='https://www.pokedata.io/api/cards?'+urllib.parse.urlencode({'set_name':name,'tcg':'Pokemon','stats':'kwan'})
    try:
        raw,_,final=get(url,{'www.pokedata.io'},limit=12*1024*1024)
        if urllib.parse.urlsplit(final).path!='/api/cards' or urllib.parse.parse_qs(urllib.parse.urlsplit(final).query)!=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query):raise ValueError('Unexpected provider redirect')
        cards=json.loads(raw)
        if not isinstance(cards,list) or not 1<=len(cards)<=2500:raise ValueError('No bounded card listing')
        for c in cards:
            if c.get('language')!='JAPANESE' or c.get('tcg')!='Pokemon' or str(c.get('set_code','')).casefold()!=code.casefold():raise ValueError('Wrong provider language or set code')
        ids={c['set_id'] for c in cards};provider_names={c['set_name'] for c in cards}
        if len(ids)!=1 or len(provider_names)!=1:raise ValueError('Ambiguous provider set')
        descriptor={'id':next(iter(ids)),'name':next(iter(provider_names)),'code':code,'language':'JAPANESE','tcg':'Pokemon'}
        file=sources/f'pokedata-set-{descriptor["id"]}.json'
        file.write_bytes(raw)
        save(file.with_suffix('.receipt.json'),{'url':url,'at':now(),'sha256':hashlib.sha256(raw).hexdigest(),'provider_set':descriptor})
        descriptors.append(descriptor)
    except Exception as e:failures.append({'set_code':code,'set_name':name,'reason':str(e)})
    print(json.dumps({'sets_saved':len(descriptors),'sets_failed':len(failures),'sets_total':len(groups)}),flush=True)
    time.sleep(.75)
save(sources/'pokedata-sets.json',descriptors)
save(output/'source-failures.json',failures)
subprocess.run([sys.executable,str(here/'reconcile-pokedata.py'),'--ledger',str(output/'ledger.json'),'--exclude',str(output/'exclude.json'),'--sources',str(sources),'--metadata',str(metadata),'--revision','bc5a2698eb9af858feb0280d579fd5fd0f0273e2','--output',str(output/'matching')],check=True)
