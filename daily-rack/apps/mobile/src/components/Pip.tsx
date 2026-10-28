import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { colors } from '../theme.ts';

// Pip, the Daily Rack sparrow. "Mahjong" (麻雀) means sparrow, and a pip is a dot on a
// tile. Pip greets new players, teaches, cheers wins and sends the gentle reminders.
// Drawn in SVG; moods swap the face and wings, and small animations keep Pip alive.

export const MASCOT_NAME = 'Pip';

export type PipMood = 'happy' | 'cheer' | 'wave' | 'think' | 'oops' | 'sleepy' | 'proud';

const BROWN = '#B9773F';
const CAP = '#8A4E26';
const CREAM = '#F8EBD6';
const INK = '#2B1D14';
const BEAK = '#F2A33A';
const FEET = '#E0892B';
const CHEEK = '#F2A0AE';

const HAPPY_EYES = (
  <G stroke={INK} strokeWidth={2.6} strokeLinecap="round" fill="none">
    <Path d="M37 45 Q41 40 45 45" />
    <Path d="M55 45 Q59 40 63 45" />
  </G>
);

function Eyes({ mood, blink }: { mood: PipMood; blink: boolean }) {
  if (mood === 'cheer' || mood === 'proud') return HAPPY_EYES;
  if (mood === 'sleepy' || blink) {
    return (
      <G stroke={INK} strokeWidth={2.4} strokeLinecap="round" fill="none">
        <Path d="M37 45 Q41 47.5 45 45" />
        <Path d="M55 45 Q59 47.5 63 45" />
      </G>
    );
  }
  // Thinking looks up and to the side.
  const dx = mood === 'think' ? -1.4 : 0;
  const dy = mood === 'think' ? -1.6 : 0;
  return (
    <G>
      <Circle cx={41} cy={44.5} r={4.4} fill={INK} />
      <Circle cx={59} cy={44.5} r={4.4} fill={INK} />
      <Circle cx={42.4 + dx} cy={43 + dy} r={1.5} fill="#fff" />
      <Circle cx={60.4 + dx} cy={43 + dy} r={1.5} fill="#fff" />
      {mood === 'oops' && (
        <G stroke={INK} strokeWidth={1.8} strokeLinecap="round">
          <Path d="M36.5 39.5 L44 36.8" />
          <Path d="M63.5 39.5 L56 36.8" />
        </G>
      )}
    </G>
  );
}

