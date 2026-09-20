import { createHash, randomUUID } from 'node:crypto';
import { ownerIdentityLookupRows, resolveScopedOwnedProviderVariant } from './owner-price-saved-references.mjs';
import { readGeneralPrintingCatalogue, resolveGeneralPriceIdentity } from './general-price-identities.mjs';
import { generalPriceBaseCandidates, selectGeneralPriceBase, wrapGeneralEstimate } from '../../backend/lib/marketPricing/generalEstimate.js';

const token = (value) => String(value ?? '').trim().toLowerCase();
const variantCode = (value) => ({ holofoil: 'holo', reverseholofoil: 'reverse_holo', reverse_holofoil: 'reverse_holo',
  reverseholopokeball: 'poke_ball', masterballpatternholofoil: 'master_ball', standard: 'normal', default: 'normal', '1st_edition': 'first_edition' }[token(value)] ?? token(value));
const pair = (row) => JSON.stringify([row.set_id, row.card_id]);
const unique = (values) => [...new Set(values)];

export async function queryRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function readPages(makeQuery, size = 500) {
  const rows = [];
  for (let offset = 0; ; offset += size) {
    const page = await queryRows(makeQuery().range(offset, offset + size - 1));
    rows.push(...page);
    if (page.length < size) return rows;
  }
}

export function ownedValuationUnits({ ownedRows, binders, binderCards }) {
  const authoritative = new Set(ownedRows.map(pair));
  const byBinder = new Map(binders.map((b) => [b.id, b]));
  const units = ownedRows.map((row) => ({ ...row }));
  const legacy = new Map();
  for (const card of binderCards) {
    if (!card.owned || authoritative.has(pair(card)) || card.owned_card_variant_id) continue;
    const binder = byBinder.get(card.binder_id);
    const key = JSON.stringify([pair(card), binder?.edition, card.condition, card.grade_company, card.grade]);
    const old = legacy.get(key);
    // Saved legacy placement cannot prove extra copies; use its explicit quantity
    // once, even when that same card is placed into several binders.
    if (!old || Number(card.owned_quantity ?? 1) > old.quantity) legacy.set(key, { ...card,
      id: `legacy:${key}`, variant: ['1st_edition','first_edition'].includes(binder?.edition) ? 'first_edition' : 'normal', quantity: Number(card.owned_quantity ?? 1) });
  }
  units.push(...legacy.values());
  return units.map((row) => {
    const placements = binderCards.filter((card) => card.owned_card_variant_id === row.id
      || !card.owned_card_variant_id && pair(card) === pair(row));
    const matching = unique([...placements.map((c) => c.binder_id), ...binders.filter((b) => b.type === 'official' && b.source_set_id === row.set_id).map((b) => b.id)])
      .map((id) => byBinder.get(id)).filter(Boolean);
    const unanimous = (key) => { const values = unique(matching.map((b) => b[key]).filter(Boolean)); return values.length === 1 ? values[0] : null; };
    const modes = unique(matching.map((b) => b.card_mode ?? 'raw'));
    return { ...row, quantity: Math.max(0, Math.floor(Number(row.quantity) || 0)), binderIds: matching.map((b) => b.id),
      condition: row.condition || unanimous('default_condition'),
      grade_company: row.grade_company || (modes.includes('graded') ? unanimous('default_grade_company') || 'unknown' : null),
      grade: row.grade || (modes.includes('graded') ? unanimous('default_grade') : null),
      language: row.language || unanimous('language'), edition: row.edition || unanimous('edition'),
      ambiguousDefaults: modes.length > 1 || unique(matching.map((b) => b.edition).filter(Boolean)).length > 1,
    };
  }).filter((row) => row.quantity > 0);
}

