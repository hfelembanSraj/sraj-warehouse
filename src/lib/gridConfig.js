// ============================================================
// gridConfig.js — مساعدات الشبكة والقياسات (نِسب مئويّة ↔ أمتار)
// دوال خالصة بلا React. المستودع غير مربّع (width_m ≠ depth_m)،
// فالتباعد بالنِّسبة المئويّة يختلف بين المحورين X و Y.
// ============================================================

export const GRID_PRESETS = [
  { label: '0.5م', value: 0.5 },
  { label: '1م', value: 1 },
  { label: '2م', value: 2 },
  { label: '5م', value: 5 },
];

export function whWidthM(warehouse)  { return Number(warehouse?.width_m) || 4; }
export function whDepthM(warehouse)  { return Number(warehouse?.depth_m) || 4; }

// أمتار → نسبة مئويّة على المحور المطلوب
export function metersToPercentX(meters, warehouse) { return (meters / whWidthM(warehouse)) * 100; }
export function metersToPercentY(meters, warehouse) { return (meters / whDepthM(warehouse)) * 100; }

// نسبة مئويّة → أمتار
export function percentToMetersX(pct, warehouse) { return (pct / 100) * whWidthM(warehouse); }
export function percentToMetersY(pct, warehouse) { return (pct / 100) * whDepthM(warehouse); }

// التقاط قيمة نسبيّة لأقرب خانة شبكة. spacingPct falsy/0 = بلا التقاط.
export function snapValue(pct, spacingPct) {
  return (spacingPct && spacingPct > 0) ? Math.round(pct / spacingPct) * spacingPct : pct;
}

// تنسيق بُعد بالأمتار: ≥1م بالمتر، أقل بالسنتيمتر
export function formatDim(meters) {
  const m = Number(meters) || 0;
  return m >= 1 ? `${m.toFixed(1)}م` : `${Math.round(m * 100)}سم`;
}
