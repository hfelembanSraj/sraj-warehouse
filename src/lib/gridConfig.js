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

// لصق قيمة بأقرب حافّة من قائمة حواف (جيران) ضمن سماحية — null = لا لصق
export function stickEdge(v, edges, tol = 1.0) {
  let best = null, bd = tol;
  for (const e of edges || []) {
    const d = Math.abs(e - v);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// لصق مستطيل متحرّك على محور واحد: تُفحص حافّتاه (بداية/نهاية) معاً
// ويفوز الأقرب. يعيد الموضع الجديد للبداية (أو الموضع الأصلي بلا تغيير).
export function stickAxis(start, size, edges, tol = 1.0) {
  const a = stickEdge(start, edges, tol);
  const b = stickEdge(start + size, edges, tol);
  if (a != null && (b == null || Math.abs(a - start) <= Math.abs(b - (start + size)))) return a;
  if (b != null) return b - size;
  return start;
}

// تنسيق بُعد بالأمتار: ≥1م بالمتر، أقل بالسنتيمتر
export function formatDim(meters) {
  const m = Number(meters) || 0;
  return m >= 1 ? `${m.toFixed(1)}م` : `${Math.round(m * 100)}سم`;
}
