import assert from 'node:assert/strict';

async function main() {
  const calls: string[] = [];
  const platform = { OS: 'android' };
  const hapticsMock = {
    ImpactFeedbackStyle: {
      Soft: 'soft',
      Light: 'light',
      Medium: 'medium',
      Rigid: 'rigid',
    },
    NotificationFeedbackType: {
      Success: 'success',
      Warning: 'warning',
      Error: 'error',
    },
    selectionAsync: async () => { calls.push('selection'); },
    impactAsync: async (style: string) => { calls.push(`impact:${style}`); },
    notificationAsync: async (type: string) => { calls.push(`notification:${type}`); },
  };

  const NodeModule = require('node:module') as any;
  const originalModuleLoad = NodeModule._load;
  NodeModule._load = function mockHapticDependencies(request: string, parent: { filename?: string } | undefined, isMain: boolean) {
    if (request === 'expo-haptics') return hapticsMock;
    if (request === 'react-native' && parent?.filename?.endsWith('/lib/haptics.ts')) {
      return { Platform: platform };
    }
    return originalModuleLoad.call(this, request, parent, isMain);
  };
  const { haptic, setStackrHapticsEnabled } = require('../lib/haptics') as typeof import('../lib/haptics');
  NodeModule._load = originalModuleLoad;

  await haptic('selection');
  await haptic('scanner_capture_locked');
  await haptic('scanner_exact_match');
  await haptic('sale_completed');
  assert.deepEqual(calls, [
    'selection',
    'impact:light',
    'impact:light',
    'impact:medium',
    'notification:success',
  ]);

  setStackrHapticsEnabled(false);
  await haptic('action_failed');
  assert.equal(calls.length, 5, 'disabled haptics must be a no-op');

  setStackrHapticsEnabled(true);
  platform.OS = 'web';
  await haptic('binder_milestone');
  assert.equal(calls.length, 5, 'web haptics must be a no-op');

  console.log('StackR runtime haptic invocation tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
