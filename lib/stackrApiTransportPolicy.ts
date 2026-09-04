/**
 * Mobile API traffic is always encrypted. Normalize once at client construction
 * so every request shares the same transport decision.
 */
export function normalizeStackrApiBaseUrl(value: string) {
  const raw = String(value ?? '').trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Stackr API base URL must be an absolute HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Stackr API base URL must use HTTPS without embedded credentials.');
  }
  if (url.search || url.hash) {
    throw new Error('Stackr API base URL must not contain a query or fragment.');
  }
  return url.toString().replace(/\/$/, '');
}
