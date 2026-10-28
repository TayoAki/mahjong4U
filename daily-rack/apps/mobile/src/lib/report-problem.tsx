import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet, TextInput, View } from 'react-native';
import { usePathname } from 'expo-router';
import { ApiError, api, type BugReport } from './api.ts';
import { queueBugReport } from './bug-reports.ts';
import { collectDetails, describeDetails, type Details } from './diagnostics.ts';
import { usePrefs } from './prefs.ts';
import { captureCurrentScreen, pickScreenshot, type Screenshot } from './screenshot.ts';
import { Body, Button, ErrorPanel, Row, Sheet } from '../components/ui.tsx';
import { colors } from '../theme.ts';

// "Report a problem": the player says what went wrong; the app adds the screen they were
// on, their device and app version, recent errors and (if they keep it) a screenshot.

export interface ReportOptions {
  /** Take a picture of the screen first (phones only), so it shows what the player saw. */
  capture?: boolean;
  /** Wait this long first, so a sheet that's closing is out of the picture. */
  delayMs?: number;
  /** Anything else worth knowing, such as the error that was thrown. */
  extra?: Details;
}

const ReportContext = createContext<{ reportProblem: (options?: ReportOptions) => void }>({ reportProblem: () => undefined });

export function useReportProblem() {
  return useContext(ReportContext);
}

export function ReportProblemProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const screen = useRef(pathname);
  screen.current = pathname;
  const [draft, setDraft] = useState<{ id: number; screen: string; screenshot: Screenshot | null; extra: Details } | null>(null);
  const [visible, setVisible] = useState(false);

  const reportProblem = useCallback((options: ReportOptions = {}) => {
    void (async () => {
      const where = screen.current;
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      const screenshot = options.capture ? await captureCurrentScreen() : null;
      setDraft({ id: Date.now(), screen: where, screenshot, extra: options.extra ?? {} });
      setVisible(true);
    })();
  }, []);
  const value = useMemo(() => ({ reportProblem }), [reportProblem]);

  return (
    <ReportContext.Provider value={value}>
      {children}
      {draft && <ReportProblemSheet key={draft.id} visible={visible} onClose={() => setVisible(false)} screen={draft.screen} screenshot={draft.screenshot} extra={draft.extra} />}
    </ReportContext.Provider>
  );
}

/** The sheet itself. The crash screen uses it directly, since nothing else is running then. */
export function ReportProblemSheet({
  visible,
  onClose,
  screen,
  screenshot: captured = null,
  extra = {},
}: {
  visible: boolean;
  onClose: () => void;
  screen: string;
  screenshot?: Screenshot | null;
  extra?: Details;
}) {
  const prefs = usePrefs();
  // Taken once, when the sheet opens, so errors from sending the report don't end up in it.
  const [details] = useState(() => collectDetails(prefs, extra));
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<Screenshot | null>(captured);
  const [picking, setPicking] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'queued'>('idle');
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setPicking(true);
    setError(null);
    try {
      const shot = await pickScreenshot();
      if (shot) setScreenshot(shot);
    } catch {
      setError('That picture couldn’t be added. Try another, or send the report without one.');
    } finally {
      setPicking(false);
    }
  };

  const send = async () => {
    const report: BugReport = { description: description.trim(), screen, details, screenshot: screenshot ? { type: screenshot.type, data: screenshot.data } : null };
    setState('sending');
    setError(null);
    try {
      await api.bugReport(report);
      setState('sent');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'network') {
        await queueBugReport(report);
        setState('queued');
      } else {
        setError((e as Error).message);
        setState('idle');
      }
    }
  };

  return (
    <Sheet visible={visible} title="Report a problem" onClose={onClose}>
      {state === 'sent' || state === 'queued' ? (
        <>
          <Body testID="problem-sent">
            {state === 'sent'
              ? 'Thanks! Your report is in. A person reads every one, and the details you sent help us track the problem down.'
              : 'You’re offline right now, so we’ll send your report as soon as you’re back online. Thanks!'}
          </Body>
          <Button title="Done" onPress={onClose} />
        </>
      ) : (
        <>
          <Body>What happened, and what did you expect to happen? A person reads every report.</Body>
          <TextInput
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, 4000))}
            placeholder="For example: I tapped Discard and nothing happened"
            placeholderTextColor={colors.muted}
            multiline
            style={styles.input}
            accessibilityLabel="What went wrong"
            testID="problem-input"
          />
          {screenshot ? (
            <Row gap={12} style={{ alignItems: 'flex-start' }}>
              <Image source={{ uri: screenshot.uri }} style={[styles.shot, { aspectRatio: screenshot.width / screenshot.height }]} accessibilityLabel="The screenshot that will be sent" testID="problem-shot" />
              <View style={{ flex: 1, gap: 6 }}>
                <Body small muted>
                  This screenshot goes with your report. Check it doesn’t show anything you’d rather keep private.
                </Body>
                <Button title="Remove it" variant="text" compact icon="trash" onPress={() => setScreenshot(null)} testID="problem-remove-shot" />
              </View>
            </Row>
          ) : (
            <Button title="Add a screenshot" variant="secondary" icon="plus" loading={picking} onPress={() => void pick()} testID="problem-add-shot" />
          )}
          <Body small muted>
            We also send the screen you were on, your device and app version, a few settings and any recent errors, so we can find the problem.
          </Body>
          <Button
            title={showDetails ? 'Hide the details' : 'See exactly what’s sent'}
            variant="text"
            compact
            onPress={() => setShowDetails((v) => !v)}
            testID="problem-details-toggle"
          />
          {showDetails && (
            <View style={styles.details} testID="problem-details">
              {describeDetails(screen, details).map((line) => (
                <Body key={line} small>
                  {line}
                </Body>
              ))}
            </View>
          )}
          {error && <ErrorPanel message={error} />}
          <Button title="Send report" icon="send" disabled={!description.trim() || picking} loading={state === 'sending'} onPress={() => void send()} testID="send-problem" />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 110, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, fontSize: 17, color: colors.ink, textAlignVertical: 'top' },
  shot: { width: 96, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
  details: { gap: 4, backgroundColor: colors.canvas, borderRadius: 12, padding: 12 },
});