export function resolveValuationUnit(unit, identifiers, catalogue) {
  if (unit.ambiguousDefaults) return { ok: false, reason: 'ambiguous_saved_identity' };
  if (unit.grade_company || unit.grade || !['near mint','near_mint','raw_near_mint','nm'].includes(token(unit.condition))) return { ok: false, reason: 'unsupported_scope' };
  const code = ['1st_edition','first_edition'].includes(unit.edition) ? 'first_edition' : variantCode(unit.variant);
  if (!code) return { ok: false, reason: 'unresolved_identity' };
  // Preserve the PR #202 resolver, including conflicting aliases and explicit
  // language prefixes. Project only the requested physical finish into it.
  const scoped = catalogue.filter((c) => variantCode(c.variant_code) === code
    && Boolean(c.finish_code)
    && (code !== 'normal' || ['normal','standard','default','non_holo'].includes(c.finish_code))
    && (!unit.language || token(c.language_code) === token(unit.language)));
  return resolveScopedOwnedProviderVariant({ ...unit, condition: 'near_mint', variant: 'normal' }, identifiers,
    scoped.map((c) => ({ ...c, variant_code: 'normal', finish_code: 'normal' })));
}

export function summarisePreparedUnits(units, outcomes, prices, now = Date.now(), { general = false } = {}) {
  const summary = { total: null, totalUnits: 0, distinctPriceIdentities: 0, pricedUnits: 0, freshUnits: 0,
    olderPriceUnits: 0, unpricedUnits: 0, pending: 0, retrying: 0, unsupported: 0, unresolved: 0, noProviderQuote: 0,
    currency: 'GBP', oldestSourceAt: null, latestSourceAt: null, exactPricedUnits: 0, generalEstimateUnits: 0,
    ...(general ? { valuationBasis: 'general_card_estimate' } : {}) };
  const identities = new Set(); let total = 0;
  for (const unit of units) {
    const q = unit.quantity; summary.totalUnits += q;
    const priceVariantId = general ? unit.priceVariantId : unit.variantId;
    if (priceVariantId) identities.add(priceVariantId);
    const exactPrice = priceVariantId ? prices.get(priceVariantId) : null;
    const price = general && unit.priceScope === 'printing_general'
      ? wrapGeneralEstimate(exactPrice, unit.selection, unit.resolution) : exactPrice;
    const central = price?.estimates?.central;
    const known = typeof central === 'number' && Number.isFinite(central) && central >= 0 && price.status !== 'unavailable'
      && price.currency === 'GBP' && (general ? (!price.fallbackEstimate || unit.priceScope === 'printing_general') : !price.fallbackEstimate);
    if (known) {
      total += central * q; summary.pricedUnits += q;
      if (general && unit.priceScope === 'printing_general') summary.generalEstimateUnits += q;
      else summary.exactPricedUnits += q;
      const sourceAt = price.providerUpdatedAt ?? price.calculatedAt;
      if (sourceAt && Number.isFinite(Date.parse(sourceAt))) {
        if (!summary.oldestSourceAt || sourceAt < summary.oldestSourceAt) summary.oldestSourceAt = sourceAt;
        if (!summary.latestSourceAt || sourceAt > summary.latestSourceAt) summary.latestSourceAt = sourceAt;
      }
      if (!['fresh','source_timestamped'].includes(price.freshness) || !price.staleAfter || Date.parse(price.staleAfter) <= now) summary.olderPriceUnits += q;
      else summary.freshUnits += q;
    } else {
      summary.unpricedUnits += q;
      const outcome = unit.reason === 'unsupported_scope' ? 'unsupported_scope'
        : !priceVariantId ? 'unresolved_identity' : outcomes.get(priceVariantId) ?? 'pending';
      const key = { unsupported_scope: 'unsupported', unresolved_identity: 'unresolved', retrying: 'retrying',
        no_provider_quote: 'noProviderQuote' }[outcome] ?? 'pending';
      summary[key] += q;
    }
  }
  summary.distinctPriceIdentities = identities.size;
  summary.total = summary.pricedUnits ? Math.round(total * 100) / 100 : null;
  return summary;
}

function usableExactPrice(price) {
  const central = price?.estimates?.central;
  return !price?.fallbackEstimate && price?.quoteScope !== 'printing_level' && price?.currency === 'GBP' && price?.status !== 'unavailable'
    && typeof central === 'number' && Number.isFinite(central) && central >= 0;
}

