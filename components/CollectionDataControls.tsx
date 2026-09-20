import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Share } from 'react-native';
import { createCollectionExport, CollectionExportError } from '../lib/collectionExport';
import { supabase } from '../lib/supabase';
import { UtilityGroup, UtilityRow } from './UtilityScreen';
import { useTheme } from './theme-context';

/** Settings-owned UI. It exports only saved user rows and never reports a sync state it cannot verify. */
export function CollectionDataControls() {
  const { theme } = useTheme();
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const exportingRef = useRef(false);
  const mounted = useRef(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    mounted.current = true;
    const subscription = supabase.auth.onAuthStateChange(() => {
      generation.current += 1;
      controller.current?.abort();
      controller.current = null;
      exportingRef.current = false;
      if (mounted.current) setExporting(false);
    });
    return () => {
      mounted.current = false;
      subscription.data.subscription.unsubscribe();
      controller.current?.abort();
      controller.current = null;
      exportingRef.current = false;
    };
  }, []);

  const exportCollection = useCallback(async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
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
      if (controller.current === request) {
        controller.current = null;
        exportingRef.current = false;
        if (mounted.current) setExporting(false);
      }
    }
  }, []);

  return <UtilityGroup title="Your collection data">
    <UtilityRow
      title="Export saved collection"
      detail="Includes server-saved entries only. Finish pending edits before export. This is not a full personal-data export."
      onPress={() => { void exportCollection(); }}
      disabled={exporting}
      trailing={exporting ? <ActivityIndicator color={theme.colors.primary} /> : undefined}
    />
  </UtilityGroup>;
}
