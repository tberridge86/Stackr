import React, { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';

const IPHONE_15_PREVIEW_WINDOW_NAME = 'stackr-iphone-15-preview';

function isIphone15LayoutPreview() {
  return Platform.OS === 'web'
    && typeof window !== 'undefined'
    && window.name === IPHONE_15_PREVIEW_WINDOW_NAME;
}

export function StackrSafeAreaBoundary({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();

  const previewMetrics = useMemo(() => {
    if (!isIphone15LayoutPreview()) return null;

    const portrait = height >= width;
    return {
      frame: { x: 0, y: 0, width, height },
      insets: portrait
        ? { top: 59, right: 0, bottom: 34, left: 0 }
        : { top: 0, right: 34, bottom: 0, left: 59 },
    };
  }, [height, width]);

  // Only the named browser preview needs simulated insets. Native keeps its
  // existing provider and inset ownership; this boundary adds no layout padding.
  if (!previewMetrics) return <>{children}</>;

  return (
    <SafeAreaFrameContext.Provider value={previewMetrics.frame}>
      <SafeAreaInsetsContext.Provider value={previewMetrics.insets}>
        {children}
      </SafeAreaInsetsContext.Provider>
    </SafeAreaFrameContext.Provider>
  );
}
