/** Project an acknowledged canonical write into legacy chart storage.
 * A multi-sale estimate is never the amount of an individual "Last sold".
 */
export function projectCanonicalSnapshot(identity, estimate, confidence, publication) {
  if (publication?.status !== 'applied') {
    return { estimate: { ...estimate, priceBasis: 'normalised_delivered_price_gbp' }, confidence };
  }
  const row = publication.estimate;
  if (publication.dryRun !== false || publication.writtenCount !== 1
    || !row || row.variant_id !== identity.canonicalVariantId
    || row.product_kind !== 'raw_card' || row.grader_code || row.grade_id || row.sealed_product_variant_id
    || row.condition_code !== `raw_${String(identity.rawCondition ?? '').replace(/^raw_/, '')}`
    || row.display_currency_code !== 'GBP'
    || row.outlier_summary?.price_basis !== 'item_price_excludes_shipping'
    || !Number.isFinite(row.central_estimate) || row.central_estimate <= 0
    || !Array.isArray(row.source_breakdown) || !row.source_breakdown.length) {
    throw new Error('Acknowledged canonical estimate does not match the snapshot scope and price basis.');
  }
  return {
    estimate: {
      ...estimate,
      decisionCase: 'CANONICAL_RETAINED_SOLD_AGGREGATE',
      priceType: 'recent_sold_market_estimate',
      priceBasis: 'item_price_excludes_shipping',
      marketEstimate: row.central_estimate,
      lowEstimate: row.low_estimate,
      highEstimate: row.high_estimate,
      ebaySoldEstimate: null,
      secondaryConsensusEstimate: null,
      activeListingIndication: null,
      compCount: row.sample_count,
      soldCompCount: row.sold_sample_count,
      activeListingCount: 0,
      sourceCount: row.source_count,
      primarySource: row.source_breakdown[0].source,
      sourceBreakdown: row.source_breakdown,
      calculatedAt: row.calculated_at,
      staleAfter: row.stale_after,
      isStale: row.freshness === 'stale',
      canonicalEstimateVersionId: row.estimate_version_id,
      volatility: null,
      rejectedObservationCount: null,
      outlierCount: row.outlier_summary.excluded_outlier_count,
      disagreementPercentage: null,
      disagreementReason: null,
    },
    confidence: {
      score: row.confidence_score,
      label: row.confidence_label,
      explanation: `Aggregate of ${row.sold_sample_count} retained exact GBP sales, excluding shipping; not an individual last-sale price.`,
    },
  };
}
