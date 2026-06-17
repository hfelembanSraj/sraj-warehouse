import { useEffect } from 'react';

// نافذة تكبير صورة — تُغلَق بالضغط على الخلفية، أو زرّ ✕، أو مفتاح Esc.
// caption: اسم الغرض/الصندوق يظهر فوق الصورة ليعرف المستخدم ما يشاهده.
export default function ImageLightbox({ url, alt = '', caption = '', onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!url) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fade-in"
      title="اضغط في أيّ مكان للإغلاق"
    >
      <button
        onClick={onClose}
        title="إغلاق (Esc)"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white text-xl leading-none flex items-center justify-center transition z-10"
      >✕</button>

      {caption && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mb-3 max-w-[90vw] px-4 py-1.5 rounded-full bg-white/15 text-white text-sm font-bold text-center truncate"
        >
          {caption}
        </div>
      )}

      <img
        src={url}
        alt={alt || caption}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] max-w-[92vw] object-contain rounded-lg shadow-2xl"
      />
    </div>
  );
}
