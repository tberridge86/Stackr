import { setTimeout as delay } from 'node:timers/promises';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { createMarketPricingService } from '../backend/lib/marketPricing/service.js';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';
import { prepareCollectionValuation, readPages } from './lib/prepared-collection-valuation.mjs';

export function supportedCatalogueProviderScope(row) {
  const variant=row.variant_code??row.variantCode, finish=row.finish_code??row.finishCode, language=row.language_code??row.language;
  return ['normal','standard','default'].includes(variant)&&['normal','standard','default','non_holo'].includes(finish)
    || language==='en'&&['holo','reverse_holo'].includes(variant)&&finish===variant;
}

async function refreshWithSharedLease(supabase,service,variantId,input) {
  const {data:lease,error}=await supabase.schema('api').rpc('claim_price_identity',{p_variant:variantId});
  if(error)throw error;
  if(!lease)throw Object.assign(new Error('Identity already refreshing'),{status:429,code:'provider_refresh_cooldown'});
  try { return await service.refreshExactProviderEstimate(variantId,input); }
  finally { const {error:releaseError}=await supabase.from('catalogue_price_identity_leases').delete().eq('variant_id',variantId).eq('token',lease); if(releaseError)throw releaseError; }
}

export function catalogueRefreshPlan(rows, { hours = 12, requestBudget = 0, reserveFraction = 0.2, spacingMs = 1000 } = {}) {
  const groups = {};
  let eligible=0;
  for(const row of rows) {
    const key=`${row.language_code}:${row.variant_code}:${row.finish_code ?? 'unknown'}`;
    groups[key]=(groups[key]??0)+1;
    if(supportedCatalogueProviderScope(row)) eligible++;
  }
  const available=Math.floor(requestBudget*(1-reserveFraction));
  return {population:rows.length,byLanguageVariant:groups,eligibleUpperBound:eligible,unsupported:rows.length-eligible,
    cycleHours:hours,requestsUpperBound:eligible,minimumRuntimeSeconds:Math.ceil(eligible*spacingMs/1000),
    reservedRequests:requestBudget-available,availableRequests:available,
    fits:requestBudget>0&&available>=eligible&&eligible*spacingMs<=hours*3600000,
    capacityVerified:false,providerCalls:0};
}

export function assertCatalogueCapacity(plan) {
  if (!plan.fits) throw Error('Verified request budget and minimum runtime do not fit the catalogue cycle; keep catalogue pricing disabled');
}

export function refreshOutcome(error, retained=false) {
  const code=String(error?.code??'provider_refresh_failed');
  const status=Number(error?.status??0);
  if(code==='unsupported_refresh_scope')return {outcome:'unsupported_scope',delay:7*86400,code};
  if(['unresolved_provider_identity','ambiguous_provider_identity','provider_identity_truncated'].includes(code))return {outcome:'unresolved_identity',delay:86400,code};
  if(code==='exact_provider_quote_unavailable')return {outcome:retained?'older_price_retained':'no_provider_quote',delay:86400,code};
  const raw=error?.retryAfter;
  const retrySeconds=Number.isFinite(Number(raw))&&raw!=null?Number(raw):Math.ceil((Date.parse(String(raw))-Date.now())/1000);
  return {outcome:'retrying',delay:Math.max(60,Number.isFinite(retrySeconds)?retrySeconds:300),code,
    systemic:[401,403,429].includes(status)||status>=500||code==='provider_refresh_timeout'};
}

