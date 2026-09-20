function clean(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalFinish(row) {
  return ['normal', 'standard', 'default'].includes(clean(row?.variant_code))
    && ['normal', 'standard', 'default', 'non_holo'].includes(clean(row?.finish_code));
}

function holoFinish(row) {
  return clean(row?.variant_code) === 'holo' && clean(row?.finish_code) === 'holo';
}

/**
 * Select a same-printing general-price base. This function does not resolve
 * saved references: callers must first prove printing, set and language.
 */
export function selectGeneralPriceBase(rows) {
  const candidates = (rows ?? []).filter((row) => clean(row?.variant_id)
    && clean(row?.printing_id) && clean(row?.set_id) && clean(row?.language_code));
  const groups = new Set(candidates.map((row) => `${clean(row.printing_id)}:${clean(row.set_id)}:${clean(row.language_code)}`));
  if (groups.size !== 1) return null;
  const unique = (items) => [...new Map(items.map((row) => [clean(row.variant_id), row])).values()];
  const normal = unique(candidates.filter(normalFinish));
  const holo = unique(candidates.filter(holoFinish));
  const base = normal.length === 1 ? normal[0] : !normal.length && holo.length === 1 ? holo[0] : null;
  if (!base) return null;
  return {
    baseVariantId: clean(base.variant_id),
    printingId: clean(base.printing_id),
    setId: clean(base.set_id),
    language: clean(base.language_code),
    finishCode: clean(base.finish_code),
    reason: normal.length === 1 ? 'same_printing_normal_base' : 'same_printing_unique_holo_base',
  };
}

/** A normal base is preferred, but a unique holo is retained as a separate
 * candidate when the normal has no usable stored exact quote. */
export function generalPriceBaseCandidates(rows) {
  const structural = selectGeneralPriceBase(rows);
  if (!structural) return [];
  const candidates = (rows ?? []).filter((row) => clean(row?.variant_id)
    && clean(row?.printing_id) && clean(row?.set_id) && clean(row?.language_code));
  const holo = [...new Map(candidates.filter(holoFinish).map((row) => [clean(row.variant_id), row])).values()];
  if (structural.reason !== 'same_printing_normal_base' || holo.length !== 1) return [structural];
  return [structural, {
    baseVariantId: clean(holo[0].variant_id), printingId: clean(holo[0].printing_id), setId: clean(holo[0].set_id),
    language: clean(holo[0].language_code), finishCode: clean(holo[0].finish_code), reason: 'same_printing_unique_holo_base',
  }];
}

/** Never turn an existing fallback into another fallback. */
export function wrapGeneralEstimate(exactPrice, selection, resolution = {}) {
  const central = exactPrice?.estimates?.central;
  if (!selection || exactPrice?.fallbackEstimate || exactPrice?.quoteScope === 'printing_level'
    || exactPrice?.currency !== 'GBP' || typeof central !== 'number' || !Number.isFinite(central)
    || central < 0 || exactPrice?.status === 'unavailable') return null;
  return {
    ...exactPrice,
    quoteScope: 'printing_level',
    status: 'market_estimate',
    priceType: 'market_estimate',
    priceBasis: 'same_printing_general_card_estimate',
    sample: { ...(exactPrice.sample ?? {}), sold: 0, active: 0 },
    provenLastSold: false,
    lastSoldEvidence: null,
    generalEstimate: {
      exact: false,
      baseVariantId: selection.baseVariantId,
      printingId: selection.printingId,
      setId: selection.setId,
      language: selection.language,
      baseFinishCode: selection.finishCode,
      resolution: typeof resolution === 'string' ? resolution : resolution.reason ?? selection.reason,
    },
    fallbackEstimate: {
      identityKey: null,
      reason: 'general_card_estimate',
      exact: false,
      baseVariantId: selection.baseVariantId,
      printingId: selection.printingId,
      language: selection.language,
      finishCode: selection.finishCode,
      resolution: typeof resolution === 'string' ? resolution : resolution.reason ?? selection.reason,
    },
  };
}
