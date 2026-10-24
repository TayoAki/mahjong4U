import { useEffect, useState } from 'react';
import { api, ensureSession, type Progress } from '../lib/api.ts';
import { clearAll, readPrefs, writeJson, PREFS_KEY, type Preferences } from '../lib/storage.ts';
import { BottomNav, ErrorPanel, Loading, Sheet } from '../components/ui.tsx';

export function YouScreen() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(readPrefs);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setError(null);
    ensureSession()
      .then(() => api.progress())
      .then(setProgress)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, []);

  const updatePrefs = (next: Preferences) => {
    setPrefs(next);
    writeJson(PREFS_KEY, next);
  };

  const deleteEverything = async () => {
    setDeleting(true);
    try {
      await api.deleteMe();
      clearAll();
      window.location.assign('/');
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
      setConfirming(false);
    }
  };

  const maxSection = Math.max(1, ...(progress?.sections.map((s) => s.count) ?? [1]));

  return (
    <main className="screen with-nav">
      <div className="wordmark-row">
        <h1 className="wordmark">You</h1>
      </div>
      {error && <ErrorPanel message={error} onRetry={load} />}
      {!progress && !error && <Loading />}
      {progress && (
        <>
          <div className="stats">
            <div className="stat">
              <strong>{progress.streak}</strong>
              <span>day streak</span>
            </div>
            <div className="stat">
              <strong>{progress.bestStreak}</strong>
              <span>best streak</span>
            </div>
            <div className="stat">
              <strong>{progress.racksSolved}</strong>
              <span>racks solved</span>
            </div>
            <div className="stat">
              <strong>{progress.strongPasses}</strong>
              <span>matched a strong pass</span>
            </div>
          </div>

          <section className="card">
            <h2>Sections you practise</h2>
            {progress.sections.length === 0 ? (
              <p className="muted" style={{ margin: '8px 0 0' }}>
                Play a rack to start your record.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {progress.sections.map((s) => (
                  <div key={s.label} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 28px', gap: 10, alignItems: 'center' }}>
                    <span>{s.label}</span>
                    <div className="split-bar">
                      <span style={{ width: `${(s.count / maxSection) * 100}%` }} />
                    </div>
                    <strong style={{ textAlign: 'right' }}>{s.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section className="card">
        <h2>Clip captions</h2>
        <div className="segmented" style={{ marginTop: 12 }}>
          <button type="button" aria-pressed={prefs.captionStyle === 'blue'} onClick={() => updatePrefs({ ...prefs, captionStyle: 'blue' })}>
            Blue
          </button>
          <button type="button" aria-pressed={prefs.captionStyle === 'magenta'} onClick={() => updatePrefs({ ...prefs, captionStyle: 'magenta' })}>
            Magenta
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Your data</h2>
        <p className="muted small" style={{ margin: '6px 0 12px' }}>
          You are playing as a guest on this device. Voiceovers never leave your phone. Deleting removes your answers, links and
          progress, and takes your answers out of the community split.
        </p>
        <button type="button" className="secondary-action" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => setConfirming(true)}>
          Delete my data
        </button>
      </section>

      <section className="card">
        <h2>About</h2>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          Daily Rack is an independent practice app. It is not affiliated with or endorsed by the National Mah Jongg League and
          does not reproduce any official card. Check hands against your own card. Suggestions are one strong pass, not the only
          right answer.
        </p>
      </section>

      {confirming && (
        <Sheet title="Delete your data?" onClose={() => setConfirming(false)}>
          <p style={{ margin: 0 }}>This removes your streak, answers and share links for good. It cannot be undone.</p>
          <button type="button" className="primary-action" style={{ background: 'var(--danger)' }} disabled={deleting} onClick={deleteEverything}>
            {deleting ? 'Deleting…' : 'Delete everything'}
          </button>
          <button type="button" className="text-button" onClick={() => setConfirming(false)}>
            Keep my data
          </button>
        </Sheet>
      )}
      <BottomNav active="you" />
    </main>
  );
}
