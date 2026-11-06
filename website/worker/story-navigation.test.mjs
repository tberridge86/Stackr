import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/story-navigation.js','utf8'),key='stackr-story-return-v1',now=Date.parse('2026-11-03T08:00:00Z');
const snapshot={query:'crystal',language:'Japanese',category:'Boxes',setKey:'crystal',view:'sets',scrollY:1620,openSets:['crystal'],priceRange:'all'};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture({referrer='',saved,initial=null,pathname='/',unavailableStorage=false,rememberError=false,restoreError=false}={}){
 const values=new Map(saved===undefined?[]:[[key,typeof saved==='string'?saved:JSON.stringify(saved)]]),calls=[],restored=[],listeners={},removed=[];
 const history={state:{stackrBrowse:{query:'before capture'}}};
 const document={referrer,addEventListener(type,fn){listeners[type]=fn;}};
 const sessionStorage={getItem(name){if(unavailableStorage)throw Error('Storage blocked');return values.get(name)||null;},setItem(name,value){if(unavailableStorage)throw Error('Storage blocked');values.set(name,value);},removeItem(name){if(unavailableStorage)throw Error('Storage blocked');removed.push(name);values.delete(name);}};
 const context=vm.createContext({URL,Date:{now:()=>now},document,location:{origin:'https://stackr.test',href:'https://stackr.test'+pathname,pathname},history,sessionStorage,initialBrowseSnapshot:initial,rememberBrowseContext(force){calls.push(force);if(rememberError)throw Error('Capture failed');history.state.stackrBrowse=clone(snapshot);},restoreBrowseContext(raw){if(restoreError)throw Error('Restore failed');restored.push(clone(raw));}});
 vm.runInContext(source,context);
 function click({href='/history',resolved,target='',download=false,notALink=false,...eventOptions}={}){
  const link={href:resolved||'https://stackr.test'+href,getAttribute:name=>name==='href'?href:name==='target'?target:null,hasAttribute:name=>name==='download'&&download};
  const event={button:0,defaultPrevented:false,preventDefault(){assert.fail('story links must keep their native navigation');},target:{closest:()=>notALink?null:link},...eventOptions};
  assert.doesNotThrow(()=>listeners.click?.(event));return event;
 }
 return {values,calls,restored,listeners,removed,history,click};
}

test('same-tab story links capture the live catalogue context without intercepting navigation',()=>{
 for(const href of ['/about','/history']){const e=fixture();e.click({href});assert.deepEqual(e.calls,[true]);assert.deepEqual(JSON.parse(e.values.get(key)),{savedAt:now,browse:snapshot});}
});

test('modifier, middle-button, new-window, download and previously handled clicks leave context untouched',()=>{
 for(const options of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{button:2},{target:'_blank'},{target:'another-window'},{download:true},{defaultPrevented:true},{notALink:true}]){const e=fixture();e.click(options);assert.deepEqual(e.calls,[],JSON.stringify(options));assert.equal(e.values.has(key),false);}
 const self=fixture();self.click({target:'_SELF'});assert.deepEqual(self.calls,[true]);
});

test('foreign destinations and non-shop pages cannot save catalogue context',()=>{
 const e=fixture();e.click({resolved:'https://elsewhere.example/history'});assert.deepEqual(e.calls,[]);assert.equal(e.values.has(key),false);
 const about=fixture({pathname:'/about'});assert.equal(about.listeners.click,undefined);
});

test('same-origin story returns and route aliases restore and consume a recent snapshot',()=>{
 for(const path of ['/about','/about/','/about.html','/history','/history/','/history.html']){const e=fixture({referrer:'https://stackr.test'+path,saved:{savedAt:now-5000,browse:snapshot}});assert.deepEqual(e.restored,[snapshot],path);assert.equal(e.values.has(key),false);assert.deepEqual(e.removed,[key]);}
 const index=fixture({pathname:'/index.html',referrer:'https://stackr.test/history',saved:{savedAt:now,browse:snapshot}});assert.deepEqual(index.restored,[snapshot]);
});

test('normal Back history takes priority over a session copy',()=>{
 const e=fixture({referrer:'https://stackr.test/about',initial:{query:'existing history entry'},saved:{savedAt:now,browse:snapshot}});assert.deepEqual(e.restored,[]);assert.equal(e.values.has(key),true);
});

test('foreign, unrelated and missing referrers do not apply or expose a saved catalogue',()=>{
 for(const referrer of ['https://elsewhere.example/history','https://stackr.test/api/history','https://stackr.test/','https://stackr.test/history-elsewhere','']){const e=fixture({referrer,saved:{savedAt:now,browse:snapshot}});assert.deepEqual(e.restored,[],referrer);assert.equal(e.values.has(key),true);}
});

test('expired, future and malformed saved entries are discarded without restoring',()=>{
 for(const saved of [{savedAt:now-7200001,browse:snapshot},{savedAt:now+1,browse:snapshot},{savedAt:String(now),browse:snapshot},{savedAt:null,browse:snapshot},{savedAt:now,browse:null},{savedAt:now,browse:[]},'not JSON','null']){const e=fixture({referrer:'https://stackr.test/history',saved});assert.deepEqual(e.restored,[],JSON.stringify(saved));assert.equal(e.values.has(key),false,JSON.stringify(saved));}
 const limit=fixture({referrer:'https://stackr.test/about',saved:{savedAt:now-7200000,browse:snapshot}});assert.deepEqual(limit.restored,[snapshot]);
});

test('blocked storage and capture or restoration errors preserve ordinary page behaviour',()=>{
 const blocked=fixture({unavailableStorage:true});blocked.click();assert.deepEqual(blocked.restored,[]);
 const capture=fixture({rememberError:true});capture.click();assert.equal(capture.values.has(key),false);
 const restore=fixture({referrer:'https://stackr.test/about',saved:{savedAt:now,browse:snapshot},restoreError:true});assert.equal(restore.values.has(key),false);
});

test('restoration passes the snapshot to the existing browse validator instead of trusting its filter fields',()=>{
 const raw={...snapshot,language:'invented',category:'malformed',scrollY:-50};const e=fixture({referrer:'https://stackr.test/history',saved:{savedAt:now,browse:raw}});assert.deepEqual(e.restored,[raw]);
 const rules=vm.runInNewContext(fs.readFileSync('src/browse-context.js','utf8')+';browseContext');
 const checked=rules.snapshot(e.restored[0],{categories:['All','Boxes'],languages:['all','Japanese'],sets:['all','crystal']});assert.equal(checked.language,'all');assert.equal(checked.category,'All');assert.equal(checked.scrollY,0);assert.equal(checked.query,'crystal');
});