// General candidates retain both identities until stored quotes are known.
// This lets an unavailable requested finish use a separately proven base, but
// leaves an existing usable exact quote as the unambiguous first choice.
export function chooseGeneralPriceUnits(candidates, prices) {
  return candidates.map((unit) => {
    if (unit.variantId && usableExactPrice(prices.get(unit.variantId))) {
      return { ...unit, priceVariantId: unit.variantId, priceScope: 'exact' };
    }
    const selection = (unit.generalBaseCandidates ?? []).find((candidate) => usableExactPrice(prices.get(candidate.baseVariantId)));
    if (selection) return {
      ...unit,
      priceVariantId: selection.baseVariantId,
      priceScope: 'printing_general',
      selection,
    };
    return unit.variantId ? { ...unit, priceVariantId: unit.variantId, priceScope: 'exact' } : unit;
  });
}

function generalSetPriceCandidates(catalogue, mode, edition = 'normal') {
  return setValuationUnits(catalogue, mode, edition).map((unit) => {
    const requested = catalogue.find((row) => row.variant_id === unit.variantId);
    const selection = requested ? selectGeneralPriceBase(catalogue.filter((row) => row.printing_id === requested.printing_id
      && row.set_id === requested.set_id && row.language_code === requested.language_code)) : null;
    return { ...unit, selection, resolution: selection?.reason ?? null,
      generalBaseCandidates: generalPriceBaseCandidates(catalogue.filter((row) => row.printing_id === requested?.printing_id
        && row.set_id === requested?.set_id && row.language_code === requested?.language_code)) };
  });
}

function dedupeCatalogueRows(rows) {
  const byVariant = new Map();
  for (const row of rows) {
    const key = token(row?.variant_id); if (!key) continue;
    const prior = byVariant.get(key);
    if (!prior) { byVariant.set(key, { ...row }); continue; }
    const merged = { ...row, ...prior };
    for (const [field, value] of Object.entries(row)) if (!String(merged[field] ?? '').trim() && String(value ?? '').trim()) merged[field] = value;
    byVariant.set(key, merged);
  }
  return [...byVariant.values()];
}

export function setValuationUnits(catalogue, mode, edition = 'normal') {
  const scoped = catalogue.filter((c) => ['1st_edition','first_edition'].includes(edition)
    ? c.variant_code === 'first_edition' : c.variant_code !== 'first_edition');
  if (mode === 'master') {
    const slots = new Map();
    for (const c of scoped) {
      const key = JSON.stringify([c.printing_id, variantCode(c.variant_code)]);
      const rows = slots.get(key) ?? []; rows.push(c); slots.set(key, rows);
    }
    return [...slots.values()].map((rows) => rows.length === 1
      ? { variantId: rows[0].variant_id, quantity: 1 } : { quantity: 1, reason: 'unresolved_identity' });
  }
  const groups = new Map();
  for (const c of scoped) { const rows = groups.get(c.printing_id) ?? []; rows.push(c); groups.set(c.printing_id, rows); }
  return [...groups.values()].map((rows) => {
    const normal = rows.filter((c) => ['normal','standard'].includes(c.variant_code));
    const base = normal.length ? normal : rows.filter((c) => ['holo','first_edition'].includes(c.variant_code));
    return base.length === 1 ? { variantId: base[0].variant_id, quantity: 1 } : { quantity: 1, reason: 'unresolved_identity' };
  });
}

