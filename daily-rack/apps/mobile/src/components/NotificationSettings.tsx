import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { FEATURES } from '@daily-rack/core';
import { api, type NotificationSettings as Settings } from '../lib/api.ts';
import { useNotifications } from '../lib/notification-prompt.tsx';
import { REMINDER_TIMES, readReminderPrefs, saveReminderPrefs, type ReminderPrefs } from '../lib/reminders.ts';
import { Body, Button, Card, Chip, Heading } from './ui.tsx';
import { PipSays } from './Pip.tsx';
import { colors } from '../theme.ts';

// The You tab's notification settings: which pushes to get, and Pip's daily reminder.

const KINDS: [keyof Settings, string, string][] = [
  ['turns', 'Your move', 'Turn-based games, and when your match is ready'],
  ['invites', 'Invites and friends', 'Seats saved for you and friend requests'],
  ['messages', 'Messages', 'From friends, at most one a minute per chat'],
  ['nights', 'Game Night', 'When the time is set, who’s coming, changes'],
];

function Toggle({ label, detail, value, onChange, testID }: { label: string; detail: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor="#fff"
        accessibilityLabel={label}
        accessibilityHint={detail}
        testID={testID}
      />
    </View>
  );
}

export function NotificationSettings() {
  const { state, ask, refresh } = useNotifications();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [reminders, setReminders] = useState<ReminderPrefs | null>(null);

  useEffect(() => {
    if (state !== 'granted') return;
    api
      .notificationSettings()
      .then((r) => setSettings(r.settings))
      .catch(() => undefined);
    void readReminderPrefs().then(setReminders);
  }, [state]);

  const change = (key: keyof Settings, value: boolean) => {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    api.updateNotificationSettings({ [key]: value }).catch(() => setSettings((s) => (s ? { ...s, [key]: !value } : s)));
  };

  const changeReminders = (next: ReminderPrefs) => {
    setReminders(next);
    void saveReminderPrefs(next).then(refresh);
  };

  return (
    <Card style={{ gap: 12 }} testID="notification-settings">
      <Heading>Notifications</Heading>
      {state === 'unsupported' ? (
        <Body small muted>
          Pip’s reminders and “your move” alerts come with the iPhone and Android app. Here, look for the badges on the Play and Friends tabs.
        </Body>
      ) : state !== 'granted' ? (
        <>
          <PipSays mood="wave">
            Want a nudge when it’s your move, or a reminder {FEATURES.dailyRack ? 'for today’s rack' : 'to play or learn'}? You pick what you hear about.
          </PipSays>
          <Button title="Turn on notifications" icon="check" variant="secondary" onPress={() => ask('settings')} testID="notify-settings-on" />
        </>
      ) : (
        <>
          {settings && KINDS.map(([key, label, detail]) => <Toggle key={key} label={label} detail={detail} value={settings[key]} onChange={(v) => change(key, v)} testID={`notify-${key}`} />)}
          {reminders && (
            <>
              <Toggle
                label="Reminders from Pip"
                detail={`One a day at most, ${FEATURES.dailyRack ? 'for today’s rack' : 'for a lesson or a game'}. Pip goes quiet if you take a break.`}
                value={reminders.on}
                onChange={(on) => changeReminders({ ...reminders, on })}
                testID="notify-reminders"
              />
              {reminders.on && (
                <View style={styles.times}>
                  {REMINDER_TIMES.map((t) => (
                    <Chip key={t.value} label={t.label} selected={reminders.time === t.value} onPress={() => changeReminders({ ...reminders, time: t.value })} />
                  ))}
                </View>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  label: { fontSize: 16, fontWeight: '600', color: colors.ink },
  detail: { fontSize: 13, color: colors.muted, marginTop: 1 },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
