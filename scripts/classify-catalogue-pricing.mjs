import 'dotenv/config';
import {pathToFileURL} from 'node:url';
import {createCataloguePriceDatabase} from './catalogue-price-database.mjs';
import {resolvePricingV2SupabaseTarget} from './pricing-v2-supabase-target.mjs';

export async function classifyCataloguePricing(db,{pageSize=500,log=console.info}={}) {
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>2000) throw Error('Invalid classification page size.');
 const rpc=async(name,args={})=>{const {data,error}=await db.schema('api').rpc(name,args);if(error)throw error;return data;};
 const before=await rpc('pricing_classified_coverage');
 let after=null;let processed=0;
 for(let page=0;page<2000;page++) {
  const batch=await rpc('store_pricing_classification_page',{p_after:after,p_limit:pageSize});
  if(!Number.isInteger(batch?.processed)||batch.processed<0||batch.processed>pageSize
   || typeof batch.complete!=='boolean') throw Error('Invalid classification acknowledgement.');
  processed+=batch.processed;
  if(batch.complete) {
   const coverage=await rpc('pricing_classified_coverage');
   if(JSON.stringify(before.catalogueVersions)!==JSON.stringify(coverage.catalogueVersions)) throw Error('Publication changed during classification; rerun the resumable worker.');
   if(!Number.isInteger(coverage.totalPublishedVariants)||coverage.totalPublishedVariants<1
    ||coverage.classified!==coverage.totalPublishedVariants) throw Error('Classification finished with unprocessed published variants.');
   const result={processed,pages:page+1,coverage};log(JSON.stringify(result));return result;
  }
  if(batch.processed===0||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(batch.nextAfter??'')
   ||(after!==null&&batch.nextAfter.toLowerCase()<=after.toLowerCase()))throw Error('Classification cursor did not advance.');
  after=batch.nextAfter;
  if(page%20===0)log(JSON.stringify({event:'pricing_classification_progress',processed,nextAfter:after}));
 }
 throw Error('Classification page budget exceeded.');
}
export async function mainClassifyCataloguePricing(args=process.argv.slice(2)) {
 if(!args.includes('--apply')||(process.env.STACKR_CATALOGUE_BULK_PRICING_ENABLED!=='true'
  &&process.env.STACKR_CARDMARKET_PUBLIC_GUIDE_ENABLED!=='true'))throw Error('Classification requires the approved server write lane.');
 const target=resolvePricingV2SupabaseTarget();const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)throw Error('Missing server database credential.');
 return classifyCataloguePricing(createCataloguePriceDatabase(target.url,key));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)mainClassifyCataloguePricing().catch(error=>{console.error(error.message);process.exitCode=1;});
