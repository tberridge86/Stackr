import importlib.util,zipfile,copy
from pathlib import Path
spec=importlib.util.spec_from_file_location('bulba_download',Path(__file__).with_name('download-package.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=m.load_plan();allfiles=[*p['objects'],*p['archive_metadata']]
def entries():
 out=[]
 for o in allfiles:
  i=zipfile.ZipInfo(o['file']);i.file_size=o['byte_size'];i.external_attr=0o100644<<16;out.append(i)
 return out
m.validate_entries(entries(),p);cases=1
for name,mutate in [('missing',lambda e:e.pop()),('duplicate',lambda e:e.__setitem__(0,copy.copy(e[1]))),('extra',lambda e:e.append(zipfile.ZipInfo('raw.html'))),('traversal',lambda e:setattr(e[0],'filename','../manifest.json')),('absolute',lambda e:setattr(e[0],'filename','/manifest.json')),('windows',lambda e:setattr(e[0],'filename','C:/secret')),('symlink',lambda e:setattr(e[0],'external_attr',0o120777<<16)),('encrypted',lambda e:setattr(e[0],'flag_bits',1)),('size',lambda e:setattr(e[0],'file_size',2)),('empty',lambda e:setattr(e[0],'file_size',0)),('expanded',lambda e:setattr(e[0],'file_size',2000000))]:
 e=entries();mutate(e)
 try:m.validate_entries(e,p)
 except ValueError:cases+=1;continue
 raise AssertionError('Accepted '+name)
print(__import__('json').dumps({'status':'PASS','cases':cases,'negativeCases':cases-1,'providerRequests':0}))
