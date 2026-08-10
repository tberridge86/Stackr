import { Buffer } from 'buffer';
import { decode as decodeJpeg } from 'jpeg-js';
import type { CaptureRect, CaptureSize } from './captureGeometry';

export type BinderPageLayout = 1 | 2 | 3 | 4 | 5;

export type BinderPocketStatus =
  | 'confirmed'
  | 'possible_match'
  | 'empty'
  | 'glare_detected'
  | 'obscured'
  | 'duplicate_candidate'
  | 'rescan_required'
  | 'unresolved';

export type BinderPagePocketCell = {
  index: number;
  row: number;
  column: number;
  crop: CaptureRect;
};

export type BinderPocketQuality = {
  status: Exclude<BinderPocketStatus, 'confirmed' | 'possible_match' | 'duplicate_candidate' | 'unresolved'> | 'usable';
  score: number;
  brightness: number;
  contrast: number;
  edgeDensity: number;
  brightRatio: number;
  darkRatio: number;
  reason: string;
};

export type BinderPocketCandidate = {
  id: string;
  name: string;
  number?: string | null;
  set_id?: string | null;
  set_name?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  confidence?: number | null;
};

export type BinderPagePocketResult = {
  index: number;
  row: number;
  column: number;
  status: BinderPocketStatus;
  cropUri?: string | null;
  candidates: BinderPocketCandidate[];
  selectedCandidateIndex: number;
  quality: BinderPocketQuality | null;
  source: 'local' | 'remote' | 'manual' | 'quality' | 'none';
  notes: string[];
};

export const BINDER_PAGE_LAYOUTS: BinderPageLayout[] = [1, 2, 3, 4, 5];
export const BINDER_PAGE_LAYOUT_STORAGE_KEY = 'stackr:last-binder-page-layout';
export const DEFAULT_BINDER_PAGE_LAYOUT: BinderPageLayout = 3;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundRect(rect: CaptureRect): CaptureRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

export function normalizeBinderPageLayout(value: unknown): BinderPageLayout {
  const numeric = Math.round(Number(value));
  return BINDER_PAGE_LAYOUTS.includes(numeric as BinderPageLayout)
    ? numeric as BinderPageLayout
    : DEFAULT_BINDER_PAGE_LAYOUT;
}

export function createBinderPageGridCells(
  layout: BinderPageLayout,
  pageSize: CaptureSize,
  options: { marginRatio?: number; gapRatio?: number } = {}
): BinderPagePocketCell[] {
  const pageWidth = Math.max(1, Number(pageSize.width) || 1);
  const pageHeight = Math.max(1, Number(pageSize.height) || 1);
  const margin = Math.min(pageWidth, pageHeight) * clamp(options.marginRatio ?? 0.018, 0, 0.08);
  const gap = Math.min(pageWidth, pageHeight) * clamp(options.gapRatio ?? 0.012, 0, 0.06);
  const contentWidth = Math.max(1, pageWidth - margin * 2);
  const contentHeight = Math.max(1, pageHeight - margin * 2);
  const cellWidth = Math.max(1, (contentWidth - gap * (layout - 1)) / layout);
  const cellHeight = Math.max(1, (contentHeight - gap * (layout - 1)) / layout);
  const cells: BinderPagePocketCell[] = [];

  for (let row = 0; row < layout; row += 1) {
    for (let column = 0; column < layout; column += 1) {
      cells.push({
        index: row * layout + column,
        row,
        column,
        crop: roundRect({
          x: margin + column * (cellWidth + gap),
          y: margin + row * (cellHeight + gap),
          width: cellWidth,
          height: cellHeight,
        }),
      });
    }
  }

  return cells;
}

