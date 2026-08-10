import { stackrApiClient } from './stackrApiV1';
import {
  createShadowModePilotRecord,
  getShadowModeSnapshotFromDiagnostics,
  type ShadowModePilotIdentity,
  type ShadowModePilotRecord,
  type ShadowModePilotUserOutcome,
} from './recognitionShadowModePilotCore';
import type { ScanAttemptDiagnostics } from './scanDiagnostics';

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

  const envelope = await stackrApiClient.submitRecognitionShadowComparison(
    record as unknown as Record<string, unknown>
  );
  const payload = envelope.data;
  return {
    ok: true,
    itemId: String(payload.itemId ?? ''),
    disagreementCategory: String(payload.disagreementCategory ?? record.disagreementCategory),
  };
}
