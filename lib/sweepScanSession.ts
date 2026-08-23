import AsyncStorage from '@react-native-async-storage/async-storage';

export type SweepScanCandidate = {
  id: string;
  name: string;
  number?: string | null;
  set_id?: string | null;
  set_name?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  language?: string | null;
  confidence?: number | null;
  variant_code?: string | null;
};

export type SweepScanItemStatus = 'confirmed' | 'review' | 'unresolved';

export type SweepScanItem = {
  id: string;
  identityKey: string | null;
  status: SweepScanItemStatus;
  candidates: SweepScanCandidate[];
  selectedCandidateIndex: number;
  quantity: number;
  captureCount: number;
  captureUris: string[];
  firstCapturedAt: string;
  lastCapturedAt: string;
  source: 'auto' | 'manual';
};

export type SweepScanSession = {
  scanSessionId: string;
  binderId?: string | null;
  createdAt: string;
  updatedAt: string;
  items: SweepScanItem[];
  lastCaptureKey: string | null;
  lastCaptureAt: string | null;
};

export type SweepScanSummary = {
  distinctCards: number;
  totalCopies: number;
  confirmedCopies: number;
  reviewItems: number;
  unresolvedItems: number;
};

export type AddSweepScanResult = {
  action: 'added' | 'incremented' | 'duplicate_ignored' | 'unresolved_added';
  session: SweepScanSession;
  item: SweepScanItem;
};

const MAX_STORED_SESSIONS = 6;
const MAX_CAPTURE_URIS_PER_ITEM = 3;
const RAPID_DUPLICATE_WINDOW_MS = 4_000;
const AUTO_CONFIRM_CONFIDENCE = 0.84;
const AUTO_CONFIRM_MARGIN = 0.06;
const STORAGE_PREFIX = 'stackr:sweep-scan-session:';
const sessions = new Map<string, SweepScanSession>();

function persistenceAvailable() {
  return typeof (globalThis as any).window !== 'undefined';
}
function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normaliseConfidence(value?: number | null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

function candidateIdentityKey(candidate?: SweepScanCandidate | null) {
  if (!candidate?.id) return null;
  return [
    String(candidate.language ?? 'unknown').trim().toLowerCase(),
    String(candidate.set_id ?? 'unknown').trim().toLowerCase(),
    String(candidate.id).trim().toLowerCase(),
    String(candidate.variant_code ?? '').trim().toLowerCase(),
  ].join(':');
}

function mergeCandidates(
  incoming: SweepScanCandidate[],
  existing: SweepScanCandidate[]
) {
  const merged: SweepScanCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of [...incoming, ...existing]) {
    const key = candidateIdentityKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }
  return merged;
}

function inferStatus(candidates: SweepScanCandidate[]): SweepScanItemStatus {
  const top = normaliseConfidence(candidates[0]?.confidence);
  if (top == null) return 'review';
  const second = normaliseConfidence(candidates[1]?.confidence);
  const margin = second == null ? 1 : top - second;
  return top >= AUTO_CONFIRM_CONFIDENCE && margin >= AUTO_CONFIRM_MARGIN
    ? 'confirmed'
    : 'review';
}

function persistSession(session: SweepScanSession) {
  if (!persistenceAvailable()) return;
  void AsyncStorage.setItem(`${STORAGE_PREFIX}${session.scanSessionId}`, JSON.stringify(session))
    .catch((error) => console.log('Sweep scan session persistence failed:', error));
}

function trimSessions() {
  while (sessions.size > MAX_STORED_SESSIONS) {
    const oldestKey = sessions.keys().next().value as string | undefined;
    if (!oldestKey) break;
    sessions.delete(oldestKey);
    if (!persistenceAvailable()) continue;
    void AsyncStorage.removeItem(`${STORAGE_PREFIX}${oldestKey}`)
      .catch((error) => console.log('Sweep scan session cleanup failed:', error));
  }
}

function saveSession(session: SweepScanSession) {
  sessions.delete(session.scanSessionId);
  sessions.set(session.scanSessionId, session);
  trimSessions();
  persistSession(session);
  return session;
}

