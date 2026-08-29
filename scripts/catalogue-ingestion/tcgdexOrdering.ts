import { cleanText } from './sourceAdapter';

function canonicalTcgdexProviderId(value: unknown) {
  const rawId = value && typeof value === 'object'
    ? (value as Record<string, unknown>).id
    : value;
  const id = cleanText(rawId);
  return id ? id.normalize('NFKC').toLowerCase() : null;
}

function sortTcgdexProviderRows<T>(rows: readonly T[], recordType: 'card' | 'set') {
  const keyed = rows.map((row) => {
    const id = canonicalTcgdexProviderId(row);
    if (!id) throw new Error(`TCGdex ${recordType} rows must have a stable provider ID before batching.`);
    return { id, row };
  });
  keyed.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  for (let index = 1; index < keyed.length; index += 1) {
    if (keyed[index - 1].id === keyed[index].id) {
      throw new Error(`TCGdex ${recordType} universe contains duplicate provider ID ${keyed[index].id}.`);
    }
  }
  return keyed.map(({ row }) => row);
}

export function canonicalTcgdexCardId(value: unknown) {
  return canonicalTcgdexProviderId(value);
}

export function canonicalTcgdexSetId(value: unknown) {
  return canonicalTcgdexProviderId(value);
}

export function sortTcgdexCardRows<T>(rows: readonly T[]) {
  return sortTcgdexProviderRows(rows, 'card');
}

export function sortTcgdexSetRows<T>(rows: readonly T[]) {
  return sortTcgdexProviderRows(rows, 'set');
}
