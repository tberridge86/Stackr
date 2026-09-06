#!/usr/bin/env node
'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFileSync, spawn } = require('node:child_process');
const {
  MOBILE_PRODUCTION_RELEASE_FLAGS,
  MOBILE_RUNTIME_ENV_VARIABLES,
  resolveMobileRuntimeConfig,
} = require('../../config/mobile-runtime.cjs');

const ROOT = __dirname;
const PROJECT_ROOT = path.resolve(ROOT, '..', '..');
const DEFAULT_HOST_PORT = 4173;
const DEFAULT_APP_PORT = 8081;
let appProcess = null;

function usage() {
  console.log('Usage: node tools/iphone-preview/server.js [--port 4173] [--app-url http://127.0.0.1:8081] [--start-app] [--app-port 8081] [--environment local|production]');
}

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value.`);
  return value;
}

function asPort(value, option) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${option} must be a port from 1 to 65535.`);
  return port;
}

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isVerifiedExpoUrl(requestedUrl, verifiedAppUrl) {
  if (!verifiedAppUrl || !isLocalUrl(requestedUrl)) return false;
  try {
    return new URL(requestedUrl).origin === new URL(verifiedAppUrl).origin;
  } catch {
    return false;
  }
}

function isPreviewExpoAlive(process) {
  return Boolean(process && !process.killed && process.exitCode === null);
}

function alternateLoopbackUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname === '127.0.0.1') {
      url.hostname = '[::1]';
      return url.toString();
    }
    if (url.hostname === '[::1]') {
      url.hostname = '127.0.0.1';
      return url.toString();
    }
  } catch {
    // The configured URL is validated separately with a clear user-facing error.
  }
  return null;
}

function escapeHtmlAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function readPreviewEnvironment() {
  const environment = readOption('--environment', 'local');
  if (!['local', 'production'].includes(environment)) {
    throw new Error('--environment must be either local or production.');
  }
  return environment;
}

function environmentLabel(environment) {
  return environment === 'production' ? 'Production' : 'Local config';
}

function buildProductionExpoEnvironment(productionEnv, inheritedEnvironment = process.env) {
  const runtimeConfig = resolveMobileRuntimeConfig(productionEnv);
  if (runtimeConfig.appVariant !== 'production' || runtimeConfig.environment !== 'production') {
    throw new Error('The production EAS profile does not resolve to the production mobile target.');
  }
  for (const key of MOBILE_RUNTIME_ENV_VARIABLES) {
    if (typeof productionEnv[key] !== 'string' || !productionEnv[key].trim()) {
      throw new Error(`The production EAS profile is missing ${key}.`);
    }
  }
  for (const [key, value] of Object.entries(MOBILE_PRODUCTION_RELEASE_FLAGS)) {
    if (productionEnv[key] !== value) {
      throw new Error(`The production EAS profile has an unsafe ${key} value.`);
    }
  }

  const publicRuntimeKeys = [
    ...MOBILE_RUNTIME_ENV_VARIABLES,
    ...Object.keys(MOBILE_PRODUCTION_RELEASE_FLAGS),
  ];
  const publicProductionEnv = Object.fromEntries(
    publicRuntimeKeys.map((key) => [key, productionEnv[key]]),
  );
  const cleanEnvironment = { ...inheritedEnvironment };
  for (const key of Object.keys(cleanEnvironment)) {
    if (
      key === 'APP_VARIANT'
      || key === 'EXPO_PUBLIC_APP_VARIANT'
      || key.startsWith('EXPO_PUBLIC_')
      || key.startsWith('STACKR_MOBILE_')
      || key.startsWith('SUPABASE_')
      || key === 'STACKR_API_URL'
      || key === 'STACKR_PREVIEW_PROXY_GATEWAY_URL'
      || key === 'STACKR_OWNER_RECOGNITION_BUILD'
      || /(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|DATABASE_URL|CONNECTION_STRING)/i.test(key)
    ) {
      delete cleanEnvironment[key];
    }
  }
  return {
    ...cleanEnvironment,
    // Prevent a dirty developer .env.local from replacing the reviewed EAS
    // target. Only the explicit mobile runtime keys above reach Expo.
    EXPO_NO_DOTENV: '1',
    ...publicProductionEnv,
  };
}

