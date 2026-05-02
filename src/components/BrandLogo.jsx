// شعار الجمعيّة — يستخدم الصورة الرسميّة من /logo.png
// إن لم تتوفّر الصورة، يستخدم بديلاً SVG هندسيّاً مُستوحى من الشعار

import { useState } from 'react';

export default function BrandLogo({ size = 40, className = '' }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!imgFailed) {
    return (
      <img
        src="/logo.png"
        alt="جمعيّة المسؤوليّة الاجتماعيّة بمحافظة جدّة"
        width={size}
        height={size}
        className={`object-contain ${className}`}
        onError={() => setImgFailed(true)}
        draggable={false}
      />
    );
  }

  // البديل الهندسي إن لم يجد الصورة
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <polygon points="50,80 18,80 34,55" fill="#00A8B5" />
      <polygon points="50,15 30,55 50,55" fill="#7B2D8E" />
      <polygon points="50,15 70,55 50,55" fill="#E91E8B" />
      <polygon points="50,80 82,80 66,55" fill="#6CB33E" />
      <polygon points="50,55 30,55 40,75" fill="#FFCC00" />
      <polygon points="50,55 70,55 60,75" fill="#F58220" />
      <polygon points="40,75 60,75 50,90" fill="#2196F3" />
    </svg>
  );
}

// شريط الألوان السبعة — يُستخدم في رؤوس الصفحات
export function BrandStripe({ height = 4, className = '', animated = false }) {
  return (
    <div
      className={`bg-brand-stripe ${animated ? 'animate-brand-shimmer' : ''} ${className}`}
      style={{ height: `${height}px` }}
    />
  );
}

// شارة "س" بتدرّج لوني (لمواقع لا تحتاج الشعار الكامل)
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
      <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-white/20 rounded-br-full pointer-events-none" />
    </div>
  );
}
