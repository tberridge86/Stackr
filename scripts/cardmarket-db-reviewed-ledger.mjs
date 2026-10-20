import 'dotenv/config';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createCataloguePriceDatabase } from './catalogue-price-database.mjs';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';
async function write(path,value){await mkdir(dirname(path),{recursive:true});const t=`${path}.${process.pid}.tmp`;await writeFile(t,value);await rename(t,path);}
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function volumePath(root,path){if(!isAbsolute(root)||!isAbsolute(path))throw Error('Cardmarket cache and ledger paths must be absolute.');const base=resolve(root),target=resolve(path),distance=relative(base,target);if(distance==='..'||distance.startsWith('..')||isAbsolute(distance))throw Error('Cardmarket ledger path must be inside the cache volume.');return target;}
const REVIEWED_MAPPING_PAGE_SIZE=100;
const REVIEWED_MAPPING_MAX_PAGES=2500;
const evidence=value=>Boolean(value)&&!Array.isArray(value)&&typeof value==='object'&&Object.keys(value).length>0;
const reviewReference=value=>typeof value==='string'&&value.trim().length>=5&&value.trim().length<=1000;
const reviewedMappingFailureReason=error=>error?.code==='57014'?'statement_timeout':'request_failed';
// Smaller reads keep reviewed identity checks within the database deadline.
// The 2,500-page bound retains the existing 250,000-mapping safety ceiling.
export async function loadReviewedCardmarketLedger({api,maxPages=REVIEWED_MAPPING_MAX_PAGES}={}){
  if(!api||!Number.isInteger(maxPages)||maxPages<1||maxPages>REVIEWED_MAPPING_MAX_PAGES)throw Error('Invalid reviewed-ledger loader configuration.');
  let after=0;
  const mappings=[];
  for(let page=0;page<maxPages;page+=1){
    let response;
    try{
      response=await api.rpc('list_reviewed_cardmarket_printing_mappings',{
        p_after_product_id:after,
        p_limit:REVIEWED_MAPPING_PAGE_SIZE,
      });
    }catch(error){
      throw Error(`Cardmarket reviewed mapping RPC failed at product cursor ${after}: ${reviewedMappingFailureReason(error)}`);
    }
    const {data,error}=response??{};
    if(error)throw Error(`Cardmarket reviewed mapping RPC failed at product cursor ${after}: ${reviewedMappingFailureReason(error)}`);
    if(!Array.isArray(data)||data.length>REVIEWED_MAPPING_PAGE_SIZE)throw Error('Invalid reviewed mapping page.');
    let cursor=after;
    for(const row of data){
      if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid reviewed mapping row.');
      const productId=Number(row.cardmarket_product_id);
      const categoryId=Number(row.cardmarket_category_id);
      if(!Number.isSafeInteger(productId)||productId<=cursor
        ||!Number.isSafeInteger(categoryId)||categoryId<=0
        ||!uuid(row.printing_id)||!uuid(row.catalogue_version_id)
        ||!evidence(row.language_evidence)||!evidence(row.variant_evidence)||!evidence(row.finish_evidence)
        ||!reviewReference(row.review_reference))throw Error('Invalid reviewed mapping row.');
      cursor=productId;
      mappings.push({
        cardmarketProductId:productId,
        cardmarketCategoryId:categoryId,
        printingId:row.printing_id,
        catalogueVersionId:row.catalogue_version_id,
        method:'reviewed_exact',
        languageEvidence:row.language_evidence,
        variantEvidence:row.variant_evidence,
        finishEvidence:row.finish_evidence,
        reviewReference:row.review_reference,
      });
    }
    if(data.length<REVIEWED_MAPPING_PAGE_SIZE)return {schemaVersion:1,mappings};
    after=cursor;
  }
  throw Error(`Reviewed mapping pagination exceeded ${maxPages} pages.`);
}
export async function main(){const cache=process.env.STACKR_CARDMARKET_CACHE_DIR,path=volumePath(cache??'',process.env.STACKR_CARDMARKET_MAPPING_LEDGER_PATH??'');const target=resolvePricingV2SupabaseTarget();const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;if(!key)throw Error('Missing server database credential.');const ledger=await loadReviewedCardmarketLedger({api:createCataloguePriceDatabase(target.url,key).schema('api')});if(process.env.STACKR_CARDMARKET_PUBLIC_GUIDE_ENABLED==='true'&&!ledger.mappings.length)throw Error('Refusing an empty reviewed ledger while apply is enabled.');await write(path,JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({project:target.projectRef,mappings:ledger.mappings.length}));}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/cardmarket-db-reviewed-ledger.mjs'))main().catch(e=>{console.error(e.message);process.exitCode=1;});
