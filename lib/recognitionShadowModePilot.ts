import { SHADOW_MODE_PILOT_API_URL } from './config';
import { supabase } from './supabase';
import {
  createShadowModePilotRecord,
  getShadowModeSnapshotFromDiagnostics,
  type ShadowModePilotIdentity,
  type ShadowModePilotRecord,
  type ShadowModePilotUserOutcome,
} from './recognitionShadowModePilotCore';
import type { ScanAttemptDiagnostics } from './scanDiagnostics';

async function authHeader() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in is required before uploading shadow-mode pilot evidence.');
  return `Bearer ${token}`;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload?.error ?? `Shadow-mode pilot request failed with HTTP ${response.status}`);
  }
  return payload;
}

export function buildShadowModePilotRecordFromDiagnostics(input: {
  diagnostics: ScanAttemptDiagnostics | null;
  userOutcome: ShadowModePilotUserOutcome;
  confirmedIdentity: ShadowModePilotIdentity | null;
  appContext?: Record<string, unknown> | null;
}): ShadowModePilotRecord | null {
  const snapshot = getShadowModeSnapshotFromDiagnostics(input.diagnostics);
  if (!snapshot) return null;
  const client = input.appContext?.client && typeof input.appContext.client === 'object'
    ? input.appContext.client as Record<string, unknown>
    : null;
  const deviceClass = [
    client?.platform,
    client?.deviceFamily,
    client?.deviceTier,
  ].filter(Boolean).join(':') || null;
  return createShadowModePilotRecord({
    shadowSnapshot: snapshot,
    userOutcome: {
      ...input.userOutcome,
      confirmedIdentity: input.confirmedIdentity,
    },
    captureQuality: input.diagnostics?.image?.quality ?? {},
    ocrEvidenceSummary: input.diagnostics?.providers
      .find((provider) => provider.provider === 'local-ocr')?.signals ?? {},
    deviceClass: String(input.appContext?.deviceClass ?? deviceClass ?? '') || null,
    appContext: {
      scanSource: input.diagnostics?.source ?? null,
      mode: input.diagnostics?.mode ?? null,
      intent: input.diagnostics?.intent ?? null,
      flow: input.diagnostics?.flow ?? null,
      binderId: input.diagnostics?.binderId ?? null,
      timings: input.diagnostics?.timings ?? {},
      ...input.appContext,
    },
  });
}

export async function submitShadowModePilotRecord(
  record: ShadowModePilotRecord
): Promise<{ ok: true; itemId: string; disagreementCategory: string }> {
  if (record.rawImageRecorded !== false || record.shadowSnapshot.rawImageRecorded !== false) {
    throw new Error('Shadow-mode pilot records must not include raw images.');
  }

  const authorization = await authHeader();
  const response = await fetch(`${SHADOW_MODE_PILOT_API_URL}/items`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ record }),
  });
  const payload = await parseJsonResponse(response);
  return {
    ok: true,
    itemId: String(payload.itemId ?? ''),
    disagreementCategory: String(payload.disagreementCategory ?? record.disagreementCategory),
  };
}
