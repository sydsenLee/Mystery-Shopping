/** @type {import('tailwindcss').Config} */
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        surface: c('surface'),
        surface2: c('surface-2'),
        line: c('line'),
        ink: c('ink'),
        muted: c('muted'),
        accent: c('accent'),
        'accent-soft': c('accent-soft'),
        'accent-ink': c('accent-ink'),
        yes: c('yes'),
        'yes-soft': c('yes-soft'),
        no: c('no'),
        'no-soft': c('no-soft'),
        na: c('na'),
        'na-soft': c('na-soft'),
        warn: c('warn'),
        'warn-soft': c('warn-soft'),
        'on-status': c('on-status'),
      },
      fontFamily: {
        display: ['"Barlow Semi Condensed"', '"Arial Narrow"', 'system-ui', 'sans-serif'],
        sans: ['"Public Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
