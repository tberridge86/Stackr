import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { SCAN_LAB_INTERNAL_ENABLED, SCAN_LAB_UPLOAD_API_URL } from './config';
import { supabase } from './supabase';
import {
  SCAN_LAB_SCHEMA_VERSION,
  applyScanLabReviewDecision,
  buildScanLabUploadMetadata,
  createPhysicalCardSessionId,
  createScanLabCaptureRecord,
  createScanLabLocalId,
  shouldDeleteScanLabBackendCapture,
  validateScanLabCaptureForUpload,
  type ScanLabCaptureDraft,
  type ScanLabCaptureRecord,
  type ScanLabReviewDecision,
} from './scanLabCore';
import type { Profile } from '../components/profile-context';

const SCAN_LAB_QUEUE_KEY = `${SCAN_LAB_SCHEMA_VERSION}:queue`;
const SCAN_LAB_LOCAL_DIR = `${FileSystem.documentDirectory ?? ''}scan-lab`;

type UploadFileRole = 'original-photo' | 'rectified-card';

function sortQueue(records: ScanLabCaptureRecord[]) {
  return [...records].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

function isFileUri(uri?: string | null): uri is string {
  return Boolean(uri && (uri.startsWith('file://') || uri.startsWith('content://')));
}

async function readQueueUnchecked() {
  const raw = await AsyncStorage.getItem(SCAN_LAB_QUEUE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed as ScanLabCaptureRecord[];
}

async function writeQueue(records: ScanLabCaptureRecord[]) {
  await AsyncStorage.setItem(SCAN_LAB_QUEUE_KEY, JSON.stringify(sortQueue(records)));
}

async function ensureLocalCaptureDir(localId: string) {
  const baseInfo = await FileSystem.getInfoAsync(SCAN_LAB_LOCAL_DIR);
  if (!baseInfo.exists) {
    await FileSystem.makeDirectoryAsync(SCAN_LAB_LOCAL_DIR, { intermediates: true });
  }
  const captureDir = `${SCAN_LAB_LOCAL_DIR}/${localId}`;
  const captureInfo = await FileSystem.getInfoAsync(captureDir);
  if (!captureInfo.exists) {
    await FileSystem.makeDirectoryAsync(captureDir, { intermediates: true });
  }
  return captureDir;
}

function extensionForUri(uri: string, fallback: string) {
  const cleanUri = uri.split('?')[0] ?? uri;
  const match = /\.([a-z0-9]+)$/i.exec(cleanUri);
  return match?.[1]?.toLowerCase() ?? fallback;
}

async function persistLocalFile(localId: string, uri: string | null, basename: string, fallbackExtension: string) {
  if (!isFileUri(uri)) return uri;
  if (uri.includes(`/scan-lab/${localId}/`)) return uri;
  const captureDir = await ensureLocalCaptureDir(localId);
  const destination = `${captureDir}/${basename}.${extensionForUri(uri, fallbackExtension)}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

async function persistScanLabCaptureFiles(record: ScanLabCaptureRecord): Promise<ScanLabCaptureRecord> {
  const [
    originalPhotoUri,
    rectifiedCardUri,
    recognitionCropUri,
    ocrSourceCropUri,
    thumbnailUri,
  ] = await Promise.all([
    persistLocalFile(record.localId, record.originalPhotoUri, 'original-photo', 'jpg'),
    persistLocalFile(record.localId, record.rectifiedCardUri, 'rectified-card', 'png'),
    persistLocalFile(record.localId, record.recognitionCropUri, 'recognition-crop', 'png'),
    persistLocalFile(record.localId, record.ocrSourceCropUri, 'ocr-source-crop', 'png'),
    persistLocalFile(record.localId, record.thumbnailUri, 'thumbnail', 'jpg'),
  ]);

  return {
    ...record,
    originalPhotoUri: originalPhotoUri ?? record.originalPhotoUri,
    rectifiedCardUri,
    recognitionCropUri,
    ocrSourceCropUri,
    thumbnailUri,
  };
}

export function isScanLabAvailableForProfile(profile?: Pick<Profile, 'role'> | null) {
  return SCAN_LAB_INTERNAL_ENABLED && profile?.role === 'admin';
}

export { createPhysicalCardSessionId, createScanLabLocalId };

export async function loadScanLabQueue(): Promise<ScanLabCaptureRecord[]> {
  try {
    return sortQueue(await readQueueUnchecked());
  } catch {
    return [];
  }
}

export async function saveScanLabCapture(record: ScanLabCaptureRecord): Promise<ScanLabCaptureRecord[]> {
  const persistedRecord = await persistScanLabCaptureFiles(record);
  const records = await loadScanLabQueue();
  const next = [persistedRecord, ...records.filter((item) => item.localId !== record.localId)];
  await writeQueue(next);
  return sortQueue(next);
}

export async function updateScanLabCapture(
  localId: string,
  updater: Partial<ScanLabCaptureRecord> | ((record: ScanLabCaptureRecord) => ScanLabCaptureRecord)
): Promise<ScanLabCaptureRecord[]> {
  const records = await loadScanLabQueue();
  const next = records.map((record) => {
    if (record.localId !== localId) return record;
    return typeof updater === 'function'
      ? updater(record)
      : { ...record, ...updater };
  });
  await writeQueue(next);
  return sortQueue(next);
}

export async function reviewScanLabCapture(
  localId: string,
  decision: ScanLabReviewDecision
): Promise<ScanLabCaptureRecord[]> {
  return updateScanLabCapture(localId, (record) => applyScanLabReviewDecision(record, decision));
}

export function buildScanLabCaptureDraft(
  input: Omit<ScanLabCaptureDraft, 'schemaVersion' | 'device' | 'localId' | 'backendCaptureId' | 'capturedAt'>
): ScanLabCaptureDraft {
  return {
    ...input,
    localId: createScanLabLocalId(),
    backendCaptureId: null,
    capturedAt: new Date().toISOString(),
    device: {
      platform: Platform.OS,
      deviceModel: Device.modelName ?? Device.deviceName ?? null,
      osName: Device.osName ?? Platform.OS,
      osVersion: Device.osVersion ?? null,
    },
  };
}

export function createLocalScanLabRecord(
  input: Omit<ScanLabCaptureDraft, 'schemaVersion' | 'device' | 'localId' | 'backendCaptureId' | 'capturedAt'>
) {
  return createScanLabCaptureRecord(buildScanLabCaptureDraft(input));
}

async function deleteLocalFile(uri?: string | null) {
  if (!isFileUri(uri)) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // Local cleanup should not hide the queue state from the tester.
  }
}

async function getAuthHeader() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in is required before uploading Scan Lab captures.');
  return `Bearer ${token}`;
}

async function parseUploadResponse(response: Response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload?.error ?? `Scan Lab upload failed with HTTP ${response.status}`);
  }
  return payload;
}

async function uploadFile(captureId: string, role: UploadFileRole, uri: string, authorization: string) {
  const result = await FileSystem.uploadAsync(
    `${SCAN_LAB_UPLOAD_API_URL}/captures/${encodeURIComponent(captureId)}/files/${role}`,
    uri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: authorization,
        'Content-Type': role === 'rectified-card' ? 'image/png' : 'image/jpeg',
      },
    }
  );

  const payload = result.body ? JSON.parse(result.body) : {};
  if (result.status < 200 || result.status >= 300) {
    throw new Error(payload?.error ?? `Scan Lab ${role} upload failed with HTTP ${result.status}`);
  }
  return payload;
}

export async function uploadScanLabCapture(record: ScanLabCaptureRecord): Promise<ScanLabCaptureRecord> {
  const validation = validateScanLabCaptureForUpload(record);
  if (!validation.ok) {
    throw new Error(`Scan Lab capture is not uploadable: ${validation.reasons.join(', ')}`);
  }

  const authorization = await getAuthHeader();
  const metadataResponse = await fetch(`${SCAN_LAB_UPLOAD_API_URL}/captures`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      capture: buildScanLabUploadMetadata(record),
    }),
  });
  const metadataPayload = await parseUploadResponse(metadataResponse);
  const captureId = String(metadataPayload.captureId ?? record.backendCaptureId ?? '');
  if (!captureId) {
    throw new Error('Scan Lab upload route did not return a capture ID.');
  }

  await updateScanLabCapture(record.localId, {
    backendCaptureId: captureId,
    uploadStatus: 'metadata_received',
    uploadError: null,
  });

  await uploadFile(captureId, 'original-photo', record.originalPhotoUri, authorization);
  if (record.rectifiedCardUri) {
    await uploadFile(captureId, 'rectified-card', record.rectifiedCardUri, authorization);
  }

  const uploaded: ScanLabCaptureRecord = {
    ...record,
    backendCaptureId: captureId,
    uploadStatus: 'uploaded',
    uploadError: null,
    uploadedAt: new Date().toISOString(),
  };
  await updateScanLabCapture(record.localId, uploaded);
  return uploaded;
}

export async function deleteUploadedScanLabCapture(record: ScanLabCaptureRecord): Promise<void> {
  if (!record.backendCaptureId) return;
  const authorization = await getAuthHeader();
  const response = await fetch(
    `${SCAN_LAB_UPLOAD_API_URL}/captures/${encodeURIComponent(record.backendCaptureId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: authorization },
    }
  );
  await parseUploadResponse(response);
}

export async function deleteScanLabCapture(
  record: ScanLabCaptureRecord,
  options: { deleteUploaded?: boolean; deleteLocalFiles?: boolean } = {}
): Promise<ScanLabCaptureRecord[]> {
  if (options.deleteUploaded && shouldDeleteScanLabBackendCapture(record)) {
    await deleteUploadedScanLabCapture(record);
  }

  if (options.deleteLocalFiles !== false) {
    await Promise.all([
      deleteLocalFile(record.originalPhotoUri),
      deleteLocalFile(record.rectifiedCardUri),
      deleteLocalFile(record.recognitionCropUri),
      deleteLocalFile(record.ocrSourceCropUri),
      deleteLocalFile(record.thumbnailUri),
    ]);
  }

  const records = await loadScanLabQueue();
  const next = records.filter((item) => item.localId !== record.localId);
  await writeQueue(next);
  return sortQueue(next);
}
