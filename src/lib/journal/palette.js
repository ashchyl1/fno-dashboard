// Chart color roles for the journal, tuned for the app's dark surface.
// P&L polarity uses the reserved status greens/reds; series colors follow
// the categorical order (blue, aqua, yellow, violet, ...) and are never
// reassigned when filters change.
export const PALETTE = {
  win: '#0ca30c',
  winSoft: 'rgba(12, 163, 12, 0.25)',
  loss: '#e66767',
  lossCritical: '#d03b3b',
  lossSoft: 'rgba(230, 103, 103, 0.25)',
  series1: '#3987e5', // blue — primary metric lines
  series2: '#199e70', // aqua — secondary comparisons
  series3: '#c98500', // yellow — highlights (MFE)
  series4: '#9085e9', // violet — hypothetical / what-if
  neutral: '#383835',
  grid: '#2c2c2a',
  axis: '#898781',
  ink: '#e7e9ee',
  inkSecondary: '#c3c2b7',
  inkMuted: '#898781',
};

// Diverging ramp for daily P&L calendar: loss red → neutral → win green.
// 4 steps per arm around a neutral midpoint.
export const PNL_DIVERGING = {
  loss: ['#f1b8b8', '#e66767', '#d03b3b', '#9c2626'],
  neutral: '#30302e',
  win: ['#b7e3b7', '#4fbf4f', '#0ca30c', '#006300'],
};

export function pnlColor(value, maxAbs) {
  if (!value) return PNL_DIVERGING.neutral;
  const arm = value > 0 ? PNL_DIVERGING.win : PNL_DIVERGING.loss;
  const t = Math.min(Math.abs(value) / (maxAbs || 1), 1);
  const idx = Math.min(Math.floor(t * arm.length), arm.length - 1);
  return arm[idx];
}
