import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path: string) {
  return readFile(path, 'utf8');
}

async function main() {
  const [haptics, scanLearning, liveAnalyser, mainScanner, scanResult, ownerScanner, settings] = await Promise.all([
    source('lib/haptics.ts'),
    source('lib/scanLearning.ts'),
    source('lib/useLiveCardFrameAnalyser.ts'),
    source('features/scan/ScanScreen.tsx'),
    source('app/scan/result.tsx'),
    source('app/scan/owner.tsx'),
    source('app/settings.tsx'),
  ]);

  assert.match(haptics, /Platform\.OS === 'web'/, 'web must remain a no-op');
  assert.match(haptics, /catch \{[\s\S]*?Tactile feedback must never block/, 'haptic failures must be contained');
  assert.match(haptics, /scanner_frame_ready: 650/, 'frame-ready feedback needs a cooldown');
  assert.match(haptics, /scanner_ambiguous: 1200/, 'ambiguous-match warnings need a cooldown');
  assert.match(
    haptics,
    /doubleImpact\(Haptics\.ImpactFeedbackStyle\.Light, Haptics\.ImpactFeedbackStyle\.Medium, 55\)/,
    'the StackR exact-match signature must remain light then medium',
  );

  assert.match(scanLearning, /candidate_selected[\s\S]*?return 'selection'/);
  assert.match(ownerScanner, /if \(photo.canceled\) return;[\s\S]*?stackrHaptics.scannerCaptureLocked\(\)/,
    'owner capture feedback must follow camera dismissal and exclude cancellation');
  assert.match(ownerScanner, /setResult\(identified\);\s*void stackrHaptics.scannerAmbiguous\(\)/,
    'owner suggestions require review, never an automatic exact-match haptic');
  assert.match(ownerScanner, /stackrHaptics.captureSaved\(\)/, 'saved teaching captures need completion feedback');
  assert.match(settings, /Test haptic feedback/, 'a device feedback check must be reachable outside the camera');
  assert.match(haptics, /return 'requested'/, 'native dispatch must not claim physical-device success');
  assert.match(scanLearning, /added_to_binder[\s\S]*?return 'card_added'/);
  assert.match(scanLearning, /duplicate_prevented[\s\S]*?return 'duplicate_prevented'/);
  assert.match(scanLearning, /match_incorrect[\s\S]*?none_correct[\s\S]*?return 'scanner_ambiguous'/);
  assert.match(scanLearning, /void import\('\.\/haptics'\)/, 'result haptics must load safely and lazily');
  assert.match(
    scanLearning,
    /playScanLearningHaptic\(input\.eventType\);[\s\S]*?supabase\.auth\.getUser/,
    'local tactile feedback must not depend on analytics or authentication',
  );

  assert.match(liveAnalyser, /stackrHaptics\.scannerFrameReady\(\)/);
  assert.match(liveAnalyser, /stackrHaptics\.scannerCaptureLocked\(\)/);
  assert.match(
    liveAnalyser,
    /previousStableFrameCount < requiredStableFrames[\s\S]*?nextStableFrameCount >= requiredStableFrames/,
    'frame-ready feedback must fire on a state transition, not every analysed frame',
  );

  assert.match(
    mainScanner,
    /(?:stackrHaptics\.|Haptics\.(?:impactAsync|notificationAsync|selectionAsync))/, 
    'the routed main scanner must retain tactile feedback',
  );
  assert.match(
    scanResult,
    /logResultFeedback\('added_to_binder'/,
    'the scan-result collection write must emit the binder-add learning event',
  );

  console.log('StackR haptic vocabulary and scanner/result embedding checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
