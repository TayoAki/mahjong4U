import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api, ensureSession, type SharedRack } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { RackPlay } from '../components/RackPlay.tsx';
import { ErrorPanel, Loading, TopBar } from '../components/ui.tsx';

/** Exact-rack entry from a shared clip or link. Plays in the browser with no install. */
export function SharedRackScreen() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [rack, setRack] = useState<SharedRack | null>(null);
  const [error, setError] = useState<{ message: string; gone: boolean } | null>(null);

  const load = () => {
    setError(null);
    ensureSession()
      .then(() => api.sharedRack(token))
      .then((r) => {
        track('shared_link_opened', { linkId: r.linkId, revisionId: r.puzzle.revisionId });
        if (r.attemptId) navigate(`/result/${r.attemptId}`, { replace: true });
        else setRack(r);
      })
      .catch((e: Error) =>
        setError({ message: e.message, gone: e instanceof ApiError && (e.status === 404 || e.status === 410) }),
      );
  };
  useEffect(load, [token]);

  return (
    <main className="screen">
      <TopBar title={rack?.isTodaysRack ? "Today's rack" : 'Shared rack'} />
      {error && (
        <>
          <ErrorPanel message={error.message} onRetry={error.gone ? undefined : load} />
          <button type="button" className="primary-action" onClick={() => navigate('/rack')}>
            Play today's rack instead
          </button>
        </>
      )}
      {!error && !rack && <Loading label="Opening the shared rack" />}
      {rack && (
        <>
          <p className="notice small" style={{ margin: 0 }}>
            Someone shared this exact rack with you.
            {rack.posterPassPublished ? ' Answer it to see their pass next to yours.' : ''}
          </p>
          <RackPlay
            puzzle={rack.puzzle}
            shareToken={token}
            source="shared-link"
            onSubmitted={(id) => navigate(`/result/${id}`, { replace: true })}
          />
        </>
      )}
    </main>
  );
}
