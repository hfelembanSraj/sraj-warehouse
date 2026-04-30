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
        brand: {
          blue: '#185FA5',
          orange: '#D85A30',
          cream: '#FAEEDA'
        }
      }
    }
  },
  plugins: []
};
