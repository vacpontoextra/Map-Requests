import type { Config } from 'tailwindcss';

// Colors come from CSS variables (see globals.css) so the dark/light toggle
// only needs to flip a class on <html> – no `dark:` variants needed anywhere.
const withAlpha = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: withAlpha('bg'),
        surface: withAlpha('surface'),
        surface2: withAlpha('surface2'),
        border: withAlpha('border'),
        fg: withAlpha('fg'),
        muted: withAlpha('muted'),
        accent: withAlpha('accent'),
        accent2: withAlpha('accent2'),
        good: withAlpha('good'),
        warn: withAlpha('warn'),
        bad: withAlpha('bad'),
      },
    },
  },
  plugins: [],
};

export default config;
