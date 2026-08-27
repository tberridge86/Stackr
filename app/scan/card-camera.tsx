import { Redirect } from 'expo-router';
import React from 'react';

/**
 * The former VisionCamera experiment had a second, incomplete permission
 * flow. Keep old links working while routing every release user through the
 * single hardened Expo Camera scanner.
 */
export default function LegacyCardCameraRedirect() {
  return <Redirect href="/scan" />;
}
