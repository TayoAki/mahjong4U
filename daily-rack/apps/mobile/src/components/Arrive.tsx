import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Platform } from 'react-native';

/**
 * Slides its content in from an offset when it first appears, like a tile pushed onto the
 * table. With `animate` false (the first render of a screen) it simply appears.
 */
export function Arrive({ children, from, animate }: { children: ReactNode; from: { x?: number; y?: number }; animate: boolean }) {
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    Animated.timing(progress, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
    // Only on mount: a tile arrives once.
  }, []);
  return (
    <Animated.View
      style={{
        opacity: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [from.x ?? 0, 0] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [from.y ?? 0, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** False during a screen's first render and true after, so only later arrivals animate. */
export function useAfterFirstRender(): boolean {
  const ready = useRef(false);
  useEffect(() => {
    ready.current = true;
  }, []);
  return ready.current;
}
