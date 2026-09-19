import React, { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'expo-router';
import { canInspectCatalogueCard, type CardInspectionRequest } from '../lib/cardInspection';
import { stackrHaptics } from '../lib/haptics';

// Neither the motion hooks nor the native renderer load when a list mounts.
const CardInspectionViewer = lazy(() => import('./CardInspectionViewer'));
const InspectionContext = createContext<{ inspectCard: (request: CardInspectionRequest) => void }>({ inspectCard: () => {} });

export function useCardInspection() { return useContext(InspectionContext); }

export function CardInspectionProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<CardInspectionRequest | null>(null);
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const pathname = usePathname();
  const inspectCard = useCallback((next: CardInspectionRequest) => {
    if (!canInspectCatalogueCard(next)) return;
    afterClose.current = undefined;
    setRequest(next);
    void stackrHaptics.cardPreview();
  }, []);
  const close = useCallback((action?: () => void) => {
    afterClose.current = action;
    setRequest(null);
  }, []);
  useEffect(() => { setRequest(null); afterClose.current = undefined; }, [pathname]);
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
      request={request} onClose={close} /></Suspense> : null}
  </InspectionContext.Provider>;
}
