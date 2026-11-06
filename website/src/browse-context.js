/* Search and browse-state rules. Native names and numeric identifiers remain exact. */
const browseContext={
 normalise(value){return String(value??'').normalize('NFKC').toLocaleLowerCase('en-GB').replace(/pokémon/g,'pokemon').replace(/[^\p{L}\p{N}]+/gu,' ').trim();},
 distance(a,b,limit=2){
  if(Math.abs(a.length-b.length)>limit)return limit+1;
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const current=[i];for(let j=1;j<=b.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));previous=current;}
  return previous[b.length];
 },
 rank(product,value,aliases=''){
  const query=this.normalise(value);if(!query)return 0;
  const names=[product.name,product.setName,product.nativeName,product.reference,product.collectorNumber,product.name+' '+product.type].filter(Boolean).map(name=>this.normalise(name));
  if(names.some(name=>name===query))return 0;
  const text=this.normalise(['pokemon',...names,product.type,product.series,product.category,product.edition,product.language,aliases,product.packs===undefined?'':product.packs+' packs'].filter(Boolean).join(' '));
  const words=text.split(' ');let score=names.some(name=>name.startsWith(query))?1:3;
  for(const term of query.split(' ')){
   if(words.includes(term))continue;
   if(!/^\d+$/.test(term)&&words.some(word=>word.startsWith(term))){score+=1;continue;}
   if(!/^\d+$/.test(term)&&words.some(word=>word.includes(term))){score+=2;continue;}
   // Correct small Latin spelling errors only; never silently alter numbers or scripts.
   if(!/^[a-z]{4,}$/.test(term))return null;
   const limit=term.length>=8?2:1;
   let best=limit+1;for(const word of words)if(/^[a-z]{4,}$/.test(word))best=Math.min(best,this.distance(term,word,limit));
   if(best>limit)return null;score+=5+best;
  }
  return score;
 },
 inBudget(pence,range){return range==='all'||Number.isInteger(pence)&&((range==='under25'&&pence<2500)||(range==='25to75'&&pence>=2500&&pence<=7500)||(range==='over75'&&pence>7500));},
 snapshot(raw,allowed){
  if(!raw||typeof raw!=='object')return null;
  const pick=(key,values,fallback)=>values.includes(raw[key])?raw[key]:fallback;
  return {query:typeof raw.query==='string'?raw.query.slice(0,300):'',category:pick('category',allowed.categories,'All'),setKey:pick('setKey',allowed.sets,'all'),language:pick('language',allowed.languages,allowed.languages.includes('English')?'English':'all'),availability:pick('availability',['all','in_stock','out_of_stock','unknown'],'all'),priceRange:pick('priceRange',['all','under25','25to75','over75'],'all'),sort:pick('sort',['featured','low','high','name'],'featured'),onlySaved:raw.onlySaved===true,view:pick('view',['sets','products'],'sets'),scrollY:Number.isFinite(raw.scrollY)?Math.max(0,raw.scrollY):0,productLimit:Number.isInteger(raw.productLimit)?Math.max(24,Math.min(raw.productLimit,1000)):24,setLimit:Number.isInteger(raw.setLimit)?Math.max(24,Math.min(raw.setLimit,1000)):24,openSets:Array.isArray(raw.openSets)?raw.openSets.filter(key=>allowed.sets.includes(key)):[],focusProduct:typeof raw.focusProduct==='string'?raw.focusProduct:null};
 }
};
