import { useEffect } from 'react';

// نافذة تكبير صورة — تُغلَق بالضغط على الخلفية، أو زرّ ✕، أو مفتاح Esc.
// تُستخدم لعرض صور الأصناف والصناديق بحجم كبير داخل الموقع (بدل فتح تبويب جديد).
export default function ImageLightbox({ url, alt = '', onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!url) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      title="اضغط في أيّ مكان للإغلاق"
    >
      <button
        onClick={onClose}
        title="إغلاق (Esc)"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white text-xl leading-none flex items-center justify-center transition z-10"
      >✕</button>
      <img
        src={url}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] max-w-[92vw] object-contain rounded-lg shadow-2xl"
      />
    </div>
  );
}
