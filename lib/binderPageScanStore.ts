import type { BinderPageLayout, BinderPagePocketResult } from './binderPageScan';

export type BinderPageScanSession = {
  scanSessionId: string;
  binderId?: string | null;
  layout: BinderPageLayout;
  capturedAt: string;
  originalUri?: string | null;
  pageUri?: string | null;
  processingMs: number;
  pockets: BinderPagePocketResult[];
};

const MAX_STORED_SESSIONS = 4;
const sessions = new Map<string, BinderPageScanSession>();

function trimSessions() {
  while (sessions.size > MAX_STORED_SESSIONS) {
    const oldestKey = sessions.keys().next().value;
    if (!oldestKey) break;
    sessions.delete(oldestKey);
  }
}

export function saveBinderPageScanSession(session: BinderPageScanSession) {
  sessions.set(session.scanSessionId, session);
  trimSessions();
}

export function getBinderPageScanSession(scanSessionId?: string | null) {
  return scanSessionId ? sessions.get(scanSessionId) ?? null : null;
}

export function updateBinderPageScanSession(
  scanSessionId: string,
  updater: (session: BinderPageScanSession) => BinderPageScanSession
) {
  const current = sessions.get(scanSessionId);
  if (!current) return null;
  const next = updater(current);
  sessions.set(scanSessionId, next);
  return next;
}

export function clearBinderPageScanSession(scanSessionId?: string | null) {
  if (!scanSessionId) return;
  sessions.delete(scanSessionId);
}
