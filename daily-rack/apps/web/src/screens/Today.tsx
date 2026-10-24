import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { spokenLabel } from '@daily-rack/core';
import { api, ensureSession, type Daily } from '../lib/api.ts';
import { draftKey, readJson, type Draft } from '../lib/storage.ts';
import { BottomNav, ErrorPanel, Icon, Loading, Tile } from '../components/ui.tsx';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function TodayScreen() {
  const navigate = useNavigate();
  const [daily, setDaily] = useState<Daily | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    ensureSession()
      .then(() => api.daily())
      .then(setDaily)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, []);

  if (error) {
    return (
      <main className="screen with-nav">
        <Wordmark streak={0} />
        <ErrorPanel message={error} onRetry={load} />
        <BottomNav active="today" />
      </main>
    );
  }
  if (!daily) return <Loading label="Dealing today's rack" />;

  const streak = daily.progress?.streak ?? 0;
  const puzzle = daily.puzzle;
  const hasDraft = puzzle ? (readJson<Draft | null>(draftKey(puzzle.revisionId), null)?.selected.length ?? 0) > 0 : false;
  const action = daily.attemptId ? 'See your result' : hasDraft ? 'Resume your rack' : "Play today's rack";
  const go = () => (daily.attemptId ? navigate(`/result/${daily.attemptId}`) : navigate('/rack'));
  const todayIndex = daily.progress?.week.findIndex((d) => d.day === daily.contentDay) ?? -1;

  return (
    <main className="screen with-nav">
      <Wordmark streak={streak} />

      {puzzle ? (
        <>
          <div>
            <p className="eyebrow">Today's drop</p>
            <h1 className="display" style={{ fontSize: 40 }}>
              {puzzle.title}
            </h1>
            <p className="subtitle">One rack. Three tiles. Your call.</p>
          </div>

          <section className="hero" aria-label="Today's rack">
            <div className="wood-rack" role="img" aria-label={`Today's deal: ${puzzle.tiles.map((t) => spokenLabel(t.faceCode)).join(', ')}`}>
              <div className="row">
                {puzzle.tiles.map((t) => (
                  <Tile key={t.instanceId} faceCode={t.faceCode} flat />
                ))}
              </div>
            </div>
            <button type="button" className="primary-action" onClick={go}>
              {action} <Icon name="arrow" />
            </button>
          </section>
        </>
      ) : (
        <section className="card center-block">
          <h1 className="display">The next rack is on its way</h1>
          <p className="muted">
            It lands {new Date(daily.nextPublicationAt).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}.
          </p>
        </section>
      )}

      {daily.progress && (
        <section className="card" aria-label="This week's rhythm">
          <h2>This week's rhythm</h2>
          <div className="week">
            {daily.progress.week.map((d, i) => (
              <div key={d.day} className={`week-day${i === todayIndex ? ' today' : ''}${d.done ? ' done' : ''}`}>
                <span aria-hidden="true">{WEEKDAY_LETTERS[i]}</span>
                <span className="sr-only">
                  {new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long' })}: {d.done ? 'played' : 'not played'}
                </span>
                <div className="dot-row" aria-hidden="true">
                  <span />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {puzzle && !daily.attemptId && (
        <button type="button" className="card link-card row-button" onClick={go}>
          <span className="circle" aria-hidden="true">
            <Icon name="leaf" />
          </span>
          <span className="grow">See how your pass compares once you answer.</span>
          <Icon name="chevron" />
        </button>
      )}

      <BottomNav active="today" />
    </main>
  );
}

function Wordmark({ streak }: { streak: number }) {
  return (
    <div className="wordmark-row">
      <p className="wordmark">Daily Rack</p>
      {streak > 0 && (
        <Link to="/you" className="streak-pill" aria-label={`${streak} day streak`}>
          <Icon name="flame" size={16} /> {streak} day streak
        </Link>
      )}
    </div>
  );
}
