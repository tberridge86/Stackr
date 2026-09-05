import * as FileSystem from 'expo-file-system/legacy';
import { PRICE_API_URL } from './config';
import { supabase } from './supabase';
import {
  createOwnerCaptureRecord, ownerCaptureDirectory, parseOwnerRecognitionResult,
  type OwnerRecognitionResult,
} from './ownerRecognitionCore';

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
  await accessToken(ownerId);
  return ownerCaptureDirectory(FileSystem.documentDirectory, ownerId);
}

export async function listOwnerCaptures(ownerId: string) {
  const directory = await verifiedLocalDirectory(ownerId);
  if (!(await FileSystem.getInfoAsync(directory)).exists) return [];
  const entries = (await FileSystem.readDirectoryAsync(directory)).filter((id) => /^[a-z0-9-]+$/.test(id));
  const records: { id: string; physicalCardId: string; reviewStatus: string }[] = [];
  for (const id of entries) {
    try {
      const record = JSON.parse(await FileSystem.readAsStringAsync(`${directory}${id}/record.json`));
      records.push({ id, physicalCardId: String(record.physicalCardId), reviewStatus: String(record.reviewStatus) });
    } catch { /* Interrupted saves are not treated as complete dataset records. */ }
  }
  await accessToken(ownerId);
  return records.reverse();
}

export async function saveOwnerCapture(input: {
  ownerId: string; imageUri: string; physicalCardId: string;
  result: OwnerRecognitionResult; selectedVariantId: string | null;
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
  const directory = await verifiedLocalDirectory(ownerId);
  await FileSystem.deleteAsync(`${directory}${id}/`, { idempotent: true });
}
