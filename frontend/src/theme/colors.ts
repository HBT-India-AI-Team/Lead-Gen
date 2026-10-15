// Fintech Lead Intelligence — Google/Gemini-inspired color system.
//
// Primary (#1A73E8) and Secondary (#1967D2) are the two brand blues, taken
// from the Google Blue scale; every other primary shade below is a step on
// that scale around #1A73E8 (kept at the 600 slot) so components can reach for a
// lighter/darker step without introducing new ad-hoc colors. Success/
// Warning/Error use the exact specified hex as the accent/border color;
// where that exact value would fail text contrast on a light surface (the
// bright warning amber), a deepened variant of the same hue is used for
// body text instead — the brand color still appears verbatim (badge
// borders, icons, dots), it just isn't misused as low-contrast text.
//
// Every component in components/ui and components/layout should draw its
// color values from here (mirrored as literal Tailwind arbitrary-value
// classes, e.g. `primary.600` below maps to `bg-[#1A73E8]`) rather than
// introducing new colors, so the whole shell reads as one system.

export const colors = {
  primary: {
    50: '#E8F0FE',
    100: '#D2E3FC',
    200: '#AECBFA',
    300: '#8AB4F8',
    400: '#669DF6',
    500: '#4285F4',
    600: '#1A73E8', // Primary (spec)
    700: '#1967D2',
    800: '#185ABC',
    900: '#174EA6',
  },
  secondary: {
    50: '#E8F0FE',
    100: '#D2E3FC',
    300: '#8AB4F8',
    500: '#1967D2', // Secondary (spec)
    700: '#185ABC',
  },
  surface: {
    canvas: '#F5F7FA', // Background (spec)
    base: '#FFFFFF',
    muted: '#F8FAFC',
    sunken: '#EEF2F6',
  },
  border: {
    subtle: '#E3E8EF',
    default: '#D3DBE4',
    strong: '#B7C2D0',
  },
  text: {
    primary: '#0F1B2D',
    secondary: '#48576B',
    muted: '#5F6B7A', // AA on canvas/surface (was #8996A6, 2.8:1)
    inverse: '#FFFFFF',
  },
  status: {
    success: { fg: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7' }, // Approved
    warning: { fg: '#8A5A00', bg: '#FFF6E5', border: '#F9A825' }, // Pending
    danger: { fg: '#C62828', bg: '#FDECEA', border: '#EF9A9A' }, // Rejected
    info: { fg: '#1967D2', bg: '#E8F0FE', border: '#8AB4F8' }, // Active
    neutral: { fg: '#48576B', bg: '#EEF2F6', border: '#D3DBE4' },
  },
} as const;

export type ColorScale = typeof colors;
