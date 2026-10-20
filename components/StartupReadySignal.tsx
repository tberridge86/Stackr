import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSegments } from 'expo-router';
import { useAuth } from './auth-context';
import { useProfile } from './profile-context';
import { markStartupPhase } from '../lib/performance';

/** The presentation can leave once navigation (or its retry UI) has committed. */
export function StartupReadySignal({ onReady }: { onReady: () => void }) {
  const segments: readonly string[] = useSegments();
  const { error: authError } = useAuth();
  const { error: profileError } = useProfile();
  const [laidOut, setLaidOut] = useState(false);
  const initialRoute = segments.length === 0 || (segments.length === 1 && segments[0] === 'index');
  const ready = !initialRoute || Boolean(authError || profileError);

  useEffect(() => {
    if (!laidOut || !ready) return;
    // Give the committed navigator a frame before fading the cover. This is
    // shell readiness, not proof that remote collection data/images have loaded.
    const frame = requestAnimationFrame(() => {
      markStartupPhase('navigation-ready');
      onReady();
    });
    return () => cancelAnimationFrame(frame);
  }, [laidOut, onReady, ready]);

  return <View pointerEvents="none" accessible={false} style={{ position: 'absolute', width: 1, height: 1 }}
    onLayout={() => { markStartupPhase('shell-layout'); setLaidOut(true); }} />;
}
