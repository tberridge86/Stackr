export function isSetVariantQuantitySchemaUnavailable(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '').toLowerCase();
  return /(?:column|field|schema|migration).{0,80}\bquantity\b|\bquantity\b.{0,80}(?:column|field|schema|migration)/.test(message);
}
