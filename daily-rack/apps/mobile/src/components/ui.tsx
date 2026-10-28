import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, fonts, radius } from '../theme.ts';
import { useLayout } from '../lib/layout.ts';

// ------------------------------------------------------------------ layout

export function Screen({
  children,
  scroll = true,
  footer,
  padded = true,
  wide = false,
  testID,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  padded?: boolean;
  /** Lets the screen use two columns on big screens (see Columns). */
  wide?: boolean;
  testID?: string;
}) {
  const layout = useLayout();
  const content = <View style={[styles.content, padded && styles.padded, layout.tablet && padded && styles.paddedTablet]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']} testID={testID}>
      <View style={[styles.column, { maxWidth: wide ? layout.wideColumn : layout.column }]}>
        {scroll ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        ) : (
          content
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.topbar}>
      {onBack ? (
        <IconButton icon="back" label="Back" onPress={onBack} />
      ) : (
        <View style={styles.iconSpace} />
      )}
      <Text style={styles.topbarTitle} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {right ?? <View style={styles.iconSpace} />}
    </View>
  );
}

/** Two columns side by side on big screens; stacked (left first) on phones. */
export function Columns({ left, right, ratio = 1 }: { left: ReactNode; right: ReactNode; ratio?: number }) {
  const { wide } = useLayout();
  if (!wide) {
    return (
      <>
        {left}
        {right}
      </>
    );
  }
  return (
    <View style={styles.columns}>
      <View style={[styles.columnHalf, { flex: ratio }]}>{left}</View>
      <View style={styles.columnHalf}>{right}</View>
    </View>
  );
}

export function Row({ children, gap = 8, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

// ------------------------------------------------------------------ text

export function Display({ children, center, size = 34, style }: { children: ReactNode; center?: boolean; size?: number; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[styles.display, { fontSize: size, lineHeight: size * 1.12 }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

export function Heading({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[styles.heading, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted, small, center, bold, style, numberOfLines, testID }: { children: ReactNode; muted?: boolean; small?: boolean; center?: boolean; bold?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number; testID?: string }) {
  return (
    <Text
      testID={testID}
      numberOfLines={numberOfLines}
      style={[styles.body, muted && { color: colors.muted }, small && { fontSize: 14, lineHeight: 20 }, center && { textAlign: 'center' }, bold && { fontWeight: '700' }, style]}
    >
      {children}
    </Text>
  );
}

export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.eyebrow, light && { color: colors.feltText }]}>{children}</Text>;
}

// ------------------------------------------------------------------ controls

type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger' | 'light';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  hint,
  style,
  compact,
  testID,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  testID?: string;
}) {
  const v = BUTTONS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: v.bg, borderColor: v.border, borderWidth: v.border === 'transparent' ? 0 : 1.5 },
        pressed && !inactive && { backgroundColor: v.pressed, transform: [{ scale: 0.98 }] },
        inactive && variant === 'primary' && { backgroundColor: '#C9B9C6' },
        inactive && variant !== 'primary' && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <Icon name={icon} color={v.fg} size={20} /> : null}
      <Text style={[styles.buttonText, { color: v.fg }, compact && { fontSize: 15 }]}>{title}</Text>
    </Pressable>
  );
}

const BUTTONS: Record<ButtonVariant, { bg: string; fg: string; border: string; pressed: string }> = {
  primary: { bg: colors.primary, fg: '#FFFFFF', border: 'transparent', pressed: colors.primaryPressed },
  secondary: { bg: colors.surface, fg: colors.ink, border: colors.ink, pressed: colors.sage },
  text: { bg: 'transparent', fg: colors.primary, border: 'transparent', pressed: colors.pink },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.danger, pressed: '#FDECEA' },
  light: { bg: 'rgba(255,255,255,0.14)', fg: colors.feltText, border: 'transparent', pressed: 'rgba(255,255,255,0.24)' },
};

