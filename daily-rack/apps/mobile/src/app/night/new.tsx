import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../../lib/api.ts';
import { deviceTimeZone, formatWhen } from '../../lib/dates.ts';
import { track } from '../../lib/analytics.ts';
import { useSafety } from '../../lib/safety.tsx';
import { Body, Button, Chip, ErrorPanel, Heading, IconButton, Notice, Screen, TopBar } from '../../components/ui.tsx';
import { colors } from '../../theme.ts';
import { useNotifications } from '../../lib/notification-prompt.tsx';

// Any quarter hour from 8 in the morning to 11 at night, up to eight weeks out.
const HOURS = Array.from({ length: 16 }, (_, i) => 8 + i);
const MINUTES = [0, 15, 30, 45];
const DAYS = 56;

interface Slot {
  day: number;
  minutes: number;
}

function slotDate({ day, minutes }: Slot): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + day);
  d.setMinutes(minutes);
  return d;
}

const timeLabel = (minutes: number) => {
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

/** Plan a game night: a name, an optional place, and one to three times to vote on. */
export default function NewNightScreen() {
  const router = useRouter();
  const { ask } = useNotifications();
  const { guard } = useSafety();
  const timeZone = useMemo(deviceTimeZone, []);
  const [title, setTitle] = useState('Mahjong night');
  const [location, setLocation] = useState('');
  const [slots, setSlots] = useState<Slot[]>([{ day: nextWeekday(4), minutes: 19 * 60 }]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => i), []);
  const current = slots[active] ?? slots[0]!;
  const update = (change: Partial<Slot>) => setSlots((s) => s.map((x, i) => (i === active ? { ...x, ...change } : x)));
  const past = slots.some((s) => slotDate(s).getTime() <= Date.now());

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const unique = [...new Set(slots.map((s) => slotDate(s).toISOString()))];
      const night = await guard(() => api.createNight({ title: title.trim() || 'Mahjong night', location: location.trim() || null, timeZone, slots: unique }));
      if (!night) {
        setBusy(false);
        return;
      }
      track('night_created', { slots: unique.length });
      setTimeout(() => ask('night'), 1500);
      router.replace({ pathname: '/night/[id]', params: { id: night.id, created: '1' } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="Create and invite" icon="arrow" disabled={past || !title.trim()} loading={busy} onPress={create} testID="create-night" />}>
      <TopBar title="Plan a game night" onBack={() => (router.canGoBack() ? router.back() : router.replace('/nights'))} />
      {error && <ErrorPanel message={error} />}

      <View style={{ gap: 8 }}>
        <Heading>What’s it called?</Heading>
        <TextInput value={title} onChangeText={(t) => setTitle(t.slice(0, 60))} style={styles.input} accessibilityLabel="Name" testID="night-title" />
        <TextInput
          value={location}
          onChangeText={(t) => setLocation(t.slice(0, 120))}
          placeholder="Where? (optional, e.g. Rosie’s place)"
          placeholderTextColor={colors.muted}
          style={styles.input}
          accessibilityLabel="Location"
        />
      </View>

      <View style={{ gap: 10 }}>
        <Heading>When could you play?</Heading>
        <Body small muted>
          Offer up to three times. Everyone votes, then you lock one in. Times are in {timeZone.replace(/_/g, ' ')}.
        </Body>
        {slots.map((s, i) => (
          <View key={i} style={[styles.slot, i === active && styles.slotActive]}>
            <Text style={styles.slotText} onPress={() => setActive(i)} accessibilityRole="button" accessibilityLabel={`Option ${i + 1}: ${formatWhen(slotDate(s).toISOString())}`}>
              {i + 1}. {formatWhen(slotDate(s).toISOString())}
            </Text>
            {slots.length > 1 && (
              <IconButton
                icon="close"
                label={`Remove option ${i + 1}`}
                onPress={() => {
                  setSlots((x) => x.filter((_, j) => j !== i));
                  setActive(0);
                }}
              />
            )}
          </View>
        ))}
        <Body bold>Day for option {active + 1}</Body>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {days.map((day) => {
            const d = slotDate({ day, minutes: 0 });
            return (
              <Chip
                key={day}
                style={{ flexGrow: 0, minWidth: 64 }}
                label={day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                selected={current.day === day}
                onPress={() => update({ day })}
              />
            );
          })}
        </ScrollView>
        <Body bold>Time · {timeLabel(current.minutes)}</Body>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {HOURS.map((h) => (
            <Chip
              key={h}
              style={{ flexGrow: 0, minWidth: 72 }}
              label={timeLabel(h * 60).replace(/:00/, '')}
              selected={Math.floor(current.minutes / 60) === h}
              onPress={() => update({ minutes: h * 60 + (current.minutes % 60) })}
              testID={`hour-${h}`}
            />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {MINUTES.map((m) => (
            <Chip
              key={m}
              label={`:${String(m).padStart(2, '0')}`}
              selected={current.minutes % 60 === m}
              onPress={() => update({ minutes: Math.floor(current.minutes / 60) * 60 + m })}
              testID={`minute-${m}`}
            />
          ))}
        </View>
        {past && <Notice tone="warn">One of these times has already passed. Pick a later day or time.</Notice>}
        {slots.length < 3 && (
          <Button
            title="Offer another time"
            variant="secondary"
            icon="plus"
            onPress={() => {
              const last = slots[slots.length - 1]!;
              setSlots((s) => [...s, { day: Math.min(DAYS - 1, last.day + 1), minutes: last.minutes }]);
              setActive(slots.length);
            }}
            testID="add-slot"
          />
        )}
      </View>
    </Screen>
  );
}

/** Days from today until the next given weekday (0 = Sunday), at least tomorrow. */
function nextWeekday(target: number): number {
  const today = new Date().getDay();
  const diff = (target - today + 7) % 7;
  return diff === 0 ? 7 : diff;
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', paddingHorizontal: 14, fontSize: 17, color: colors.ink },
  slot: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', paddingLeft: 14, minHeight: 50 },
  slotActive: { borderColor: colors.primary, backgroundColor: colors.pink },
  slotText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink, paddingVertical: 12 },
});