export async function runCataloguePriceSlice({supabase,service,limit=30,cycleHours=12,requestBudget=0,spacingMs=1000,capacityVerified=false}) {
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Catalogue slice limit must be 1..100');
  const rpc=async(name,args)=>{const {data,error}=await supabase.schema('api').rpc(name,args);if(error)throw error;return data;};
  // Accounting is allowed without fetching a single provider quote. Capacity
  // is a release input backed by an actual allowance, not an inferred no-limit.
  const cycle=await rpc('begin_catalogue_price_cycle',{p_hours:cycleHours});
  const items=await rpc('claim_catalogue_prices',{p_cycle:cycle,p_limit:limit});
  let providerAttempts=0;
  const retained = new Set((await service.storedExactPrices(items.map((i)=>i.variant_id))).filter((p)=>p.estimates.central!=null).map((p)=>p.variantId));
  for(const item of items) {
    const i=item.identity;
    let result;
    const supported=supportedCatalogueProviderScope(i);
    if(!supported)result={outcome:'unsupported_scope',delay:7*86400,code:'unverified_provider_finish'};
    else if(!capacityVerified) result={outcome:'retrying',delay:12*3600,code:'provider_capacity_unverified'};
    else {
      const reserved=await rpc('reserve_catalogue_provider_request',{p_provider:'tcgdex',p_limit:Math.floor(requestBudget*0.8),p_spacing_ms:spacingMs});
      if(!reserved)result={outcome:'retrying',delay:Math.max(60,spacingMs/1000),code:'provider_budget_backoff'};
      else {
        try {
          // Compare the frozen revision before the service resolves approved aliases.
          const {data:current,error}=await supabase.schema('api').from('catalogue_cards').select('catalogue_version_id').eq('variant_id',item.variant_id).maybeSingle();
          if(error)throw error;
          if(current?.catalogue_version_id!==i.catalogueVersionId) result={outcome:'unresolved_identity',delay:60,code:'catalogue_revision_changed'};
          else {
            providerAttempts++;
            const quote=await refreshWithSharedLease(supabase,service,item.variant_id,{productType:'raw_card',condition:'near_mint',currency:'GBP'});
            result={outcome:['stale','expired'].includes(quote.freshness)?'older_price_retained':'priced',delay:cycleHours*3600,code:null};
          }
        }catch(error){result=refreshOutcome(error,retained.has(item.variant_id));}
        await delay(Math.max(100,spacingMs));
      }
    }
    if(result.systemic) {
      const {error}=await supabase.from('catalogue_price_provider_budget').update({blocked_until:new Date(Date.now()+result.delay*1000).toISOString()}).eq('provider','tcgdex');
      if(error)throw error;
    }
    const acknowledged=await rpc('finish_catalogue_price',{p_cycle:cycle,p_variant:item.variant_id,p_lease:item.lease_token,
      p_outcome:result.outcome,p_delay_seconds:Math.ceil(result.delay),p_error:result.code});
    if(!acknowledged)throw Error('Catalogue price lease expired; result was not acknowledged');
  }
  return {cycleId:cycle,attempted:items.length,providerAttempts,status:await rpc('catalogue_price_cycle_status',{})};
}

