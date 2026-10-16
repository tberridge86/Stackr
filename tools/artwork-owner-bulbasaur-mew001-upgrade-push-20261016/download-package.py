"""Exact already-uploaded Bulbasaur package. No artwork-provider requests or uploads."""
import argparse,hashlib,json,shutil,subprocess,zipfile
from pathlib import Path,PurePosixPath
PLAN_SHA='891fb5e775ecc65878bed46ed196d8b6c1d7d8e8803d69034f2b5e6abc0b001a'
METADATA={'manifest.json','reviewed-supersession.json','source-evidence.json','derivative-specifications.json'}
def load_plan():
 b=Path(__file__).with_name('plan.json').read_bytes()
 if hashlib.sha256(b).hexdigest()!=PLAN_SHA:raise ValueError('Frozen plan changed')
 p=json.loads(b)
 if p['archive']['id']!=647979461 or p['archive']['file_count']!=8 or len(p['objects'])!=4:raise ValueError('Wrong finite package')
 return p

def validate_entries(entries,plan):
 expected={o['file']:o for o in plan['objects']}
 metadata={m['file']:m for m in plan['archive_metadata']}
 if set(metadata)!=METADATA:raise ValueError('Metadata scope changed')
 names=[i.filename for i in entries]
 if len(names)!=8 or len(set(names))!=8 or set(names)!=set(expected)|METADATA:raise ValueError('Unexpected or duplicate entries')
 if sum(i.file_size for i in entries)>1000000:raise ValueError('Expanded archive bound')
 for i in entries:
  parts=PurePosixPath(i.filename).parts;mode=(i.external_attr>>16)&0o170000
  if not parts or PurePosixPath(i.filename).is_absolute() or '..' in parts or '\\' in i.filename or ':' in i.filename or i.is_dir() or mode not in(0,0o100000) or i.flag_bits&1:raise ValueError('Unsafe archive entry')
  target=expected.get(i.filename) or metadata[i.filename]
  if i.file_size!=target['byte_size'] or not 0<i.file_size<1000000:raise ValueError('Member size changed')

def extract(archive,target,plan=None):
 p=plan or load_plan();a=p['archive'];data=archive.read_bytes()
 if len(data)!=a['byte_size'] or hashlib.sha256(data).hexdigest()!=a['sha256']:raise ValueError('Archive bytes changed')
 if target.is_symlink():raise ValueError('Unsafe extraction root')
 target.mkdir(parents=True,exist_ok=True);resolved=target.resolve();objects={o['file']:o for o in p['objects']};metadata={m['file']:m for m in p['archive_metadata']}
 with zipfile.ZipFile(archive)as z:
  entries=z.infolist();validate_entries(entries,p)
  if z.testzip()is not None:raise ValueError('Archive CRC failure')
  for i in entries:
   dest=target/i.filename
   if dest.is_symlink()or not dest.resolve().is_relative_to(resolved):raise ValueError('Extraction path escaped')
   b=z.read(i);expected=objects.get(i.filename)or metadata[i.filename]
   if len(b)!=expected['byte_size']or hashlib.sha256(b).hexdigest()!=expected['sha256']:raise ValueError('Frozen member changed')
  for i in entries:
   dest=target/i.filename;dest.parent.mkdir(parents=True,exist_ok=True);temp=dest.with_name(dest.name+'.partial')
   if temp.is_symlink():raise ValueError('Unsafe temporary path')
   with z.open(i)as src,temp.open('wb')as out:shutil.copyfileobj(src,out,65536)
   temp.replace(dest)

def download(root,local_archive=None):
 p=load_plan();a=p['archive'];root.mkdir(parents=True,exist_ok=True);archive=Path(local_archive)if local_archive else root/(str(a['id'])+'.zip')
 if not archive.exists():
  if local_archive:raise ValueError('Local archive missing')
  partial=archive.with_suffix('.partial')
  with partial.open('wb')as out:subprocess.run(['gh','api','repos/tberridge86/Stackr/releases/assets/'+str(a['id']),'-H','Accept: application/octet-stream'],stdout=out,check=True,timeout=52)
  partial.replace(archive)
 extract(archive,root/str(a['id']),p)
 return{'asset_id':a['id'],'sha256':a['sha256'],'bytes':a['byte_size'],'files':8,'provider_requests':0,'status':'verified_and_extracted'}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('packages',type=Path);parser.add_argument('--archive',type=Path);args=parser.parse_args();print(json.dumps(download(args.packages,args.archive)))
