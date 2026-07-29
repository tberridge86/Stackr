const encoder = new TextEncoder();

export function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

export function serviceSignatureInput({ serviceId, timestamp, nonce, method, path, bodyHash, userId, deviceId }) {
  return [serviceId, timestamp, nonce, method.toUpperCase(), path, bodyHash, userId ?? '', deviceId ?? ''].join('\n');
}

export async function createServiceHeaders(env, input) {
  const secret = String(env.RECOGNITION_SERVICE_SECRET ?? '');
  if (!secret) throw new Error('Recognition service credential is not configured.');
  const serviceId = String(env.RECOGNITION_SERVICE_ID ?? 'stackr-public-gateway');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const signature = await hmacSha256(secret, serviceSignatureInput({
    ...input,
    serviceId,
    timestamp,
    nonce,
  }));
  return {
    'X-Stackr-Service-Id': serviceId,
    'X-Stackr-Service-Timestamp': timestamp,
    'X-Stackr-Service-Nonce': nonce,
    'X-Stackr-Service-Signature': signature,
    'X-Stackr-Body-Sha256': input.bodyHash,
    'X-Stackr-User-Id': input.userId ?? '',
    'X-Stackr-Device-Id': input.deviceId ?? '',
  };
}
