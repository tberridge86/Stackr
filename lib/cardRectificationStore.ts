import * as FileSystem from 'expo-file-system/legacy';
import type { CardRectificationResult } from './cardRectification';
import { deleteCardRectificationOutputs } from './stackrCardVision';

export type CardRectificationScanRecord = {
  scanId: string;
  originalPhotoUris: string[];
  result: CardRectificationResult | null;
  createdAt: string;
};

const records = new Map<string, CardRectificationScanRecord>();
let latestScanId: string | null = null;

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function recordCapturedPhotoForRectification(scanId: string, uri: string) {
  const existing = records.get(scanId);
  const next: CardRectificationScanRecord = {
    scanId,
    originalPhotoUris: unique([...(existing?.originalPhotoUris ?? []), uri]),
    result: existing?.result ?? null,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  records.set(scanId, next);
  latestScanId = scanId;
}

export function recordCardRectificationResult(scanId: string, result: CardRectificationResult) {
  const existing = records.get(scanId);
  records.set(scanId, {
    scanId,
    originalPhotoUris: existing?.originalPhotoUris ?? [],
    result,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });
  latestScanId = scanId;
}

export function getCardRectificationRecord(scanId?: string | null): CardRectificationScanRecord | null {
  const key = scanId ?? latestScanId;
  return key ? records.get(key) ?? null : null;
}

async function deleteFileIfPresent(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function deleteTemporaryCardRectificationScan(scanId: string): Promise<{
  scanId: string;
  deletedCount: number;
  nativeDeletedCount: number;
}> {
  const record = records.get(scanId);
  const nativeDeletion = deleteCardRectificationOutputs(scanId);
  let deletedCount = nativeDeletion.deletedCount;

  for (const uri of record?.originalPhotoUris ?? []) {
    if (await deleteFileIfPresent(uri)) {
      deletedCount += 1;
    }
  }

  records.delete(scanId);
  if (latestScanId === scanId) latestScanId = null;

  return {
    scanId,
    deletedCount,
    nativeDeletedCount: nativeDeletion.deletedCount,
  };
}
