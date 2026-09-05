'use strict';

const { isIPv4 } = require('node:net');

function isIpv4Loopback(value) {
  return isIPv4(value) && value.split('.')[0] === '127';
}

function isLoopbackPeerAddress(value) {
  const address = String(value || '').trim().toLowerCase();
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true;
  if (isIpv4Loopback(address)) return true;
  return address.startsWith('::ffff:') && isIpv4Loopback(address.slice('::ffff:'.length));
}

function isLoopbackHost(value) {
  try {
    const parsed = new URL(`http://${String(value || '')}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return false;
    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function isAllowedPreviewRead(pathname) {
  return pathname === '/sets' || pathname === '/assets/manifest'
    || /^\/sets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\/cards)?$/i.test(pathname);
}

function isAuthorizedPreviewRead(request, gateway, upstreamPath) {
  return request?.method === 'GET'
    && isLoopbackHost(request?.headers?.host)
    && isLoopbackPeerAddress(request?.socket?.remoteAddress)
    && Boolean(gateway)
    && isAllowedPreviewRead(upstreamPath);
}

module.exports = {
  isAllowedPreviewRead,
  isAuthorizedPreviewRead,
  isLoopbackHost,
  isLoopbackPeerAddress,
};
