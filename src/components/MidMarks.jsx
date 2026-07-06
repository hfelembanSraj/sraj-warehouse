// ============================================================
// MidMarks — علامات المنتصف على شكل أثناء التعديل: شرطة صغيرة في
// منتصف كل حافّة (طولاً وعرضاً) + دائرة صغيرة في المركز، لمعرفة
// نقاط المنتصف عند الرسم والمحاذاة.
// ============================================================
export default function MidMarks({ color = '#3b82f6' }) {
  const base = 'absolute pointer-events-none z-10';
  return (
    <>
      <div className={base} style={{ top: 0, left: '50%', transform: 'translateX(-50%)', width: 2, height: 8, backgroundColor: color, opacity: 0.85 }} />
      <div className={base} style={{ bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 2, height: 8, backgroundColor: color, opacity: 0.85 }} />
      <div className={base} style={{ left: 0, top: '50%', transform: 'translateY(-50%)', width: 8, height: 2, backgroundColor: color, opacity: 0.85 }} />
      <div className={base} style={{ right: 0, top: '50%', transform: 'translateY(-50%)', width: 8, height: 2, backgroundColor: color, opacity: 0.85 }} />
      <div className={base} style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 6, height: 6, borderRadius: '50%', border: `1.5px solid ${color}`, opacity: 0.8 }} />
    </>
  );
}
