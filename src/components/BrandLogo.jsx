// شعار الجمعيّة — مثلّثات هندسيّة بألوان الشعار السبعة
// مُستوحى من شعار "جمعيّة المسؤوليّة الاجتماعيّة بمحافظة جدّة"

export default function BrandLogo({ size = 40, className = '' }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      {/* مثلّثات متداخلة بألوان الشعار */}
      {/* الخلفيّة الفيروزيّة */}
      <polygon points="50,80 18,80 34,55" fill="#00A8B5" />
      {/* البنفسجي */}
      <polygon points="50,15 30,55 50,55" fill="#7B2D8E" />
      {/* الزهري */}
      <polygon points="50,15 70,55 50,55" fill="#E91E8B" />
      {/* الأخضر */}
      <polygon points="50,80 82,80 66,55" fill="#6CB33E" />
      {/* الأصفر */}
      <polygon points="50,55 30,55 40,75" fill="#FFCC00" />
      {/* البرتقالي */}
      <polygon points="50,55 70,55 60,75" fill="#F58220" />
      {/* الأزرق الفاتح في الأسفل */}
      <polygon points="40,75 60,75 50,90" fill="#2196F3" />
    </svg>
  );
}

// شريط الألوان السبعة — يُستخدم في رؤوس الصفحات وحوافّ المكوّنات
export function BrandStripe({ height = 4, className = '', animated = false }) {
  return (
    <div
      className={`bg-brand-stripe ${animated ? 'animate-brand-shimmer' : ''} ${className}`}
      style={{ height: `${height}px` }}
    />
  );
}

// أيقونة "س" مع تدرّج لوني — بديل عن النصّ المسطّح
export function BrandLetterBadge({ size = 36, className = '' }) {
  return (
    <div
      className={`relative rounded-xl flex items-center justify-center font-display font-bold text-white shadow-lg overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.48,
        background: 'linear-gradient(135deg, #1A2B5F 0%, #7B2D8E 50%, #E91E8B 100%)'
      }}
    >
      <span className="relative z-10 drop-shadow-sm">س</span>
      {/* لمعة في الزاوية */}
      <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-white/20 rounded-br-full pointer-events-none" />
    </div>
  );
}
