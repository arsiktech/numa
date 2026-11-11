// Pulse design tokens (docs/rebuild/DESIGN.md). Dark is the primary theme.
export type ThemeName = 'dark' | 'light';

const dark = {
  bg: '#000000', s1: '#0E0F11', s2: '#1C1E22', line: '#2A2D32', line2: '#2A2D32', stroke: '#767676',
  ink: '#F4F4F1', ink2: '#A1A4AA', ink3: '#8E9198',
  up: '#3DDC97', upInk: '#3DDC97', down: '#FF6B5E', downDeep: '#D9483C', onDown: '#0B0B0C', warn: '#FFB547',
  upBg: 'rgba(61,220,151,0.13)', netBg: 'rgba(61,220,151,0.14)',
  glass: 'rgba(30,32,36,0.72)', glassBorder: 'rgba(255,255,255,0.08)',
  plus: '#F4F4F1', plusInk: '#000000', shadow: 'rgba(0,0,0,0.45)',
  rib: '#2A2D32', rib2: '#3A3D42',
  catAmber: '#E09A3A', catBlue: '#5B8CFF', catViolet: '#9B87F5', catSlate: '#8796AE', catSky: '#9CCBE8', catSand: '#D9C9A8',
  onCat: '#0B0B0C', onCatDeep: '#0B0B0C',
};

const light: typeof dark = {
  bg: '#FFFFFF', s1: '#F5F5F3', s2: '#ECECE9', line: '#D9D9D5', line2: '#D9D9D5', stroke: '#767676',
  ink: '#0B0B0C', ink2: '#55575C', ink3: '#61646A',
  up: '#0B7A4B', upInk: '#0B7A4B', down: '#D23A2D', downDeep: '#B32F24', onDown: '#FFFFFF', warn: '#8A5200',
  upBg: 'rgba(11,138,85,0.10)', netBg: '#E3F4EC',
  glass: 'rgba(255,255,255,0.82)', glassBorder: 'rgba(0,0,0,0.07)',
  plus: '#0B0B0C', plusInk: '#FFFFFF', shadow: 'rgba(0,0,0,0.12)',
  rib: '#D9D9D5', rib2: '#C4C4BF',
  catAmber: '#F2A23A', catBlue: '#2F5BD8', catViolet: '#6B54E0', catSlate: '#5E6F87', catSky: '#7FB6E0', catSand: '#CDB98F',
  onCat: '#0B0B0C', onCatDeep: '#FFFFFF',
};

export const palettes = { dark, light };
export type Palette = typeof dark;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 10: 40 } as const;
export const radius = { bar: 10, control: 14, card: 18, sheet: 18, capsule: 999, pill: 999 } as const;

export const duration = { quick: 160, ui: 250, morph: 450, card: 500, roll: 600, reveal: 1000, draw: 1300 } as const;
// cubic-bezier(0.22, 1, 0.36, 1) and friends, as Reanimated Easing.bezier arguments.
export const curves = {
  soft: [0.22, 1, 0.36, 1],
  draw: [0.4, 0.6, 0.2, 1],
  pop: [0.22, 1.4, 0.36, 1],
} as const;

// Font family names registered in the root layout (one family per weight on native).
export const fonts = {
  light: 'Manrope_300Light',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export const type = {
  display: { fontFamily: fonts.light, fontSize: 80, lineHeight: 80, letterSpacing: -2 },
  hero: { fontFamily: fonts.light, fontSize: 54, lineHeight: 54, letterSpacing: -1.08 },
  cents: { fontFamily: fonts.light, fontSize: 30, lineHeight: 32 },
  title: { fontFamily: fonts.heavy, fontSize: 28, lineHeight: 32, letterSpacing: -0.84 },
  section: { fontFamily: fonts.heavy, fontSize: 20, lineHeight: 24, letterSpacing: -0.2 },
  /** Card titles use the body size. The heavier weight keeps them distinct. */
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.heavy, fontSize: 12, lineHeight: 16, letterSpacing: 0.72 },
  figure: { fontFamily: fonts.monoMedium, fontSize: 16, lineHeight: 24 },
  figureSm: { fontFamily: fonts.monoMedium, fontSize: 13, lineHeight: 16 },
} as const;

export type CategoryColor = 'catAmber' | 'catBlue' | 'catViolet' | 'catSlate' | 'catSky' | 'catSand';
export const onCategory: Record<CategoryColor, 'onCat' | 'onCatDeep'> = {
  catAmber: 'onCat', catSky: 'onCat', catSand: 'onCat',
  catBlue: 'onCatDeep', catViolet: 'onCatDeep', catSlate: 'onCatDeep',
};
