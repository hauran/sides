// Sides Design System — "Warm Studio" theme
// Soft pastels with playful energy, designed for teen actors

export const colors = {
  // Backgrounds
  bg: '#FAF7F2',          // Warm linen — main app background
  surface: '#FFFFFF',      // Cards, modals, inputs
  surfaceAlt: '#F5F0EB',  // Slightly darker surface for grouped items

  // Text
  text: '#2D2A26',        // Primary text — warm charcoal
  textSecondary: '#9B9590', // Secondary/muted text
  textInverse: '#FFFFFF',  // Text on dark/accent backgrounds

  // Primary accent — Dusty Rose (CTAs, your turn, active states)
  rose: '#C4727F',
  roseSoft: '#F5E3E6',    // Light rose for backgrounds
  roseMuted: '#D9A0A8',   // Disabled/subtle rose

  // Secondary accent — Soft Sage (other characters, success)
  sage: '#8B9D83',
  sageSoft: '#E8EDE6',    // Light sage backgrounds
  sageDark: '#6B7D63',    // Darker sage for emphasis

  // Highlight — Warm Honey (hints, bookmarks, warnings)
  honey: '#E8B86D',
  honeySoft: '#FDF3E1',   // Light honey backgrounds
  honeyDark: '#C99A4E',   // Darker honey

  // Recording/Error — Soft Coral
  coral: '#D4726A',
  coralSoft: '#FBE9E7',   // Light coral backgrounds

  // Borders & Dividers
  border: '#E8E3DE',
  borderFocus: '#C4727F',  // Focus ring color

  // Shadows (use with shadow* style helpers)
  shadow: '#2D2A26',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const typography = {
  // Script lines — theatrical serif
  script: {
    fontFamily: 'Georgia',
    fontSize: 16,
    lineHeight: 26,
    color: colors.text,
  },
  // Character labels
  label: {
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  // Screen titles
  title: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: colors.text,
  },
  // Section headings
  heading: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text,
  },
  // Body text
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  // Small/caption text
  caption: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  // Button text
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
} as const;

// Reusable shadow presets
export const shadows = {
  sm: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  lg: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;
