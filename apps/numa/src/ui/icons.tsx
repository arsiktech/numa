import Svg, { Circle, Path, Rect } from 'react-native-svg';

type P = { color: string; size?: number };
const s = (color: string) => ({ stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' });

export const IconHome = ({ color, size = 22 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M3 17l5-5 4 3 8-8" {...s(color)} /><Path d="M15 7h5v5" {...s(color)} /></Svg>
);
export const IconFlow = ({ color, size = 22 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M3 7c5 0 6 10 11 10h7" {...s(color)} /><Path d="M3 17c5 0 6-10 11-10h7" {...s(color)} /></Svg>
);
export const IconPlan = ({ color, size = 22 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="8" {...s(color)} /><Circle cx="12" cy="12" r="3" {...s(color)} /></Svg>
);
export const IconHoldings = ({ color, size = 20 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Rect x="3" y="5" width="18" height="6" rx="2" {...s(color)} /><Rect x="3" y="13" width="11" height="6" rx="2" {...s(color)} /></Svg>
);
export const IconAsk = ({ color, size = 20 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M4 5h16v11H9l-5 4z" {...s(color)} /></Svg>
);
export const IconPlus = ({ color, size = 24 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" {...s(color)} strokeWidth={2.2} /></Svg>
);
export const IconEye = ({ color, size = 22 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" {...s(color)} strokeWidth={1.75} /><Circle cx="12" cy="12" r="3" {...s(color)} strokeWidth={1.75} /></Svg>
);
export const IconCheck = ({ color, size = 16 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" {...s(color)} strokeWidth={2.6} /></Svg>
);
export const IconPerson = ({ color, size = 22 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="8.5" r="3.6" {...s(color)} strokeWidth={1.75} /><Path d="M4.8 19.6c1.4-3.1 4-4.7 7.2-4.7s5.8 1.6 7.2 4.7" {...s(color)} strokeWidth={1.75} /></Svg>
);
