import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme.ts';

// A burst of confetti for the big moments: a finished lesson, a strong pass, a Mahjong,
// a streak milestone. Falls once and gets out of the way. Skipped with reduced motion.

const COLORS = [colors.primary, colors.gold, '#2E8B57', '#1B4F9C', '#F2A0AE', '#B9773F'];
const PIECES = 42;

export function Confetti({ run, onDone }: { run: number; onDone?: () => void }) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        x: Math.random() * width,
        sway: (Math.random() - 0.5) * 80,
        delay: Math.random() * 0.25,
        spin: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2),
        color: COLORS[i % COLORS.length]!,
        w: 6 + Math.random() * 5,
        h: 10 + Math.random() * 6,
      })),
    // A new set of pieces for each burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, width],
  );

  useEffect(() => {
    if (run === 0) return;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled?.()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) return onDone?.();
        progress.setValue(0);
        Animated.timing(progress, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => onDone?.());
      });
    return () => {
      cancelled = true;
    };
  }, [run, progress, onDone]);

  if (run === 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {pieces.map((p, i) => {
        const t = progress.interpolate({ inputRange: [0, p.delay, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x,
              top: -20,
              width: p.w,
              height: p.h,
              borderRadius: 2,
              backgroundColor: p.color,
              opacity: progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
                { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.sway, p.sway * 0.4] }) },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 360}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