function stripBase64ImagePrefix(base64: string) {
  return String(base64 ?? '').trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function lumaAt(data: Uint8Array, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

export function assessBinderPocketImage(base64?: string | null): BinderPocketQuality {
  const cleanBase64 = stripBase64ImagePrefix(base64 ?? '');
  if (!cleanBase64) {
    return {
      status: 'rescan_required',
      score: 0,
      brightness: 0,
      contrast: 0,
      edgeDensity: 0,
      brightRatio: 0,
      darkRatio: 0,
      reason: 'missing-image',
    };
  }

  try {
    const image = decodeJpeg(Buffer.from(cleanBase64, 'base64'), { useTArray: true });
    const { width, height, data } = image;
    if (!width || !height || !data?.length) {
      throw new Error('unreadable');
    }

    const step = Math.max(1, Math.floor(Math.min(width, height) / 72));
    let count = 0;
    let sum = 0;
    let sumSq = 0;
    let edgePixels = 0;
    let brightPixels = 0;
    let darkPixels = 0;

    for (let y = step; y < height - step; y += step) {
      for (let x = step; x < width - step; x += step) {
        const luma = lumaAt(data, width, x, y);
        const right = lumaAt(data, width, x + step, y);
        const down = lumaAt(data, width, x, y + step);
        const gradient = Math.abs(luma - right) + Math.abs(luma - down);
        count += 1;
        sum += luma;
        sumSq += luma * luma;
        if (gradient > 44) edgePixels += 1;
        if (luma > 236) brightPixels += 1;
        if (luma < 34) darkPixels += 1;
      }
    }

    const brightness = count ? sum / count : 0;
    const variance = count ? Math.max(0, sumSq / count - brightness * brightness) : 0;
    const contrast = Math.sqrt(variance);
    const edgeDensity = count ? edgePixels / count : 0;
    const brightRatio = count ? brightPixels / count : 0;
    const darkRatio = count ? darkPixels / count : 0;
    const detailScore = clamp(edgeDensity / 0.08, 0, 1);
    const contrastScore = clamp(contrast / 42, 0, 1);
    const glarePenalty = brightRatio > 0.16 ? 0.24 : 0;
    const darknessPenalty = darkRatio > 0.28 ? 0.2 : 0;
    const score = clamp(detailScore * 0.56 + contrastScore * 0.44 - glarePenalty - darknessPenalty, 0, 1);

    if (contrast < 10 && edgeDensity < 0.022 && brightRatio < 0.18 && darkRatio < 0.22) {
      return { status: 'empty', score, brightness, contrast, edgeDensity, brightRatio, darkRatio, reason: 'low-detail-empty-pocket' };
    }

    if (brightRatio > 0.28 || (brightness > 226 && contrast < 32)) {
      return { status: 'glare_detected', score, brightness, contrast, edgeDensity, brightRatio, darkRatio, reason: 'large-bright-reflection' };
    }

    if (darkRatio > 0.48) {
      return { status: 'obscured', score, brightness, contrast, edgeDensity, brightRatio, darkRatio, reason: 'mostly-dark-or-covered' };
    }

    if (score < 0.26 || edgeDensity < 0.024) {
      return { status: 'rescan_required', score, brightness, contrast, edgeDensity, brightRatio, darkRatio, reason: 'not-enough-readable-detail' };
    }

    return { status: 'usable', score, brightness, contrast, edgeDensity, brightRatio, darkRatio, reason: 'usable' };
  } catch {
    return {
      status: 'rescan_required',
      score: 0,
      brightness: 0,
      contrast: 0,
      edgeDensity: 0,
      brightRatio: 0,
      darkRatio: 0,
      reason: 'decode-failed',
    };
  }
}

export function getBinderPocketStatusFromCandidates(
  quality: BinderPocketQuality | null,
  candidates: BinderPocketCandidate[]
): BinderPocketStatus {
  if (quality && quality.status !== 'usable') return quality.status;
  const best = candidates[0];
  const confidence = Number(best?.confidence ?? 0);
  if (!best) return 'unresolved';
  if (confidence >= 82) return 'confirmed';
  return 'possible_match';
}

export function markDuplicatePocketCandidates<T extends BinderPagePocketResult>(pockets: T[]): T[] {
  const seen = new Map<string, number>();

  return pockets.map((pocket) => {
    const candidate = pocket.candidates[pocket.selectedCandidateIndex] ?? pocket.candidates[0];
    const key = candidate?.id && candidate?.set_id ? `${candidate.set_id}:${candidate.id}` : null;
    if (!key || (pocket.status !== 'confirmed' && pocket.status !== 'possible_match')) return pocket;

    const previous = seen.get(key) ?? 0;
    seen.set(key, previous + 1);
    if (previous === 0) return pocket;

    return {
      ...pocket,
      status: 'duplicate_candidate' as const,
      notes: [...pocket.notes, 'same-card-already-seen-on-page'],
    };
  });
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, items.length || 1));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }));

  return results;
}
