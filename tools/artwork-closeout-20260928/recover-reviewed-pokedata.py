"""Append only the 18 visually reviewed, byte-pinned Japanese fronts."""
import hashlib,json,sys
from pathlib import Path
from acquire import image_info
from pooled_http import get
from scan import now,save

DECISIONS_SHA='88925f114b3862b6e812cb538d638432fab3fe2be56c00d13342e616fe6a911d'

def verify_decisions(raw):
    if hashlib.sha256(raw).hexdigest()!=DECISIONS_SHA:raise ValueError('Visual decisions changed')
    rows=json.loads(raw)
    if len(rows)!=18 or len({r['printing_id'] for r in rows})!=18:raise ValueError('Wrong review cohort')
    return rows

def main():
    sources,package=map(Path,sys.argv[1:3])
    rows=verify_decisions(Path(__file__).with_name('visual-decisions-18.json').read_bytes())
    candidates=json.loads((package/'candidates.json').read_text())
    acquired=json.loads((package/'acquired/manifest.json').read_text())
    if {r['printing_id'] for r in candidates}&{r['printing_id'] for r in rows}:raise ValueError('Review overlaps automatic cohort')
    descriptors=json.loads((sources/'pokedata-sets.json').read_text())
    for row in rows:
        matches=[s for s in descriptors if s['code'].casefold()==row['set_code'].casefold() and s['language']=='JAPANESE' and s['tcg']=='Pokemon']
        if len(matches)!=1:raise ValueError('Ambiguous provider set')
        s=matches[0];file=sources/f'pokedata-set-{s["id"]}.json';raw=file.read_bytes()
        receipt=json.loads(file.with_suffix('.receipt.json').read_text())
        if hashlib.sha256(raw).hexdigest()!=receipt['sha256']:raise ValueError('Provider evidence drift')
        p=row['provider_candidate'];hits=[c for c in json.loads(raw) if c.get('id')==p['id']]
        if len(hits)!=1:raise ValueError('Ambiguous provider card')
        card=hits[0]
        for key,value in {'set_id':s['id'],'set_name':s['name'],'set_code':s['code'],'language':'JAPANESE','tcg':'Pokemon','name':p['name'],'num':p['num'],'img_url':p['image_url']}.items():
            if card.get(key)!=value:raise ValueError('Reviewed provider identity drift: '+key)
        if int(p['num'])!=int(row['collector_number']):raise ValueError('Number drift')
        b,mime,final=get(p['image_url'],{'pokemoncardimages.pokedata.io'},limit=12*1024*1024)
        info=image_info(b,mime)
        for key in ('sha256','byte_size','width','height'):
            if info[key]!=row[key]:raise ValueError('Reviewed image bytes changed: '+key)
        candidate={**row,'source_code':'pokedata_japanese','image_url':p['image_url'],'identity_url':receipt['url'],'source_name':p['name'],'source_number':p['num'],'source_provider_card_id':p['id'],'source_provider_set_id':s['id'],'source_provider_set_name':s['name'],'provider_response_sha256':receipt['sha256'],'name_match_rule':'exact_image_visual_review','permission_status':'existing_source_recheck','artwork_scope':'printing_front','exact_finish_verified':False,'production_writes':0,'publication_status':'NOT_PUBLISHED'}
        relative='originals/'+info['sha256']+'.'+{'PNG':'png','JPEG':'jpg','WEBP':'webp'}[info['format']]
        image=package/'acquired'/relative;image.parent.mkdir(parents=True,exist_ok=True);image.write_bytes(b)
        result={**candidate,**info,'image_file':relative,'final_url':final,'checked_at':now(),'status':'acquired_for_review','source_approval_recheck_required':True}
        candidates.append(candidate);acquired.append(result)
        save(package/'acquired/results'/(row['printing_id']+'.json'),result)
    save(package/'candidates.json',candidates);save(package/'acquired/manifest.json',acquired)
    save(package/'visual-review-decisions.json',rows)
    save(package/'acquired/summary.json',{'targets':len(candidates),'acquired':sum(r['status']=='acquired_for_review' for r in acquired),'visual_review_count':18,'production_writes':0})

if __name__=='__main__':main()
