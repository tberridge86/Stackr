function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  const rows = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

function daysSince(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (Date.now() - time) / 86_400_000);
}

export function calculateConfidence(estimate, observations, identity) {
  if (!estimate?.marketEstimate) {
    return {
      score: 0,
      label: 'low',
      explanation: 'Insufficient exact market evidence.',
    };
  }

  const used = estimate.observationsUsed ?? [];
  const sold = estimate.soldCompCount ?? 0;
  const activeOnly = estimate.priceType === 'asking_price_indication';
  const avgMatch = average(used.map((row) => row.matchScore)) ?? 0;
  const newestAge = Math.min(...used.map((row) => daysSince(row.soldAt ?? row.listedAt ?? row.fetchedAt) ?? 365));
  const recencyScore = newestAge <= 7 ? 14 : newestAge <= 30 ? 11 : newestAge <= 90 ? 7 : newestAge <= 180 ? 4 : 1;
  const compScore = clamp((estimate.compCount ?? 0) * 4, 0, 18);
  const soldScore = clamp(sold * 9, 0, 30);
  const sourceScore = clamp((estimate.sourceCount ?? 0) * 4, 0, 10);
  const matchScore = clamp(avgMatch * 16, 0, 16);
  const languageCertainty = identity?.language ? 6 : 2;
  const variantCertainty = identity?.finish && identity.finish !== 'unknown_finish' ? 5 : 2;
  const dispersionPenalty = clamp((estimate.volatility ?? 0) * 35, 0, 18);
  const disagreementPenalty = estimate.needsReview ? 16 : 0;
  const stalePenalty = newestAge > 180 ? 12 : newestAge > 90 ? 6 : 0;

  let score = 12
    + compScore
    + soldScore
    + sourceScore
    + matchScore
    + recencyScore
    + languageCertainty
    + variantCertainty
    - dispersionPenalty
    - disagreementPenalty
    - stalePenalty;

  if (sold === 0 && estimate.priceType !== 'market_estimate') score = Math.min(score, 39);
  if (activeOnly) score = Math.min(score, 34);
  if ((estimate.compCount ?? 0) <= 1) score = Math.min(score, 44);
  if (estimate.needsReview) score = Math.min(score, 58);
  score = Math.round(clamp(score, 0, 100));

  const label = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
  let explanation;
  if (activeOnly) {
    explanation = `Low confidence: based mainly on ${estimate.activeListingCount} current asking price${estimate.activeListingCount === 1 ? '' : 's'}.`;
  } else if (sold > 0) {
    explanation = `Based on ${sold} verified sold comp${sold === 1 ? '' : 's'} and ${estimate.compCount - sold} supporting observation${estimate.compCount - sold === 1 ? '' : 's'}.`;
  } else {
    explanation = `Based on ${estimate.compCount} secondary market observation${estimate.compCount === 1 ? '' : 's'}; no verified recent sold comps available.`;
  }

  if (estimate.needsReview) {
    explanation += ' Source disagreement reduced confidence.';
  }

  return { score, label, explanation };
}