export async function mainCataloguePricing(args=process.argv.slice(2)) {
  const target=resolvePricingV2SupabaseTarget();
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
  if(!key)throw Error('Missing server database credential');
  const supabase=createClient(target.url,key);
  const service=createMarketPricingService({supabase,refreshEnabled:process.env.MARKET_PRICE_REFRESH_ENABLED==='true'});
  const limit=Number(args.find((a)=>a.startsWith('--limit='))?.split('=')[1]??30);
  const cycleHours=Number(process.env.STACKR_CATALOGUE_PRICE_CYCLE_HOURS??12);
  const requestBudget=Number(process.env.STACKR_TCGDEX_VERIFIED_REQUESTS_PER_CYCLE??0);
  const spacingMs=Number(process.env.STACKR_TCGDEX_REQUEST_SPACING_MS??1000);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(cycleHours)||cycleHours<1||cycleHours>168
    ||!Number.isInteger(requestBudget)||requestBudget<0||!Number.isInteger(spacingMs)||spacingMs<100||spacingMs>60000) throw Error('Invalid catalogue pricing limits');
  if(!args.includes('--apply')) {
    const rows=await readPages(()=>supabase.schema('api').from('catalogue_cards').select('variant_id,language_code,variant_code,finish_code,catalogue_version_id').order('variant_id'));
    const plan=catalogueRefreshPlan(rows,{hours:cycleHours,requestBudget,spacingMs});
    console.log(JSON.stringify({worker:'catalogue-pricing',dryRun:true,project:target.projectRef,...plan}));
    return plan;
  }
  if(process.env.STACKR_CATALOGUE_PRICING_ENABLED!=='true')throw Error('Catalogue pricing is disabled');
  // Presence of a number is not proof. Release must bind its capacity evidence.
  const capacityVerified=process.env.STACKR_TCGDEX_CAPACITY_VERIFIED==='true'
    && /^[0-9a-f]{64}$/.test(process.env.STACKR_TCGDEX_CAPACITY_EVIDENCE_SHA256??'')&&requestBudget>0;
  if (capacityVerified) {
    const rows=await readPages(()=>supabase.schema('api').from('catalogue_cards').select('variant_id,language_code,variant_code,finish_code').order('variant_id'));
    assertCatalogueCapacity(catalogueRefreshPlan(rows,{hours:cycleHours,requestBudget,spacingMs}));
  }
  const ownerId=process.env.STACKR_OWNER_PRICE_REFRESH_USER_ID;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId??''))throw Error('The private valuation worker requires its configured owner');
  let result=null,queueResult=null;
  if(!args.includes('--queue-only')) {
    const runtime=Number(process.env.STACKR_CATALOGUE_PRICE_SLICE_SECONDS??60);
    if(!Number.isFinite(runtime)||runtime<1||runtime>240)throw Error('Slice runtime must be 1..240 seconds');
    const deadline=Date.now()+runtime*1000;
    do {
      result=await runCataloguePriceSlice({supabase,service,limit:Math.max(1,Math.min(limit,Math.floor((deadline-Date.now())/(spacingMs+12000)))),cycleHours,requestBudget,spacingMs,capacityVerified});
    } while(capacityVerified&&result.attempted>0&&Date.now()+spacingMs+12000<deadline);
  }
  if (args.includes('--queue-only') && capacityVerified) {
    const {data:priority,error:priorityError}=await supabase.schema('api').rpc('catalogue_price_priority_candidates',{p_limit:12});
    if(priorityError)throw priorityError;
    for(const identity of priority??[]) {
      if(supportedCatalogueProviderScope(identity)) await service.requestSnapshotRefresh(identity.variantId,{productType:'raw_card',currency:'GBP'},process.env.STACKR_OWNER_PRICE_REFRESH_USER_ID);
      const {error:markerError}=await supabase.from('catalogue_price_priority_markers')
        .upsert({variant_id:identity.variantId,identity,queued_at:new Date().toISOString()});
      if(markerError)throw markerError;
    }
    const { runOwnerProviderRefresh } = await import('./refresh-owner-provider-prices.mjs');
    queueResult=await runOwnerProviderRefresh({ supabase, ownerId:process.env.STACKR_OWNER_PRICE_REFRESH_USER_ID,
      limit:Math.min(limit,30),dryRun:false,includeQueue:true,queueOnly:true,
      refreshExactProviderEstimate:async(variantId,input)=>{
        const {data,error}=await supabase.schema('api').rpc('reserve_catalogue_provider_request',
          {p_provider:'tcgdex',p_limit:requestBudget,p_spacing_ms:spacingMs});
        if(error)throw error;
        if(!data)throw Object.assign(new Error('Provider budget backoff'),{status:429,code:'provider_refresh_cooldown'});
        try { return await refreshWithSharedLease(supabase,service,variantId,input); }
        catch (error) {
          const result=refreshOutcome(error);
          if(result.systemic) {
            const {error:writeError}=await supabase.from('catalogue_price_provider_budget')
              .update({blocked_until:new Date(Date.now()+result.delay*1000).toISOString()}).eq('provider','tcgdex');
            if(writeError)throw writeError;
          }
          throw error;
        }
      } });
  }
  const valuation=await prepareCollectionValuation({supabase,service,ownerId,providerCapacityVerified:capacityVerified});
  console.log(JSON.stringify({worker:'catalogue-pricing',dryRun:false,project:target.projectRef,capacityVerified,...result,
    priorityQueue:queueResult,valuationPublished:valuation?.published??false}));
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)mainCataloguePricing().catch((error)=>{
  console.error(JSON.stringify({worker:'catalogue-pricing',error:error.code??'worker_failed'}));process.exitCode=1;
});