export function IconButton({ icon, label, onPress, color = colors.ink, badge }: { icon: IconName; label: string; onPress: () => void; color?: string; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: 'rgba(23,63,54,0.08)' }]}>
      <Icon name={icon} color={color} />
      {badge ? (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, disabled, style, testID }: { label: string; selected?: boolean; onPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected), disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && !selected && { backgroundColor: '#E2E0D8' }, disabled && { opacity: 0.45 }, style]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="radio"
          accessibilityLabel={o.label}
          accessibilityState={{ checked: value === o.value }}
          onPress={() => onChange(o.value)}
          style={[styles.segment, value === o.value && styles.segmentOn]}
        >
          <Text style={[styles.segmentText, value === o.value && { color: colors.primary }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ surfaces

export function Card({ children, tone = 'default', style, testID }: { children: ReactNode; tone?: 'default' | 'sage' | 'pink' | 'felt'; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View testID={testID} style={[styles.card, tone === 'sage' && styles.cardSage, tone === 'pink' && styles.cardPink, tone === 'felt' && styles.cardFelt, style]}>
      {children}
    </View>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <View style={[styles.notice, tone === 'warn' && { backgroundColor: colors.warnBg }]} accessibilityRole="text">
      <Text style={[styles.noticeText, tone === 'warn' && { color: colors.warnInk }]}>{children}</Text>
    </View>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? <Button title="Try again" variant="text" onPress={onRetry} compact /> : null}
    </View>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.body, { color: colors.muted }]}>{label}…</Text>
    </View>
  );
}

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  // Phones get a sheet from the bottom; tablets a card in the middle of the screen.
  const { tablet, height } = useLayout();
  return (
    <Modal visible={visible} transparent animationType={tablet ? 'fade' : 'slide'} onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <Pressable style={[styles.backdrop, tablet && styles.backdropCentered]} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, tablet && styles.sheetCentered]} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.sheetTitle}>
            {title}
          </Text>
          <ScrollView style={{ maxHeight: Math.min(tablet ? 720 : 560, height * 0.72) }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function Avatar({ name, color, size = 40, online }: { name: string; color: string; size?: number; online?: boolean }) {
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
        <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
      </View>
      {online !== undefined ? <View style={[styles.presence, { backgroundColor: online ? colors.online : '#B9BDB7' }]} /> : null}
    </View>
  );
}

