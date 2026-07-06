// ============================================================
// CenterGuides — خطّا تنصيف متقطّعان (منتصف الطول ومنتصف العرض)
// يظهران في وضع التعديل فوق أي لوحة رسم، للمحاذاة على المنتصف.
// ============================================================
export default function CenterGuides({ color = '#6366f1' }) {
  return (
    <div className="absolute inset-0 pointer-events-none z-[5]">
      <div className="absolute top-0 bottom-0" style={{ left: '50%', width: 0, borderLeft: `1.5px dashed ${color}`, opacity: 0.45 }} />
      <div className="absolute left-0 right-0" style={{ top: '50%', height: 0, borderTop: `1.5px dashed ${color}`, opacity: 0.45 }} />
    </div>
  );
}