function Wing({ side, raised, flap }: { side: 'left' | 'right'; raised: boolean; flap: boolean }) {
  const sign = side === 'left' ? -1 : 1;
  if (raised) {
    // Up and out from the shoulder, drawn over the body so it shows.
    const angle = sign * (flap ? -115 : -135);
    return (
      <G transform={`rotate(${angle} ${50 + sign * 24} 60)`}>
        <Ellipse cx={50 + sign * 25} cy={68} rx={7.5} ry={12.5} fill={CAP} />
        <Path d={`M${50 + sign * 23} 63 Q${50 + sign * 27} 68 ${50 + sign * 23} 75`} stroke="#6E3B1B" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      </G>
    );
  }
  const x = 50 + sign * 27;
  return (
    <G transform={`rotate(${sign * (flap ? 12 : 0)} ${50 + sign * 22} 56)`}>
      <Ellipse cx={x} cy={64} rx={8} ry={14} fill={CAP} />
      <Path d={`M${x - sign * 3} 58 Q${x + sign * 2} 64 ${x - sign * 3} 72`} stroke="#6E3B1B" strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Drawing({ mood, blink, flap }: { mood: PipMood; blink: boolean; flap: boolean }) {
  const open = mood === 'cheer' || mood === 'wave' || mood === 'proud';
  const leftUp = mood === 'cheer';
  const rightUp = mood === 'cheer' || mood === 'wave';
  return (
    <Svg viewBox="0 0 100 100" width="100%" height="100%">
      {/* tail */}
      <Path d="M70 74 L92 66 L88 74 L94 78 L72 82 Z" fill={CAP} />
      {/* feet */}
      <G stroke={FEET} strokeWidth={2.6} strokeLinecap="round">
        <Path d="M43 84 L43 92 M43 92 L39 95 M43 92 L43 96 M43 92 L47 95" />
        <Path d="M57 84 L57 92 M57 92 L53 95 M57 92 L57 96 M57 92 L61 95" />
      </G>
      {!leftUp && <Wing side="left" raised={false} flap={flap} />}
      {!rightUp && <Wing side="right" raised={false} flap={flap} />}
      {/* body and belly; Pip puffs up when proud */}
      <Ellipse cx={50} cy={58} rx={mood === 'proud' ? 31 : 29.5} ry={29} fill={BROWN} />
      <Ellipse cx={50} cy={67} rx={mood === 'proud' ? 21.5 : 19.5} ry={mood === 'proud' ? 18 : 16.5} fill={CREAM} />
      {leftUp && <Wing side="left" raised flap={flap} />}
      {rightUp && <Wing side="right" raised flap={flap} />}
      {/* cap and tuft */}
      <Path d="M24 50 Q26 28 50 27 Q74 28 76 50 Q66 38 50 38 Q34 38 24 50 Z" fill={CAP} />
      <Path d="M48 28 Q46 19 53 18 Q50 22 53 27 Z" fill={CAP} />
      {/* face */}
      <Ellipse cx={50} cy={47.5} rx={18.5} ry={13.5} fill={CREAM} />
      <Eyes mood={mood} blink={blink} />
      <Ellipse cx={35.5} cy={52} rx={4} ry={2.6} fill={CHEEK} opacity={0.85} />
      <Ellipse cx={64.5} cy={52} rx={4} ry={2.6} fill={CHEEK} opacity={0.85} />
      {/* beak: open in a cheer or a wave, closed otherwise */}
      {open ? (
        <G>
          <Path d="M45.5 49.5 Q50 46.5 54.5 49.5 Z" fill={BEAK} />
          <Path d="M46.5 51 Q50 57 53.5 51 Z" fill="#D9822B" />
        </G>
      ) : (
        <Path d="M46 49.5 Q50 46.5 54 49.5 Q50 55 46 49.5 Z" fill={BEAK} />
      )}
      {mood === 'oops' && <Path d="M74 36 Q77 41 74 43 Q71 41 74 36 Z" fill="#9CC9E8" />}
    </Svg>
  );
}

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled?.()
  .then((v) => {
    reduceMotion = v;
  })
  .catch(() => undefined);

/** Pip at `size` points. With `animate`, Pip bobs and blinks, and hops on a cheer. */
export function Pip({ mood = 'happy', size = 88, animate = true, style, label }: { mood?: PipMood; size?: number; animate?: boolean; style?: StyleProp<ViewStyle>; label?: string }) {
  const bob = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const [blink, setBlink] = useState(false);
  const [flap, setFlap] = useState(false);
  const moving = animate && !reduceMotion;

  // A gentle bob, all the time.
  useEffect(() => {
    if (!moving) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [moving, bob]);

  // Blinks every few seconds.
  useEffect(() => {
    if (!moving) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        setBlink(true);
        timer = setTimeout(() => {
          setBlink(false);
          next();
        }, 140);
      }, 2800 + Math.random() * 2400);
    };
    next();
    return () => clearTimeout(timer);
  }, [moving]);

  // Celebrations: a hop, and flapping wings for a moment.
  useEffect(() => {
    if (!moving || (mood !== 'cheer' && mood !== 'proud' && mood !== 'wave')) return;
    hop.setValue(0);
    Animated.sequence([
      Animated.timing(hop, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(hop, { toValue: 0, friction: 4, tension: 120, useNativeDriver: true }),
    ]).start();
    let frames = 0;
    const timer = setInterval(() => {
      frames += 1;
      setFlap((f) => !f);
      if (frames >= 8) clearInterval(timer);
    }, 170);
    return () => clearInterval(timer);
  }, [mood, moving, hop]);

  const translateY = Animated.add(bob.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.035] }), hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.16] }));
  return (
    <Animated.View
      style={[{ width: size, height: size, transform: [{ translateY }] }, style]}
      accessible={Boolean(label)}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={!label}
    >
      <Drawing mood={mood} blink={blink} flap={flap} />
      {mood === 'sleepy' && <Text style={[styles.z, { fontSize: size * 0.16, right: -size * 0.02, top: size * 0.02 }]}>z z</Text>}
      {mood === 'think' && <Text style={[styles.think, { fontSize: size * 0.22, right: -size * 0.04, top: -size * 0.06 }]}>?</Text>}
    </Animated.View>
  );
}

/** Pip with a speech bubble. The words are what screen readers hear. */
export function PipSays({ mood = 'happy', children, size = 64, style, testID }: { mood?: PipMood; children: ReactNode; size?: number; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View style={[styles.says, style]} testID={testID}>
      <Pip mood={mood} size={size} />
      <View style={styles.bubble} accessible accessibilityRole="text">
        <View style={styles.tail} />
        {typeof children === 'string' ? <Text style={styles.bubbleText}>{children}</Text> : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  z: { position: 'absolute', color: colors.muted, fontWeight: '700' },
  think: { position: 'absolute', color: colors.primary, fontWeight: '800' },
  says: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bubble: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 },
  tail: {
    position: 'absolute',
    left: -7,
    top: '50%',
    marginTop: -7,
    width: 14,
    height: 14,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
  },
  bubbleText: { fontSize: 16, lineHeight: 22, color: colors.ink },
});
