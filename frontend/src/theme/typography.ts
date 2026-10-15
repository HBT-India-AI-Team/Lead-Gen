// Fintech Lead Intelligence — enterprise banking typography system.
// Single source of truth for font stack + type scale, referenced by
// components/ui and components/layout instead of ad-hoc text-sizing.
// Inter throughout (already loaded via index.html), with a clearer size/
// weight/line-height step between display, section, and body text so
// heading hierarchy reads unambiguously and body copy stays comfortable at
// dashboard density.

export const typography = {
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",

  scale: {
    display: 'text-3xl font-bold tracking-tight leading-tight',
    pageTitle: 'text-2xl font-bold tracking-tight leading-tight',
    sectionTitle: 'text-base font-bold tracking-tight leading-snug',
    subsectionTitle: 'text-sm font-bold uppercase tracking-wide leading-snug',
    body: 'text-sm font-normal leading-relaxed',
    bodyStrong: 'text-sm font-semibold leading-relaxed',
    caption: 'text-xs font-medium leading-normal',
    eyebrow: 'text-xs font-semibold uppercase tracking-wide leading-normal',
  },

  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export type Typography = typeof typography;
