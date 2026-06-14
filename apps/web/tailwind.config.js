/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        notion: {
          text:    '#37352f',
          bg:      '#ffffff',
          sidebar: '#f7f6f3',
          hover:   '#f1f0ef',
          border:  '#e9e9e7',
          muted:   '#9b9a97',
          accent:  '#1a73e8',
        },
      },
    },
  },
  plugins: [],
};
