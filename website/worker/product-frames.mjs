/** Validate source-bound display geometry before it can enter storefront markup. */
export function validateProductFrame(mask,sha,width,height,label='product'){
 if(!mask)return null;
 const b=mask.bounds,w=mask.sourceWidth,h=mask.sourceHeight;
 const fail=()=>{throw Error('Invalid or stale product display cutout '+label);};
 if(mask.sourceSha256!==sha||w!==width||h!==height||!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||!b||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0||b.x<0||b.y<0||b.x+b.width>w+.01||b.y+b.height>h+.01||!Array.isArray(mask.polygon)||mask.polygon.length<4||mask.polygon.length>32||mask.polygon.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||point[0]<0||point[0]>w||point[1]<0||point[1]>h))fail();
 if(mask.outlinePath!==undefined){
  const value=mask.outlinePath;
  if(typeof value!=='string'||!value.length||value.length>50000||!/^[MLZ0-9eE+.,\s-]+$/.test(value))fail();
  const pattern=/[MLZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g,tokens=value.match(pattern);
  if(!tokens||value.replace(pattern,'').replace(/[\s,]/g,''))fail();
  let open=false,points=0,total=0,parts=0;
  for(let i=0;i<tokens.length;){
   const command=tokens[i++];
   if(command==='Z'){if(!open||points<3)fail();open=false;continue;}
   if(command!=='M'&&command!=='L'||command==='M'&&open||command==='L'&&!open)fail();
   const x=Number(tokens[i++]),y=Number(tokens[i++]);
   if(!Number.isFinite(x)||!Number.isFinite(y)||x<b.x-.01||x>b.x+b.width+.01||y<b.y-.01||y>b.y+b.height+.01)fail();
   if(command==='M'){open=true;points=0;if(++parts>32)fail();}
   points++;if(++total>4096)fail();
  }
  if(open||!parts)fail();
 }
 return mask;
}