export async function prepareCollectionValuation({ supabase, service, ownerId, providerCapacityVerified = false }) {
  const started = performance.now();
  const stages = new Map();
  const measured = async (stage, work) => {
    const at = performance.now();
    try { return await work(); }
    catch (cause) {
      const candidate = String(cause?.code ?? '');
      const code = /^(?:[0-9A-Z]{5}|PGRST\d{3}|[a-z][a-z_]{0,63})$/.test(candidate) ? candidate : 'operation_failed';
      const error = new Error(`Prepared valuation failed at ${stage}: ${code}`);
      error.code = code;
      error.valuationStage = stage;
      error.elapsedMs = Math.round(performance.now() - at);
      throw error;
    } finally {
      const elapsedMs = Math.round(performance.now() - at);
      const timing = stages.get(stage) ?? { calls: 0, elapsedMs: 0, maxMs: 0 };
      timing.calls++; timing.elapsedMs += elapsedMs; timing.maxMs = Math.max(timing.maxMs, elapsedMs);
      stages.set(stage, timing);
    }
  };
  const rpc = (name, args) => measured(name, async () => {
    const { data, error } = await supabase.schema('api').rpc(name,args);
    if (error) throw error;
    return data;
  });
  const claim = await rpc('claim_collection_valuation', { p_owner: ownerId });
  if (!claim) return null;
  const catalogueRevision=await rpc('published_price_catalogue_revision',{});
  const inputs = claim.inputs; const units = ownedValuationUnits(inputs);
  const lookupUnits = [...units, ...inputs.binders.filter((b) => b.source_set_id).map((b) => ({set_id:b.source_set_id,card_id:'',language:b.language}))];
  const references = unique(lookupUnits.flatMap(ownerIdentityLookupRows).flatMap((u) => [u.card_id,u.set_id]).filter(Boolean));
  const identifiers = [];
  for (let offset=0; offset<references.length; offset+=50) identifiers.push(...await measured('catalogue_identifiers', () => readPages(() => supabase.schema('api').from('catalogue_external_identifiers')
    .select('*').in('external_id',references.slice(offset,offset+50)).order('external_id').order('source_entity_type').order('variant_id').order('printing_id').order('set_id'))));
  const uuid = /^[0-9a-f-]{36}$/i;
  const sets = unique([...identifiers.map((i)=>i.set_id), ...units.map((u)=>u.set_id), ...inputs.binders.map((b)=>b.source_set_id)].filter((v)=>uuid.test(v)));
  const catalogueRows = [];
  for (const setId of sets) catalogueRows.push(...await measured('catalogue_members', () => readPages(() => supabase.schema('api').from('catalogue_cards')
    .select('variant_id,printing_id,set_id,set_code,collector_number,language_code,variant_code,finish_code,catalogue_version_id').eq('set_id',setId).order('variant_id'))));
  // Approved printing aliases can prove a general same-printing estimate even
  // when an old saved set alias is absent. Discover only those exact printing
  // IDs; resolution below still verifies set/language/finish uniqueness.
  catalogueRows.push(...await measured('catalogue_printings', () => readGeneralPrintingCatalogue(supabase, units, identifiers, catalogueRows)));
  const catalogue = dedupeCatalogueRows(catalogueRows);
  const resolved = units.map((u) => { const result=resolveValuationUnit(u,identifiers,catalogue); return { ...u, variantId:result.variantId,reason:result.reason }; });
  const generalCandidates = resolved.map((u) => {
    // General estimates are raw Near Mint only. Do not convert a failed exact
    // scope check (for example a graded copy) into a raw-card estimate.
    if (u.reason === 'unsupported_scope' || u.ambiguousDefaults || u.reason === 'ambiguous_saved_identity') return { ...u, generalReason: u.reason };
    const result = resolveGeneralPriceIdentity(u, identifiers, catalogue);
    return result.ok ? { ...u, generalBaseCandidates: result.baseCandidates, resolution: result.resolution, selection: result.selection }
      : { ...u, generalReason: result.reason };
  });
  const variantIds = unique(resolved.map((u)=>u.variantId).filter(Boolean));
  const generalVariantIds = unique(generalCandidates.flatMap((u)=>[u.variantId,...(u.generalBaseCandidates ?? []).map((candidate)=>candidate.baseVariantId)]).filter(Boolean));
  const prices = new Map(); const outcomes = new Map(); const nextAttempts = new Map();
  // Stored-only reads. Fail the generation on any transport error: the prior
  // published generation remains intact, and the lease is resumable after expiry.
  const membersByBinder = new Map(inputs.binders.map((binder) => {
    const references = ownerIdentityLookupRows({set_id:binder.source_set_id,card_id:'',language:binder.language}).map((u)=>u.set_id);
    const setIds = new Set([binder.source_set_id,...identifiers.filter((i)=>i.source_entity_type==='set'
      && references.includes(i.external_id) && (!binder.language || i.language_code===binder.language)).map((i)=>i.set_id)]);
    return [binder.id,catalogue.filter((c)=>setIds.has(c.set_id) && (!binder.language || c.language_code===binder.language))];
  }));
  // Custom binders need prices for their owned cards only. Full-set prices are
  // used exclusively by official binders' standard/master-set totals; reading
  // every other card in a custom binder's source sets creates unused RPC work.
  const allIds = unique([...variantIds,...generalVariantIds,...inputs.binders.filter((b)=>b.type==='official')
    .flatMap((b)=>(membersByBinder.get(b.id)??[]).map((c)=>c.variant_id))]);
  for (let offset=0;offset<allIds.length;offset+=200) {
    const ids=allIds.slice(offset,offset+200);
    const response=await measured('stored_exact_prices',()=>service.storedExactPrices(ids));
    for (const price of response) prices.set(price.variantId,price);
    const states=await measured('catalogue_price_state',()=>queryRows(supabase.from('catalogue_price_state').select('variant_id,outcome,next_attempt_at').in('variant_id',ids)));
    for (const state of states) { outcomes.set(state.variant_id,state.outcome); nextAttempts.set(state.variant_id,state.next_attempt_at); }
  }
  const generalResolved = chooseGeneralPriceUnits(generalCandidates, prices);
  const needsRefresh=claim.refreshRequestedAt && (!claim.refreshCompletedAt || claim.refreshRequestedAt>claim.refreshCompletedAt);
  const collectionChanged=claim.previousCollectionRevision!==inputs.collectionRevision;
  const requestKey=inputs.collectionRevision+':'+(needsRefresh?claim.refreshRequestedAt:'automatic');
  const oldProgress=claim.refreshProgress?.requestKey===requestKey?claim.refreshProgress:null;
  const dueIds=oldProgress?.ids??(needsRefresh?variantIds:collectionChanged?variantIds.filter((id)=>{
    const price=prices.get(id);return (!price || !price.staleAfter || Date.parse(price.staleAfter)<=Date.now())
      && (!nextAttempts.has(id) || Date.parse(nextAttempts.get(id))<=Date.now());
  }):[]);
  const refresh=oldProgress?.counts??{accepted:0,alreadyPending:0,unsupported:resolved.filter((u)=>u.reason==='unsupported_scope').length,
    unresolved:resolved.filter((u)=>!u.variantId&&u.reason!=='unsupported_scope').length,blocked:0};
  let cursor=oldProgress?.cursor??0;
  // Persist a bounded enumeration checkpoint independently of the complete price
  // generation. A crash replays at most this batch, using queue uniqueness.
  const end=Math.min(dueIds.length,cursor+50);
  while(cursor<end) {
    const variantId=dueIds[cursor];
    if (!providerCapacityVerified) refresh.blocked++;
    else try {
      const r=await service.requestSnapshotRefresh(variantId,{productType:'raw_card',currency:'GBP'},ownerId);
      if(r.status==='queued')refresh.accepted++;else if(r.status==='already_queued')refresh.alreadyPending++;else refresh.blocked++;
    } catch(error) { if(error.status===422)refresh.unsupported++;else if(error.status===503)refresh.blocked++;else throw error; }
    cursor++;
  }
  const refreshComplete=cursor===dueIds.length;
  if(needsRefresh||collectionChanged||oldProgress&&!oldProgress.complete) {
    const saved=await rpc('checkpoint_collection_refresh',{p_owner:ownerId,p_lease:claim.lease,
      p_progress:{requestKey,ids:dueIds,cursor,counts:refresh,complete:refreshComplete}});
    if(!saved)throw Error('Private refresh checkpoint lease expired');
  }
  refresh.remaining=dueIds.length-cursor;
  const cycleStatus=await rpc('catalogue_price_cycle_status',{});
  const summary={cycle:cycleStatus?{id:cycleStatus.cycle.id,dueAt:cycleStatus.cycle.due_at,overdue:cycleStatus.overdue,population:cycleStatus.cycle.population,accounted:cycleStatus.cycle.checkpoint}:null,...summarisePreparedUnits(resolved,outcomes,prices), collectionRevision:inputs.collectionRevision,
    valuationRevision:randomUUID(),calculatedAt:new Date().toISOString(),refresh:needsRefresh?refresh:null,
    catalogueRevisions:unique(catalogue.map((c)=>c.catalogue_version_id)),
    binders:inputs.binders.map((b)=>{
      const owned=resolved.filter((u)=>u.binderIds.includes(b.id));
      const members=membersByBinder.get(b.id)??[];
      return {binderId:b.id,owned:summarisePreparedUnits(owned,outcomes,prices),
        standardSet:b.type==='official'&&members.length?summarisePreparedUnits(setValuationUnits(members,'standard',b.edition),outcomes,prices):null,
        masterSet:b.type==='official'&&members.length?summarisePreparedUnits(setValuationUnits(members,'master',b.edition),outcomes,prices):null};
    })};
  summary.general = {
    cycle: summary.cycle,
    ...summarisePreparedUnits(generalResolved,outcomes,prices,Date.now(),{ general: true }),
    collectionRevision: summary.collectionRevision,
    valuationRevision: summary.valuationRevision,
    calculatedAt: summary.calculatedAt,
    refresh: summary.refresh,
    catalogueRevisions: summary.catalogueRevisions,
    trend: { scope: null, evidence: null, eligible: false, points: [] },
    binders: inputs.binders.map((b) => {
      const owned = generalResolved.filter((u) => u.binderIds.includes(b.id));
      const members = membersByBinder.get(b.id) ?? [];
      const standard = chooseGeneralPriceUnits(generalSetPriceCandidates(members,'standard',b.edition), prices);
      const master = chooseGeneralPriceUnits(generalSetPriceCandidates(members,'master',b.edition), prices);
      return { binderId: b.id, owned: summarisePreparedUnits(owned,outcomes,prices,Date.now(),{ general: true }),
        standardSet: b.type==='official'&&members.length ? summarisePreparedUnits(standard,outcomes,prices,Date.now(),{ general: true }) : null,
        masterSet: b.type==='official'&&members.length ? summarisePreparedUnits(master,outcomes,prices,Date.now(),{ general: true }) : null };
    }),
  };
  if(JSON.stringify(await rpc('published_price_catalogue_revision',{}))!==JSON.stringify(catalogueRevision)) throw Error('Published catalogue changed during valuation preparation');
  const evidence=valuationTrendEvidence(resolved,prices,summary);
  const history=await rpc('collection_valuation_trend',{p_owner:ownerId,p_scope:evidence.scope});
  summary.trend={scope:evidence.scope,evidence:evidence.evidence,eligible:evidence.eligible,
    points:mergeValuationTrend(history??[],{at:summary.calculatedAt,total:summary.total,evidence:evidence.evidence},evidence.eligible)};
  const published=await rpc('publish_collection_valuation',{p_owner:ownerId,p_lease:claim.lease,p_revision:inputs.collectionRevision,
    p_summary:summary,p_refresh_completed:needsRefresh&&refreshComplete?claim.refreshRequestedAt:null});
  return {published,summary,diagnostics:{elapsedMs:Math.round(performance.now()-started),
    ownedPriceIdentities:variantIds.length,storedPriceIdentities:allIds.length,stages:Object.fromEntries(stages)}};
}

export function valuationTrendEvidence(units, prices, summary) {
  const digest=(value)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const priced=units.filter((u)=>u.variantId).map((u)=>{
    const p=prices.get(u.variantId);
    return [u.variantId,u.quantity,p?.currency,p?.primarySource??(p?.sourceBreakdown??[]).map((s)=>s.sourceId??s.source_id??s.providerCode??s.provider_code??s).sort(),p?.priceBasis,p?.estimateVersion,p?.calculatedAt,p?.estimates?.central];
  }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {scope:digest(priced.map((p)=>p.slice(0,6))),evidence:digest(priced),
    eligible:summary.totalUnits>0&&summary.freshUnits===summary.totalUnits&&summary.unpricedUnits===0};
}

export function mergeValuationTrend(history, point, eligible) {
  const valid=history.filter((p)=>Number.isFinite(p.total)&&p.total>=0&&Number.isFinite(Date.parse(p.at)));
  if(eligible && Number.isFinite(point.total) && valid.at(-1)?.evidence!==point.evidence) {
    const bucket=(at)=>Math.floor(Date.parse(at)/1800000);
    if(valid.length&&bucket(valid.at(-1).at)===bucket(point.at))valid.pop();
    valid.push(point);
  }
  return valid.slice(-1441);
}
