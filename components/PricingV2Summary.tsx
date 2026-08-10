import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { fetchStackrPricingV2, PRICING_ENGINE_V2_ENABLED, PricingV2Response } from '../lib/pricingV2';

type Props = {
  cardId: string;
  language?: string | null;
  variant?: string | null;
  finish?: string | null;
  edition?: string | null;
  condition?: string | null;
  productType?: string | null;
  gradingCompany?: string | null;
  grade?: string | number | null;
};

function formatMoney(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? `\u00A3${value.toFixed(2)}` : null;
}

function formatDate(value?: string | null) {
  if (!value) return 'Not refreshed yet';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getStateCopy(data: PricingV2Response | null) {
  if (!data) {
    return {
      headline: 'Pricing evidence loading',
      body: 'Checking the latest cached Stackr price snapshot.',
      action: 'Refresh',
    };
  }
  if (data.state === 'asking_price_indication') {
    return {
      headline: `${formatMoney(data.marketPrice) ?? 'No price'} asking-price indication`,
      body: 'No verified recent sold comps are available, so this is based on the lower end of current asking prices.',
      action: 'How calculated',
    };
  }
  if (data.state === 'stale_verified_value') {
    return {
      headline: `${formatMoney(data.marketPrice) ?? 'No price'} last verified value`,
      body: 'This price is stale. A refresh has been queued so the card is not shown as freshly priced.',
      action: 'How calculated',
    };
  }
  if (data.marketPrice != null) {
    const range = data.lowPrice != null && data.highPrice != null
      ? ` Range ${formatMoney(data.lowPrice)}-${formatMoney(data.highPrice)}.`
      : '';
    return {
      headline: `${formatMoney(data.marketPrice)} estimated value`,
      body: `${data.confidence.explanation}${range}`,
      action: 'How calculated',
    };
  }
  return {
    headline: 'Insufficient exact market evidence',
    body: data.refreshQueued
      ? 'A pricing refresh has been queued. Stackr will not copy a similar card price into this slot.'
      : 'No safe exact match is available yet.',
    action: 'How calculated',
  };
}

export default function PricingV2Summary(props: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [data, setData] = useState<PricingV2Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = async (forceRefresh = false) => {
    if (!props.cardId || !PRICING_ENGINE_V2_ENABLED) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStackrPricingV2(props.cardId, {
        language: props.language,
        variant: props.variant,
        finish: props.finish,
        edition: props.edition,
        condition: props.condition,
        productType: props.productType,
        gradingCompany: props.gradingCompany,
        grade: props.grade,
        forceRefresh,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pricing unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.cardId, props.language, props.variant, props.finish, props.edition, props.condition, props.productType, props.gradingCompany, props.grade]);

  if (!PRICING_ENGINE_V2_ENABLED) return null;

  const copy = getStateCopy(data);
  const confidenceColor = data?.confidence.label === 'high'
    ? '#20C997'
    : data?.confidence.label === 'medium'
      ? '#F5B941'
      : '#7C3AED';

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.copyWrap}>
          <Text style={styles.eyebrow}>Stackr verified pricing</Text>
          <Text style={styles.title}>{copy.headline}</Text>
        </View>
        {loading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
      </View>

      <Text style={styles.body}>{error ?? copy.body}</Text>

      <View style={styles.metaRow}>
        <View style={[styles.confidencePill, { borderColor: confidenceColor, backgroundColor: confidenceColor + '14' }]}>
          <Text style={[styles.confidenceText, { color: confidenceColor }]}>
            {data ? `${data.confidence.label.toUpperCase()} confidence` : 'Loading'}
          </Text>
        </View>
        <Text style={styles.metaText}>
          {data?.evidence.soldCompCount ?? 0} sold comps
        </Text>
        <Text style={styles.metaText}>
          Refreshed {formatDate(data?.lastUpdated)}
        </Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setExpanded((current) => !current)}>
          <Text style={styles.secondaryButtonText}>{expanded ? 'Hide detail' : copy.action}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => load(true)} disabled={loading}>
          <Text style={styles.secondaryButtonText}>{loading ? 'Refreshing' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {expanded ? (
        <View style={styles.detailBox}>
          <Text style={styles.detailLine}>Primary evidence: {data?.evidence.primarySource ?? 'none'}</Text>
          <Text style={styles.detailLine}>Observations used: {data?.evidence.compCount ?? 0}</Text>
          <Text style={styles.detailLine}>Active listings: {data?.evidence.activeListingCount ?? 0}</Text>
          <Text style={styles.detailLine}>Identity: {data?.identityKey ?? 'pending'}</Text>
          {data?.sourceBreakdown?.length ? (
            data.sourceBreakdown.slice(0, 4).map((source) => (
              <Text key={`${source.source}-${source.sourceType}`} style={styles.detailLine}>
                {source.source}: {formatMoney(source.estimate) ?? 'no value'} from {source.observationsUsed}
              </Text>
            ))
          ) : (
            <Text style={styles.detailLine}>No exact source breakdown yet.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: theme.colors.primary + '35',
    backgroundColor: theme.colors.primary + '0D',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  copyWrap: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    marginTop: 2,
  },
  body: {
    color: theme.colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  confidencePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '900',
  },
  metaText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary + '35',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: theme.colors.card,
  },
  secondaryButtonText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  detailBox: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.primary + '22',
    paddingTop: 10,
    gap: 5,
  },
  detailLine: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
});