export function createSweepScanSession(input: {
  scanSessionId?: string;
  binderId?: string | null;
} = {}) {
  const now = new Date().toISOString();
  const session: SweepScanSession = {
    scanSessionId: input.scanSessionId ?? createId('sweep'),
    binderId: input.binderId ?? null,
    createdAt: now,
    updatedAt: now,
    items: [],
    lastCaptureKey: null,
    lastCaptureAt: null,
  };
  return saveSession(session);
}

export function getSweepScanSession(scanSessionId?: string | null) {
  return scanSessionId ? sessions.get(scanSessionId) ?? null : null;
}

export async function hydrateSweepScanSession(scanSessionId?: string | null) {
  if (!scanSessionId) return null;
  const current = getSweepScanSession(scanSessionId);
  if (current) return current;
  if (!persistenceAvailable()) return null;
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${scanSessionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SweepScanSession;
    if (!parsed || parsed.scanSessionId !== scanSessionId || !Array.isArray(parsed.items)) return null;
    sessions.set(scanSessionId, parsed);
    trimSessions();
    return parsed;
  } catch (error) {
    console.log('Sweep scan session restore failed:', error);
    return null;
  }
}

export function ensureSweepScanSession(input: {
  scanSessionId: string;
  binderId?: string | null;
}) {
  return getSweepScanSession(input.scanSessionId) ?? createSweepScanSession(input);
}

export function addSweepScanCandidates(
  scanSessionId: string,
  candidates: SweepScanCandidate[],
  options: {
    captureUri?: string | null;
    source?: 'auto' | 'manual';
    capturedAt?: string;
    preventRapidDuplicate?: boolean;
  } = {}
): AddSweepScanResult {
  const session = ensureSweepScanSession({ scanSessionId });
  const usableCandidates = candidates.filter((candidate) => Boolean(candidate?.id));
  if (!usableCandidates.length) {
    return addUnresolvedSweepScan(scanSessionId, options);
  }

  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const capturedAtMs = Date.parse(capturedAt);
  const key = candidateIdentityKey(usableCandidates[0]);
  const lastCaptureAtMs = session.lastCaptureAt ? Date.parse(session.lastCaptureAt) : 0;
  const duplicateWindowActive = options.preventRapidDuplicate !== false
    && key != null
    && session.lastCaptureKey === key
    && Number.isFinite(capturedAtMs)
    && capturedAtMs - lastCaptureAtMs >= 0
    && capturedAtMs - lastCaptureAtMs < RAPID_DUPLICATE_WINDOW_MS;

  const existingIndex = key
    ? session.items.findIndex((item) => item.identityKey === key)
    : -1;

  if (duplicateWindowActive && existingIndex >= 0) {
    return {
      action: 'duplicate_ignored',
      session,
      item: session.items[existingIndex],
    };
  }

  const captureUris = options.captureUri ? [options.captureUri] : [];
  const incomingStatus = inferStatus(usableCandidates);
  let item: SweepScanItem;
  let action: AddSweepScanResult['action'];
  let items: SweepScanItem[];

  if (existingIndex >= 0) {
    const existing = session.items[existingIndex];
    const mergedCandidates = mergeCandidates(usableCandidates, existing.candidates);
    item = {
      ...existing,
      status: existing.status === 'confirmed' || incomingStatus === 'confirmed' ? 'confirmed' : 'review',
      candidates: mergedCandidates,
      selectedCandidateIndex: 0,
      quantity: existing.quantity + 1,
      captureCount: existing.captureCount + 1,
      captureUris: [...captureUris, ...existing.captureUris].slice(0, MAX_CAPTURE_URIS_PER_ITEM),
      lastCapturedAt: capturedAt,
      source: options.source ?? existing.source,
    };
    items = session.items.map((current, index) => index === existingIndex ? item : current);
    action = 'incremented';
  } else {
    item = {
      id: createId('sweep-item'),
      identityKey: key,
      status: incomingStatus,
      candidates: usableCandidates,
      selectedCandidateIndex: 0,
      quantity: 1,
      captureCount: 1,
      captureUris,
      firstCapturedAt: capturedAt,
      lastCapturedAt: capturedAt,
      source: options.source ?? 'auto',
    };
    items = [...session.items, item];
    action = 'added';
  }

  const next = saveSession({
    ...session,
    items,
    updatedAt: capturedAt,
    lastCaptureKey: key,
    lastCaptureAt: capturedAt,
  });
  return { action, session: next, item };
}

