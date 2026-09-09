export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        maroon: { 50:'#FBF0F1',100:'#F2D9DC',200:'#E2AEB4',300:'#C97883',400:'#A8434F',500:'#7F1D2B',600:'#6B1220',700:'#57101B',800:'#3D0B14',900:'#28080D' },
        gold: { 50:'#FBF6F1',100:'#F5E9DE',200:'#EAD2BE',300:'#DAB48F',400:'#C89563',500:'#B4813F',600:'#8F6530',700:'#6B4B24' },
        chalk: '#FFFFFF',
      },
      fontFamily: { display: ['"Playfair Display"','serif'], sans: ['"Outfit"','system-ui','sans-serif'], mono: ['"IBM Plex Mono"','monospace'] },
      boxShadow: { card: '0 1px 2px rgba(61,11,20,0.06), 0 8px 28px rgba(61,11,20,0.10)' },
    },
  },
  plugins: [],
}
