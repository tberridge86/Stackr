import assert from 'node:assert/strict';
import fs from 'node:fs';

const bundlePath = process.argv[2];
assert.ok(bundlePath, 'Pass the embedded Android JavaScript bundle path.');
assert.ok(fs.existsSync(bundlePath), `Embedded bundle not found: ${bundlePath}`);

const bundle = fs.readFileSync(bundlePath, 'utf8');

function moduleWindow(marker, radius = 7000) {
  const index = bundle.indexOf(marker);
  assert.notEqual(index, -1, `Embedded bundle is missing ${marker}`);
  return bundle.slice(Math.max(0, index - radius), index + radius);
}

const sellerTrialModule = moduleWindow('getRuntimeSellerTrialEnvironment');
assert.match(sellerTrialModule, /EXPO_PUBLIC_APP_VARIANT\s*:\s*["']staging["']/);
assert.match(sellerTrialModule, /EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED\s*:\s*["']false["']/);
assert.match(sellerTrialModule, /EXPO_PUBLIC_SELLER_TRIAL_MODE\s*:\s*["']true["']/);

const recognitionModule = moduleWindow('getRuntimeRecognitionEnvironment', 12000);
for (const flag of [
  'EXPO_PUBLIC_STACKR_API_ENABLED',
  'EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED',
  'EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED',
  'EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK',
  'EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED',
  'EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED',
  'EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY',
]) {
  assert.match(
    recognitionModule,
    new RegExp(`${flag}\\s*:\\s*["']false["']`),
    `${flag} was not embedded as false`,
  );
}

const configModule = moduleWindow('var SCAN_XIMILAR_FALLBACK_ENABLED', 1600);
assert.match(
  configModule,
  /var SCAN_XIMILAR_FALLBACK_ENABLED\s*=\s*false/,
  'EXPO_PUBLIC_SCAN_XIMILAR_FALLBACK was not embedded as false',
);
assert.match(
  configModule,
  /var BETA_TRADE_DEMO_MODE\s*=\s*true/,
  'Seller Trial must keep trade cash in demo mode',
);
assert.match(
  configModule,
  /stackr-api-gateway-staging\.berridge14\.workers\.dev/,
  'Seller Trial price API was not embedded as staging',
);

const supabaseModule = moduleWindow('var stagingSupabaseProjectRef', 2600);
assert.match(
  supabaseModule,
  /var supabaseUrl\s*=\s*["']https:\/\/lmwfhvexfcoyeuoyrlco\.supabase\.co["']\.trim\(\)/,
  'Seller Trial Supabase client was not embedded with the staging project',
);

console.log('Embedded Seller Trial and scanner feature flags verified.');
