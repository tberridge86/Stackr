import assert from 'node:assert/strict';

process.env.APP_VARIANT = 'staging';
process.env.EXPO_PUBLIC_APP_VARIANT = 'staging';
process.env.EXPO_PUBLIC_SELLER_TRIAL_MODE = 'true';
process.env.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED = 'false';

async function main() {
  let authCalls = 0;
  let tableCalls = 0;
  let storageCalls = 0;
  const supabase = {
    auth: {
      getUser: async () => {
        authCalls += 1;
        return { data: { user: { id: 'trial-user' } }, error: null };
      },
    },
    from: () => {
      tableCalls += 1;
      return { insert: async () => ({ error: null }) };
    },
  };
  const asyncStorage = {
    getItem: async () => { storageCalls += 1; return null; },
    setItem: async () => { storageCalls += 1; },
  };

  const NodeModule = require('node:module') as any;
  const originalModuleLoad = NodeModule._load;
  NodeModule._load = function mockTrialTelemetryDependencies(
    request: string,
    parent: { filename?: string } | undefined,
    isMain: boolean,
  ) {
    if (request === './supabase' && parent?.filename?.endsWith('/lib/scanLearning.ts')) {
      return { supabase };
    }
    if (request === './scannerClientContext' && parent?.filename?.endsWith('/lib/scanLearning.ts')) {
      return { getScannerClientContext: () => ({ appVersion: 'test' }) };
    }
    if (request === '@react-native-async-storage/async-storage') {
      return { default: asyncStorage };
    }
    return originalModuleLoad.call(this, request, parent, isMain);
  };
  const { logScanLearningEvent } = require('../lib/scanLearning') as typeof import('../lib/scanLearning');
  NodeModule._load = originalModuleLoad;

  await logScanLearningEvent({
    scanSessionId: 'trial-session',
    eventType: 'attempt',
    outcome: 'test',
  });

  assert.equal(authCalls, 0, 'Seller Trial must not perform scanner telemetry auth calls');
  assert.equal(tableCalls, 0, 'Seller Trial must not insert scanner telemetry');
  assert.equal(storageCalls, 0, 'Seller Trial must not queue scanner telemetry locally');
  console.log('Seller Trial telemetry write boundary tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
