export const STACKR_FLOW_LAYOUT_VERSION = '1.0.0';

export const STACKR_FLOW_LAYOUT_TOKENS = Object.freeze({
  maxContentWidth: 760,
  phonePadding: 16,
  compactPhonePadding: 12,
  minimumTouchTarget: stackrControlTokens.minTapTarget,
  logoWidth: 96,
  logoHeight: 28,
  progressHeight: 8,
  progressRadius: 999,
  cardRadius: 18,
  sectionGap: 12,
});

export type StackrFlowProgressInput = {
  label: string;
  value?: number | null;
  current?: number | null;
  total?: number | null;
  authoritativeComplete?: boolean;
  indeterminate?: boolean;
  statusText?: string;
};

export type StackrFlowProgressModel = {
  mode: 'determinate' | 'indeterminate';
  value: number | null;
  percent: number | null;
  accessibilityText: string;
};

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function resolveStackrFlowProgress(input: StackrFlowProgressInput): StackrFlowProgressModel {
  if (input.indeterminate) {
    return {
      mode: 'indeterminate',
      value: null,
      percent: null,
      accessibilityText: `${input.label}. ${input.statusText || 'Progress is being calculated.'}`,
    };
  }

  const ratioFromCounts = finiteNumber(input.current)
    && finiteNumber(input.total)
    && input.total > 0
      ? input.current / input.total
      : null;
  const rawValue = finiteNumber(input.value) ? input.value : ratioFromCounts;
  const boundedValue = Math.max(0, Math.min(1, rawValue ?? 0));
  const honestValue = boundedValue >= 1 && !input.authoritativeComplete ? 0.99 : boundedValue;
  const percent = Math.round(honestValue * 100);
  const status = input.statusText ? ` ${input.statusText}.` : '';

  return {
    mode: 'determinate',
    value: honestValue,
    percent,
    accessibilityText: `${input.label}. ${percent}% complete.${status}`,
  };
}

export function getStackrFlowLayoutMetrics(width: number) {
  const safeWidth = finiteNumber(width) ? Math.max(0, width) : 0;
  const horizontalPadding = safeWidth < 360
    ? STACKR_FLOW_LAYOUT_TOKENS.compactPhonePadding
    : STACKR_FLOW_LAYOUT_TOKENS.phonePadding;

  return {
    horizontalPadding,
    contentWidth: Math.max(0, Math.min(
      STACKR_FLOW_LAYOUT_TOKENS.maxContentWidth,
      safeWidth - horizontalPadding * 2,
    )),
    stackHeaderActions: safeWidth < 360,
    minimumTouchTarget: STACKR_FLOW_LAYOUT_TOKENS.minimumTouchTarget,
  };
}
import { stackrControlTokens } from './stackrSizing';
