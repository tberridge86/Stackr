const { getDefaultConfig } = require('expo/metro-config');
const { Worker } = require('node:worker_threads');
const path = require('path');
const { resolveMobileRuntimeConfig } = require('./config/mobile-runtime.cjs');
const { isAuthorizedPreviewRead } = require('./scripts/stackr-preview-proxy-policy.cjs');

const config = getDefaultConfig(__dirname);
const escapePathForRegex = (targetPath) => targetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ignoredProjectDirs = ['.cache', '.metro-cache', '.tmp', 'tmp', 'dist', 'web-build'].map(
  (dir) => new RegExp(`${escapePathForRegex(path.resolve(__dirname, dir))}${escapePathForRegex(path.sep)}.*`)
);
const existingBlockList = config.resolver.blockList;

config.resolver.assetExts.push('onnx', 'ort', 'bin', 'jfif', 'wasm');
config.resolver.blockList = Array.isArray(existingBlockList)
  ? [...existingBlockList, ...ignoredProjectDirs]
  : [existingBlockList, ...ignoredProjectDirs].filter(Boolean);
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@': path.resolve(__dirname),
};

const previewProxyPrefix = '/__stackr-preview-api/v1';
const previewGateway = process.env.STACKR_PREVIEW_PROXY_GATEWAY_URL
  || process.env.STACKR_API_URL
  || process.env.STACKR_MOBILE_API_URL
  || resolveMobileRuntimeConfig(process.env).stackrApiUrl;

function configuredPreviewGateway(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const gateway = configuredPreviewGateway(previewGateway);
const previewProxyWorkerPath = path.resolve(__dirname, 'scripts/stackr-preview-proxy-worker.cjs');
const existingEnhanceMiddleware = config.server?.enhanceMiddleware;
config.server = {
  ...(config.server || {}),
  enhanceMiddleware: (middleware, metroServer) => {
    const downstream = existingEnhanceMiddleware
      ? existingEnhanceMiddleware(middleware, metroServer)
      : middleware;
    return (request, response, next) => {
      const requestUrl = new URL(request.url || '/', 'http://metro.local');
      if (!requestUrl.pathname.startsWith(`${previewProxyPrefix}/`) && requestUrl.pathname !== previewProxyPrefix) {
        return downstream(request, response, next);
      }
      const upstreamPath = requestUrl.pathname.slice(previewProxyPrefix.length) || '/';
      if (!isAuthorizedPreviewRead(request, gateway, upstreamPath)) {
        response.statusCode = 404;
        response.end();
        return undefined;
      }
      const upstreamUrl = new URL(`/v1${upstreamPath}${requestUrl.search}`, gateway);
      const proxyWorker = new Worker(previewProxyWorkerPath, {
        workerData: {
          url: upstreamUrl.toString(),
          accept: request.headers.accept || 'application/json',
        },
      });
      let workerFinished = false;
      const workerTimeout = setTimeout(() => {
        void proxyWorker.terminate();
        if (response.writableEnded) return;
        response.statusCode = 502;
        response.end();
      }, 16_000);
      workerTimeout.unref?.();
      proxyWorker.once('message', (result) => {
        workerFinished = true;
        clearTimeout(workerTimeout);
        void proxyWorker.terminate();
        if (response.writableEnded) return;
        response.statusCode = result?.ok ? result.status : 502;
        if (result?.ok) {
          for (const [header, value] of Object.entries(result.headers || {})) {
            if (value) response.setHeader(header, value);
          }
          response.end(Buffer.from(result.payload || []));
          return;
        }
        response.end();
      });
      proxyWorker.once('error', () => {
        clearTimeout(workerTimeout);
        if (response.writableEnded) return;
        if (!response.headersSent) response.statusCode = 502;
        response.end();
      });
      proxyWorker.once('exit', (code) => {
        if (workerFinished || code === 0 || response.writableEnded) return;
        clearTimeout(workerTimeout);
        response.statusCode = 502;
        response.end();
      });
      return undefined;
    };
  },
};

module.exports = config;
