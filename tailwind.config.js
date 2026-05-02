/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'sans-serif'],
        display: ['Cairo', 'sans-serif']
      },
      colors: {
        // ألوان جمعيّة المسؤوليّة الاجتماعيّة بمحافظة جدّة (مستخرجة من الشعار)
        brand: {
          navy:   '#1A2B5F',  // الأزرق الكحلي — لون النصّ في الشعار (الأساسيّ)
          pink:   '#E91E8B',  // الزهري الفاقع
          purple: '#7B2D8E',  // البنفسجي
          orange: '#F58220',  // البرتقالي
          yellow: '#FFCC00',  // الأصفر
          green:  '#6CB33E',  // الأخضر
          cyan:   '#00A8B5',  // التركوازي
          blue:   '#185FA5',  // الأزرق التقليدي (للحفاظ على المراجع القديمة)
          cream:  '#FAEEDA'
        }
      },
      backgroundImage: {
        // شريط ألوان الجمعيّة السبعة — للاستخدام كزخرفة
        'brand-stripe': 'linear-gradient(90deg, #E91E8B 0%, #7B2D8E 16.6%, #2196F3 33.3%, #00A8B5 50%, #6CB33E 66.6%, #FFCC00 83.3%, #F58220 100%)',
        'brand-stripe-soft': 'linear-gradient(90deg, #E91E8B22 0%, #7B2D8E22 16.6%, #2196F322 33.3%, #00A8B522 50%, #6CB33E22 66.6%, #FFCC0022 83.3%, #F5822022 100%)'
      }
    }
  },
  plugins: []
};
