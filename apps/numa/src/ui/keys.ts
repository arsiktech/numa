import { Platform } from 'react-native';

/** Arrow keys move a tab list. Enter still activates the focused tab. */
export function arrowProps<T extends string>(items: readonly T[], current: T, set: (next: T) => void) {
  if (Platform.OS !== 'web') return {};
  return {
    onKeyDown: (event: { key?: string; nativeEvent?: { key?: string }; preventDefault?: () => void }) => {
      const key = event.key ?? event.nativeEvent?.key;
      if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
      const index = items.indexOf(current);
      if (index < 0) return;
      event.preventDefault?.();
      set(items[(index + (key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]);
    },
  };
}
