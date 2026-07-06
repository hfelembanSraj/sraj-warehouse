// ============================================================
// mapDraw.js — هندسة الرسم على خريطة المستودع (دوال خالصة بلا React)
// كل الإحداثيات نِسب مئويّة 0..100 على أرضيّة المستودع، والمستودع غير
// مربّع (width_m ≠ depth_m) فالحسابات الزاويّة/الطوليّة تمرّ بالأمتار.
// ============================================================
import { whWidthM, whDepthM } from './gridConfig';

// المستطيل الطبيعي للمساحة (من قاعدة البيانات) كنسب مئويّة
export function naturalZoneRect(zone) {
  const left = zone.pos_left ?? (100 - (zone.pos_right ?? 0) - (zone.pos_width ?? 18));
  return {
    left,
    top:    zone.pos_top    ?? 0,
    width:  zone.pos_width  ?? 18,
    height: zone.pos_height ?? 42
  };
}

// إحداثيات مؤشّر → نسب مئويّة على صندوق الحشو (padding box) للحاوية
export function pctFromClient(el, clientX, clientY) {
  if (!el) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  const left = r.left + el.clientLeft;
  const top  = r.top  + el.clientTop;
  const w = el.clientWidth  || r.width;
  const h = el.clientHeight || r.height;
  return {
    x: Math.max(0, Math.min(100, ((clientX - left) / w) * 100)),
    y: Math.max(0, Math.min(100, ((clientY - top) / h) * 100))
  };
}

// مضلّع مطلق (على الأرضيّة) → هندسة مساحة: مربّع إحاطة + نقاط نسبيّة
// (0..100 داخل المربّع). open=true يعلّم النقطة الأولى (جدار/خطّ مفتوح).
export function geometryFromAbsPoints(pts, { open = false } = {}) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const truW = Math.max(...xs) - minX, truH = Math.max(...ys) - minY;
  const rel = pts.map((p, i) => ({
    x: Math.round((truW > 0.01 ? (p.x - minX) / truW : 0) * 1000) / 10,
    y: Math.round((truH > 0.01 ? (p.y - minY) / truH : 0) * 1000) / 10,
    ...(open && i === 0 ? { open: true } : {})
  }));
  return { top: minY, left: minX, width: Math.max(1.5, truW), height: Math.max(1.5, truH), points: rel };
}

// نقاط المساحة المطلقة على الأرضيّة من هندستها المخزّنة.
// مساحة بلا نقاط (مستطيل) → زواياها الأربع.
export function absPointsOfZone(rect, points) {
  if (Array.isArray(points) && points.length >= 2) {
    return points.map(p => ({
      x: rect.left + (p.x / 100) * rect.width,
      y: rect.top  + (p.y / 100) * rect.height
    }));
  }
  return [
    { x: rect.left,              y: rect.top },
    { x: rect.left + rect.width, y: rect.top },
    { x: rect.left + rect.width, y: rect.top + rect.height },
    { x: rect.left,              y: rect.top + rect.height }
  ];
}

// مساحة مضلّع (shoelace) بالنِّسب — لرفض الخطوط شبه المستقيمة
export function polygonArea(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

// طول ضلع بالأمتار (يراعي اختلاف مقياس المحورين)
export function segmentMeters(a, b, warehouse) {
  const dx = ((b.x - a.x) / 100) * whWidthM(warehouse);
  const dy = ((b.y - a.y) / 100) * whDepthM(warehouse);
  return Math.hypot(dx, dy);
}

// تقييد الزاوية لأقرب مضاعف 45° نسبةً لنقطة المرساة — يُحسب بالأمتار
// (في فضاء النسب تنحرف الزوايا حين يكون المستودع غير مربّع).
// يعيد { point, axis } حيث axis: 'h' أفقي | 'v' رأسي | 'd' قطري
export function orthoSnap(anchor, cur, warehouse) {
  const wm = whWidthM(warehouse), dm = whDepthM(warehouse);
  const dx = ((cur.x - anchor.x) / 100) * wm;
  const dy = ((cur.y - anchor.y) / 100) * dm;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { point: cur, axis: null };
  const snapped = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const ndx = Math.cos(snapped) * len, ndy = Math.sin(snapped) * len;
  const axis = Math.abs(ndy) < 1e-9 ? 'h' : Math.abs(ndx) < 1e-9 ? 'v' : 'd';
  return {
    point: { x: anchor.x + (ndx / wm) * 100, y: anchor.y + (ndy / dm) * 100 },
    axis
  };
}

// التقاط لأقرب رأس من رؤوس الأشكال القائمة (سماحية بالنسب لكل محور)
export function snapToTargets(p, targets, tolX = 1.6, tolY = 1.6) {
  let best = null, bestD = Infinity;
  for (const t of targets || []) {
    const d = Math.max(Math.abs(t.x - p.x) / tolX, Math.abs(t.y - p.y) / tolY);
    if (d <= 1 && d < bestD) { best = t; bestD = d; }
  }
  return best;
}

// أقرب نقطة على أضلاع الأشكال القائمة (إسقاط عمودي محسوب بالأمتار) —
// «لصق جدار بجدار»: يلتقط لأي موضع على طول الجدار لا لرؤوسه فقط
export function snapToSegments(p, segments, warehouse, tolM = 0.18) {
  const wm = whWidthM(warehouse), dm = whDepthM(warehouse);
  const px = (p.x / 100) * wm, py = (p.y / 100) * dm;
  let best = null, bestD = tolM;
  for (const s of segments || []) {
    const ax = (s.a.x / 100) * wm, ay = (s.a.y / 100) * dm;
    const bx = (s.b.x / 100) * wm, by = (s.b.y / 100) * dm;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const qx = ax + t * dx, qy = ay + t * dy;
    const d = Math.hypot(px - qx, py - qy);
    if (d < bestD) { bestD = d; best = { x: (qx / wm) * 100, y: (qy / dm) * 100 }; }
  }
  return best;
}

// قرب نقطتين (سماحية موحّدة بالنسب)
export function nearPoint(a, b, tol = 1.2) {
  return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;
}

// منتصف ضلع
export function midPoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
