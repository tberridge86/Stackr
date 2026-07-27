import { Buffer } from 'buffer';
import { decode as decodeJpeg } from 'jpeg-js';

export type CardCenteringConfidence = 'low' | 'moderate';

export type CardCenteringAssessment = {
  available: boolean;
  label: 'Well centred' | 'Slightly off-centre' | 'Noticeably off-centre' | 'Unable to assess';
  summary: string;
  confidence: CardCenteringConfidence;
  disclaimer: string;
  ratios: {
    left: number | null;
    right: number | null;
    top: number | null;
    bottom: number | null;
    horizontalBalance: number | null;
    verticalBalance: number | null;
    score: number | null;
  };
  measurements: {
    leftMarginPx: number | null;
    rightMarginPx: number | null;
    topMarginPx: number | null;
    bottomMarginPx: number | null;
    width: number | null;
    height: number | null;
  };
  warnings: string[];
  method: 'local-border-balance-v1';
};

type DecodedImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

const DISCLAIMER = 'Visual centering guidance only. This is not a professional grade, valuation, authentication result or condition guarantee.';

function stripBase64ImagePrefix(base64: string) {
  return String(base64 ?? '').trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, precision = 1) {
  return Number(value.toFixed(precision));
}

function unavailable(summary: string, warnings: string[] = []): CardCenteringAssessment {
  return {
    available: false,
    label: 'Unable to assess',
    summary,
    confidence: 'low',
    disclaimer: DISCLAIMER,
    ratios: {
      left: null,
      right: null,
      top: null,
      bottom: null,
      horizontalBalance: null,
      verticalBalance: null,
      score: null,
    },
    measurements: {
      leftMarginPx: null,
      rightMarginPx: null,
      topMarginPx: null,
      bottomMarginPx: null,
      width: null,
      height: null,
    },
    warnings,
    method: 'local-border-balance-v1',
  };
}

function decodeBase64Jpeg(base64?: string | null): DecodedImage | null {
  const cleanBase64 = stripBase64ImagePrefix(base64 ?? '');
  if (!cleanBase64) return null;
  try {
    const decoded = decodeJpeg(Buffer.from(cleanBase64, 'base64'), { useTArray: true });
    if (!decoded.width || !decoded.height || !decoded.data?.length) return null;
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
    };
  } catch {
    return null;
  }
}

function lumaAt(image: DecodedImage, x: number, y: number) {
  const clampedX = clamp(Math.round(x), 0, image.width - 1);
  const clampedY = clamp(Math.round(y), 0, image.height - 1);
  const index = (clampedY * image.width + clampedX) * 4;
  return image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return sorted[index];
}

function smooth(values: number[], radius = 3) {
  return values.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let cursor = Math.max(0, index - radius); cursor <= Math.min(values.length - 1, index + radius); cursor += 1) {
      total += values[cursor];
      count += 1;
    }
    return count ? total / count : 0;
  });
}

function verticalEdgeProfile(image: DecodedImage) {
  const values: number[] = [];
  const yStart = Math.round(image.height * 0.12);
  const yEnd = Math.round(image.height * 0.88);
  const step = Math.max(1, Math.round(image.height / 160));

  for (let x = 1; x < image.width - 1; x += 1) {
    let total = 0;
    let count = 0;
    for (let y = yStart; y <= yEnd; y += step) {
      total += Math.abs(lumaAt(image, x + 1, y) - lumaAt(image, x - 1, y));
      count += 1;
    }
    values.push(count ? total / count : 0);
  }
  return smooth(values);
}

function horizontalEdgeProfile(image: DecodedImage) {
  const values: number[] = [];
  const xStart = Math.round(image.width * 0.12);
  const xEnd = Math.round(image.width * 0.88);
  const step = Math.max(1, Math.round(image.width / 160));

  for (let y = 1; y < image.height - 1; y += 1) {
    let total = 0;
    let count = 0;
    for (let x = xStart; x <= xEnd; x += step) {
      total += Math.abs(lumaAt(image, x, y + 1) - lumaAt(image, x, y - 1));
      count += 1;
    }
    values.push(count ? total / count : 0);
  }
  return smooth(values);
}

