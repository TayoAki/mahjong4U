import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, api, type ReportReason } from './api.ts';
import { useSession } from './session.tsx';
import { track } from './analytics.ts';
import { Body, Button, Chip, ErrorPanel, Notice, Sheet } from '../components/ui.tsx';
import { colors } from '../theme.ts';

// Player safety in one place: the community rules players agree to before reaching out to
// anyone, and the report and block sheets every screen opens for a player or a message.

export const COMMUNITY_RULES = [
  'Be kind. No harassment, bullying, threats or hate of any kind.',
  'Keep it clean. No sexual content, slurs or graphic language.',
  'No spam, scams or selling, and never share someone else’s personal details.',
  'Play fair. No cheating or teaming up against other players.',
];

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'sexual', label: 'Sexual content' },
  { value: 'spam', label: 'Spam or scams' },
  { value: 'cheating', label: 'Cheating' },
  { value: 'other', label: 'Something else' },
];

export interface ExtraAction {
  label: string;
  onPress: () => void;
  danger?: boolean;
}

type Target =
  | { kind: 'player'; id: string; name: string; extra: ExtraAction[] }
  | { kind: 'message'; id: string; senderId: string; name: string; body: string };

type Step = 'menu' | 'report' | 'block' | 'done';

interface Safety {
  /** Resolves true once the player has agreed to the community rules (asking if needed). */
  requireRules: () => Promise<boolean>;
  /** Runs a social action after the rules check, asking again if the server insists. */
  guard: <T>(fn: () => Promise<T>) => Promise<T | null>;
  openPlayer: (player: { id: string; name: string }, extra?: ExtraAction[]) => void;
  openMessage: (message: { id: string; senderId: string; name: string; body: string }) => void;
  openRules: () => void;
  /** Bumps whenever a block or report changes what this player should see. */
  version: number;
  /** The player most recently blocked, so a screen about them can close. */
  lastBlocked: { id: string; at: number } | null;
}

const SafetyContext = createContext<Safety>({
  requireRules: async () => true,
  guard: async (fn) => fn(),
  openPlayer: () => undefined,
  openMessage: () => undefined,
  openRules: () => undefined,
  version: 0,
  lastBlocked: null,
});

export function useSafety(): Safety {
  return useContext(SafetyContext);
}

