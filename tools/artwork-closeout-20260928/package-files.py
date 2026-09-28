#!/usr/bin/env python3
"""Preserve verified local bytes in bounded downloadable archives; no uploads."""
import argparse,json,zipfile,hashlib,collections
from pathlib import Path
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--workspace',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);a=ap.parse_args();root=a.workspace;out=a.output;out.mkdir(parents=True,exist_ok=True)
    packages=[];locations={};allrows={}
    for lang,label in [('ja','Japanese'),('en','English')]:
        rows=json.loads((root/f'prepared-{lang}/manifest.json').read_text());allrows[lang]=rows
        groups=collections.defaultdict(list)
        for r in rows:groups[r['set_code']].append(r)
        chunks=[[]];size=0
        for _,rs in groups.items():
            n=sum(r['byte_size'] for r in rs)
            if size and size+n>450*1024*1024:chunks.append([]);size=0
            chunks[-1].extend(rs);size+=n
        for i,rs in enumerate(chunks,1):
            filename=f'Stackr_{label}_Originals_{i:02d}_2026-09-28.zip';p=out/filename;manifest=[]
            with zipfile.ZipFile(p,'w',compression=zipfile.ZIP_STORED) as z:
                for r in rs:
                    source=root/f'acquired-{lang}'/r['image_file']
                    if sha(source)!=r['sha256']:raise ValueError('Source image hash changed')
                    rel=f"originals/{lang}/{r['set_code']}/{r['collector_number']}{source.suffix}"
                    if '..' in Path(rel).parts:raise ValueError('Unsafe image name')
                    z.write(source,rel);manifest.append({**r,'archive_image_file':rel});locations[r['printing_id']]={'archive':filename,'image_file':rel}
                z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2))
                z.writestr('README.txt','Stackr private artwork recovery, 28 September 2026.\nExact printing fronts, not certification of foil or reverse finish.\nFiles verified and prepared; NOT PUBLISHED. Source and release review still apply.\nThe manifest binds each image to the current language, set, collector number and printing ID.\n')
            packages.append({'filename':filename,'kind':'verified_originals','language':lang,'printings':len(rs),'bytes':p.stat().st_size,'sha256':sha(p),'sets':sorted({r['set_code'] for r in rs})});print(json.dumps(packages[-1]),flush=True)
    p=out/'Stackr_Display_Images_2026-09-28.zip'
    with zipfile.ZipFile(p,'w',compression=zipfile.ZIP_STORED) as z:
        for lang,rows in allrows.items():
            for r in rows:
                for d in r['derivatives']:
                    f=root/f'prepared-{lang}'/d['file']
                    if sha(f)!=d['sha256']:raise ValueError('Derivative image hash changed')
                    z.write(f,f'prepared-{lang}/'+d['file'])
            z.write(root/f'prepared-{lang}/manifest.json',f'prepared-{lang}/manifest.json')
            z.write(root/f'prepared-{lang}/summary.json',f'prepared-{lang}/summary.json')
        z.writestr('original-locations.json',json.dumps(locations,indent=2))
        z.writestr('README.txt','6,399 verified WebP display images for 2,133 printing fronts.\ncard-grid: 240px, search-result: 96px, detail-page: up to 720px. No image was enlarged.\nPrepared only. NOT PUBLISHED. Full original locations are in original-locations.json.\nEncoder versions and image hashes are preserved in each language manifest.\n')
    packages.append({'filename':p.name,'kind':'display_images','printings':sum(len(v) for v in allrows.values()),'image_files':sum(len(v)*3 for v in allrows.values()),'bytes':p.stat().st_size,'sha256':sha(p)})
    (out/'evidence/package-index.json').write_text(json.dumps(packages,indent=2));(out/'evidence/original-locations.json').write_text(json.dumps(locations,indent=2));print(json.dumps(packages[-1]),flush=True)
if __name__=='__main__':main()
