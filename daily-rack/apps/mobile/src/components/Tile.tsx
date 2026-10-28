import { createContext, memo, useContext } from 'react';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent, type AccessibilityActionInfo, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { tileSvg } from '../tiles/tileArt.ts';
import { colors, table } from '../theme.ts';

const RATIO = 130 / 100;
const svgCache = new Map<string, string>();
function xmlFor(face: string, bigIndex: boolean): string {
  const key = `${face}:${bigIndex}`;
  let xml = svgCache.get(key);
  if (!xml) {
    xml = tileSvg(face, { bigIndex });
    svgCache.set(key, xml);
  }
  return xml;
}

/** Large-tile mode: tiles inside draw a big, dark corner number. */
export const TileStyle = createContext({ bigIndex: false });

/**
 * How much of a real tile's body shows: 'standing' tiles (your rack) show the blue back
 * along the top, as when you look down at tiles stood on the table; 'lying' tiles
 * (discards, exposures) show their ivory and blue layers along the near edge.
 */
export type TileDepth = 'standing' | 'lying';

/** A tile face. `width` sets the size; height follows the 100:130 tile shape. */
export const Tile = memo(function Tile({
  face,
  width,
  flat = false,
  selected = false,
  highlight = false,
  dim = false,
  depth,
  style,
}: {
  face: string;
  width: number;
  flat?: boolean;
  selected?: boolean;
  highlight?: boolean;
  dim?: boolean;
  depth?: TileDepth;
  style?: StyleProp<ViewStyle>;
}) {
  const { bigIndex } = useContext(TileStyle);
  const height = width * RATIO;
  const radius = width * 0.1;
  const art = (
    <View
      style={[
        styles.tile,
        { width, height, borderRadius: radius },
        depth ? null : flat ? styles.flat : styles.raised,
        selected && styles.selected,
        highlight && styles.highlight,
        !depth && dim && { opacity: 0.45 },
        !depth && style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SvgXml xml={xmlFor(face, bigIndex)} width={width} height={height} />
    </View>
  );
  if (!depth) return art;
  const layer = Math.max(2, Math.round(width * 0.09));
  return (
    <View
      style={[styles.body, { width, borderRadius: radius }, depth === 'standing' ? styles.standingShadow : styles.lyingShadow, dim && { opacity: 0.45 }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {depth === 'standing' && <View style={{ height: layer + 1, backgroundColor: table.tileBack, borderTopLeftRadius: radius, borderTopRightRadius: radius }} />}
      {art}
      {depth === 'lying' && (
        <>
          <View style={{ height: Math.max(1, layer - 1), backgroundColor: table.tileBody }} />
          <View style={{ height: layer, backgroundColor: table.tileBack, borderBottomLeftRadius: radius, borderBottomRightRadius: radius }} />
        </>
      )}
    </View>
  );
});

/** The green back of a tile, for hands we cannot see. */
export function TileBack({ width }: { width: number }) {
  return <View style={[styles.back, { width, height: width * RATIO, borderRadius: width * 0.12 }]} />;
}

/** A standing tile seen from behind, as the player across holds them: blue back, ivory top edge. */
export function TileFromBehind({ width }: { width: number }) {
  const height = width * 1.15;
  return (
    <View style={{ width, height, borderRadius: width * 0.14, overflow: 'hidden', backgroundColor: table.tileBack }}>
      <View style={{ height: height * 0.24, backgroundColor: table.tileBody }} />
      <View style={{ flex: 1, borderBottomWidth: 2, borderBottomColor: table.tileBackDark }} />
    </View>
  );
}

/**
 * A standing tile seen from the side, as the players on your left and right hold them:
 * the ivory face half toward its owner, the blue back half toward the middle.
 */
export function TileFromSide({ length, thickness, faceFirst }: { length: number; thickness: number; faceFirst: boolean }) {
  const halves = [
    <View key="face" style={{ flex: 1, backgroundColor: table.tileBody }} />,
    <View key="back" style={{ flex: 1.2, backgroundColor: table.tileBack }} />,
  ];
  return (
    <View style={{ width: thickness, height: length, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' }}>{faceFirst ? halves : halves.reverse()}</View>
  );
}

export function TileButton({
  face,
  label,
  onPress,
  width,
  selected,
  disabled,
  highlight,
  badge,
  depth,
  testID,
  accessibilityActions,
  onAccessibilityAction,
}: {
  face: string;
  label: string;
  onPress?: () => void;
  width: number;
  selected?: boolean;
  disabled?: boolean;
  highlight?: boolean;
  badge?: string;
  depth?: TileDepth;
  testID?: string;
  /** Extra screen reader actions, such as moving a rack tile. */
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected), disabled }}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPress={onPress}
      disabled={disabled}
      hitSlop={2}
      style={({ pressed }) => [{ transform: [{ translateY: selected ? -10 : pressed ? 2 : 0 }] }]}
    >
      <Tile face={face} width={width} selected={selected} highlight={highlight} depth={depth} />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: '#FFF8E9', overflow: 'visible' },
  raised: {
    borderBottomWidth: 3,
    borderBottomColor: '#2D6B56',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  flat: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#D9CCAE',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  body: { backgroundColor: '#FFF8E9' },
  standingShadow: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  lyingShadow: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  selected: { borderWidth: 2.5, borderColor: colors.primary },
  highlight: { borderWidth: 2.5, borderColor: colors.gold },
  back: { backgroundColor: '#2D6B56', borderWidth: 1.5, borderColor: '#1F4F3F' },
  badge: { position: 'absolute', right: -4, top: -6, backgroundColor: colors.ink, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
