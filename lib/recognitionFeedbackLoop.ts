import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { RECOGNITION_FEEDBACK_API_URL } from './config';
import { supabase } from './supabase';
import {
  RECOGNITION_FEEDBACK_SCHEMA_VERSION,
  createRecognitionFeedbackRecord,
  explainRecognitionFeedbackImageUpload,
  grantRecognitionFeedbackImageConsent,
  markRecognitionFeedbackDeleted,
  validateRecognitionFeedbackForImageUpload,
  withdrawRecognitionFeedbackConsent,
  type RecognitionFeedbackDraftInput,
  type RecognitionFeedbackRecord,
} from './recognitionFeedbackCore';

const RECOGNITION_FEEDBACK_QUEUE_KEY = `${RECOGNITION_FEEDBACK_SCHEMA_VERSION}:queue`;
const RECOGNITION_FEEDBACK_LOCAL_DIR = `${FileSystem.documentDirectory ?? ''}recognition-feedback`;

function sortQueue(records: RecognitionFeedbackRecord[]) {
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function isFileUri(uri?: string | null): uri is string {
  return Boolean(uri && (uri.startsWith('file://') || uri.startsWith('content://')));
}

async function readQueueUnchecked() {
  const raw = await AsyncStorage.getItem(RECOGNITION_FEEDBACK_QUEUE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed as RecognitionFeedbackRecord[] : [];
}

async function writeQueue(records: RecognitionFeedbackRecord[]) {
  await AsyncStorage.setItem(RECOGNITION_FEEDBACK_QUEUE_KEY, JSON.stringify(sortQueue(records)));
}

async function ensureLocalFeedbackDir(localId: string) {
  const baseInfo = await FileSystem.getInfoAsync(RECOGNITION_FEEDBACK_LOCAL_DIR);
  if (!baseInfo.exists) {
    await FileSystem.makeDirectoryAsync(RECOGNITION_FEEDBACK_LOCAL_DIR, { intermediates: true });
  }
  const itemDir = `${RECOGNITION_FEEDBACK_LOCAL_DIR}/${localId}`;
  const itemInfo = await FileSystem.getInfoAsync(itemDir);
  if (!itemInfo.exists) {
    await FileSystem.makeDirectoryAsync(itemDir, { intermediates: true });
  }
  return itemDir;
}

function extensionForUri(uri: string, fallback: string) {
  const cleanUri = uri.split('?')[0] ?? uri;
  const match = /\.([a-z0-9]+)$/i.exec(cleanUri);
  return match?.[1]?.toLowerCase() ?? fallback;
}

async function persistLocalRectifiedImage(record: RecognitionFeedbackRecord): Promise<RecognitionFeedbackRecord> {
  if (!isFileUri(record.rectifiedImageUri)) return record;
  if (record.rectifiedImageUri.includes(`/recognition-feedback/${record.localId}/`)) return record;
  const itemDir = await ensureLocalFeedbackDir(record.localId);
  const destination = `${itemDir}/rectified-card.${extensionForUri(record.rectifiedImageUri, 'jpg')}`;
  await FileSystem.copyAsync({ from: record.rectifiedImageUri, to: destination });
  return {
    ...record,
    rectifiedImageUri: destination,
  };
}

async function getAuthHeader() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in is required before uploading recognition feedback.');
  return `Bearer ${token}`;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload?.error ?? `Recognition feedback request failed with HTTP ${response.status}`);
  }
  return payload;
}

function buildUploadMetadata(record: RecognitionFeedbackRecord) {
  return {
    schemaVersion: record.schemaVersion,
    localId: record.localId,
    anonymousScanId: record.anonymousScanId,
    action: record.action,
    predictedIdentity: record.predictedIdentity,
    correctedIdentity: record.correctedIdentity,
    correctedVariant: record.correctedVariant,
    missingCardDescription: record.missingCardDescription,
    topCandidateScores: record.topCandidateScores,
    captureQuality: record.captureQuality,
    ocrEvidenceSummary: record.ocrEvidenceSummary,
    modelVersion: record.modelVersion,
    catalogueVersion: record.catalogueVersion,
    deviceClass: record.deviceClass,
    physicalCardSessionId: record.physicalCardSessionId,
    rectifiedImageWidth: record.rectifiedImageWidth,
    rectifiedImageHeight: record.rectifiedImageHeight,
    consentState: record.consentState,
    userLabelStatus: record.userLabelStatus,
    reviewStatus: record.reviewStatus,
    createdAt: record.createdAt,
  };
}

export function createDeviceRecognitionFeedbackRecord(
  input: Omit<RecognitionFeedbackDraftInput, 'deviceClass'>
): RecognitionFeedbackRecord {
  return createRecognitionFeedbackRecord({
    ...input,
    deviceClass: [
      Platform.OS,
      Device.modelName ?? Device.deviceName ?? 'unknown-device',
      Device.deviceYearClass ? `year-${Device.deviceYearClass}` : null,
    ].filter(Boolean).join(':'),
  });
}

export { explainRecognitionFeedbackImageUpload };

export async function loadRecognitionFeedbackQueue(): Promise<RecognitionFeedbackRecord[]> {
  try {
    return sortQueue(await readQueueUnchecked());
  } catch {
    return [];
  }
}

