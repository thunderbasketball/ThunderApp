// Thunder logo colors and the app's light/dark palettes. Matches the website (app/globals.css).
export const Thunder = {
  blue: '#1b41e7',
  blueDark: '#1533b8',
  orange: '#ec8034',
} as const;

export const Colors = {
  light: {
    text: '#18181b',
    textSecondary: '#52525b',
    background: '#f1f3f6',
    card: '#ffffff',
    border: 'rgba(9, 9, 11, 0.1)',
    link: '#1d4ed8',
    errorBg: '#fef2f2',
    errorText: '#b91c1c',
    noticeBg: '#ecfdf5',
    noticeText: '#047857',
  },
  dark: {
    text: '#f4f4f5',
    textSecondary: '#a1a1aa',
    background: '#09090b',
    card: '#18181b',
    border: 'rgba(255, 255, 255, 0.15)',
    link: '#60a5fa',
    errorBg: 'rgba(239, 68, 68, 0.1)',
    errorText: '#fca5a5',
    noticeBg: 'rgba(16, 185, 129, 0.1)',
    noticeText: '#6ee7b7',
  },
} as const;

export type Palette = (typeof Colors)['light' | 'dark'];

export const Spacing = {
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
} as const;
