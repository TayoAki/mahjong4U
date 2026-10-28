import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Icon, type IconName } from './ui.tsx';
import { colors } from '../theme.ts';

/** A tappable row that leads to another screen: icon, title, one line of detail. */
export function LinkCard({ icon, title, body, onPress, testID }: { icon: IconName; title: string; body: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} testID={testID} style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.sage }]}>
      <View style={styles.icon}>
        <Icon name={icon} color={colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Body small muted>
          {body}
        </Body>
      </View>
      <Icon name="chevron" color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, minHeight: 72 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
});
