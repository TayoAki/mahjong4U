import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ensureSession, type Daily } from '../lib/api.ts';
import { FIRST_OPEN_KEY, PREFS_ASKED_KEY, PREFS_KEY, readJson, readPrefs, writeJson, type Preferences } from '../lib/storage.ts';
import { RackPlay } from '../components/RackPlay.tsx';
import { ErrorPanel, Icon, Loading, Sheet, TopBar } from '../components/ui.tsx';

export function RackScreen() {
  const navigate = useNavigate();
  const [daily, setDaily] = useState<Daily | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const firstOpen = !readJson<boolean>(FIRST_OPEN_KEY, false);
  const [askPrefs, setAskPrefs] = useState(() => firstOpen && !readJson<boolean>(PREFS_ASKED_KEY, false));

  const load = () => {
    setError(null);
    ensureSession()
      .then(() => api.daily())
      .then((d) => {
        if (d.attemptId) navigate(`/result/${d.attemptId}`, { replace: true });
        else setDaily(d);
      })
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, []);

  const helpButton = (
    <button type="button" className="icon-button" aria-label="How to play" onClick={() => setHelp(true)}>
      <Icon name="help" />
    </button>
  );

  return (
    <main className="screen">
      <TopBar title="Today's rack" back={firstOpen ? undefined : '/today'} right={helpButton} />
      {error && <ErrorPanel message={error} onRetry={load} />}
      {!error && !daily && <Loading label="Dealing today's rack" />}
      {daily && !daily.puzzle && (
        <div className="center-block">
          <h2 className="display">The next rack is on its way</h2>
          <button type="button" className="secondary-action" onClick={() => navigate('/today')}>
            Back to Today
          </button>
        </div>
      )}
      {daily?.puzzle && (
        <RackPlay
          puzzle={daily.puzzle}
          source={firstOpen ? 'first-open' : 'today'}
          onSubmitted={(id) => navigate(`/result/${id}`, { replace: true })}
        />
      )}
      {help && <HelpSheet onClose={() => setHelp(false)} />}
      {askPrefs && <PreferencesSheet onDone={() => setAskPrefs(false)} />}
    </main>
  );
}

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="How it works" onClose={onClose}>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
        <li>Pick the section of the card you would aim for with this rack.</li>
        <li>Choose the three tiles you would pass in the first Charleston.</li>
        <li>See one strong pass with the reasoning, and how everyone else passed.</li>
        <li>Turn your answer into a vertical clip to share.</li>
      </ol>
      <p className="muted small" style={{ margin: 0 }}>
        Jokers can never be passed. Everyone gets the same rack each day, and your first answer is the one that counts.
        Check hands against your own card: this app never reproduces it.
      </p>
      <button type="button" className="primary-action" onClick={onClose}>
        Got it
      </button>
    </Sheet>
  );
}

/** Two optional taps on first open. Skipping is always fine. */
export function PreferencesSheet({ onDone }: { onDone: () => void }) {
  const [prefs, setPrefs] = useState<Preferences>(readPrefs);
  const finish = (save: boolean) => {
    if (save) writeJson(PREFS_KEY, prefs);
    writeJson(PREFS_ASKED_KEY, true);
    onDone();
  };
  return (
    <Sheet title="Quick question" onClose={() => finish(false)}>
      <div>
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Which card do you play?</p>
        <div className="option-grid">
          {(
            [
              ['this-year', "This year's card"],
              ['learning', "I'm learning"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" className="chip" aria-pressed={prefs.card === value} onClick={() => setPrefs({ ...prefs, card: value })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>How often do you play?</p>
        <div className="option-grid three">
          {(
            [
              ['new', "I'm new"],
              ['weekly', 'Weekly'],
              ['teach', 'I teach'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" className="chip" aria-pressed={prefs.frequency === value} onClick={() => setPrefs({ ...prefs, frequency: value })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="primary-action" onClick={() => finish(true)}>
        Deal my rack
      </button>
      <button type="button" className="text-button" onClick={() => finish(false)}>
        Skip
      </button>
    </Sheet>
  );
}
