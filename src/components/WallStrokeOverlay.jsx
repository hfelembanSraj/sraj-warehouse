// ============================================================
// WallStrokeOverlay — يرسم جدارًا مفتوحًا (خطّ/منحنى) كخطّ مرسوم (stroke)
// داخل مربّع إحاطة العنصر. النقاط نسبيّة 0..100. الجدران المغلقة (دائرة/مستطيل)
// تبقى تستخدم clip-path المملوء — هذا للخطوط المفتوحة فقط.
// ============================================================
export default function WallStrokeOverlay({ points, color = '#9CA3AF', thickness = 3 }) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const d = `M ${points[0].x} ${points[0].y} ` +
    points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={thickness}
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
