#!/usr/bin/env python3
"""Join frozen read-only evidence into a complete, non-publishing work ledger."""
import argparse,json,collections,hashlib
from pathlib import Path
from datetime import datetime,timezone
def read(p):return json.loads(p.read_text())
def write(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2))
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--workspace',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);a=ap.parse_args();root=a.workspace;out=a.output
    baseline=read(root/'missing-baseline.json');snaps={r['printing_id']:r for r in read(root/'snapshot-matches.json')};refs={r['printing_id']:r for r in read(root/'source-scan/reference-results.json')}
    prepared={}
    for lang in ['ja','en']:
        for r in read(root/f'prepared-{lang}/manifest.json'):prepared[r['printing_id']]={**r,'prepared_directory':f'prepared-{lang}'}
    old=root/'recovered/Stackr_TW_116_Prepared_Artwork_2026-09-26';oldman=read(old/'manifest.json')
    old116={('zh-tw','SV4a',r['collector_number']):r for r in oldman['candidates']}
    cohort=read(root/'Stackr/tools/artwork-closeout-20260928/tw365-cohort.json');old365={r['production_printing_id']:r for r in cohort}
    rows=[]
    for b in baseline:
        pid=b['printing_id'];s=snaps[pid];ref=refs[pid];key=(b['language_code'],b['set_code'],b['collector_number']);ev=prepared.get(pid)
        r={**b,'publication_status':'NOT_PUBLISHED','published_in_this_run':False,'exact_finish_verified':False,'artwork_scope':'printing_front','snapshot_status':s['status'],'provider_reference_status':ref['status'],'image_url':s.get('image_url',''),'identity_url':s.get('identity_url',''),'source_code':s.get('source_code',''),'reason':'','action':'','user_status':'Not started','user_file':'','user_notes':''}
        if ev:
            r.update(category='Files prepared',reason='Original and three display sizes verified. Protected publication remains pending.',action='Publish through the reviewed catalogue release path.',image_url=ev.get('acquired_url',ev['image_url']),identity_url=ev.get('identity_url',''),source_code=ev['source_code'],source_sha256=ev['sha256'],width=ev['width'],height=ev['height'],source_rendition=ev.get('source_rendition','original'),permission_status=ev['permission_status'],user_status='Not a manual download')
            if b['language_code']=='en':r['reason']='Original and three display sizes verified. This exact English cohort still needs its source review recorded before publication.'
        elif key in old116:
            ev=old116[key];r.update(category='Files prepared',reason='Recovered prior 116-card package; original and three display sizes reverified.',action='Complete the protected TW preflight and bounded publication.',image_url=ev['source_url'],identity_url='',source_code='tcgdex',source_sha256=ev['source_sha256'],permission_status='existing_cohort_recheck',user_status='Not a manual download')
        elif pid in old365:
            ev=old365[pid];r.update(category='Originals archived',reason='Previous image and identity checks preserved; local review preview verified. Full originals remain in GitHub artifacts.',action='Recover the saved originals, prepare display sizes, complete source review and publish.',image_url=ev['source_url'],identity_url=ev['identity_page'],source_code='pokemon_official_taiwan_review_required',source_sha256=ev['sha256'],width=ev['width'],height=ev['height'],permission_status='REVIEW_REQUIRED',user_status='Not a manual download')
        elif ref['status']=='reference_http_decoded':
            r.update(category='Working reference',reason='Provider image fetched and fully decoded. No source image bytes retained or new publication performed.',action='Repair the exact provider reference through its approved delivery path.',image_url=ref['image_url'],identity_url=ref['source_url'],source_code='tcgdex',source_sha256=ref['sha256'],width=ref['width'],height=ref['height'],permission_status='delivery_scope_recheck',user_status='Not a manual download')
        elif s['status']=='snapshot_exact_pointer' and b['language_code']=='zh-tw':
            r.update(category='Acquisition gated',reason='Exact metadata image pointer found. Image bytes have not been downloaded or decoded in this run.',action='Record the source acquisition scope, then fetch and verify the exact native card front.',permission_status='REVIEW_REQUIRED',user_status='Not a manual download')
        elif s['status']=='wrong_language_catalogue_candidate':
            r.update(category='Identity review',reason='A Simplified Chinese target matches a Traditional Chinese source name, set and number.',action='Resolve the canonical language/set identity before attaching any image.',source_code='ptcg_metadata_snapshot',identity_url=f"https://github.com/type-null/PTCG-database/blob/90e28f12dde837353c3f4d231edfe236cfe9ba80/{s['conflicting_source_file']}",image_url='')
        elif s['status']=='printed_total_conflict':
            r.update(category='Identity review',reason=f"Catalogue denominator {b['printed_total']} differs from source denominator {s['source_total']}.",action='Verify the printed set size and canonical set identity.',identity_url=f"https://github.com/type-null/PTCG-database/blob/90e28f12dde837353c3f4d231edfe236cfe9ba80/{s['source_file']}")
        elif s['status']=='multiple_image_candidates':
            r.update(category='Artwork choice',reason='Two official images share the same name, set and number.',action='Inspect the printing and finish, then select the supported image.',identity_url=f"https://github.com/type-null/PTCG-database/blob/90e28f12dde837353c3f4d231edfe236cfe9ba80/{s['candidates'][0]['file']}",candidate_images=[x['image'] for x in s['candidates']])
        elif s['status']=='snapshot_name_conflict':
            r.update(category='Identity review',reason='Canonical name differs from exact set/number source: '+', '.join(x['name'] for x in s['candidates']),action='Resolve the card name conflict before selecting artwork.',identity_url=f"https://github.com/type-null/PTCG-database/blob/90e28f12dde837353c3f4d231edfe236cfe9ba80/{s['candidates'][0]['file']}")
        elif s['status']=='snapshot_exact_pointer':
            failure=read(root/f"acquired-{b['language_code']}"/'results'/(pid+'.json'))
            r.update(category='Download failed',reason=failure['error'],action='Find another exact provider image or supply a verified scan.',alternate_image_url=s.get('image_fallback_url',''),permission_status='REVIEW_REQUIRED')
        else:
            r.update(category='Source needed',reason='No exact usable image found in the reviewed source sweep.',action='Locate the exact native-language card front using set, number and card name.')
            if b['language_code']=='ja':r['reason']='No exact image in the pinned official metadata; alternative PokeData and Pokecardex endpoints returned HTTP 403 in this run.'
            if b['language_code']=='ko':r['reason']='TCGdex supplies no usable image and the reviewed snapshot has no Korean source lane.'
            r['identity_url']=ref.get('source_url','')
        rows.append(r)
    assert len(rows)==12161 and len({r['printing_id'] for r in rows})==12161
    categories=['Files prepared','Originals archived','Working reference','Acquisition gated','Source needed','Download failed','Identity review','Artwork choice']
    groups=collections.defaultdict(list)
    for r in rows:groups[(r['language_code'],r['set_code'],r['set_id'])].append(r)
    sets=[]
    for (lang,code,sid),rs in sorted(groups.items()):
        counts=collections.Counter(r['category'] for r in rs)
        sets.append({'language':lang,'set_code':code,'set_id':sid,'set_name':rs[0]['set_native_name'],'set_english_name':rs[0]['set_english_display_name'],'missing':len(rs),**{k:counts[k] for k in categories}})
    counts=collections.Counter(r['category'] for r in rows)
    summary={'at':datetime.now(timezone.utc).isoformat(),'production_project':'oakdbbzdqwurpjnoqhmu','observed_scope':'Published Pokémon printings missing a usable API-manifest artwork association, including same-artwork resolution','source_main_revision':'ac1dcc63684b5dcdecec3ec47c00fcd9009240d2','published_printings':57436,'missing_printings':12161,'sets':len(sets),'categories':dict(counts),'newly_acquired_and_prepared':len(prepared),'prior_prepared':116,'prior_originals_archived':365,'new_derivatives':len(prepared)*3,'newly_published':0,'production_writes':0,'installed_app_rendering':'NOT_TESTED','by_language':{l:dict(collections.Counter(r['category'] for r in rows if r['language_code']==l)) for l in ['en','ja','zh-tw','zh-cn','ko']},'catalogue_versions':{r['language_code']:r['catalogue_version_id'] for r in rows},'source_denominator_complete':True}
    write(out/'card-ledger.json',rows);write(out/'set-ledger.json',sets);write(out/'summary.json',summary)
    write(out/'prepared-cohort.json',list(prepared.values()))
    write(out/'identity-and-artwork-review.json',[r for r in rows if r['category'] in ['Identity review','Artwork choice']])
    write(out/'manual-source-queue.json',[r for r in rows if r['category'] in ['Source needed','Download failed']])
    print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':main()
