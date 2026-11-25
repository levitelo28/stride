// Evergreen design tokens, carried over from the v7–v9 web app.
export const colors = {
  base: '#0B1914', // app background
  surface: '#182D23', // cards
  hero: '#244934', // highlighted cards
  alt: '#365E47',
  line: '#304C3D',
  accent: '#B8D69B',
  accentInk: '#0B1914', // text on accent
  text: '#F7FAF4',
  muted: '#B5CCB9',
  warn: '#F2C879',
  danger: '#F29A8A',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 } as const;
export const maxWidth = 720;
