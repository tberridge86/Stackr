type MobileRuntimeEnvironment = 'staging' | 'production';
type MobileAppVariant = 'development' | 'preview' | 'staging' | 'seller-canary' | 'production';
type ExpoRuntimeConfig = Readonly<{
  extra?: Record<string, unknown>;
}>;
type NativeRuntimeIdentity = Readonly<{
  platform: unknown;
  applicationId: unknown;
}>;

export type MobileRuntimeConfig = Readonly<{
  schemaVersion: 1;
  appVariant: MobileAppVariant;
  environment: MobileRuntimeEnvironment;
  supabaseUrl: string;
  supabasePublishableKey: string;
  priceApiUrl: string;
  stackrApiUrl: string;
}>;

const NON_PRODUCTION_VARIANTS = new Set<MobileAppVariant>([
  'development',
  'preview',
  'staging',
  'seller-canary',
]);
const PRODUCTION_NATIVE_APP_ID = 'com.tommo86.Stackr';
const TARGET_SHA256: Record<MobileRuntimeEnvironment, Record<
  'supabaseUrl' | 'supabasePublishableKey' | 'priceApiUrl' | 'stackrApiUrl',
  string
>> = {
  staging: {
    supabaseUrl: 'cfff4dfb9fe7daeb2db9ee606d30c7043eaec34619e8b8d59a07ce729e1530de',
    supabasePublishableKey: '45ec141cde077714c9056d8333d007f230fc9375006acdb0eff62ea119db0086',
    priceApiUrl: 'ee72d677697a1c6014071902f11c2559d4ef38e0f25360c54867f7a49e4cb4c8',
    stackrApiUrl: '19579eb9fa688c400fb02411b6bce4c34f8f9740eda03b092361d796338ca6e7',
  },
  production: {
    supabaseUrl: 'cf628436aefc0742d078d001a8d5a0827ec636faaef4068e840a21ef78e0ca3e',
    supabasePublishableKey: '6f26beb079015fcbeaa0ea775af977df76fbc0a85523dce808be419c9e9f30ab',
    priceApiUrl: 'a6a264c7a21e51ebf407bdbcae8c5c9c8b1446ce51a8d67fc3ac229a646052a5',
    stackrApiUrl: '02fd1945e59072a88ac05c7d4a937a4333ca20d8e3aab2af8350faf00fe3a282',
  },
};

const SHA256_INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;
const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (const symbol of value) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >>> 12),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >>> 18),
        0x80 | ((codePoint >>> 12) & 0x3f),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
}

function sha256(value: string): string {
  const bytes = utf8Bytes(value);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitLengthHigh = Math.floor(bitLength / 0x100000000);
  const bitLengthLow = bitLength >>> 0;
  for (const word of [bitLengthHigh, bitLengthLow]) {
    bytes.push(word >>> 24, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  }

  const state: number[] = [...SHA256_INITIAL_STATE];
  const words = new Array<number>(64).fill(0);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const byteOffset = offset + (index * 4);
      words[index] = (
        (bytes[byteOffset] << 24)
        | (bytes[byteOffset + 1] << 16)
        | (bytes[byteOffset + 2] << 8)
        | bytes[byteOffset + 3]
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15];
      const previous2 = words[index - 2];
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  return state.map((word) => word.toString(16).padStart(8, '0')).join('');
}

function requireHttpsUrl(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`mobile_runtime_field_missing:${field}`);
  }
  const normalized = value.trim().replace(/\/$/, '');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`mobile_runtime_url_invalid:${field}`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(`mobile_runtime_url_invalid:${field}`);
  }
  return normalized;
}

export function parseMobileRuntimeConfig(value: unknown): MobileRuntimeConfig {
  if (!value || typeof value !== 'object') throw new Error('mobile_runtime_config_missing');
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) throw new Error('mobile_runtime_schema_version_invalid');
  if (typeof candidate.appVariant !== 'string') throw new Error('mobile_runtime_variant_invalid');
  const appVariant = candidate.appVariant as MobileAppVariant;
  const environment = candidate.environment;
  if (environment !== 'staging' && environment !== 'production') {
    throw new Error('mobile_runtime_environment_invalid');
  }
  const inferredEnvironment = NON_PRODUCTION_VARIANTS.has(appVariant)
    ? 'staging'
    : appVariant === 'production'
      ? 'production'
      : null;
  if (!inferredEnvironment || inferredEnvironment !== environment) {
    throw new Error(`mobile_runtime_variant_environment_mismatch:${appVariant}:${environment}`);
  }

  const supabaseUrl = requireHttpsUrl(candidate.supabaseUrl, 'supabaseUrl');
  const parsed = {
    schemaVersion: 1,
    appVariant,
    environment,
    supabaseUrl,
    supabasePublishableKey: typeof candidate.supabasePublishableKey === 'string'
      ? candidate.supabasePublishableKey
      : '',
    priceApiUrl: requireHttpsUrl(candidate.priceApiUrl, 'priceApiUrl'),
    stackrApiUrl: requireHttpsUrl(candidate.stackrApiUrl, 'stackrApiUrl'),
  } as const;
  const expectedTarget = TARGET_SHA256[environment];
  for (const field of [
    'supabaseUrl',
    'supabasePublishableKey',
    'priceApiUrl',
    'stackrApiUrl',
  ] as const) {
    if (sha256(parsed[field]) !== expectedTarget[field]) {
      throw new Error(`mobile_runtime_target_mismatch:${environment}:${field}`);
    }
  }

  return Object.freeze(parsed);
}

