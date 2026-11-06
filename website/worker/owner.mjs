// Owner-only business records. Every financial amount is integer GBP pence.
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie, Origin'};
const KINDS=['purchase','expense','income','sale','supplier_credit','sales_refund'];
const INCOME=new Set(['income','sale','supplier_credit']);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const safeText=(v,max=500)=>{if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))throw fail('Invalid text field.');return v.trim();};
const date=v=>{if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw fail('Use a valid date.');return v;};
const integer=(v,max=1000000000)=>{if(!Number.isSafeInteger(v)||v<0||v>max)throw fail('Amounts must be whole pence and quantities whole units.');return v;};
function owner(request,env){const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();return id&&id.length<=200&&!/[\x00-\x20\x7f]/.test(id)&&email&&env.SHOP_OWNER_EMAIL?.trim().toLowerCase()===email?id:null;}
function csvCell(value){let s=String(value??'');if(/^[\s\u0000-\u001f]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function csvResponse(rows,name){return new Response('\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n',{headers:{...HEADERS,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+name+'"'}});}
export function parseStockCsv(text){
 if(typeof text!=='string'||text.length>200000)throw fail('CSV is too large. Use at most 500 rows.');
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 text=text.replace(/^\ufeff/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'&&!cell&&!closed){quoted=true;continue;}if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];}continue;}
  if(c==='"'||closed)throw fail('Malformed CSV. Use the downloaded template.');cell+=c;
 }
 if(quoted)throw fail('Unclosed quoted CSV cell.');if(cell||row.length){row.push(cell);rows.push(row);}
 if(rows.length<2||rows.length>501||rows[0].join(',')!=='product_id,quantity,note')throw fail('CSV needs product_id,quantity,note headers and 1–500 rows.');
 const picked=rows.slice(1).filter(r=>r.length!==3||r[1].trim()!=='');if(!picked.length)throw fail('Enter at least one quantity.');return picked.map(r=>{if(r.length!==3||!/^\d{1,6}$/.test(r[1].trim()))throw fail('Every row needs an exact product ID and a whole quantity.');return {productId:r[0].trim(),quantity:integer(Number(r[1]),999999),note:safeText(r[2])};});
}
async function body(request){
 if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw fail('Same-origin request required.',403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))throw fail('JSON required.',415);
 if(Number(request.headers.get('Content-Length')||0)>250000)throw fail('Request too large.',413);
 const reader=request.body?.getReader();if(!reader)throw fail('Missing request.');let n=0;const parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>250000){await reader.cancel();throw fail('Request too large.',413);}parts.push(value);}}finally{reader.releaseLock();}
 let data;try{const b=new Uint8Array(n);let off=0;for(const p of parts){b.set(p,off);off+=p.length;}data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}catch{throw fail('Invalid JSON.');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw fail('Invalid request.');return data;
}
export function createOwnerService({products,getPrices,now=Date.now}){
 const catalogue=new Map(products.map(p=>[p.id,p]));
 const known=id=>{if(!catalogue.has(id))throw fail('Unknown product ID.');return id;};
 const stamp=()=>new Date(now()).toISOString();
 const all=async stmt=>{const r=await stmt.all();if(!r?.success||!Array.isArray(r.results))throw Error('read');return r.results;};
 const settings=async db=>await db.prepare('SELECT * FROM owner_settings WHERE id=1').first()||{vat_status:'unknown',vat_number:'',sales_vat_bps:null};
 async function action(db,id,payload,user,statements){
  if(!uuid(id))throw fail('A valid action ID is required.');const serial=JSON.stringify(payload);
  const replay=async()=>{const old=await db.prepare('SELECT payload FROM owner_actions WHERE id=?').bind(id).first();if(old){if(old.payload!==serial)throw fail('Action ID already used for different data.',409);return true;}return false;};
  if(await replay())return true;
  try{const r=await db.batch([db.prepare('INSERT INTO owner_actions(id,payload,created_at,user_id) VALUES(?,?,?,?)').bind(id,serial,stamp(),user),...statements]);if(!Array.isArray(r)||r.some(v=>!v?.success))throw Error('write');}
  catch(e){if(await replay())return true;throw e;}return false;
 }
 function entry(data){
  const e={kind:data.kind,entryDate:date(data.entryDate),paidDate:data.paidDate?date(data.paidDate):null,counterparty:safeText(data.counterparty,200),reference:safeText(data.reference,200),category:safeText(data.category,100),documentRef:safeText(data.documentRef,1000),note:safeText(data.note),productId:null,quantity:0,netPence:integer(data.netPence),vatPence:integer(data.vatPence)};
  if(!KINDS.includes(e.kind)||!e.counterparty||!e.reference)throw fail('Choose a record type and supply the name and invoice/reference.');
  e.grossPence=e.netPence+e.vatPence;if(!e.grossPence||e.grossPence>1000000000)throw fail('Invalid invoice total.');
  if(['purchase','sale'].includes(e.kind)){e.productId=known(data.productId);e.quantity=integer(data.quantity,999999);if(!e.quantity)throw fail('Enter a positive quantity.');}
  e.relatedEntryId=null;if(['supplier_credit','sales_refund'].includes(e.kind)){if(!uuid(data.relatedEntryId))throw fail('Choose the original purchase or manual sale for this credit/refund.');e.relatedEntryId=data.relatedEntryId;}return e;
 }
 async function stockRows(db,items){
  const seen=new Set(),result=[];
  for(const i of items){known(i.productId);if(seen.has(i.productId))throw fail('Duplicate product in CSV.');seen.add(i.productId);
   const s=await db.prepare('SELECT status,quantity,note,updated_at FROM shop_inventory WHERE product_id=?').bind(i.productId).first();
   result.push({...i,name:catalogue.get(i.productId).name,language:catalogue.get(i.productId).language,expectedAt:s?.updated_at??null,expectedQuantity:s?.quantity??null,expectedStatus:s?.status??null});
  }return result;
 }
 function stockStatement(db,id,row,user,kind='count',entryId=null){return db.prepare('INSERT INTO owner_stock_changes(action_id,product_id,kind,expected_at,expected_quantity,expected_status,quantity,entry_id,note,changed_at,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,row.productId,kind,row.expectedAt,row.expectedQuantity,row.expectedStatus,row.quantity,entryId,row.note,stamp(),user);}
 async function handleRequest(request,env={}){
  const url=new URL(request.url),path=url.pathname.slice('/api/owner'.length),user=owner(request,env);
  if(!user)return reply({error:'Owner sign-in required.'},request.headers.has('oai-authenticated-user-id')?403:401);
  if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed.'},405);
  try{
   const db=env.DB;if(!db?.prepare||!db?.batch)throw Error('storage');
   if(request.method==='GET'){
    if(path==='/template')return csvResponse([['product_id','quantity','note'],...products.map(p=>[p.id,'',''])],'stackr-stock-template.csv');
    if(path==='/catalogue'){const q=(url.searchParams.get('q')||'').toLowerCase().slice(0,150);return reply({products:products.filter(p=>[p.id,p.name,p.type,p.language].join(' ').toLowerCase().includes(q)).slice(0,50).map(p=>({id:p.id,name:p.name,type:p.type,language:p.language}))});}
    const from=date(url.searchParams.get('from')||'2000-01-01'),to=date(url.searchParams.get('to')||'2099-12-31');if(from>to)throw fail('Start date must precede end date.');
    if(path==='/records'||path==='/export'||path==='/cash-export'){
     const offset=integer(Number(url.searchParams.get('offset')||0),10000000),exporting=path!=='/records',limit=exporting?10001:51;
     const entries=await all(db.prepare('SELECT * FROM owner_entries WHERE '+(path==='/cash-export'?'paid_date':'entry_date')+' BETWEEN ? AND ? ORDER BY entry_date DESC,created_at DESC,id DESC LIMIT ? OFFSET ?').bind(from,to,limit,exporting?0:offset));
     if(exporting){
      if(entries.length>10000)throw fail('Narrow the export period to at most 10,000 records.',413);
      return csvResponse([['ID','Type','Date','Paid date','Supplier/customer','Reference','Category','Document reference','Product ID','Quantity','Net GBP','Invoice VAT GBP','Gross GBP','Cash direction','Reverses ID','Linked record ID','Received','Frozen gross cost GBP','Tax settings at entry','Note'],...entries.map(e=>[e.id,e.kind,e.entry_date,e.paid_date,e.counterparty,e.reference,e.category,e.document_ref,e.product_id,e.quantity,(e.net_pence/100).toFixed(2),(e.vat_pence/100).toFixed(2),(e.gross_pence/100).toFixed(2),(INCOME.has(e.kind)?1:-1)*(e.reverses_id?-1:1),e.reverses_id,e.related_id,e.received_at,e.cost_pence===null?'':(e.cost_pence/100).toFixed(2),e.tax_snapshot,e.note])],'stackr-business-records.csv');
     }return reply({records:entries.slice(0,50),hasMore:entries.length>50,nextOffset:offset+50});
    }
    if(path==='/orders'){
     const list=await all(db.prepare("SELECT o.id,o.updated_at,o.mode,o.total_pence,o.delivery_pence,l.product_id,l.quantity,l.unit_pence,c.cost_pence,c.vat_status,c.sales_vat_pence FROM shop_orders o JOIN shop_order_items l ON l.order_id=o.id LEFT JOIN owner_order_costs c ON c.order_id=l.order_id AND c.product_id=l.product_id WHERE o.status='paid' AND substr(o.updated_at,1,10) BETWEEN ? AND ? ORDER BY o.updated_at DESC,o.id LIMIT 10001").bind(from,to));
     if(list.length>10000)throw fail('Narrow the sales export period.',413);
     return csvResponse([['Order ID','Paid at','Mode','Order total GBP (repeats per line)','Delivery GBP (repeats per line)','Product','Quantity','Actual unit GBP','Frozen gross cost GBP','VAT status','Recorded line VAT GBP'],...list.map(e=>[e.id,e.updated_at,e.mode,(e.total_pence/100).toFixed(2),(e.delivery_pence/100).toFixed(2),e.product_id,e.quantity,(e.unit_pence/100).toFixed(2),e.cost_pence===null?'':(e.cost_pence/100).toFixed(2),e.vat_status,e.sales_vat_pence===null?'':(e.sales_vat_pence/100).toFixed(2)])],'stackr-paid-order-lines.csv');
    }
    if(path==='/dashboard'){
     const s=await settings(db);
     const cash=await db.prepare("SELECT COALESCE(SUM(CASE WHEN kind IN ('income','sale','supplier_credit') THEN gross_pence ELSE -gross_pence END * CASE WHEN reverses_id IS NULL THEN 1 ELSE -1 END),0) net, COUNT(*) count FROM owner_entries WHERE paid_date BETWEEN ? AND ?").bind(from,to).first();
     const byKind=await all(db.prepare('SELECT kind,SUM(gross_pence * CASE WHEN reverses_id IS NULL THEN 1 ELSE -1 END) gross,SUM(vat_pence * CASE WHEN reverses_id IS NULL THEN 1 ELSE -1 END) vat FROM owner_entries WHERE entry_date BETWEEN ? AND ? GROUP BY kind').bind(from,to));
     const online=await db.prepare("SELECT COALESCE(SUM(total_pence),0) gross,COUNT(*) count FROM shop_orders WHERE status='paid' AND mode='live' AND substr(updated_at,1,10) BETWEEN ? AND ?").bind(from,to).first();
     const page=integer(Number(url.searchParams.get('offset')||0),10000000);
     const costs=await all(db.prepare('SELECT i.product_id,i.quantity,i.status,c.gross_pence,c.units,c.known FROM shop_inventory i LEFT JOIN owner_costs c ON c.product_id=i.product_id ORDER BY i.product_id LIMIT 51 OFFSET ?').bind(page));
     const snapshot=await getPrices(env);const inventory=costs.slice(0,50).map(c=>{const q=snapshot?.products?.[c.product_id],current=q?.status==='current'&&q.currency==='GBP'&&Date.parse(q.expiresAt)>now()&&Number.isSafeInteger(q.shopPence)&&q.shopPence>0;const knownCost=c.known===1&&c.units===c.quantity&&c.quantity>0;return {...c,name:catalogue.get(c.product_id)?.name||c.product_id,unitGrossCostPence:knownCost?Math.round(c.gross_pence/c.units):null,salePence:current?q.shopPence:null,estimatedGrossMarginPence:current&&knownCost?q.shopPence-Math.round(c.gross_pence/c.units):null,priceAsOf:current?q.observedAt||q.checkedAt:null};});
     return reply({settings:s,cash,byKind,online,inventory,inventoryHasMore:costs.length>50,nextOffset:page+50,priceRefresh:'Scheduled refresh is paused. Only unexpired references are used.',costBasis:'Recorded gross purchase cost. VAT reclaim, fees and tax are not deducted.'});
    }return reply({error:'Not found.'},404);
   }
   const data=await body(request);if(!uuid(data.id))throw fail('A valid action ID is required.');
   if(path==='/settings'){
    if(!['unknown','not_registered','registered'].includes(data.vatStatus))throw fail('Choose a VAT registration status.');
    const number=safeText(data.vatNumber||'',40),rate=data.vatStatus==='registered'?data.salesVatBps:null;
    if(data.vatStatus==='registered'&&(!number||![0,500,2000,null].includes(rate)))throw fail('Enter your VAT number and a valid rate.');
    const payload={vatStatus:data.vatStatus,vatNumber:data.vatStatus==='registered'?number:'',salesVatBps:rate};
    await action(db,data.id,payload,user,[db.prepare('INSERT INTO owner_settings(id,vat_status,vat_number,sales_vat_bps,updated_at) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET vat_status=excluded.vat_status,vat_number=excluded.vat_number,sales_vat_bps=excluded.sales_vat_bps,updated_at=excluded.updated_at').bind(payload.vatStatus,payload.vatNumber,rate,stamp())]);return reply({ok:true});
   }
   if(path==='/preview'){
    const rows=await stockRows(db,parseStockCsv(data.csv));return reply({ok:true,rows});
   }
   if(path==='/import'){
    if(!Array.isArray(data.rows)||!data.rows.length||data.rows.length>500)throw fail('Import needs 1–500 validated rows.');
    const seen=new Set();const rows=data.rows.map(r=>{known(r.productId);if(seen.has(r.productId))throw fail('Duplicate product ID.');seen.add(r.productId);if(r.expectedAt!==null&&(typeof r.expectedAt!=='string'||!Number.isFinite(Date.parse(r.expectedAt))))throw fail('Preview stock again.');if(r.expectedQuantity!==null)integer(r.expectedQuantity,999999);if(![null,'unknown','in_stock','out_of_stock'].includes(r.expectedStatus))throw fail('Preview stock again.');return {productId:r.productId,quantity:integer(r.quantity,999999),note:safeText(r.note),expectedAt:r.expectedAt,expectedQuantity:r.expectedQuantity,expectedStatus:r.expectedStatus};});
    const replay=await action(db,data.id,{kind:'stock-import',rows},user,rows.map(r=>stockStatement(db,data.id,r,user)));return reply({ok:true,replayed:replay,count:rows.length});
   }
   if(path==='/entry'){
    const e=entry(data),s=await settings(db),tax=JSON.stringify(s);if(e.relatedEntryId){const related=await db.prepare('SELECT * FROM owner_entries WHERE id=?').bind(e.relatedEntryId).first();if(!related||related.reverses_id||related.reversed_by||related.kind!==(e.kind==='supplier_credit'?'purchase':'sale'))throw fail('The linked record must be an active original purchase or manual sale.');}if(e.kind==='sale'&&s.vat_status==='not_registered'&&e.vatPence!==0)throw fail('A non-registered business sale cannot charge VAT. Record the selling amount as net and VAT as zero.');
    const replay=await action(db,data.id,e,user,[db.prepare('INSERT INTO owner_entries(id,kind,entry_date,paid_date,counterparty,reference,category,document_ref,note,product_id,quantity,net_pence,vat_pence,gross_pence,tax_snapshot,related_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(data.id,e.kind,e.entryDate,e.paidDate,e.counterparty,e.reference,e.category,e.documentRef,e.note,e.productId,e.quantity,e.netPence,e.vatPence,e.grossPence,tax,e.relatedEntryId,stamp())]);return reply({ok:true,replayed:replay});
   }
   if(path==='/receive'){
    if(!uuid(data.entryId))throw fail('Invalid purchase.');
    const prior=await db.prepare('SELECT payload FROM owner_actions WHERE id=?').bind(data.id).first();const payload={kind:'receive',entryId:data.entryId,confirmZero:data.confirmZero===true};
    if(prior){if(prior.payload!==JSON.stringify(payload))throw fail('Action ID conflict.',409);return reply({ok:true,replayed:true});}
    const e=await db.prepare("SELECT * FROM owner_entries WHERE id=? AND kind='purchase' AND received_at IS NULL AND reversed_by IS NULL AND reverses_id IS NULL").bind(data.entryId).first();if(!e)throw fail('Purchase is already received, reversed or unavailable.',409);
    const [row]=await stockRows(db,[{productId:e.product_id,quantity:e.quantity,note:'Received: '+e.reference}]);
    if(row.expectedQuantity===null&&data.confirmZero!==true)throw fail('Count existing available stock first, or confirm it is zero.');
    row.quantity=integer((row.expectedQuantity||0)+e.quantity,999999);
    await action(db,data.id,payload,user,[stockStatement(db,data.id,row,user,'receipt',e.id)]);return reply({ok:true,quantity:row.quantity});
   }
   if(path==='/paid'){
    if(!uuid(data.entryId))throw fail('Invalid record.');const paidDate=date(data.paidDate);const original=await db.prepare('SELECT * FROM owner_entries WHERE id=?').bind(data.entryId).first();if(!original||original.reversed_by||original.reverses_id)throw fail('This record cannot be marked paid.',409);
    await action(db,data.id,{kind:'paid',entryId:data.entryId,paidDate},user,[db.prepare('UPDATE owner_entries SET paid_date=? WHERE id=? AND paid_date IS NULL AND reverses_id IS NULL AND reversed_by IS NULL').bind(paidDate,data.entryId)]);
    const saved=await db.prepare('SELECT paid_date FROM owner_entries WHERE id=?').bind(data.entryId).first();if(saved?.paid_date!==paidDate)throw fail('Payment date was not changed. Refresh the record.',409);return reply({ok:true});
   }
   if(path==='/reverse'){
    if(!uuid(data.entryId))throw fail('Invalid record.');const reason=safeText(data.reason);if(!reason)throw fail('Give a reason for the correction.');
    const correctionDate=date(data.entryDate),payload={kind:'reverse',entryId:data.entryId,reason,correctionDate};
    const replay=await db.prepare('SELECT payload FROM owner_actions WHERE id=?').bind(data.id).first();if(replay){if(replay.payload!==JSON.stringify(payload))throw fail('Action ID conflict.',409);return reply({ok:true,replayed:true});}
    const e=await db.prepare('SELECT * FROM owner_entries WHERE id=?').bind(data.entryId).first();if(!e||e.reversed_by||e.reverses_id||e.received_at||e.kind==='sale')throw fail('Use a linked refund/credit record and a stock count for a received purchase or sale. This record cannot be reversed.',409);
    await action(db,data.id,payload,user,[db.prepare('UPDATE owner_entries SET reversed_by=? WHERE id=? AND reversed_by IS NULL').bind(data.id,e.id),db.prepare('INSERT INTO owner_entries(id,kind,entry_date,paid_date,counterparty,reference,category,document_ref,note,product_id,quantity,net_pence,vat_pence,gross_pence,tax_snapshot,reverses_id,created_at) SELECT ?,kind,entry_date,paid_date,counterparty,reference,category,document_ref,?,product_id,quantity,net_pence,vat_pence,gross_pence,tax_snapshot,id,? FROM owner_entries WHERE id=?').bind(data.id,'Correction '+correctionDate+': '+reason,stamp(),e.id)]);return reply({ok:true});
   }return reply({error:'Not found.'},404);
  }catch(error){const text=String(error.message);if(/stock_reserved|stock_changed|stock_unavailable/.test(text))return reply({error:'Stock changed or is held in checkout. Refresh, preview again and retry.'},409);if(/UNIQUE|receipt_unavailable|correction_unavailable|payment_date_locked/.test(text))return reply({error:'This record/import already exists or the purchase has already been received. Refresh before retrying.'},409);return reply({error:error.status?error.message:'Records are temporarily unavailable. No change is confirmed.'},error.status||503);}
 }
 return {handleRequest};
}
