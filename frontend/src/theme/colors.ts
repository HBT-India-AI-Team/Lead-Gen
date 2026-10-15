// LeadGen AI — SBI/YONO-inspired enterprise banking color system.
//
// Primary (#005BAC) and Secondary (#1976D2) are the two brand blues this
// phase specifies; every other primary shade below is a computed tint/shade
// around #005BAC (kept at the 600 slot) so components can reach for a
// lighter/darker step without introducing new ad-hoc colors. Success/
// Warning/Error use the exact specified hex as the accent/border color;
// where that exact value would fail text contrast on a light surface (the
// bright warning amber), a deepened variant of the same hue is used for
// body text instead — the brand color still appears verbatim (badge
// borders, icons, dots), it just isn't misused as low-contrast text.
//
// Every component in components/ui and components/layout should draw its
// color values from here (mirrored as literal Tailwind arbitrary-value
// classes, e.g. `primary.600` below maps to `bg-[#005BAC]`) rather than
// introducing new colors, so the whole shell reads as one system.

export const colors = {
  primary: {
    50: '#E6F0FA',
    100: '#CCE1F5',
    200: '#99C3EB',
    300: '#66A5E0',
    400: '#337FC7',
    500: '#0068C2',
    600: '#005BAC', // Primary (spec)
    700: '#004A8C',
    800: '#003968',
    900: '#002846',
  },
  secondary: {
    50: '#E9F2FC',
    100: '#D3E5F9',
    300: '#7BAEE8',
    500: '#1976D2', // Secondary (spec)
    700: '#125A9E',
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
    muted: '#8996A6',
    inverse: '#FFFFFF',
  },
  status: {
    success: { fg: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7' }, // Approved
    warning: { fg: '#8A5A00', bg: '#FFF6E5', border: '#F9A825' }, // Pending
    danger: { fg: '#C62828', bg: '#FDECEA', border: '#EF9A9A' }, // Rejected
    info: { fg: '#1976D2', bg: '#E9F2FC', border: '#7BAEE8' }, // Active
    neutral: { fg: '#48576B', bg: '#EEF2F6', border: '#D3DBE4' },
  },
} as const;

export type ColorScale = typeof colors;
