import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import './verify-owner-recognition-build.mjs';

const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const env = { ...process.env, ...eas.build.production.env, ...eas.build['production-owner'].env,
  EXPO_NO_DOTENV: '1', CI: '1' };
const result = spawnSync(process.execPath, [path.resolve('node_modules/expo/bin/cli'), 'export',
  '--platform', 'ios', '--output-dir', '.tmp/owner-recognition-ios-export', '--max-workers', '2'],
{ env, stdio: 'inherit' });
process.exit(result.status ?? 1);
