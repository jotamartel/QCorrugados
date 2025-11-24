/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        kraft: {
          50: '#faf8f5',
          100: '#f5f0e8',
          200: '#e8dcc8',
          300: '#d4c4a8',
          400: '#c4a97a',
          500: '#b89960',
          600: '#a88450',
          700: '#8c6b42',
          800: '#735839',
          900: '#5e4830',
        },
        cardboard: {
          light: '#d4a574',
          DEFAULT: '#b8860b',
          dark: '#8b6914',
        }
      },
      fontFamily: {
        industrial: ['JetBrains Mono', 'monospace'],
        display: ['Bebas Neue', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
