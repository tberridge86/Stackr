// The gateway may emit separate finish rows for the same canonical printing.
// Merge only their explicit variants; never guess identities or merge changed art.
function printingSnapshot(value){
 if(Array.isArray(value))return '['+value.map(printingSnapshot).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+printingSnapshot(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export function mergeCataloguePrinting(previous,next){
 const fail=()=>{throw Error('The catalogue returned conflicting printings. Reopen this binder to retry.');};
 if(!next||typeof next.cardId!=='string'||!next.cardId||!Array.isArray(next.variants))fail();
 if(previous){
  const base=c=>Object.fromEntries(Object.entries(c).filter(([k])=>!['variants','defaultVariantId','updatedAt'].includes(k)));
  if(printingSnapshot(base(previous))!==printingSnapshot(base(next)))fail();
 }
 const variants=new Map();
 for(const variant of [...(previous?.variants||[]),...next.variants]){
  if(!variant||typeof variant.variantId!=='string'||!variant.variantId)fail();
  const seen=variants.get(variant.variantId);
  if(seen&&printingSnapshot(seen)!==printingSnapshot(variant))fail();
  variants.set(variant.variantId,variant);
 }
 const first=previous||next;
 if(first.defaultVariantId&&!variants.has(first.defaultVariantId))fail();
 const updated=[previous?.updatedAt,next.updatedAt].filter(v=>typeof v==='string'&&Number.isFinite(Date.parse(v))).sort((a,b)=>Date.parse(a)-Date.parse(b));
 return {...first,variants:[...variants.values()],...(updated.length?{updatedAt:updated.at(-1)}:{})};
}
export function mergeCataloguePrintings(cards){
 if(!Array.isArray(cards))throw Error('The catalogue checklist is incomplete.');
 const byId=new Map();
 for(const card of cards){const merged=mergeCataloguePrinting(byId.get(card?.cardId),card);byId.set(merged.cardId,merged);}
 return [...byId.values()];
}
