import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Share, TouchableOpacity, View } from 'react-native';
import { createCollectionExport, CollectionExportError } from '../lib/collectionExport';
import { supabase } from '../lib/supabase';
import { Text } from './Text';
import { useTheme } from './theme-context';

/** Settings-owned UI. It exports only saved user rows and never reports a sync state it cannot verify. */
export function CollectionDataControls() {
  const { theme } = useTheme();
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const subscription = supabase.auth.onAuthStateChange(() => {
      generation.current += 1;
      controller.current?.abort();
    });
    return () => { subscription.data.subscription.unsubscribe(); controller.current?.abort(); };
  }, []);

  const exportCollection = useCallback(async () => {
    if (exporting) return;
    const requestGeneration = generation.current;
    const request = new AbortController();
    controller.current = request;
    setExporting(true);
    try {
      const payload = await createCollectionExport({ signal: request.signal, isCurrent: () => generation.current === requestGeneration });
      if (request.signal.aborted || generation.current !== requestGeneration) return;
      await Share.share({ title: 'Stackr collection export', message: JSON.stringify(payload, null, 2) });
    } catch (error) {
      if (error instanceof CollectionExportError && error.code === 'cancelled') return;
      Alert.alert('Collection export unavailable', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      if (controller.current === request) controller.current = null;
      if (generation.current === requestGeneration) setExporting(false);
    }
  }, [exporting]);

  return <View style={{ padding: 16, marginBottom: 14, backgroundColor: theme.colors.card, borderRadius: 16 }}>
    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Your collection data</Text>
    <Text style={{ color: theme.colors.textSoft, marginTop: 4, lineHeight: 19 }}>Export your saved binders and card rows as JSON. Images, prices, catalogue data and secret URLs are not included.</Text>
    <Text style={{ color: theme.colors.textSoft, marginTop: 6, lineHeight: 19 }}>Sync status is not shown because this screen cannot verify every account queue safely.</Text>
    <TouchableOpacity accessibilityRole="button" disabled={exporting} onPress={() => { void exportCollection(); }} style={{ paddingVertical: 12 }}>
      <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>{exporting ? 'Preparing export…' : 'Export collection data'}</Text>
    </TouchableOpacity>
  </View>;
}
