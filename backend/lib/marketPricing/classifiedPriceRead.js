/** Read resolved evidence from Stackr, with no provider requests from a price page. */
export async function readClassifiedPrices(supabase, candidates) {
 const ids=[...new Set(candidates.map(c=>c.variant_id))];
 const result=new Map();
 for(let offset=0;offset<ids.length;offset+=100) {
  const batch=ids.slice(offset,offset+100);
  let response;
  try { response=await supabase.schema('api').rpc('read_pricing_classifications',{p_variants:batch}); }
  catch(error) { if(['42883','PGRST202'].includes(String(error?.code)))return null;throw error; }
  const {data,error}=response;
  if(error) {
   if(['42883','PGRST202'].includes(String(error.code))) return null;
   throw error;
  }
  for(const row of data??[]) if(batch.includes(row.variant_id)) result.set(row.variant_id,row.resolution);
 }
 return result;
}

export function classifiedPrice(resolution,selected,unavailablePrice) {
 const base=unavailablePrice(selected.variant_id,{productType:'raw_card',currency:'GBP'},resolution?.reason??'classification_pending');
 if(!resolution) return {...base,classification:'PRICE_UNAVAILABLE'};
 if(resolution.variantId!==selected.variant_id || resolution.printingId!==selected.printing_id
  || resolution.setId!==selected.set_id || resolution.language!==selected.language_code
  || resolution.catalogueVersionId!==selected.catalogue_version_id) return {...base,classification:'PRICE_UNAVAILABLE',unavailableReason:'classification_identity_mismatch'};
 if(resolution.classification==='PRICE_UNAVAILABLE') return {...base,classification:resolution.classification};
 // This store currently resolves raw market guides only. Condition-specific
 // exact evidence retains its existing reader until explicitly integrated.
 if(!['MARKET_GUIDE','ESTIMATED_VALUE'].includes(resolution.classification)
  || !Number.isFinite(resolution.value)||resolution.value<=0||resolution.currency!=='GBP') {
  return {...base,classification:'PRICE_UNAVAILABLE',unavailableReason:'invalid_classified_price'};
 }
 return {...base,status:'market_estimate',priceType:'market_estimate',classification:resolution.classification,
  evidenceType:resolution.evidenceType,estimates:{low:null,central:resolution.value,high:null},
  confidence:{score:resolution.confidence,label:resolution.confidence>=0.8?'high':resolution.confidence>=0.6?'medium':'low'},
  calculatedAt:resolution.sourceAt,staleAfter:resolution.staleAfter,
  freshness:Date.parse(resolution.staleAfter)<=Date.now()?'stale':'fresh',
  provenLastSold:false,lastSoldObservationId:null,lastSoldEvidence:null,
  sourceBreakdown:[{provider:resolution.provider,evidenceType:resolution.evidenceType,
   retrievedAt:resolution.retrievedAt,sourceAt:resolution.sourceAt,
   printingMatch:resolution.printingMatch,languageMatch:resolution.languageMatch,finishMatch:resolution.finishMatch,
   condition:resolution.condition,grade:null,marketSignalValue:resolution.marketSignalValue,
   usableForHoldingsValuation:resolution.usableForHoldingsValuation,
   verificationFlags:[...(resolution.value>=100?['high_value_single_provider']:[]),'raw_condition_unspecified',
    ...(resolution.provenance?.conversionQuality==='retained_conversion_without_rate_timestamp'?['retained_fx_unverified']:[])],
   provenance:resolution.provenance}],
  fallbackEstimate:{identityKey:selected.variant_id,exact:false,reason:'general_card_estimate',printingId:selected.printing_id},
  unavailableReason:null,estimateVersion:resolution.policyVersion};
}