export async function saveRecognitionFeedbackRecord(
  record: RecognitionFeedbackRecord
): Promise<RecognitionFeedbackRecord[]> {
  const persistedRecord = await persistLocalRectifiedImage(record);
  const records = await loadRecognitionFeedbackQueue();
  const next = [persistedRecord, ...records.filter((item) => item.localId !== record.localId)];
  await writeQueue(next);
  return sortQueue(next);
}

export async function updateRecognitionFeedbackRecord(
  localId: string,
  updater: Partial<RecognitionFeedbackRecord> | ((record: RecognitionFeedbackRecord) => RecognitionFeedbackRecord)
): Promise<RecognitionFeedbackRecord[]> {
  const records = await loadRecognitionFeedbackQueue();
  const next = records.map((record) => {
    if (record.localId !== localId) return record;
    return typeof updater === 'function' ? updater(record) : { ...record, ...updater };
  });
  await writeQueue(next);
  return sortQueue(next);
}

export async function consentToRecognitionFeedbackImageUpload(
  localId: string
): Promise<RecognitionFeedbackRecord | null> {
  const records = await loadRecognitionFeedbackQueue();
  const record = records.find((item) => item.localId === localId) ?? null;
  if (!record) return null;
  const updated = grantRecognitionFeedbackImageConsent(record);
  await updateRecognitionFeedbackRecord(localId, updated);
  return updated;
}

export async function withdrawRecognitionFeedbackImageUploadConsent(
  localId: string
): Promise<RecognitionFeedbackRecord | null> {
  const records = await loadRecognitionFeedbackQueue();
  const record = records.find((item) => item.localId === localId) ?? null;
  if (!record) return null;
  const updated = withdrawRecognitionFeedbackConsent(record);
  await updateRecognitionFeedbackRecord(localId, updated);
  return updated;
}

async function uploadRectifiedImage(record: RecognitionFeedbackRecord, authorization: string) {
  if (!record.backendId) throw new Error('Recognition feedback metadata must be uploaded before its image.');
  if (!record.rectifiedImageUri) throw new Error('Rectified image is missing.');

  const contentType = /\.(png)$/i.test(record.rectifiedImageUri) ? 'image/png' : 'image/jpeg';
  const result = await FileSystem.uploadAsync(
    `${RECOGNITION_FEEDBACK_API_URL}/items/${encodeURIComponent(record.backendId)}/files/rectified-card`,
    record.rectifiedImageUri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: authorization,
        'Content-Type': contentType,
      },
    }
  );

  const payload = result.body ? JSON.parse(result.body) : {};
  if (result.status < 200 || result.status >= 300) {
    throw new Error(payload?.error ?? `Recognition feedback image upload failed with HTTP ${result.status}`);
  }
  return payload;
}

export async function uploadRecognitionFeedbackRecord(
  record: RecognitionFeedbackRecord
): Promise<RecognitionFeedbackRecord> {
  const validation = validateRecognitionFeedbackForImageUpload(record);
  if (!validation.ok) {
    throw new Error(`Recognition feedback is not uploadable: ${validation.reasons.join(', ')}`);
  }

  const authorization = await getAuthHeader();
  const metadataResponse = await fetch(`${RECOGNITION_FEEDBACK_API_URL}/items`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ feedback: buildUploadMetadata(record) }),
  });
  const metadataPayload = await parseJsonResponse(metadataResponse);
  const backendId = String(metadataPayload.feedbackId ?? record.backendId ?? '');
  if (!backendId) throw new Error('Recognition feedback upload route did not return an ID.');

  const metadataUploaded: RecognitionFeedbackRecord = {
    ...record,
    backendId,
    imageUploadStatus: 'metadata_received',
    uploadError: null,
  };

  const imagePayload = await uploadRectifiedImage(metadataUploaded, authorization);
  const uploaded: RecognitionFeedbackRecord = {
    ...metadataUploaded,
    imageUploadStatus: 'uploaded',
    rectifiedImageStoragePath: imagePayload.storagePath ?? metadataUploaded.rectifiedImageStoragePath,
    rectifiedImageChecksumSha256: imagePayload.checksumSha256 ?? metadataUploaded.rectifiedImageChecksumSha256,
    uploadedAt: new Date().toISOString(),
  };
  await updateRecognitionFeedbackRecord(record.localId, uploaded);
  return uploaded;
}

async function deleteLocalFile(uri?: string | null) {
  if (!isFileUri(uri)) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // Local cleanup should not hide the feedback queue from the user.
  }
}

export async function deleteRecognitionFeedbackRecord(
  record: RecognitionFeedbackRecord,
  options: { deleteUploaded?: boolean; deleteLocalImage?: boolean } = {}
): Promise<RecognitionFeedbackRecord[]> {
  if (options.deleteUploaded && record.backendId) {
    const authorization = await getAuthHeader();
    const response = await fetch(
      `${RECOGNITION_FEEDBACK_API_URL}/items/${encodeURIComponent(record.backendId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: authorization },
      }
    );
    await parseJsonResponse(response);
  }

  if (options.deleteLocalImage !== false) {
    await deleteLocalFile(record.rectifiedImageUri);
  }

  const deleted = markRecognitionFeedbackDeleted(record);
  const records = await loadRecognitionFeedbackQueue();
  const next = [deleted, ...records.filter((item) => item.localId !== record.localId)]
    .filter((item) => item.reviewStatus !== 'deleted' || item.backendId);
  await writeQueue(next);
  return sortQueue(next);
}
