import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StackrScreen, StackrPageHeader } from '../../components/StackrScreen';
import { StackrButton } from '../../components/StackrControls';
import { StackrImage } from '../../components/StackrImage';
import { StackrLoadingIndicator } from '../../components/StackrLoadingIndicator';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { fetchStackrCard, type StackrLegacyCard } from '../../lib/stackrDomainAdapter';
import { getCardArtworkPresentation } from '../../lib/cardArtworkPresentation';
import { stackrTabContentPadding } from '../../lib/stackrSizing';

export default function CoreCardDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; language?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const language = Array.isArray(params.language) ? params.language[0] : params.language;
  const { theme } = useTheme();
  const [state, setState] = useState<{ key: string; card: StackrLegacyCard | null; loading: boolean; error: string | null }>({
    key: '', card: null, loading: true, error: null,
  });
  const [attempt, setAttempt] = useState(0);
  const key = `${id ?? ''}:${language ?? ''}`;

  useEffect(() => {
    const request = new AbortController();
    setState({ key, card: null, loading: true, error: null });
    if (!id) {
      setState({ key, card: null, loading: false, error: 'This card link is incomplete.' });
      return () => request.abort();
    }
    let factsShown = false;
    void fetchStackrCard(id, {
      language, signal: request.signal,
      onCanonicalCard: (card) => {
        if (request.signal.aborted) return;
        factsShown = true;
        setState({ key, card, loading: false, error: null });
      },
    }).then((card) => {
      if (request.signal.aborted) return;
      setState({ key, card, loading: false, error: card ? null : 'This exact card could not be found.' });
    }).catch(() => {
      if (request.signal.aborted) return;
      setState(previous => ({ ...previous, key, loading: false,
        error: factsShown ? 'The card is available. Its artwork could not be refreshed.' : 'The card could not be loaded. Please try again.' }));
    });
    return () => request.abort();
  }, [attempt, id, key, language]);

  const current = state.key === key ? state : { card: null, loading: true, error: null };
  const card = current.card;
  const artwork = getCardArtworkPresentation(card);
  const title = card?.englishDisplayName ?? card?.name ?? 'Card';
  return (
    <StackrScreen variant="detail">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: stackrTabContentPadding.standard }}>
        <StackrButton label="Back" variant="secondary" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/search')} />
        <StackrPageHeader title={title} subtitle={card ? `${card.set.name} · ${card.number} · ${card.language.toUpperCase()}` : undefined} />
        {current.loading ? <StackrLoadingIndicator accessibilityLabel="Loading card" /> : null}
        {current.error ? <View style={{ gap: 10 }}>
          <Text accessibilityRole="alert">{current.error}</Text>
          <StackrButton label="Retry" onPress={() => setAttempt(value => value + 1)} />
        </View> : null}
        {card ? <>
          <StackrImage
            key={key}
            uri={artwork?.large ?? card.images.large ?? card.images.small}
            thumbnailUri={artwork?.small ?? card.images.small}
            fallbackUris={artwork?.candidates.map(candidate => candidate.uri)}
            accessibilityLabel={title}
            contentFit="contain"
            preserveDetail
            transition={0}
            style={{ width: '100%', aspectRatio: 0.716, backgroundColor: theme.colors.card, borderRadius: 18 }}
          />
          {card.localName && card.localName !== title ? <Text style={{ color: theme.colors.textSoft }}>{card.localName}</Text> : null}
          <StackrButton label="View set" variant="secondary" onPress={() => router.push({ pathname: '/set/[id]', params: { id: card.set.id, language: card.language } })} />
          <StackrButton label="Open binders" onPress={() => router.push('/(tabs)/binder')} />
        </> : null}
      </ScrollView>
    </StackrScreen>
  );
}

