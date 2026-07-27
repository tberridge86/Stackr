import { spawn } from 'node:child_process';

function passthroughArgs() {
  const output: string[] = [];
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--language' || arg === '--lang') {
      index += 1;
      continue;
    }
    if (arg.startsWith('--language=') || arg.startsWith('--lang=')) continue;
    output.push(arg);
  }
  return output;
}

const child = spawn(process.execPath, [
  'scripts/sync-tcgdex-catalogue.mjs',
  '--language=ja',
  ...passthroughArgs(),
], {
  stdio: 'inherit',
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});
