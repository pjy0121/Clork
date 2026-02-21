/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
      },
      fontSize: {
        xs:   ['12px', { lineHeight: '17px' }],
        sm:   ['13px', { lineHeight: '19px' }],
        base: ['15px', { lineHeight: '23px' }],
        md:   ['15px', { lineHeight: '23px' }],
        lg:   ['17px', { lineHeight: '25px' }],
        xl:   ['19px', { lineHeight: '27px' }],
        '2xl':['22px', { lineHeight: '30px' }],
        '3xl':['27px', { lineHeight: '35px' }],
      },
      boxShadow: {
        'soft': '0 1px 4px 0 rgba(0,0,0,0.06), 0 4px 12px 0 rgba(0,0,0,0.06)',
        'soft-md': '0 2px 8px 0 rgba(0,0,0,0.08), 0 8px 24px 0 rgba(0,0,0,0.06)',
      },
      animation: {
        'pulse-slow':    'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in':      'slideIn 0.2s ease-out',
        'fade-in':       'fadeIn 0.18s ease-out',
        'slide-in-right':'slideInRight 0.25s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0', transform: 'scale(0.97) translateY(4px)' },
          '100%': { opacity: '1', transform: 'scale(1)   translateY(0)'    },
        },
        slideInRight: {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
