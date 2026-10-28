import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from './api.ts';
import { LESSONS } from '../lessons/content.ts';
import { useLessonProgress } from '../lessons/progress.ts';
import { clearBadge, configureNotifications, onNotificationTap, openNotificationSettings, pushState, registerPushToken, requestPush, type PushState } from './notifications';
import { refreshReminders } from './reminders.ts';
import { useSession } from './session.tsx';
import { readJson, writeJson } from './storage.ts';
import { Button, Icon, Sheet, type IconName } from '../components/ui.tsx';
import { Pip } from '../components/Pip.tsx';
import { colors } from '../theme.ts';

// Asking for notifications the friendly way: Pip explains what they're for at a moment
// they make sense (a turn-based game, a friend request, after the first rack), and only
// then does the phone show its own prompt. "Not now" is respected for a week.

export type AskReason = 'first-rack' | 'first-lesson' | 'turn-table' | 'friend' | 'night' | 'settings';

const DISMISSED_KEY = 'dr:notify-dismissed';
const WEEK = 7 * 24 * 3_600_000;

const LEAD: Record<AskReason, string> = {
  'first-rack': 'Nice first rack! Want Pip to remind you when tomorrow’s is ready?',
  'first-lesson': 'Lesson one, done! Want a gentle nudge to keep learning?',
  'turn-table': 'Turn-based games wait for you. Pip can tell you when it’s your move.',
  friend: 'Pip can let you know when your friend says yes, and when friends message you.',
  night: 'Pip can tell you when the time is set, and remind you before the game.',
  settings: 'Pip only nudges you when it matters. You choose which kinds.',
};

const PERKS: [IconName, string][] = [
  ['play', 'When it’s your move in a turn-based game'],
  ['users', 'Table invites, friend requests and messages'],
  ['calendar', 'Game Night plans, and a reminder before you go'],
  ['flame', 'A daily reminder for today’s rack, at a time you pick'],
];

interface NotificationsContext {
  state: PushState;
  /** Offers notifications (once a week at most, unless it's from Settings). */
  ask: (reason: AskReason) => void;
  /** Re-reads the permission and reschedules reminders, e.g. after changing reminder settings. */
  refresh: () => void;
}

const Ctx = createContext<NotificationsContext>({ state: 'unsupported', ask: () => undefined, refresh: () => undefined });

export function useNotifications(): NotificationsContext {
  return useContext(Ctx);
}

configureNotifications();

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, offline } = useSession();
  const { done, loaded } = useLessonProgress();
  const [state, setState] = useState<PushState>('unsupported');
  const [asking, setAsking] = useState<AskReason | null>(null);
  const [step, setStep] = useState<'offer' | 'thanks' | 'blocked'>('offer');
  const lessons = useRef({ done, loaded });
  lessons.current = { done, loaded };

  // Reschedules Pip's reminders from today's progress.
  const refresh = useCallback(() => {
    void (async () => {
      const now = await pushState();
      setState(now);
      if (now !== 'granted' || !ready) return;
      const daily = await api.daily().catch(() => null);
      const next = lessons.current.loaded ? LESSONS.find((l) => !lessons.current.done.has(l.id)) : undefined;
      await refreshReminders({
        streak: daily?.progress?.streak ?? 0,
        playedToday: daily?.progress?.playedToday ?? false,
        nextLesson: next ? { id: next.id, title: next.title, minutes: next.minutes } : null,
      }).catch(() => undefined);
    })();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    void pushState().then((s) => {
      setState(s);
      // Tokens can change; tell the server each time the app starts.
      if (s === 'granted' && !offline) void registerPushToken();
    });
    refresh();
    void clearBadge();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      refresh();
      void clearBadge();
    });
    return () => sub.remove();
  }, [ready, offline, refresh]);

  // Tapping a notification opens what it's about.
  useEffect(() => onNotificationTap((url) => router.push(url as never)), [router]);

  const ask = useCallback(
    (reason: AskReason) => {
      void (async () => {
        const now = await pushState();
        setState(now);
        if (now === 'unsupported' || now === 'granted') return;
        if (reason !== 'settings') {
          const dismissed = await readJson<number>(DISMISSED_KEY, 0);
          if (Date.now() - dismissed < WEEK) return;
        }
        setStep(now === 'denied' ? 'blocked' : 'offer');
        setAsking(reason);
      })();
    },
    [],
  );

  const turnOn = async () => {
    if (step === 'blocked') {
      openNotificationSettings();
      setAsking(null);
      return;
    }
    const result = await requestPush();
    setState(result);
    if (result === 'granted') {
      setStep('thanks');
      refresh();
    } else {
      setAsking(null);
    }
  };

  const notNow = () => {
    if (asking !== 'settings') void writeJson(DISMISSED_KEY, Date.now());
    setAsking(null);
  };

  const value = useMemo(() => ({ state, ask, refresh }), [state, ask, refresh]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <Sheet visible={asking !== null} title={step === 'thanks' ? 'You’re all set' : 'Want a nudge from Pip?'} onClose={notNow}>
        <View style={styles.hero}>
          <Pip mood={step === 'thanks' ? 'cheer' : 'wave'} size={96} />
        </View>
        {step === 'thanks' ? (
          <>
            <Text style={styles.lead}>Pip will only nudge you when it matters. Change what you hear about any time on the You tab.</Text>
            <Button title="Sounds good" onPress={() => setAsking(null)} testID="notify-done" />
          </>
        ) : (
          <>
            <Text style={styles.lead}>{asking ? LEAD[asking] : ''}</Text>
            <View style={{ gap: 10 }}>
              {PERKS.map(([icon, text]) => (
                <View key={text} style={styles.perk}>
                  <Icon name={icon} size={20} color={colors.primary} />
                  <Text style={styles.perkText}>{text}</Text>
                </View>
              ))}
            </View>
            {step === 'blocked' && <Text style={styles.note}>Notifications are turned off for Daily Rack in your phone’s Settings. Turn them on there, then come back.</Text>}
            <Button title={step === 'blocked' ? 'Open Settings' : 'Turn on notifications'} icon="check" onPress={() => void turnOn()} testID="notify-yes" />
            <Button title="Not now" variant="text" onPress={notNow} testID="notify-later" />
          </>
        )}
      </Sheet>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center' },
  lead: { fontSize: 17, lineHeight: 24, color: colors.ink, textAlign: 'center' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perkText: { flex: 1, fontSize: 16, color: colors.ink },
  note: { fontSize: 14, color: colors.muted, textAlign: 'center' },
});
