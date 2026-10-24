import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatRate, spokenLabel } from '@daily-rack/core';
import { ApiError, api, ensureSession, type ResultResponse } from '../lib/api.ts';
import { FIRST_OPEN_KEY, writeJson } from '../lib/storage.ts';
import { track } from '../lib/analytics.ts';
import { ErrorPanel, Icon, Loading, MiniTiles, ReviewNotice, Tile, TopBar } from '../components/ui.tsx';

export function ResultScreen() {
  const { attemptId = '' } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    ensureSession()
      .then(() => api.result(attemptId))
      .then((r) => {
        setResult(r);
        writeJson(FIRST_OPEN_KEY, true);
        track('result_viewed', { attemptId, splitShown: r.split.minimumSampleMet });
      })
      .catch((e: Error) => setError(e instanceof ApiError && e.status === 404 ? 'That result is not available on this device.' : e.message));
  };
  useEffect(load, [attemptId]);

  if (error) {
    return (
      <main className="screen">
        <TopBar title="Your result" back="/today" />
        <ErrorPanel message={error} onRetry={load} />
      </main>
    );
  }
  if (!result) return <Loading label="Comparing passes" />;

  const faceOf = new Map(result.puzzle.tiles.map((t) => [t.instanceId, t.faceCode]));
  const faces = (ids: string[]) => ids.map((id) => faceOf.get(id) ?? '');
  const { suggestion, split, progress } = result;
  const sameSection = result.section.id === result.suggestedSection.id;

  return (
    <main className="screen">
      <TopBar title="Your result" back="/today" />

      <div style={{ textAlign: 'center' }}>
        <h2 className="display">{result.alignmentCopy}</h2>
        <p style={{ margin: '10px 0 0' }}>
          <span className="badge">{result.section.label}</span>
        </p>
      </div>

      <div className="compare">
        <section className="card" aria-label="Your pass">
          <h3>Your pass</h3>
          <MiniTiles faceCodes={faces(result.attempt.tileInstanceIds)} label="Your pass" />
        </section>
        <section className="card" aria-label="One strong pass">
          <h3>{suggestion.label}</h3>
          <MiniTiles faceCodes={faces(suggestion.tileInstanceIds)} label={suggestion.label} />
          {!sameSection && <p className="muted small" style={{ margin: '8px 0 0' }}>aiming for {result.suggestedSection.label}</p>}
        </section>
      </div>

      {result.poster && (
        <section className="card" aria-label="Their pass">
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>The pass that was shared with you</h3>
          <div style={{ maxWidth: 'calc(50% - 5px)' }}>
            <MiniTiles faceCodes={faces(result.poster.tileInstanceIds)} label="Their pass" />
          </div>
        </section>
      )}

      <section className="card sage">
        <div style={{ display: 'flex', gap: 12 }}>
          <span aria-hidden="true" style={{ color: 'var(--ink)' }}>
            <Icon name="leaf" size={28} />
          </span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>{suggestion.headline}</p>
            <p style={{ margin: '4px 0 0' }}>{suggestion.explanation}</p>
          </div>
        </div>
        <ul className="reason-list">
          {suggestion.tileInstanceIds.map((id) => (
            <li key={id}>
              <Tile faceCode={faceOf.get(id) ?? ''} flat />
              <span>
                <span className="sr-only">{spokenLabel(faceOf.get(id) ?? '')}: </span>
                {suggestion.reasons[id]}
              </span>
            </li>
          ))}
        </ul>
        {result.alternates.length > 0 && (
          <p className="small" style={{ margin: '12px 0 0' }}>
            <strong>Also strong: </strong>
            {result.alternates[0]!.note}
          </p>
        )}
      </section>

      <section aria-label="The community split">
        <h2 className="section-title">The community split</h2>
        {split.minimumSampleMet ? (
          <>
            <p className="muted small" style={{ margin: '2px 0 12px' }}>
              Share of {split.eligibleAttemptCount} players passing each tile (counted separately)
            </p>
            <SplitBars result={result} />
            {split.syntheticAttemptCount > 0 && (
              <p className="notice small" style={{ marginTop: 12 }}>
                Includes {split.syntheticAttemptCount} demo answers for testing.
              </p>
            )}
          </>
        ) : (
          <div className="card" style={{ marginTop: 10 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>More players are weighing in.</p>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              {split.eligibleAttemptCount} {split.eligibleAttemptCount === 1 ? 'answer' : 'answers'} so far. The split appears once{' '}
              {split.threshold} players have passed.
            </p>
          </div>
        )}
      </section>

      {result.attempt.isDaily && progress.streak > 0 && (
        <section className="card pink" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ color: '#D9475A' }} aria-hidden="true">
            <Icon name="flame" size={36} />
          </span>
          <div>
            <p style={{ margin: 0, color: 'var(--primary)', fontFamily: 'var(--serif)', fontSize: 22 }}>
              {progress.streak} {progress.streak === 1 ? 'day' : 'days'}. {progress.streak === 1 ? 'A fresh start.' : 'Nicely played.'}
            </p>
            <p className="muted small" style={{ margin: 0 }}>
              {progress.milestone ? 'A milestone worth sharing.' : 'Keep the momentum going.'}
            </p>
          </div>
        </section>
      )}

      <ReviewNotice reviewed={result.review.teacherReviewed} />

      <div className="sticky-actions">
        <button type="button" className="primary-action" onClick={() => navigate(`/clip/${result.attempt.id}`)}>
          Make my clip <Icon name="arrow" />
        </button>
        {!result.attempt.isDaily && (
          <button type="button" className="secondary-action" onClick={() => navigate('/today')}>
            Play today's rack
          </button>
        )}
      </div>
    </main>
  );
}

function SplitBars({ result }: { result: ResultResponse }) {
  const mine = new Set(result.attempt.tileInstanceIds);
  const shown = new Set([...result.attempt.tileInstanceIds, ...result.suggestion.tileInstanceIds]);
  const faceOf = new Map(result.puzzle.tiles.map((t) => [t.instanceId, t.faceCode]));
  const rows = result.split.rows.filter((r) => shown.has(r.tileInstanceId)).sort((a, b) => b.rate - a.rate);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.tileInstanceId} className={`split-row ${mine.has(r.tileInstanceId) ? 'mine' : 'other'}`}>
          <Tile faceCode={faceOf.get(r.tileInstanceId) ?? ''} flat />
          <div className="split-bar" role="img" aria-label={`${spokenLabel(faceOf.get(r.tileInstanceId) ?? '')}: ${formatRate(r.rate)} passed it${mine.has(r.tileInstanceId) ? ', you passed it too' : ''}`}>
            <span style={{ width: formatRate(r.rate) }} />
          </div>
          <strong>{formatRate(r.rate)}</strong>
        </div>
      ))}
    </div>
  );
}
