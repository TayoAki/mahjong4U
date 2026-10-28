import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PLUS } from '@daily-rack/core';
import { usePlus } from '../lib/plus.tsx';
import { Pip } from './Pip.tsx';
import { Icon } from './ui.tsx';
import { colors, fonts } from '../theme.ts';

/** Daily Rack Plus at a glance: membership, or a gentle invitation to look. */
export function PlusCard() {
  const { plus, status, openPlus } = usePlus();
  const until = status?.until ? new Date(status.until).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
  return (
    <Pressable
      onPress={() => openPlus()}
      accessibilityRole="button"
      accessibilityLabel={plus ? `${PLUS.name}: you're a member` : `${PLUS.name}: see what it adds`}
      style={({ pressed }) => [styles.card, plus && styles.member, pressed && { opacity: 0.85 }]}
      testID="plus-card"
    >
      <Pip mood={plus ? 'proud' : 'happy'} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.title, plus && { color: '#fff' }]}>{PLUS.name}</Text>
        <Text style={[styles.body, plus && { color: 'rgba(255,255,255,0.9)' }]}>
          {plus
            ? status?.source === 'everyone'
              ? 'On for everyone right now. Enjoy!'
              : `You’re a member${until ? `${status?.willRenew ? ', renews' : ' until'} ${until}` : ''}. Thank you!`
            : 'Unlimited play on the 2026 card, hosting friends on it, and ranked games.'}
        </Text>
      </View>
      <Icon name="chevron" color={plus ? '#fff' : colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.pink, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#F3C6E3' },
  member: { backgroundColor: colors.primary, borderColor: colors.primary },
  title: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  body: { fontSize: 14, lineHeight: 19, color: colors.ink },
});
