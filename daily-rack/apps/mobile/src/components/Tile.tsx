import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { tileSvg } from '../tiles/tileArt.ts';
import { colors } from '../theme.ts';

const RATIO = 130 / 100;
const svgCache = new Map<string, string>();
function xmlFor(face: string): string {
  let xml = svgCache.get(face);
  if (!xml) {
    xml = tileSvg(face);
    svgCache.set(face, xml);
  }
  return xml;
}

/** A tile face. `width` sets the size; height follows the 100:130 tile shape. */
export const Tile = memo(function Tile({
  face,
  width,
  flat = false,
  selected = false,
  highlight = false,
  dim = false,
  style,
}: {
  face: string;
  width: number;
  flat?: boolean;
  selected?: boolean;
  highlight?: boolean;
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const height = width * RATIO;
  return (
    <View
      style={[
        styles.tile,
        { width, height, borderRadius: width * 0.1 },
        flat ? styles.flat : styles.raised,
        selected && styles.selected,
        highlight && styles.highlight,
        dim && { opacity: 0.45 },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SvgXml xml={xmlFor(face)} width={width} height={height} />
    </View>
  );
});

/** The green back of a tile, for hands we cannot see. */
export function TileBack({ width }: { width: number }) {
  return <View style={[styles.back, { width, height: width * RATIO, borderRadius: width * 0.12 }]} />;
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
  testID,
}: {
  face: string;
  label: string;
  onPress?: () => void;
  width: number;
  selected?: boolean;
  disabled?: boolean;
  highlight?: boolean;
  badge?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected), disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={2}
      style={({ pressed }) => [{ transform: [{ translateY: selected ? -8 : pressed ? 2 : 0 }] }]}
    >
      <Tile face={face} width={width} selected={selected} highlight={highlight} />
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
  selected: { borderWidth: 2.5, borderColor: colors.primary },
  highlight: { borderWidth: 2.5, borderColor: colors.gold },
  back: { backgroundColor: '#2D6B56', borderWidth: 1.5, borderColor: '#1F4F3F' },
  badge: { position: 'absolute', right: -4, top: -6, backgroundColor: colors.ink, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
