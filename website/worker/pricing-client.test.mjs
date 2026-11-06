import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createPriceService, STALE_MS} from './pricing.mjs';
const start=Date.parse('2026-11-02T22:00:00Z');let clock=start;
const product={id:'black',language:'Korean',setKey:'ko-black-bolt',type:'Booster box',packs:20,unit:'1 retail unit',edition:'standard',cardsPerPack:7};
const identity={...product};delete identity.id;
const descriptor={id:'retailer',name:'Example UK',url:'https://retailer.example/black',format:'jsonld',country:'GB',currency:'GBP',identity,match:{titles:['Black Bolt Korean Booster Box'],requiredText:['20 booster packs','7 cards','Korean']}};
const feed=await createPriceService({products:[product],sources:{black:[descriptor]},seedQuotes:[{productId:'black',sourceId:'retailer',currency:'GBP',identity,marketPence:3995,observedAt:new Date(start).toISOString()}],now:()=>start}).getSnapshot();
const source=await readFile('src/live-pricing.js','utf8');
class Clock extends Date{static now(){return clock;}}
function client(value=feed){
 const context=vm.createContext({pricingBootstrap:structuredClone(feed),Date:Clock,Intl,URL,value:structuredClone(value),product});
 vm.runInContext(source+';priceFeed=value;',context);
 return ()=>vm.runInContext('currentQuote(product)',context);
}

test('client accepts only exact weekly 10% quotes and rejects wrong pricing policy or printing',()=>{
 clock=start;const accepted=client()();assert.equal(accepted.shopPence,3596);
 for(const change of [
  data=>{data.discountBps=1500;},
  data=>{data.products.black.shopPence=3396;},
  data=>{data.products.black.identity.language='Japanese';},
  data=>{data.products.black.identity.cardsPerPack=10;},
  data=>{data.products.black.sources[0].url='https://unconfigured.example/another-box';},
  data=>{data.products.black.sources[0].marketPence=4995;},
 ]){const invalid=structuredClone(feed);change(invalid);assert.equal(client(invalid)(),null);}
 clock=start+STALE_MS-1;assert(client()());clock++;assert.equal(client()(),null,'A quote must expire at seven days, without extending its checked date');clock=start;
});
