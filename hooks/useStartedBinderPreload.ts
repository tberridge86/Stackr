import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import type { BinderRecord } from '../lib/binders';

/** Prepare already-started private binders without delaying library rendering. */
export function useStartedBinderPreload(binders: BinderRecord[], accountId: string | null, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !accountId || !binders.length) return;
    let cancelled = false;
    const isCurrent = () => !cancelled;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!isCurrent()) return;
      void import('../lib/binderReopenRuntime').then(({ preloadBinderReopenViews }) => {
        if (isCurrent()) return preloadBinderReopenViews(binders, accountId, isCurrent);
      }).catch(() => {});
    });
    return () => { cancelled = true; task.cancel?.(); };
  }, [binders, accountId, enabled]);
}
