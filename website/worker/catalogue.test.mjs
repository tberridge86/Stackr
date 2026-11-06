import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const products=JSON.parse(await readFile('src/products.json','utf8'));
const highlights=JSON.parse(await readFile('src/set-highlights.json','utf8'));
const logos=JSON.parse(await readFile('src/set-logos.json','utf8'));
const sets=[...new Set(products.map(p=>p.setKey))].filter(key=>key!=='collections');

test('every actual expansion has exactly three distinct, sourced, exact-language chase cards',()=>{
 for(const key of sets){
  const p=products.find(p=>p.setKey===key),entry=highlights.sets[key];
  assert(entry,key+' is missing');assert.equal(entry.language,p.language,key+' language');assert.equal(entry.cards.length,3,key+' card count');
  assert.equal(new Set(entry.cards.map(c=>c.id)).size,3,key+' duplicate ID');assert.equal(new Set(entry.cards.map(c=>c.collectorNumber)).size,3,key+' duplicate printing');
  assert(entry.sourceUrls?.some(url=>url.startsWith('https://')),key+' set provenance');
  for(const card of entry.cards){
   assert.equal(card.language,p.language,card.id+' native language');assert(card.name&&card.collectorNumber,card.id+' identity');
   assert.match(card.imageSha256,/^[a-f0-9]{64}$/);
   assert.notEqual(card.displayImagePending,true,card.id+' must have visible artwork');
   assert.equal(card.imageVerified,true,card.id+' image verification');assert.match(card.image,/^https:\/\//);
   assert(card.imageWidth>0&&card.imageHeight>0,card.id+' image dimensions');assert(card.sourceUrl?.startsWith('https://'),card.id+' source');
   assert(!card.localOriginal&&!card.downloadedOriginal,card.id+' internal source path');
  }
 }
 assert.equal(highlights.sets.collections?.cards?.length||0,0,'A mixed product category is not one expansion');
});
test('chase artwork cannot repeat one face for different picks, and local originals retain their pinned bytes',async()=>{
 const languages=new Map();
 for(const key of sets){
  const cards=highlights.sets[key].cards;
  assert.equal(new Set(cards.map(card=>card.imageSha256+'\n'+JSON.stringify(card.crop||null))).size,3,key+' must show three different faces');
  for(const card of cards){
   if(languages.has(card.imageSha256))assert.equal(languages.get(card.imageSha256),card.language,card.id+' must not reuse another language');
   languages.set(card.imageSha256,card.language);
   if(card.crop){const c=card.crop;assert.equal(c.sourceWidth,card.imageWidth);assert.equal(c.sourceHeight,card.imageHeight);assert(c.x>=0&&c.y>=0&&c.width>0&&c.height>0&&c.x+c.width<=c.sourceWidth&&c.y+c.height<=c.sourceHeight);if(c.sourceSha256)assert.equal(c.sourceSha256,card.imageSha256);}
   if(card.imageFile)assert.equal(createHash('sha256').update(await readFile('src/assets/'+card.imageFile)).digest('hex'),card.imageSha256,card.id+' original bytes');
  }
 }
 for(const id of ['ko-BS2022014110','ko-BS2022001247','ko-S7R-074']){
  const card=Object.values(highlights.sets).flatMap(entry=>entry.cards||[]).find(card=>card.id===id);assert(card.imageFile);assert.equal(card.watermarked,false);assert.equal(card.displayImagePending,false);
 }
});
test('every actual expansion has an original language-matched set logo with pinned bytes',async()=>{
 for(const key of sets){
  const logo=logos.logos[key],p=products.find(p=>p.setKey===key);assert(logo,key+' missing logo');assert.equal(logo.language,p.language,key+' logo language');
  const bytes=await readFile('src/assets/'+logo.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),logo.sha256,key+' logo bytes');
  if(logo.crop){const c=logo.crop;assert(c.x>=0&&c.y>=0&&c.width>0&&c.height>0&&c.x+c.width<=c.sourceWidth&&c.y+c.height<=c.sourceHeight,key+' logo viewport');}
  if(logo.language==='Korean'&&key!=='ko-shiny-treasure-ex'){
   const mask=logo.logoIsolation;assert(mask,key+' Korean panel isolation');assert.equal(mask.sourceSha256,logo.sha256);assert.equal(mask.sourceWidth,logo.width);assert.equal(mask.sourceHeight,logo.height);
   assert.match(mask.path,/^M/);const b=mask.bounds;assert(b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=logo.width&&b.y+b.height<=logo.height,key+' isolation bounds');
  }
 }
});

test('Rayquaza leads Delta Reign and both Storm Emeralda editions with durable exact-language art',()=>{
 for(const [key,number,language] of [['delta-reign','138/103','English'],['jp-storm-emeralda','110/076','Japanese'],['ko-storm-emeralda','110/076','Korean']]){
  const first=highlights.sets[key].cards[0];assert.equal(first.collectorNumber,number);assert.equal(first.language,language);assert.match(first.name,/Rayquaza|레쿠쟈/);assert.equal(first.displayImagePending,false);
 }
 for(const [key,number] of [['delta-reign','138/103'],['delta-reign','139/103'],['jp-storm-emeralda','110/076']])assert(highlights.sets[key].cards.find(card=>card.collectorNumber===number).imageFile,key+' must retain an independent original');
 assert(highlights.sets['jp-storm-emeralda'].cards.some(card=>card.collectorNumber==='113/076'),'The gold MUR remains a distinct chase');
});
