import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('src/set-groups.js','utf8').split('function setMark(')[0];
test('future releases remain interest-only despite a premature stock declaration',()=>{
 const clock=Date.parse('2026-11-03T12:00:00Z'),context=vm.createContext({shopReady:true,liveStock:()=>({status:'in_stock',quantity:2}),Date:class extends Date{static now(){return clock;}},Intl});
 vm.runInContext(source,context);context.product={id:'announced',releaseDate:'2026-11-06'};
 assert.equal(vm.runInContext('isProductInStock(product)',context),false);
 assert.equal(vm.runInContext('productIsUpcoming(product,Date.parse("2026-11-06T00:00:00Z"))',context),false);
 assert.match(vm.runInContext('productReleaseLabel(product)',context),/6 November 2026/);
 context.product={id:'released',releaseDate:'2026-11-01'};assert.equal(vm.runInContext('isProductInStock(product)',context),true);
 context.product={id:'month',releaseMonth:'2026-12'};assert.equal(vm.runInContext('isProductInStock(product)',context),false);
});

test('a known set date can be shown without inventing a product-format release or changing stock eligibility',()=>{
 const context=vm.createContext({shopReady:true,liveStock:()=>({status:'in_stock',quantity:1}),setReleaseDates:{'cn-example':{releaseDate:'2023-11-17'}},Intl});
 vm.runInContext(source,context);context.product={id:'older-format',setKey:'cn-example'};
 assert.equal(vm.runInContext('productReleaseLabel(product)',context),'Set release: 17 Nov 2023');
 assert.equal(vm.runInContext('productIsUpcoming(product)',context),false);
 assert.equal(context.product.releaseDate,undefined);
 context.product.releaseDate='2024-01-05';assert.equal(vm.runInContext('productReleaseLabel(product)',context),'Published release: 5 January 2024');
});
