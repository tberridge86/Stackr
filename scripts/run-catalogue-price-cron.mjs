import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Railway skips a later tick if this process never exits. Keep the durable
// per-set checkpoints, but terminate an unhealthy execution before the next
// hourly tick. The child owns the explicit target and server-write guards.
export function runPriceCron({ spawnImpl = spawn, timeoutMs = 50 * 60_000, killGraceMs = 5_000, log = console.info } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 50 * 60_000) throw Error('Invalid cron deadline.');
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawnImpl(process.execPath, [fileURLToPath(new URL('./refresh-catalogue-bulk-prices.mjs', import.meta.url)), '--apply', '--max-groups=5000'], { stdio: 'inherit', windowsHide: true });
    let deadlineReached = false;
    let killTimer;
    const deadline = setTimeout(() => {
      deadlineReached = true;
      log(JSON.stringify({ event: 'catalogue_price_cron_timeout', checkpointResume: true }));
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
    }, timeoutMs);
    const finish = (code, signal) => {
      clearTimeout(deadline);
      clearTimeout(killTimer);
      const exitCode = deadlineReached ? 124 : Number.isInteger(code) ? code : 1;
      log(JSON.stringify({ event: 'catalogue_price_cron_finished', exitCode, signal: signal ?? null, elapsedMs: Date.now() - started }));
      resolve(exitCode);
    };
    child.once('error', () => finish(1, null));
    child.once('exit', finish);
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runPriceCron().then((code) => { process.exitCode = code; }).catch(() => { console.error('Catalogue price cron could not start.'); process.exitCode = 1; });
}
