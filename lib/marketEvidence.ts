type MarketEvidence = {
  count?: number | null;
  soldCount?: number | null;
  primarySource?: string | null;
} | null;

export const formatMarketEvidence = (data: MarketEvidence): string | null => {
  if (!data) return null;
  const parts: string[] = [];
  if (data.count != null && data.count > 0) {
    parts.push(`${data.count} market observation${data.count === 1 ? '' : 's'}`);
  }
  if (data.soldCount != null && data.soldCount > 0) {
    parts.push(`${data.soldCount} sold`);
  }
  if (data.primarySource) parts.push(`Primary source: ${data.primarySource}`);
  return parts.length ? `Based on ${parts.join(' · ')}` : null;
};

export const formatEvidenceStatus = (status: string | null | undefined): string =>
  status ? status.replace(/_/g, ' ') : 'market estimate';