function expoEnvironment(environment) {
  if (environment === 'local') return process.env;

  const easPath = path.join(PROJECT_ROOT, 'eas.json');
  let productionEnv;
  try {
    productionEnv = JSON.parse(fs.readFileSync(easPath, 'utf8'))?.build?.production?.env;
  } catch (error) {
    throw new Error(`Could not read the production preview settings: ${error.message}`);
  }

  return buildProductionExpoEnvironment(productionEnv);
}

function sourceLabel() {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
    const trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
    return `${path.basename(PROJECT_ROOT)} · ${commit.slice(0, 7)}${trackedChanges ? ' · local changes' : ''}`;
  } catch {
    return `${path.basename(PROJECT_ROOT)} · source revision unavailable`;
  }
}

function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(600, () => { socket.destroy(); resolve(false); });
  });
}

function probeExpo(appUrl, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const url = new URL('/status', appUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.get(url, { headers: { Accept: 'text/plain' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        if (body.length < 1024) body += chunk;
      });
      response.on('end', () => {
        resolve(response.statusCode === 200 && body.trim() === 'packager-status:running');
      });
    });
    request.once('error', () => resolve(false));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function startExpo(appPort, environment) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const extraExpoArgs = `${environment === 'production' ? ' --clear' : ''} --max-workers 2 --localhost`;
  const args = isWindows
    ? ['/d', '/s', '/c', `npm run web -- --port ${appPort}${extraExpoArgs}`]
    : ['run', 'web', '--', '--port', String(appPort), ...(environment === 'production' ? ['--clear'] : []), '--max-workers', '2', '--localhost'];
  console.log(`[iPhone Preview] Starting Expo web on http://127.0.0.1:${appPort}…`);
  appProcess = spawn(command, args, {
    cwd: PROJECT_ROOT,
    env: {
      ...expoEnvironment(environment),
      // app.config.js uses this to choose Expo Router's interactive single-page
      // preview mode instead of its expensive static route renderer.
      STACKR_IPHONE_PREVIEW: '1',
      // This local-only preview does not use Expo services. Avoid an unbounded
      // CLI startup wait on user/version API requests before Metro starts.
      EXPO_OFFLINE: '1',
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  appProcess.once('error', (error) => console.error(`[iPhone Preview] Could not start Expo: ${error.message}`));
  appProcess.once('exit', (code, signal) => {
    appProcess = null;
    console.log(`[iPhone Preview] Expo process exited${signal ? ` (${signal})` : ` (code ${code})`}.`);
  });
}

function stopExpo() {
  if (appProcess && !appProcess.killed) {
    console.log('[iPhone Preview] Stopping the Expo process started by this preview…');
    if (process.platform === 'win32') {
      // npm.cmd can create a child Node process on Windows. Limit termination to this known child tree.
      spawn('taskkill', ['/pid', String(appProcess.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    } else {
      appProcess.kill('SIGTERM');
    }
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) { usage(); return; }
  const hostPort = asPort(readOption('--port', String(DEFAULT_HOST_PORT)), '--port');
  const appPort = asPort(readOption('--app-port', String(DEFAULT_APP_PORT)), '--app-port');
  let appUrl = readOption('--app-url', `http://127.0.0.1:${appPort}`);
  const startApp = process.argv.includes('--start-app');
  const previewEnvironment = readPreviewEnvironment();
  const previewEnvironmentLabel = environmentLabel(previewEnvironment);
  const previewSourceLabel = `Started from ${sourceLabel()} · live edits may differ`;
  let verifiedAppUrl = null;
  if (!isLocalUrl(appUrl)) throw new Error('--app-url must be an http(s) localhost URL.');

  if (startApp) {
    const configuredUrl = new URL(appUrl);
    const configuredPort = Number(configuredUrl.port || (configuredUrl.protocol === 'https:' ? 443 : 80));
    if (configuredPort !== appPort) {
      throw new Error(`--app-port (${appPort}) must match the port in --app-url (${configuredPort}).`);
    }
    if (await probeExpo(appUrl)) {
      console.log(`[iPhone Preview] Expo is already running on port ${appPort}; reusing it.`);
    } else {
      // On Windows, a second process can occupy the other loopback family on the
      // same port. Prefer the address that proves it is the live Expo server so
      // the iframe never silently renders a stale static export.
      const alternateUrl = alternateLoopbackUrl(appUrl);
      if (alternateUrl && await probeExpo(alternateUrl)) {
        appUrl = alternateUrl;
        console.log(`[iPhone Preview] Expo is live at ${appUrl}; using it instead of the non-Expo loopback address.`);
      } else if (await isListening(appPort)) {
        throw new Error(`Port ${appPort} is in use, but it is not an Expo server.`);
      } else {
        startExpo(appPort, previewEnvironment);
        // This is the only case where the host can attribute the server to this
        // worktree and its explicit environment. A reused server might have
        // been launched from another checkout or with different Expo settings.
        verifiedAppUrl = appUrl;
      }
    }
  }

  const indexPath = path.join(ROOT, 'index.html');
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    const { pathname } = requestUrl;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed');
      return;
    }
    if (pathname === '/api/status') {
      const requestedAppUrl = requestUrl.searchParams.get('appUrl') || appUrl;
      if (!isLocalUrl(requestedAppUrl)) {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ ok: false, message: 'Use a localhost Expo URL.' }));
        return;
      }
      probeExpo(requestedAppUrl).then((ok) => {
        const verified = isPreviewExpoAlive(appProcess) && isVerifiedExpoUrl(requestedAppUrl, verifiedAppUrl);
        response.writeHead(ok ? 200 : 503, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(JSON.stringify({
          ok,
          environment: verified ? previewEnvironment : 'unverified',
          verified,
          message: ok
            ? (verified ? `${previewEnvironmentLabel} · Expo live · Fast Refresh on` : 'Expo live · source/config unverified')
            : (verified ? `Waiting for ${previewEnvironmentLabel} Expo…` : 'Waiting for external Expo…'),
        }));
      });
      return;
    }
    if (pathname !== '/' && pathname !== '/index.html') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('Not found');
      return;
    }
    fs.readFile(indexPath, (error, file) => {
      if (error) {
        console.error(`[iPhone Preview] Unable to read the UI: ${error.message}`);
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Unable to load iPhone preview UI');
        return;
      }
      const initialAppVerified = isPreviewExpoAlive(appProcess) && isVerifiedExpoUrl(appUrl, verifiedAppUrl);
      const renderedFile = file
        .toString('utf8')
        .replace('__IPHONE_PREVIEW_APP_URL__', escapeHtmlAttribute(appUrl))
        .replace('__IPHONE_PREVIEW_ENVIRONMENT__', escapeHtmlAttribute(initialAppVerified ? previewEnvironmentLabel : 'External Expo · config unverified'))
        .replace('__IPHONE_PREVIEW_SOURCE__', escapeHtmlAttribute(initialAppVerified ? previewSourceLabel : 'External localhost Expo · source unverified'))
        .replace('__IPHONE_PREVIEW_VERIFIED_ENVIRONMENT__', escapeHtmlAttribute(previewEnvironmentLabel))
        .replace('__IPHONE_PREVIEW_VERIFIED_SOURCE__', escapeHtmlAttribute(previewSourceLabel));
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'no-referrer',
      });
      if (request.method === 'HEAD') response.end(); else response.end(renderedFile);
    });
  });
  server.on('error', (error) => {
    console.error(`[iPhone Preview] Server error: ${error.message}`);
    stopExpo();
    process.exitCode = 1;
  });
  server.listen(hostPort, '127.0.0.1', () => {
    console.log(`[iPhone Preview] Ready at http://127.0.0.1:${hostPort}`);
    console.log(`[iPhone Preview] App source: ${appUrl}`);
    console.log(`[iPhone Preview] Account environment: ${previewEnvironmentLabel}`);
    console.log(`[iPhone Preview] Source: ${previewSourceLabel}`);
    console.log('[iPhone Preview] Open the preview URL in a browser. Fast Refresh updates inside the phone frame.');
  });
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => {
      stopExpo();
      process.exit();
    });
    server.closeIdleConnections?.();
    const forceCloseTimer = setTimeout(() => {
      server.closeAllConnections?.();
      stopExpo();
      process.exit();
    }, 2000);
    forceCloseTimer.unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((error) => { console.error(`[iPhone Preview] ${error.message}`); process.exitCode = 1; });
}

module.exports = {
  buildProductionExpoEnvironment,
  isLocalUrl,
  isPreviewExpoAlive,
  isVerifiedExpoUrl,
  probeExpo,
  sourceLabel,
};
