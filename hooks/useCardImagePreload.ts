import { useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { prefetchStackrImagesAfterInteractions } from '../components/StackrImage';
import { cardImagePreloadWindow } from '../lib/cardImagePreloadWindow';

type ViewableImage = { index: number | null; isViewable?: boolean };

/** Follows the viewport, cancels obsolete queued work, and leaves full-size
 * artwork to the existing detail/inspection path. No catalogue/ownership writes. */
export function useCardImagePreload(thumbnails: readonly (string | null | undefined)[], initialCount = 6) {
  const focused = useIsFocused();
  const latest = useRef({ thumbnails, focused });
  latest.current = { thumbnails, focused };
  const queued = useRef<(() => void) | null>(null);
  const previous = useRef('');
  const schedule = useCallback((indices: number[]) => {
    const state = latest.current;
    const urls = state.focused ? cardImagePreloadWindow(state.thumbnails, indices) : [];
    const signature = JSON.stringify(urls);
    if (signature === previous.current) return;
    previous.current = signature;
    queued.current?.();
    queued.current = urls.length ? prefetchStackrImagesAfterInteractions(urls, urls.length) : null;
  }, []);
  const signature = JSON.stringify(thumbnails);
  useEffect(() => {
    previous.current = '';
    schedule(Array.from({ length: Math.min(12, Math.max(0, initialCount)) }, (_, index) => index));
    return () => { queued.current?.(); queued.current = null; previous.current = ''; };
  }, [signature, focused, initialCount, schedule]);
  return useCallback(({ viewableItems }: { viewableItems: ViewableImage[] }) => {
    schedule(viewableItems.filter(item => item.isViewable !== false && item.index != null).map(item => item.index!));
  }, [schedule]);
}
