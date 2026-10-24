import { useEffect, useMemo, useRef, useState } from 'react';
import { PASS_SIZE, isPassable, sortBySuit, spokenLabel, type PublicPuzzle } from '@daily-rack/core';
import { ApiError, api, ensureSession } from '../lib/api.ts';
import { draftKey, readJson, remove, writeJson, type Draft } from '../lib/storage.ts';
import { track } from '../lib/analytics.ts';
import { ErrorPanel, Icon, ReviewNotice, TileButton } from './ui.tsx';

interface Props {
  puzzle: PublicPuzzle;
  shareToken?: string;
  source: 'today' | 'first-open' | 'shared-link';
  onSubmitted: (attemptId: string) => void;
}

/** Section chips, the 13-tile deal and the three-slot pass tray. Tap-only; no dragging needed. */
export function RackPlay({ puzzle, shareToken, source, onSubmitted }: Props) {
  const key = draftKey(puzzle.revisionId);
  const [draft, setDraft] = useState<Draft>(() =>
    readJson<Draft>(key, { sectionId: null, selected: [], idempotencyKey: crypto.randomUUID() }),
  );
  const [sorted, setSorted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trayError, setTrayError] = useState<string | null>(null);
  const announce = useRef<HTMLParagraphElement>(null);

  useEffect(() => writeJson(key, draft), [key, draft]);
  useEffect(() => {
    track('rack_opened', { revisionId: puzzle.revisionId, source });
  }, [puzzle.revisionId, source]);

  // Keep only ids that still exist in this deal, so a stale draft can never submit a ghost tile.
  const known = useMemo(() => new Set(puzzle.tiles.map((t) => t.instanceId)), [puzzle.tiles]);
  const selected = draft.selected.filter((id) => known.has(id));
  const byId = useMemo(() => new Map(puzzle.tiles.map((t) => [t.instanceId, t])), [puzzle.tiles]);
  const remaining = (sorted ? sortBySuit(puzzle.tiles) : puzzle.tiles).filter((t) => !selected.includes(t.instanceId));
  const section = puzzle.sections.find((s) => s.id === draft.sectionId) ?? null;
  const canSubmit = section !== null && selected.length === PASS_SIZE && !submitting;

  const say = (text: string) => {
    if (announce.current) announce.current.textContent = text;
  };

  const choose = (id: string) => {
    const tile = byId.get(id);
    if (!tile) return;
    if (!isPassable(tile.faceCode)) {
      setTrayError('Jokers can never be passed.');
      say('Jokers can never be passed.');
      return;
    }
    if (selected.length >= PASS_SIZE) {
      setTrayError('Choose 3 tiles. Tap one in your pass to swap it out.');
      say('Your pass is full. Tap a tile in your pass to swap it out.');
      return;
    }
    setTrayError(null);
    setDraft((d) => ({ ...d, selected: [...selected, id], idempotencyKey: crypto.randomUUID() }));
    say(`${spokenLabel(tile.faceCode)}, selected, pass slot ${selected.length + 1} of 3.`);
  };

  const unchoose = (id: string) => {
    const tile = byId.get(id);
    setTrayError(null);
    setDraft((d) => ({ ...d, selected: selected.filter((s) => s !== id), idempotencyKey: crypto.randomUUID() }));
    if (tile) say(`${spokenLabel(tile.faceCode)} returned to your rack.`);
  };

  const submit = async () => {
    if (!section || selected.length !== PASS_SIZE) return;
    setSubmitting(true);
    setError(null);
    try {
      await ensureSession();
      const res = await api.submit({
        revisionId: puzzle.revisionId,
        sectionId: section.id,
        tileInstanceIds: selected,
        idempotencyKey: draft.idempotencyKey,
        shareToken,
      });
      remove(key);
      onSubmitted(res.attemptId);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'already_submitted' && typeof e.extra.attemptId === 'string') {
        remove(key);
        onSubmitted(e.extra.attemptId);
        return;
      }
      // Same idempotency key on retry, so an uncertain network outcome is never counted twice.
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Your pass is saved; try again.');
      setSubmitting(false);
    }
  };

  const reason = !section ? 'Pick a section first.' : selected.length < PASS_SIZE ? `Choose ${PASS_SIZE - selected.length} more tile${PASS_SIZE - selected.length === 1 ? '' : 's'}.` : '';

  return (
    <>
      <div>
        <h2 className="display center">{puzzle.question}</h2>
        <p className="subtitle center">{puzzle.prompt}</p>
      </div>
      <ReviewNotice reviewed={puzzle.review.teacherReviewed} />

      <div className="chips" role="group" aria-label="Section to aim for">
        {puzzle.sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className="chip"
            aria-pressed={draft.sectionId === s.id}
            onClick={() => setDraft((d) => ({ ...d, sectionId: s.id, idempotencyKey: crypto.randomUUID() }))}
          >
            {s.label}
          </button>
        ))}
      </div>

      <section className="felt" aria-label="Your deal">
        <div className="felt-head">
          <span>
            Your deal · {puzzle.tiles.length} tiles
          </span>
          <button type="button" aria-pressed={sorted} onClick={() => setSorted((v) => !v)}>
            Sort <Icon name="sort" size={18} />
          </button>
        </div>

        <div className="deal">
          {remaining.map((t) => (
            <TileButton
              key={t.instanceId}
              faceCode={t.faceCode}
              label={`${t.spokenLabel ?? spokenLabel(t.faceCode)}${isPassable(t.faceCode) ? '' : ', cannot be passed'}`}
              onClick={() => choose(t.instanceId)}
              badge={isPassable(t.faceCode) ? undefined : 'Keep'}
            />
          ))}
        </div>

        <div className={`tray${trayError ? ' error' : ''}`}>
          <div className="tray-inner">
            <div className="tray-head">
              <span>Your pass</span>
              <span>{selected.length} of 3 selected</span>
            </div>
            <div className="tray-slots">
              {[0, 1, 2].map((i) => {
                const id = selected[i];
                const tile = id ? byId.get(id) : undefined;
                return tile ? (
                  <TileButton
                    key={tile.instanceId}
                    faceCode={tile.faceCode}
                    label={`${spokenLabel(tile.faceCode)}, in pass slot ${i + 1} of 3. Tap to return it.`}
                    onClick={() => unchoose(tile.instanceId)}
                  />
                ) : (
                  <div key={`slot-${i}`} className="slot" aria-hidden="true">
                    {i + 1}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <p className="felt-hint">{trayError ?? 'Tap a tile to pass it. Tap it again to change your mind.'}</p>
      </section>

      <p ref={announce} className="sr-only" aria-live="polite" />
      {error && <ErrorPanel message={error} onRetry={submit} />}

      <div className="sticky-actions">
        <button type="button" className="primary-action" disabled={!canSubmit} onClick={submit} aria-describedby="submit-reason">
          {submitting ? 'Locking in your pass…' : 'See the split'}
          {!submitting && <Icon name="arrow" />}
        </button>
        <p id="submit-reason" className="action-hint">
          {reason || 'Your first answer is the one that counts.'}
        </p>
      </div>
    </>
  );
}