export function assertMobileRuntimeNativeIdentity(
  runtimeConfig: MobileRuntimeConfig,
  nativeIdentity: NativeRuntimeIdentity,
): MobileRuntimeConfig {
  if (nativeIdentity.platform === 'web') return runtimeConfig;
  if (nativeIdentity.platform !== 'ios' && nativeIdentity.platform !== 'android') {
    throw new Error('mobile_runtime_native_platform_invalid');
  }
  const suffix = runtimeConfig.appVariant === 'development'
    ? '.dev'
    : runtimeConfig.environment === 'staging'
      ? '.staging'
      : '';
  const expectedNativeAppId = `${PRODUCTION_NATIVE_APP_ID}${suffix}`;
  if (typeof nativeIdentity.applicationId !== 'string' || !nativeIdentity.applicationId) {
    throw new Error('mobile_runtime_native_identity_missing');
  }
  if (nativeIdentity.applicationId !== expectedNativeAppId) {
    throw new Error(
      `mobile_runtime_native_identity_mismatch:${nativeIdentity.platform}:${runtimeConfig.environment}`,
    );
  }
  return runtimeConfig;
}

function readNativeRuntimeIdentity(): NativeRuntimeIdentity {
  // Expo Application reads the identifier embedded in the installed binary.
  // Unlike Constants.expoConfig, an OTA update cannot replace this value.
  const reactNativeModule = require('react-native') as {
    Platform?: { OS?: unknown };
    default?: { Platform?: { OS?: unknown } };
  };
  const applicationModule = require('expo-application') as {
    applicationId?: unknown;
    default?: { applicationId?: unknown };
  };
  const reactNative = reactNativeModule.default ?? reactNativeModule;
  const application = applicationModule.default ?? applicationModule;
  return {
    platform: reactNative.Platform?.OS,
    applicationId: application.applicationId,
  };
}

function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && process.release?.name === 'node';
}

function optionalNodeHttpsUrl(value: string | undefined): string {
  if (!value?.trim()) return '';
  return requireHttpsUrl(value, 'nodeToolingUrl');
}

function readNodeToolingRuntimeConfig(): MobileRuntimeConfig {
  const priceApiUrl = optionalNodeHttpsUrl(process.env.PRICE_API_URL);
  return Object.freeze({
    schemaVersion: 1,
    appVariant: 'staging',
    environment: 'staging',
    supabaseUrl: 'https://node-tooling.invalid',
    supabasePublishableKey: 'sb_publishable_node_tooling_only',
    priceApiUrl,
    stackrApiUrl: optionalNodeHttpsUrl(process.env.STACKR_API_URL) || priceApiUrl,
  });
}

function loadMobileRuntimeConfig(): MobileRuntimeConfig {
  let constantsModule: {
    default?: { expoConfig?: ExpoRuntimeConfig | null };
    expoConfig?: ExpoRuntimeConfig | null;
  } | undefined;
  try {
    constantsModule = require('expo-constants') as typeof constantsModule;
  } catch (error) {
    if (!isNodeRuntime()) throw error;
  }

  if (constantsModule) {
    const constants = constantsModule.default ?? constantsModule;
    const runtimeConfig = constants.expoConfig?.extra?.stackrRuntime;
    if (runtimeConfig) {
      return assertMobileRuntimeNativeIdentity(
        parseMobileRuntimeConfig(runtimeConfig),
        readNativeRuntimeIdentity(),
      );
    }
  }

  // Server/CLI modules must provide their backend URL explicitly and never
  // inherit Expo public variables. Expo builds and static rendering do not use
  // this path because their reviewed Constants.expoConfig is loaded first.
  if (isNodeRuntime() && process.env.STACKR_NODE_TOOLING_RUNTIME === 'true') {
    return readNodeToolingRuntimeConfig();
  }
  if (isNodeRuntime()) throw new Error('mobile_runtime_node_tooling_mode_required');
  throw new Error('mobile_runtime_expo_config_unavailable');
}

export const MOBILE_RUNTIME_CONFIG = loadMobileRuntimeConfig();
