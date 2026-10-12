import { View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Txt } from './Txt';

const OIL = ['#FF5FA2', '#9B6BFF', '#4CC9F0', '#5EF2B5', '#F4E46A', '#FF9A62'];

/** The iridescent PRO badge, like oil on water. The wordmark next to it stays plain ink. */
export function ProBadge() {
  const w = 40, h = 20;
  return (
    <View style={{ width: w, height: h, borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={h} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="oil" x1="0" y1="1" x2="1" y2="0">
            {OIL.concat(OIL[0]).map((col, i) => <Stop key={i} offset={i / OIL.length} stopColor={col} />)}
          </LinearGradient>
          <RadialGradient id="shine" cx="0.25" cy="0" r="0.9">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={w} height={h} fill="url(#oil)" />
        <Rect width={w} height={h} fill="url(#shine)" />
      </Svg>
      <Txt v="label" style={{ color: '#0B0B0C', fontSize: 10.5, letterSpacing: 1.4 }}>Pro</Txt>
    </View>
  );
}
