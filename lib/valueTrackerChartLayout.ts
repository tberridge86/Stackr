export const VALUE_TRACKER_CHART_HEIGHT = 96;

const FALLBACK_HORIZONTAL_INSET = 48;
const CHART_HORIZONTAL_INSET = 20;

/**
 * Keep the chart inside its rendered card rather than sizing it from a
 * thumbnail breakpoint. The fallback only applies before the first layout
 * event, so there is no empty initial render.
 */
export function getValueTrackerChartWidth(panelWidth: number, screenWidth: number): number {
  const safeScreenWidth = Number.isFinite(screenWidth) ? screenWidth : 1;
  const usablePanelWidth = Number.isFinite(panelWidth) && panelWidth > 0
    ? panelWidth
    : Math.max(1, safeScreenWidth - FALLBACK_HORIZONTAL_INSET);

  return Math.max(1, usablePanelWidth - CHART_HORIZONTAL_INSET);
}
