/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        notion: {
          bg: '#ffffff',
          sidebar: '#f7f7f5',
          text: '#37352f',
          muted: '#9b9a97',
          border: '#e9e9e7',
          hover: '#ebebea',
          accent: '#2383e2',
        },
      },
    },
  },
  plugins: [],
};
