import * as FileSystem from 'expo-file-system/legacy';
import { PRICE_API_URL } from './config';
import { supabase } from './supabase';
import { deleteOwnerCaptureWithEnvironment } from './ownerCaptureDeletion';
import {
  createOwnerCaptureRecord, ownerCaptureDirectory, parseOwnerRecognitionResult,
  type OwnerRecognitionResult, type OwnerTeachingIdentity,
} from './ownerRecognitionCore';
import {
  assertOwnerFeedbackId, buildOwnerTeachingFeedback, syncOwnerTeachingCapture,
  type OwnerTeachingSyncRecord, type OwnerTeachingUploadStatus,
} from './ownerTeachingSyncCore';

const API = `${PRICE_API_URL.replace(/\/$/, '')}/api/owner-recognition`;
export type OwnerRecognitionAccess = { available: true; ownerId: string; modelVersion: string; indexVersion: string };

async function accessToken(expectedOwner?: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token || (expectedOwner && data.session.user.id !== expectedOwner)) {
    throw new Error('OWNER_SIGN_IN_REQUIRED: Sign in with your owner account.');
  }
  // Only forwards the token; the server verifies identity and the owner allowlist.
  return data.session.access_token;
}

async function request(path: string, body?: Blob, expectedOwner?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await fetch(`${API}${path}`, {
      method: body ? 'POST' : 'GET', signal: controller.signal,
      headers: { Authorization: `Bearer ${await accessToken(expectedOwner)}`,
        ...(body ? { 'Content-Type': 'image/jpeg' } : {}) },
      ...(body ? { body } : {}),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(`${value.error?.code ?? 'OWNER_RECOGNITION_UNAVAILABLE'}: ${value.error?.message ?? 'Private recognition is unavailable.'}`);
    return value;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('OWNER_MODEL_TIMEOUT: Recognition timed out. No match was accepted.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function getOwnerRecognitionAccess(): Promise<OwnerRecognitionAccess> {
  const value = await request('/status');
  if (value.available !== true || typeof value.ownerId !== 'string') throw new Error('Private recognition is not ready.');
  return value;
}

export async function identifyOwnerCard(uri: string, ownerId: string) {
  if (!uri.startsWith('file://')) throw new Error('Use a local camera photograph.');
  const image = await (await fetch(uri)).blob();
  if (image.size > 5 * 1024 * 1024) throw new Error('This photo is too large. Please retake it.');
  return parseOwnerRecognitionResult(await request('/identify', image, ownerId));
}

async function verifiedLocalDirectory(ownerId: string) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== ownerId) throw new Error('Sign in to access your saved captures.');
  return ownerCaptureDirectory(FileSystem.documentDirectory, ownerId);
}

export async function listOwnerCaptures(ownerId: string) {
  const directory = await verifiedLocalDirectory(ownerId);
  if (!(await FileSystem.getInfoAsync(directory)).exists) return [];
  const entries = (await FileSystem.readDirectoryAsync(directory)).filter((id) => /^[a-z0-9-]+$/.test(id));
  const records: { id: string; physicalCardId: string; reviewStatus: string;
    correctedIdentity?: OwnerTeachingIdentity | null; uploadStatus?: OwnerTeachingUploadStatus;
    trainingUseApproved?: boolean }[] = [];
  for (const id of entries) {
    try {
      const record = JSON.parse(await FileSystem.readAsStringAsync(`${directory}${id}/record.json`));
      records.push({ id, physicalCardId: String(record.physicalCardId), reviewStatus: String(record.reviewStatus),
        correctedIdentity: record.correctedIdentity ?? null,
        uploadStatus: record.uploadStatus === 'uploading' ? 'failed' : record.uploadStatus ?? 'local',
        trainingUseApproved: record.trainingUseApproved === true });
    } catch { /* Interrupted saves are not treated as complete dataset records. */ }
  }
  await accessToken(ownerId);
  return records.reverse();
}

export async function saveOwnerCapture(input: {
  ownerId: string; imageUri: string; physicalCardId: string;
  result: OwnerRecognitionResult; selectedVariantId: string | null;
  correctedIdentity?: OwnerTeachingIdentity | null; trainingUseApproved?: boolean;
}) {
  const root = await verifiedLocalDirectory(input.ownerId);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const record = createOwnerCaptureRecord({ ...input, id, capturedAt: new Date().toISOString() });
  const directory = `${root}${id}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  try {
    await FileSystem.copyAsync({ from: input.imageUri, to: `${directory}card.jpg` });
    await accessToken(input.ownerId);
    await FileSystem.writeAsStringAsync(`${directory}record.json`, JSON.stringify(record, null, 2));
    await accessToken(input.ownerId);
  } catch (error) {
    await FileSystem.deleteAsync(directory, { idempotent: true });
    throw error;
  }
  return record;
}

export async function deleteOwnerCapture(ownerId: string, id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid capture identifier.');
  if (captureOperations.has(`${ownerId}:${id}`)) throw new Error('Wait for this teaching example to finish uploading before deleting it.');
  const directory = await verifiedLocalDirectory(ownerId);
  const record = JSON.parse(await FileSystem.readAsStringAsync(`${directory}${id}/record.json`)) as OwnerTeachingSyncRecord;
  // Keep the local retry record until remote deletion has succeeded.
  if (record.feedbackId) {
    assertOwnerFeedbackId(record.feedbackId);
    await feedbackRequest(ownerId, `/items/${record.feedbackId}`, {method:'DELETE'});
  }
  await deleteOwnerCaptureWithEnvironment(ownerId, id, {
    verifiedLocalDirectory,
    assertCurrentOwner: accessToken,
    deleteDirectory: (directory) => FileSystem.deleteAsync(directory, { idempotent: true }),
  });
}

async function feedbackRequest(ownerId: string, path: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await fetch(`${PRICE_API_URL.replace(/\/$/, '')}/api/recognition-feedback${path}`, {
      ...init, signal: controller.signal,
      headers: {...init.headers, Authorization:`Bearer ${await accessToken(ownerId)}`},
    });
    const value = await response.json();
    if (!response.ok || value.ok !== true) throw new Error('Your teaching example could not be backed up. It remains on this device; try again.');
    return value;
  } finally { clearTimeout(timeout); }
}

const captureOperations = new Set<string>();
export async function uploadOwnerCapture(ownerId: string, id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid capture identifier.');
  const operationKey = `${ownerId}:${id}`;
  if (captureOperations.has(operationKey)) throw new Error('This teaching example is already uploading.');
  captureOperations.add(operationKey);
  try {
    const directory = `${await verifiedLocalDirectory(ownerId)}${id}/`;
    const record = JSON.parse(await FileSystem.readAsStringAsync(`${directory}record.json`)) as OwnerTeachingSyncRecord;
    if (record.id !== id) throw new Error('Capture identity mismatch.');
    const feedback = buildOwnerTeachingFeedback(record, new Date().toISOString(), ownerId);
    return await syncOwnerTeachingCapture(record, {
      assertOwner: () => accessToken(ownerId),
      save: async (value) => {
        await accessToken(ownerId);
        await FileSystem.writeAsStringAsync(`${directory}record.json`, JSON.stringify(value, null, 2));
      },
      createFeedback: async () => {
        const response = await feedbackRequest(ownerId, '/items', {method:'POST',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({feedback})});
        return response.feedbackId;
      },
      uploadImage: async (feedbackId) => {
        const photo = await (await fetch(`${directory}card.jpg`)).blob();
        await feedbackRequest(ownerId, `/items/${feedbackId}/files/rectified-card`, {
          method:'PUT',headers:{'Content-Type':'image/jpeg'},body:photo,
        });
      },
    });
  } finally { captureOperations.delete(operationKey); }
}