function findStrongestEdge(profile: number[], startRatio: number, endRatio: number) {
  const start = Math.max(0, Math.floor(profile.length * startRatio));
  const end = Math.min(profile.length - 1, Math.ceil(profile.length * endRatio));
  let bestIndex = start;
  let bestScore = -Infinity;

  for (let index = start; index <= end; index += 1) {
    const score = profile[index] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return {
    index: bestIndex + 1,
    score: bestScore,
    floor: percentile(profile.slice(start, end + 1), 0.55),
    strong: bestScore >= Math.max(8, percentile(profile.slice(start, end + 1), 0.82)),
  };
}

function balanceRatio(first: number, second: number) {
  const total = first + second;
  if (total <= 0) return null;
  return Math.max(first, second) / total;
}

function sidePercent(first: number, second: number) {
  const total = first + second;
  if (total <= 0) return null;
  return round((first / total) * 100);
}

function scoreFromBalances(horizontal: number, vertical: number) {
  const worst = Math.max(horizontal, vertical);
  if (worst <= 0.53) return 96;
  if (worst <= 0.56) return 90;
  if (worst <= 0.6) return 82;
  if (worst <= 0.65) return 70;
  return 58;
}

function labelFromScore(score: number): CardCenteringAssessment['label'] {
  if (score >= 90) return 'Well centred';
  if (score >= 74) return 'Slightly off-centre';
  return 'Noticeably off-centre';
}

export function assessCardCenteringFromJpeg(base64?: string | null): CardCenteringAssessment {
  const image = decodeBase64Jpeg(base64);
  if (!image) {
    return unavailable('No readable front image was available for visible centering guidance.', ['missing-or-unreadable-image']);
  }

  if (image.width < 160 || image.height < 220) {
    return unavailable('Front image is too small for visible centering guidance.', ['image-too-small']);
  }

  const vertical = verticalEdgeProfile(image);
  const horizontal = horizontalEdgeProfile(image);
  const left = findStrongestEdge(vertical, 0.04, 0.38);
  const right = findStrongestEdge(vertical, 0.62, 0.96);
  const top = findStrongestEdge(horizontal, 0.04, 0.38);
  const bottom = findStrongestEdge(horizontal, 0.62, 0.96);
  const warnings: string[] = [];

  if (!left.strong || !right.strong || !top.strong || !bottom.strong) {
    warnings.push('border-edges-low-confidence');
  }

  if (right.index <= left.index || bottom.index <= top.index) {
    return unavailable('Visible card borders could not be separated reliably.', ['border-geometry-failed']);
  }

  const leftMarginPx = Math.max(0, left.index);
  const rightMarginPx = Math.max(0, image.width - right.index);
  const topMarginPx = Math.max(0, top.index);
  const bottomMarginPx = Math.max(0, image.height - bottom.index);
  const horizontalBalance = balanceRatio(leftMarginPx, rightMarginPx);
  const verticalBalance = balanceRatio(topMarginPx, bottomMarginPx);

  if (horizontalBalance == null || verticalBalance == null) {
    return unavailable('Visible card border balance could not be calculated.', ['border-balance-failed']);
  }

  const score = scoreFromBalances(horizontalBalance, verticalBalance);
  const label = labelFromScore(score);
  const leftPct = sidePercent(leftMarginPx, rightMarginPx);
  const rightPct = sidePercent(rightMarginPx, leftMarginPx);
  const topPct = sidePercent(topMarginPx, bottomMarginPx);
  const bottomPct = sidePercent(bottomMarginPx, topMarginPx);
  const confidence: CardCenteringConfidence = warnings.length ? 'low' : 'moderate';
  const summary = `${label}: approx. left/right ${leftPct ?? '--'}/${rightPct ?? '--'} and top/bottom ${topPct ?? '--'}/${bottomPct ?? '--'} from the supplied front image.`;

  return {
    available: true,
    label,
    summary,
    confidence,
    disclaimer: DISCLAIMER,
    ratios: {
      left: leftPct,
      right: rightPct,
      top: topPct,
      bottom: bottomPct,
      horizontalBalance: round(horizontalBalance * 100),
      verticalBalance: round(verticalBalance * 100),
      score,
    },
    measurements: {
      leftMarginPx,
      rightMarginPx,
      topMarginPx,
      bottomMarginPx,
      width: image.width,
      height: image.height,
    },
    warnings,
    method: 'local-border-balance-v1',
  };
}

export function formatCardCenteringAssessment(assessment?: CardCenteringAssessment | null) {
  if (!assessment) return 'Visible centering guidance not run.';
  if (!assessment.available) return `${assessment.summary} ${assessment.disclaimer}`;
  return `${assessment.summary} Confidence: ${assessment.confidence}. ${assessment.disclaimer}`;
}