export function SafetyProvider({ children }: { children: ReactNode }) {
  const { profile, refreshProfile } = useSession();
  const [rulesOpen, setRulesOpen] = useState<'ask' | 'read' | null>(null);
  const [agreeing, setAgreeing] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [step, setStep] = useState<Step>('menu');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState('');
  const [version, setVersion] = useState(0);
  const [lastBlocked, setLastBlocked] = useState<{ id: string; at: number } | null>(null);

  const accepted = useRef(false);
  accepted.current = accepted.current || Boolean(profile?.rulesAccepted);

  const requireRules = useCallback(() => {
    if (accepted.current) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setRulesOpen('ask');
    });
  }, []);

  const closeRules = (ok: boolean) => {
    setRulesOpen(null);
    resolver.current?.(ok);
    resolver.current = null;
  };

  const agree = async () => {
    setAgreeing(true);
    try {
      await api.acceptRules();
      accepted.current = true;
      void refreshProfile().catch(() => undefined);
      closeRules(true);
    } catch {
      closeRules(false);
    } finally {
      setAgreeing(false);
    }
  };

  const guard = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      if (!(await requireRules())) return null;
      try {
        return await fn();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'rules_required') {
          accepted.current = false;
          if (!(await requireRules())) return null;
          return fn();
        }
        throw e;
      }
    },
    [requireRules],
  );

  const open = (t: Target) => {
    setTarget(t);
    setStep('menu');
    setReason(null);
    setNote('');
    setAlsoBlock(false);
    setError(null);
  };
  const close = () => setTarget(null);

  const block = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const blockedId = target.kind === 'player' ? target.id : target.senderId;
      await api.block(blockedId);
      track('player_blocked', { from: target.kind });
      setLastBlocked({ id: blockedId, at: Date.now() });
      setDone(`You blocked ${target.name}. You won’t see each other’s messages, requests, tables or game nights. They aren’t told.`);
      setStep('done');
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const report = async () => {
    if (!target || !reason) return;
    setBusy(true);
    setError(null);
    try {
      await api.report({
        ...(target.kind === 'message' ? { messageId: target.id } : { playerId: target.id }),
        reason,
        note: note.trim() || null,
        block: alsoBlock,
      });
      track('report_filed', { kind: target.kind, reason, blocked: alsoBlock });
      if (alsoBlock) setLastBlocked({ id: target.kind === 'player' ? target.id : target.senderId, at: Date.now() });
      setDone(
        `Thanks for telling us. A person reviews every report within 24 hours and removes anything that breaks the rules.${
          target.kind === 'message' ? ' You won’t see that message again.' : ''
        }${alsoBlock ? ` ${target.name} is blocked.` : ''}`,
      );
      setStep('done');
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title =
    !target
      ? ''
      : step === 'report'
        ? target.kind === 'message'
          ? 'Report this message'
          : `Report ${target.name}`
        : step === 'block'
          ? `Block ${target.name}?`
          : step === 'done'
            ? 'Done'
            : target.kind === 'message'
              ? `Message from ${target.name}`
              : target.name;

  return (
    <SafetyContext.Provider
      value={{
        requireRules,
        guard,
        openPlayer: (player, extra = []) => open({ kind: 'player', ...player, extra }),
        openMessage: (message) => open({ kind: 'message', ...message }),
        openRules: () => setRulesOpen('read'),
        version,
        lastBlocked,
      }}
    >
      {children}

      <Sheet visible={rulesOpen !== null} title="Community rules" onClose={() => closeRules(false)}>
        <Body>Daily Rack is for friendly games. When you chat, add friends or join a game night, you agree to these rules:</Body>
        {COMMUNITY_RULES.map((rule) => (
          <View key={rule} style={styles.rule}>
            <Text style={styles.bullet}>•</Text>
            <Body style={{ flex: 1 }}>{rule}</Body>
          </View>
        ))}
        <Notice>
          We don’t tolerate objectionable content or abusive players. Messages are filtered, anyone can be reported or blocked, and we review reports within 24 hours.
          Players who break the rules lose chat and friend features.
        </Notice>
        {rulesOpen === 'ask' ? (
          <>
            <Button title="I agree" icon="check" onPress={agree} loading={agreeing} testID="agree-rules" />
            <Button title="Not now" variant="text" onPress={() => closeRules(false)} />
          </>
        ) : (
          <Button title="Close" variant="secondary" onPress={() => closeRules(false)} />
        )}
      </Sheet>

      <Sheet visible={target !== null} title={title} onClose={close}>
        {target && step === 'menu' && (
          <>
            {target.kind === 'message' && (
              <View style={styles.quote}>
                <Body>{target.body}</Body>
              </View>
            )}
            {target.kind === 'player' &&
              target.extra.map((a) => (
                <Button
                  key={a.label}
                  title={a.label}
                  variant={a.danger ? 'danger' : 'secondary'}
                  onPress={() => {
                    close();
                    a.onPress();
                  }}
                />
              ))}
            <Button title={target.kind === 'message' ? 'Report message' : `Report ${target.name}`} icon="flag" variant="secondary" onPress={() => setStep('report')} testID="safety-report" />
            <Button title={`Block ${target.name}`} icon="block" variant="danger" onPress={() => setStep('block')} testID="safety-block" />
            <Button title="Cancel" variant="text" onPress={close} />
          </>
        )}

        {target && step === 'report' && (
          <>
            <Body>What’s wrong? Your report is private; {target.name} won’t know who sent it.</Body>
            <View style={styles.reasons}>
              {REASONS.map((r) => (
                <Chip key={r.value} label={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} style={{ flexBasis: '46%' }} testID={`reason-${r.value}`} />
              ))}
            </View>
            <TextInput
              value={note}
              onChangeText={(t) => setNote(t.slice(0, 500))}
              placeholder="Anything else we should know? (optional)"
              placeholderTextColor={colors.muted}
              multiline
              style={styles.note}
              accessibilityLabel="Details for the report"
            />
            <Chip label={`Also block ${target.name}`} selected={alsoBlock} onPress={() => setAlsoBlock((v) => !v)} testID="report-also-block" />
            {error && <ErrorPanel message={error} />}
            <Button title="Send report" disabled={!reason} loading={busy} onPress={report} testID="submit-report" />
            <Button title="Back" variant="text" onPress={() => setStep('menu')} />
          </>
        )}

        {target && step === 'block' && (
          <>
            <Body>
              You won’t see each other’s messages, and they can’t send you friend requests, join your tables or open your game nights. Any friendship between you ends. They
              aren’t told. You can unblock them on the You tab.
            </Body>
            {error && <ErrorPanel message={error} />}
            <Button title={`Block ${target.name}`} variant="danger" loading={busy} onPress={block} testID="confirm-block" />
            <Button title="Back" variant="text" onPress={() => setStep('menu')} />
          </>
        )}

        {target && step === 'done' && (
          <>
            <Body testID="safety-done">{done}</Body>
            <Button title="OK" onPress={close} />
          </>
        )}
      </Sheet>
    </SafetyContext.Provider>
  );
}

const styles = StyleSheet.create({
  rule: { flexDirection: 'row', gap: 8 },
  bullet: { fontSize: 18, lineHeight: 23, color: colors.primary },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: 12, paddingVertical: 4 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { minHeight: 70, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', padding: 12, fontSize: 16, color: colors.ink, textAlignVertical: 'top' },
});
