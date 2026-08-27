import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [appVariant, ...expoArguments] = process.argv.slice(2);
if (!appVariant || expoArguments.length === 0) {
  throw new Error('Usage: node scripts/run-expo-mobile-variant.mjs <variant> <expo command...>');
}

const result = spawnSync(
  process.execPath,
  [path.resolve('node_modules/expo/bin/cli'), ...expoArguments],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      STACKR_MOBILE_APP_VARIANT: appVariant,
    },
    stdio: 'inherit',
  },
);
process.exit(result.status ?? 1);
