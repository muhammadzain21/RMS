/******** Tailwind Config ********/
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e8eef6',
          100: '#d5e0ee',
          200: '#b3c5dd',
          300: '#849ebf',
          400: '#4f6f99',
          500: '#0f2d5c',
          600: '#0c2449',
          700: '#0a1e3c',
          800: '#07162c',
          900: '#050f1f'
        }
      }
    }
  },
  plugins: []
}
