import React, { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'expo-router';
import { AppState } from 'react-native';
import { canInspectCatalogueCard, type CardInspectionRequest } from '../lib/cardInspection';
import { stackrHaptics } from '../lib/haptics';
import { beginRetrieval } from '../lib/performance';

// Neither the motion hooks nor the native renderer load when a list mounts.
const CardInspectionViewer = lazy(() => import('./CardInspectionViewer'));
const InspectionContext = createContext<{ inspectCard: (request: CardInspectionRequest) => void }>({ inspectCard: () => {} });

export function useCardInspection() { return useContext(InspectionContext); }

export function CardInspectionProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<CardInspectionRequest | null>(null);
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const pathname = usePathname();
  const inspectionGeneration = useRef(0);
  const retrievalTrace = useRef<ReturnType<typeof beginRetrieval> | null>(null);
  const currentPathname = useRef(pathname);
  if (currentPathname.current !== pathname) {
    currentPathname.current = pathname;
    inspectionGeneration.current++;
  }
  const inspectCard = useCallback((next: CardInspectionRequest) => {
    if (!canInspectCatalogueCard(next)) return;
    const generation = ++inspectionGeneration.current;
    retrievalTrace.current?.cancel();
    retrievalTrace.current = beginRetrieval('inspection', 'inspection-request');
    const requestPathname = currentPathname.current;
    afterClose.current = undefined;
    setRequest(next);
    void stackrHaptics.cardInspection(() => inspectionGeneration.current === generation
      && currentPathname.current === requestPathname && AppState.currentState === 'active');
  }, []);
  const close = useCallback((action?: () => void) => {
    inspectionGeneration.current++;
    retrievalTrace.current?.cancel();
    afterClose.current = action;
    setRequest(null);
  }, []);
  useEffect(() => { inspectionGeneration.current++; retrievalTrace.current?.cancel(); setRequest(null); afterClose.current = undefined; }, [pathname]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { inspectionGeneration.current++; retrievalTrace.current?.cancel(); }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => () => { inspectionGeneration.current++; retrievalTrace.current?.cancel(); }, []);
  useEffect(() => {
    // Run binder actions after the inspection Modal has unmounted. The modal
    // has no native dismissal animation that could race another native sheet.
    if (!request && afterClose.current) {
      const action = afterClose.current;
      afterClose.current = undefined;
      action();
    }
  }, [request]);
  const value = useMemo(() => ({ inspectCard }), [inspectCard]);
  return <InspectionContext.Provider value={value}>
    {children}
    {request ? <Suspense fallback={null}><CardInspectionViewer
      key={`${request.card.id}:${request.selectedVariantId ?? ''}:${request.imageUri}`}
      request={request} onClose={close} onDiagnostic={retrievalTrace.current?.image} /></Suspense> : null}
  </InspectionContext.Provider>;
}
