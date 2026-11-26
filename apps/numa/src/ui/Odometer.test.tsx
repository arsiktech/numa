import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PixelRatio, StyleSheet, Text, View } from 'react-native';

import { Odometer } from './Odometer';
import { glyphMetrics } from './odometerFigure';

jest.mock('react-native-reanimated', () => {
  const { Text: RNText, View: RNView } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: RNView, Text: RNText },
    Easing: { bezier: () => (value: number) => value },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: (value: number) => (value === 0 ? 1 : 0),
    useReducedMotion: () => true,
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: (update: () => object) => update(),
    withTiming: (value: number) => value,
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hero = { fontFamily: 'Manrope_300Light', fontSize: 80, lineHeight: 80, letterSpacing: -2, color: '#111' };

let tree: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => { if (tree) act(() => tree?.unmount()); tree = undefined; jest.restoreAllMocks(); });

test('a settled figure keeps whole glyphs in a box taller than the line, with tabular digits', () => {
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
  act(() => { tree = TestRenderer.create(<Odometer text="€385,150" style={hero} />); });
  const root = tree!.root.findByProps({ testID: 'odometer' });
  expect(root.props.accessibilityLabel).toBe('€385,150');
  const { textBox, trim } = glyphMetrics(80, 80);
  expect(StyleSheet.flatten(root.props.style).marginVertical).toBe(-trim);

  const digits = tree!.root.findAll((node) => node.props.testID === 'odometer-digit' && node.parent?.props?.testID !== 'odometer-digit');
  for (const column of digits) {
    const box = StyleSheet.flatten(column.props.style);
    expect(box.height).toBe(textBox);
    expect(box.overflow).toBe('hidden');
    const texts = column.findAllByType(Text);
    const glyphs = texts.filter((node) => StyleSheet.flatten(node.props.style).position === 'absolute');
    expect(glyphs).toHaveLength(10);
    for (const glyph of glyphs) {
      const style = StyleSheet.flatten(glyph.props.style);
      expect(style.height).toBe(textBox);
      expect(style.lineHeight).toBe(textBox);
      expect(style.fontVariant).toEqual(expect.arrayContaining(['tabular-nums']));
      expect(style.transform).toBeUndefined();
    }
  }

  const marks = tree!.root.findAll((node) => node.props.testID === 'odometer-mark' && node.parent?.props?.testID !== 'odometer-mark').map((node) => node.props.children);
  expect(marks).toEqual(['€', ',']);
  expect(tree!.root.findAllByType(View).some((node) => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.transform !== undefined;
  })).toBe(false);
});
