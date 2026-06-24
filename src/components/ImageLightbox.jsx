import { useEffect, useState } from 'react';

// نافذة تكبير صورة — تُغلَق بالضغط على الخلفية، أو زرّ ✕، أو مفتاح Esc.
// caption: اسم الغرض/الصندوق يظهر أسفل الصورة كاملاً ليعرف المستخدم ما يشاهده.
// 🔄 تدوير للعرض فقط (لا يحفظ) — للتدوير الدائم استخدم نموذج تعديل الصورة.
export default function ImageLightbox({ url, alt = '', caption = '', onClose }) {
  const [rot, setRot] = useState(0);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // صفّر التدوير عند تغيّر الصورة
  useEffect(() => { setRot(0); }, [url]);

  if (!url) return null;

  const rotated = rot % 180 !== 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-lightbox"
      title="اضغط في أيّ مكان للإغلاق"
    >
      {/* شريط التحكّم العلوي — تدوير + إغلاق (لا يتداخل مع الصورة) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 inset-x-0 px-4 flex justify-end gap-2 z-10"
      >
        <button
          onClick={() => setRot(r => (r + 90) % 360)}
          title="تدوير العرض 90°"
          className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white text-lg leading-none flex items-center justify-center transition"
        >🔄</button>
        <button
          onClick={onClose}
          title="إغلاق (Esc)"
          className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white text-xl leading-none flex items-center justify-center transition"
        >✕</button>
      </div>

      {/* الصورة — تتمحور وتدور دون قصّ (نقايس الأبعاد حسب اتجاه التدوير) */}
      <img
        src={url}
        alt={alt || caption}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `rotate(${rot}deg)`,
          transition: 'transform 0.25s ease',
          maxWidth:  rotated ? '85vh' : '92vw',
          maxHeight: rotated ? '92vw' : '85vh'
        }}
        className="object-contain rounded-lg shadow-2xl"
      />

      {/* الاسم كاملاً بالأسفل (يلتفّ ولا يُقصّ) */}
      {caption && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-4 inset-x-0 px-4 flex justify-center"
        >
          <div className="max-w-[92vw] px-4 py-1.5 rounded-2xl bg-white/15 text-white text-sm font-bold text-center leading-snug break-words line-clamp-2">
            {caption}
          </div>
        </div>
      )}
    </div>
  );
}
