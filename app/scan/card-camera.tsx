import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { getLegacyCameraRedirect, type LegacyCameraParams } from '../../lib/scanLegacyRoute';

/** Legacy deep-link alias: capture and review always use canonical ScanScreen. */
export default function CardCameraScreen() {
  const params = useLocalSearchParams<LegacyCameraParams>();
  return <Redirect href={getLegacyCameraRedirect(params)} />;
}
