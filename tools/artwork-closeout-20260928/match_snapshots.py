#!/usr/bin/env python3
"""Match pinned metadata only; source pointers do not confer image permission."""
import argparse,json,collections,pathlib,hashlib,subprocess,unicodedata,re
from scan import norm,save,now
PTCG_PIN='90e28f12dde837353c3f4d231edfe236cfe9ba80'
def identity_name(value,language):
    value=norm(value)
    # Regional Japanese names differ only in word spacing across these sources.
    # Symbols, qualifiers and punctuation retain their identity significance.
    return re.sub(r'\s+','',value) if language=='ja' else value
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--workspace',type=pathlib.Path,required=True);args=ap.parse_args()
    ROOT=args.workspace
    rows=json.loads((ROOT/'missing-baseline.json').read_text())
    ptcg=ROOT/'PTCG-metadata';enrepo=ROOT/'PokemonTCG-data'
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ptcg,text=True).strip()==PTCG_PIN
    enrev=subprocess.check_output(['git','rev-parse','HEAD'],cwd=enrepo,text=True).strip()
    indices={}
    target_codes={lang:{r['set_code'] for r in rows if r['language_code']==lang} for lang in ['ja','zh-tw']}
    for lang,folder in [('ja','data_jp'),('zh-tw','data_tc')]:
        ix=collections.defaultdict(list)
        for f in (ptcg/folder).rglob('*.json'):
            b=f.read_bytes();j=json.loads(b)
            if j.get('number') is None or not j.get('img'):continue
            raw_code=str(j.get('set_name',''))
            resolved_code=raw_code
            if lang=='zh-tw':
                compact=re.sub(r'\s+','',raw_code)
                candidates=[c for c in target_codes[lang] if re.fullmatch(re.escape(c)+r'(?:_?F)?(?:@4x)?(?:\.png)?',compact,re.I)]
                exact=[c for c in candidates if c.casefold()==compact.casefold()]
                if len(exact)==1:resolved_code=exact[0]
                elif len(candidates)==1:resolved_code=candidates[0]
            key=(resolved_code,str(j['number']).split('/')[0])
            ix[key].append((j,str(f.relative_to(ptcg)),hashlib.sha256(b).hexdigest()))
        indices[lang]=ix
    en_sets=json.loads((enrepo/'sets/en.json').read_text());en_names=collections.defaultdict(list)
    for s in en_sets:en_names[norm(s['name'])].append(s)
    aliases={'cel25cc':'cel25c','tk-ex-latia':'tk1a','tk-ex-latio':'tk1b','tk-ex-p':'tk2a','tk-ex-m':'tk2b'}
    result=[]
    for row in rows:
        r={**row,'status':'no_snapshot_match','production_writes':0,'exact_finish_verified':False,'artwork_scope':'printing_front'}
        lang=row['language_code'];number=row['collector_number'];code=row['set_code']
        if lang in indices:
            code_aliases={'SM1+':'SM1p','SM2+':'SM2p','SM3+':'SM3p','SM4+':'SM4p'} if lang=='ja' else {}
            lookup_code=code_aliases.get(code,code)
            hits=indices[lang].get((lookup_code,number),[])
            # Collector zeros are presentation only when both sides are all-digits.
            if not hits and number.isdigit():
                hits=[x for (c,n),xs in indices[lang].items() if c==lookup_code and n.isdigit() and int(n)==int(number) for x in xs]
            if lookup_code!=code:
                hits=[x for x in hits if any(norm(row['set_native_name']) in norm(s.get('name','')) for s in x[0].get('sources',[]))]
            target_names={identity_name(row['card_native_name'],lang),identity_name(row['card_english_display_name'],lang)}
            exact=[x for x in hits if identity_name(x[0].get('name'),lang) in target_names]
            name_match_rule='exact_name'
            if not exact and lang=='ja':
                # The official HTML spells the prism symbol as a CSS class, while
                # the pinned metadata serializes it as the literal "prismstar".
                prism_names={n.rstrip('♢◇') for n in target_names}
                exact=[x for x in hits if identity_name(x[0].get('name'),lang).endswith('prismstar') and identity_name(x[0]['name'],lang)[:-9] in prism_names]
                if exact:name_match_rule='prism_symbol_spelling'
            if not exact and lang=='ja' and (code,number) in {('S8b','266'),('S8b','268')}:
                exact=[x for x in hits if re.sub(r'\([^()]+\)$','',identity_name(x[0].get('name'),lang)) in target_names]
                if exact:name_match_rule='reviewed_character_qualifier'
            urls={x[0]['img'] for x in exact}
            if len(urls)==1:
                j,f,h=exact[0]
                source_total=j.get('set_total');target_total=row.get('printed_total')
                same_total=(str(source_total).isdigit() and str(target_total).isdigit() and int(source_total)==int(target_total))
                if source_total not in (None,'',-1,'-1') and target_total and not same_total:
                    r.update(status='printed_total_conflict',source_total=source_total,source_file=f)
                else:
                    r.update(status='snapshot_exact_pointer',image_url=j['img'],identity_url=j.get('url'),source_name=j['name'],source_set=lookup_code,source_number=j['number'],source_total=source_total,source_file=f,source_file_sha256=h,source_repository='type-null/PTCG-database',source_revision=PTCG_PIN,source_code='pokemon_card_jp_official' if lang=='ja' else 'pokemon_official_taiwan_review_required',permission_status='existing_source_recheck' if lang=='ja' else 'REVIEW_REQUIRED',set_alias_evidence=j.get('sources') if lookup_code!=code else None)
                    r['name_match_rule']=name_match_rule
            elif len(urls)>1:r.update(status='multiple_image_candidates',candidates=[{'image':x[0]['img'],'name':x[0]['name'],'file':x[1]} for x in exact])
            elif hits:r.update(status='snapshot_name_conflict',candidates=[{'name':x[0].get('name'),'file':x[1]} for x in hits])
        elif lang=='en':
            matches=en_names.get(norm(row['set_native_name']),[])
            sameid=[s for s in en_sets if s['id']==code]
            mapped=[s for s in en_sets if s['id']==aliases.get(code)]
            sets=matches or sameid or mapped
            if len(sets)==1:
                s=sets[0];f=enrepo/'cards/en'/(s['id']+'.json')
                if f.exists():
                    b=f.read_bytes();cards=json.loads(b)
                    hits=[c for c in cards if str(c.get('number'))==number]
                    exact=[c for c in hits if norm(c.get('name')) in {norm(row['card_native_name']),norm(row['card_english_display_name'])}]
                    if len(exact)==1:
                        c=exact[0];url=c.get('images',{}).get('large')
                        if url:r.update(status='snapshot_exact_pointer',image_url=url,image_fallback_url=c.get('images',{}).get('small'),source_name=c['name'],source_set=s['id'],source_set_name=s['name'],source_number=c['number'],provider_id=c['id'],source_file=str(f.relative_to(enrepo)),source_file_sha256=hashlib.sha256(b).hexdigest(),source_repository='PokemonTCG/pokemon-tcg-data',source_revision=enrev,source_code='pokemon_tcg_api',permission_status='REVIEW_REQUIRED')
                    elif hits:r.update(status='snapshot_name_or_number_conflict',candidates=[{'id':c['id'],'name':c['name'],'number':c['number']} for c in hits])
        elif lang=='zh-cn':
            hits=indices['zh-tw'].get((code,number),[])
            exact=[x for x in hits if norm(x[0].get('name'))==norm(row['card_native_name'])]
            if exact:r.update(status='wrong_language_catalogue_candidate',conflicting_source_language='zh-tw',conflicting_source_name=exact[0][0]['name'],conflicting_source_file=exact[0][1])
        result.append(r)
    save(ROOT/'snapshot-matches.json',result)
    summary={'at':now(),'snapshot_revision':PTCG_PIN,'english_revision':enrev,'counts':dict(collections.Counter(r['status'] for r in result)),'by_language':{l:dict(collections.Counter(r['status'] for r in result if r['language_code']==l)) for l in ['en','ja','zh-tw','zh-cn','ko']}}
    save(ROOT/'snapshot-summary.json',summary);print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':main()