export function Badge({ label, tone = 'pink' }: { label: string; tone?: 'pink' | 'ink' | 'sage' }) {
  return (
    <View style={[styles.pill, tone === 'ink' && { backgroundColor: colors.ink }, tone === 'sage' && { backgroundColor: colors.sage }]}>
      <Text style={[styles.pillText, tone === 'ink' && { color: '#fff' }, tone === 'sage' && { color: colors.ink }]}>{label}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ icons

export type IconName =
  | 'back'
  | 'chevron'
  | 'arrow'
  | 'help'
  | 'sort'
  | 'mic'
  | 'share'
  | 'download'
  | 'flame'
  | 'leaf'
  | 'home'
  | 'user'
  | 'users'
  | 'play'
  | 'calendar'
  | 'chat'
  | 'card'
  | 'check'
  | 'plus'
  | 'close'
  | 'trash'
  | 'send'
  | 'copy'
  | 'bulb'
  | 'more'
  | 'flag'
  | 'block'
  | 'sound'
  | 'mute'
  | 'undo';

const ICONS: Record<IconName, ReactNode> = {
  back: <Path d="M15 5l-7 7 7 7" />,
  chevron: <Path d="M9 5l7 7-7 7" />,
  arrow: <Path d="M5 12h14M13 6l6 6-6 6" />,
  help: (
    <>
      <Circle cx={12} cy={12} r={9.5} />
      <Path d="M9.5 9.3a2.6 2.6 0 015 .9c0 1.8-2.5 2.2-2.5 3.8M12 17.2v.2" />
    </>
  ),
  sort: <Path d="M4 7h16M7 12h10M10 17h4" />,
  mic: <Path d="M9 6a3 3 0 016 0v5a3 3 0 01-6 0zM5.5 11a6.5 6.5 0 0013 0M12 17.5V21" />,
  share: <Path d="M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6" />,
  download: <Path d="M12 4v11M8 11l4 4 4-4M5 19h14" />,
  flame: <Path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.5-5.4 3.7-8.3.5 1.8 1.6 2.9 2.7 3.4.1-2.6 1.4-5 3.6-6.4-.4 2.8.8 4.6 2 6.2 1.2 1.6 1.9 3 1.9 5 0 3.7-3.1 6.3-7.4 6.3z" />,
  leaf: <Path d="M5 19c8 0 14-6 14-15C10 4 5 9 5 16v3zm0 0c3-5 6-8 10-10" />,
  home: <Path d="M4 11l8-6.5 8 6.5V20H4z" />,
  user: <Path d="M8 8a4 4 0 108 0 4 4 0 00-8 0M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />,
  users: <Path d="M3 8a3.5 3.5 0 107 0 3.5 3.5 0 00-7 0M1.5 19c.9-3 3.1-4.5 5-4.5s4.1 1.5 5 4.5M14 8a3.5 3.5 0 107 0 3.5 3.5 0 00-7 0M12.5 19c.9-3 3.1-4.5 5-4.5s4.1 1.5 5 4.5" />,
  play: <Path d="M8 5.5v13l11-6.5z" />,
  calendar: <Path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5" />,
  chat: <Path d="M4 5h16v11H9l-5 4z" />,
  card: (
    <>
      <Rect x={5} y={3} width={14} height={18} rx={2} />
      <Path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  check: <Path d="M5 12.5l4.5 4.5L19 7" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  trash: <Path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" />,
  send: <Path d="M4 12l16-8-6 16-3-6z" />,
  copy: <Path d="M8 8h11v12H8zM5 16V4h11" />,
  bulb: <Path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />,
  more: <Path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3.2} />,
  flag: <Path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  block: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  sound: <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />,
  mute: <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5" />,
  undo: <Path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" />,
};

export function Icon({ name, size = 24, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  const filled = name === 'play' || name === 'flame';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={filled ? 'none' : color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </Svg>
  );
}

// ------------------------------------------------------------------ styles

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  column: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  content: { flexGrow: 1, gap: 18, paddingBottom: 24 },
  padded: { paddingHorizontal: 20 },
  paddedTablet: { paddingHorizontal: 28, paddingTop: 8 },
  columns: { flexDirection: 'row', gap: 22, alignItems: 'flex-start' },
  columnHalf: { flex: 1, gap: 18 },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 10, backgroundColor: colors.canvas, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  topbar: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  topbarTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  iconSpace: { width: 44, height: 44 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badgeDot: { position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  display: { fontFamily: fonts.serif, color: colors.ink, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  body: { fontSize: 16, lineHeight: 23, color: colors.ink },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: colors.muted },
  button: { minHeight: 54, borderRadius: radius.button, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18 },
  buttonCompact: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12 },
  buttonText: { fontSize: 17, fontWeight: '600' },
  chip: { minHeight: 48, borderRadius: radius.chip, backgroundColor: colors.chip, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  chipSelected: { backgroundColor: colors.primary },
  chipText: { fontSize: 15, fontWeight: '500', color: colors.ink, textAlign: 'center' },
  chipTextSelected: { color: '#fff', fontWeight: '700' },
  segmented: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentOn: { borderColor: colors.primary, backgroundColor: colors.pink },
  segmentText: { fontWeight: '600', color: colors.ink, fontSize: 15 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 16, gap: 10 },
  cardSage: { backgroundColor: colors.sage, borderColor: 'transparent' },
  cardPink: { backgroundColor: colors.pink, borderColor: 'transparent' },
  cardFelt: { backgroundColor: colors.felt, borderColor: 'transparent' },
  notice: { backgroundColor: colors.sage, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  noticeText: { fontSize: 14, lineHeight: 20, color: colors.muted },
  error: { backgroundColor: '#FDECEA', borderRadius: 14, padding: 12, gap: 4 },
  errorText: { color: colors.danger, fontSize: 15 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 40 },
  backdrop: { flex: 1, backgroundColor: 'rgba(23,63,54,0.4)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 14 },
  backdropCentered: { justifyContent: 'center', padding: 24 },
  sheetCentered: { maxWidth: 600, borderRadius: 24, paddingBottom: 24 },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  presence: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.canvas },
  pill: { backgroundColor: colors.pink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