export function addUnresolvedSweepScan(
  scanSessionId: string,
  options: {
    captureUri?: string | null;
    source?: 'auto' | 'manual';
    capturedAt?: string;
  } = {}
): AddSweepScanResult {
  const session = ensureSweepScanSession({ scanSessionId });
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const item: SweepScanItem = {
    id: createId('sweep-unresolved'),
    identityKey: null,
    status: 'unresolved',
    candidates: [],
    selectedCandidateIndex: 0,
    quantity: 1,
    captureCount: 1,
    captureUris: options.captureUri ? [options.captureUri] : [],
    firstCapturedAt: capturedAt,
    lastCapturedAt: capturedAt,
    source: options.source ?? 'auto',
  };
  const next = saveSession({
    ...session,
    items: [...session.items, item],
    updatedAt: capturedAt,
    lastCaptureKey: null,
    lastCaptureAt: capturedAt,
  });
  return { action: 'unresolved_added', session: next, item };
}

function updateItem(
  scanSessionId: string,
  itemId: string,
  updater: (item: SweepScanItem) => SweepScanItem | null
) {
  const session = getSweepScanSession(scanSessionId);
  if (!session) return null;
  let changed = false;
  const items = session.items.flatMap((item) => {
    if (item.id !== itemId) return [item];
    changed = true;
    const next = updater(item);
    return next ? [next] : [];
  });
  if (!changed) return session;
  return saveSession({
    ...session,
    items,
    updatedAt: new Date().toISOString(),
  });
}

export function selectSweepScanCandidate(scanSessionId: string, itemId: string, candidateIndex: number) {
  return updateItem(scanSessionId, itemId, (item) => {
    if (!item.candidates[candidateIndex]) return item;
    return {
      ...item,
      identityKey: candidateIdentityKey(item.candidates[candidateIndex]),
      selectedCandidateIndex: candidateIndex,
      status: 'review',
    };
  });
}

export function confirmSweepScanItem(scanSessionId: string, itemId: string) {
  return updateItem(scanSessionId, itemId, (item) => (
    item.candidates[item.selectedCandidateIndex]
      ? { ...item, status: 'confirmed' }
      : item
  ));
}

export function setSweepScanItemQuantity(scanSessionId: string, itemId: string, quantity: number) {
  const safeQuantity = Math.max(1, Math.round(Number(quantity) || 1));
  return updateItem(scanSessionId, itemId, (item) => ({ ...item, quantity: safeQuantity }));
}

export function removeSweepScanItem(scanSessionId: string, itemId: string) {
  return updateItem(scanSessionId, itemId, () => null);
}

export function getSweepScanSummary(session?: SweepScanSession | null): SweepScanSummary {
  const items = session?.items ?? [];
  return {
    distinctCards: items.filter((item) => item.status !== 'unresolved').length,
    totalCopies: items
      .filter((item) => item.status !== 'unresolved')
      .reduce((sum, item) => sum + item.quantity, 0),
    confirmedCopies: items
      .filter((item) => item.status === 'confirmed')
      .reduce((sum, item) => sum + item.quantity, 0),
    reviewItems: items.filter((item) => item.status === 'review').length,
    unresolvedItems: items.filter((item) => item.status === 'unresolved').length,
  };
}

export function clearSweepScanSession(scanSessionId?: string | null) {
  if (!scanSessionId) return;
  sessions.delete(scanSessionId);
  if (!persistenceAvailable()) return;
  void AsyncStorage.removeItem(`${STORAGE_PREFIX}${scanSessionId}`)
    .catch((error) => console.log('Sweep scan session cleanup failed:', error));
}
