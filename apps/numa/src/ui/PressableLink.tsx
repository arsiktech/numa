import { Link, type Href } from 'expo-router';
import { forwardRef, type ReactNode } from 'react';
import { Pressable, type PressableProps, type View, type ViewStyle } from 'react-native';

type InnerProps = Omit<PressableProps, 'style' | 'children'> & {
  /** The control's style, given whether it is being pressed. */
  look: (pressed: boolean) => ViewStyle;
  children: ReactNode;
  /** What `Link asChild` merges in. Unused: `look` is the whole style. */
  style?: unknown;
};

const Inner = forwardRef<View, InnerProps>(function Inner({ look, style: _merged, ...props }, ref) {
  return <Pressable ref={ref} accessibilityRole="link" {...props} style={({ pressed }) => look(pressed)} />;
});

/**
 * A link whose look changes while it is pressed.
 *
 * `Link asChild` merges its own style into its child's `style` prop, and a style function does not
 * survive that merge: the control silently loses every style it had. Here the look travels in its
 * own prop, and the Pressable inside applies it. Use this for any pressable link that needs a
 * pressed state; a plain style object on a `Link asChild` child is still fine.
 */
export function PressableLink({ href, ...props }: Omit<InnerProps, 'style'> & { href: Href }) {
  return (
    <Link href={href} asChild>
      <Inner {...props} />
    </Link>
  );
}
