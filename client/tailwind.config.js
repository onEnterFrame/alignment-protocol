/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'terminal': {
          'bg': '#0a0a0f',
          'darker': '#050508',
          'border': '#1a1a2f',
          'text': '#00ff00',
          'dim': '#006600',
          'amber': '#ffaa00',
          'red': '#ff3333',
          'blue': '#3399ff'
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
