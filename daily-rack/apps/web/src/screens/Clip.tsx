import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { REASON_MAX_CHARS, VOICEOVER_MAX_SECONDS, buildClipTimeline, spokenLabel, type ClipTimeline } from '@daily-rack/core';
import { api, ensureSession, getConfig, type AppConfig, type ResultResponse } from '../lib/api.ts';
import { readPrefs, writeJson, PREFS_KEY } from '../lib/storage.ts';
import { track } from '../lib/analytics.ts';
import { drawFrame, loadAssets, type CaptionStyle, type RenderAssets } from '../clip/renderer.ts';
import { ExportCancelled, canExportMp4, exportClip, type ExportResult } from '../clip/exporter.ts';
import { ErrorPanel, Icon, Loading, TopBar } from '../components/ui.tsx';

interface Voice {
  blob: Blob;
  url: string;
  buffer: AudioBuffer;
  seconds: number;
}

export function ClipScreen() {
  const { attemptId = '' } = useParams();
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [assets, setAssets] = useState<RenderAssets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [style, setStyle] = useState<CaptionStyle>(() => readPrefs().captionStyle);
  const [publishPass, setPublishPass] = useState(false);
  const [link, setLink] = useState<{ path: string; url: string | null } | null>(null);
  const [voice, setVoice] = useState<Voice | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureSession()
      .then(() => Promise.all([api.result(attemptId), getConfig()]))
      .then(async ([r, c]) => {
        if (cancelled) return;
        const passReasons: Record<string, string> = {};
        const section = r.section.label;
        for (const id of r.attempt.tileInstanceIds) {
          passReasons[id] = r.suggestion.reasons[id] ?? `Not part of my ${section} plan.`;
        }
        setReasons(passReasons);
        setResult(r);
        setConfig(c);
        const loaded = await loadAssets(r.puzzle.tiles.map((t) => t.faceCode));
        if (!cancelled) setAssets(loaded);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  useEffect(() => {
    if (!result) return;
    api
      .createShareLink(result.attempt.id, publishPass)
      .then(setLink)
      .catch(() => setLink(null));
  }, [result, publishPass]);

  const timeline = useMemo<ClipTimeline | null>(() => {
    if (!result || !config) return null;
    const ids = result.attempt.tileInstanceIds as [string, string, string];
    const endCardUrl = config.publicBaseUrl && link ? `${new URL(config.publicBaseUrl).host}${link.path}` : null;
    return buildClipTimeline({
      brand: config.brand,
      question: result.puzzle.question,
      sectionLabel: result.section.label,
      tiles: result.puzzle.tiles,
      passIds: ids,
      reasons,
      split: result.split.minimumSampleMet ? result.split.rows.map((r) => ({ tileInstanceId: r.tileInstanceId, rate: r.rate })) : null,
      splitAttemptCount: result.split.eligibleAttemptCount,
      endCardUrl,
    });
  }, [result, config, reasons, link]);

  if (error) {
    return (
      <main className="screen">
        <TopBar title="Make your clip" back={`/result/${attemptId}`} />
        <ErrorPanel message={error} />
      </main>
    );
  }
  if (!result || !timeline || !assets) return <Loading label="Setting up your clip" />;

  const faceOf = new Map(result.puzzle.tiles.map((t) => [t.instanceId, t.faceCode]));
  const shareUrl = link ? (link.url ?? `${window.location.origin}${link.path}`) : window.location.origin;

  return (
    <main className="screen">
      <TopBar title="Make your clip" back={`/result/${attemptId}`} />
      <Preview timeline={timeline} assets={assets} style={style} voice={voice} />

      <VoiceoverControl voice={voice} onChange={setVoice} />

      <details className="card">
        <summary style={{ fontWeight: 600, minHeight: 32, cursor: 'pointer' }}>Edit captions</summary>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {result.attempt.tileInstanceIds.map((id, i) => (
            <div className="field" key={id}>
              <label htmlFor={`reason-${id}`}>
                Tile {i + 1}: {spokenLabel(faceOf.get(id) ?? '')}
              </label>
              <input
                id={`reason-${id}`}
                maxLength={REASON_MAX_CHARS}
                value={reasons[id] ?? ''}
                onChange={(e) => setReasons((r) => ({ ...r, [id]: e.target.value }))}
              />
              <span className="count">
                {(reasons[id] ?? '').length}/{REASON_MAX_CHARS}
              </span>
            </div>
          ))}
          <div>
            <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 14 }}>Caption colour</p>
            <div className="segmented">
              {(['blue', 'magenta'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={style === s}
                  onClick={() => {
                    setStyle(s);
                    writeJson(PREFS_KEY, { ...readPrefs(), captionStyle: s });
                  }}
                >
                  {s === 'blue' ? 'Blue' : 'Magenta'}
                </button>
              ))}
            </div>
          </div>
          <label className="toggle-row">
            <span>Show my pass to people who play my link</span>
            <input type="checkbox" checked={publishPass} onChange={(e) => setPublishPass(e.target.checked)} />
          </label>
        </div>
      </details>

      <ExportActions
        timeline={timeline}
        assets={assets}
        style={style}
        voice={voice}
        shareUrl={shareUrl}
        fileName={`daily-rack-${result.puzzle.revisionId}.mp4`}
      />
    </main>
  );
}

function Preview({ timeline, assets, style, voice }: { timeline: ClipTimeline; assets: RenderAssets; style: CaptionStyle; voice: Voice | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clock = useRef<{ startT: number; startedAt: number } | null>(null);

  const paint = useCallback(
    (time: number) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
      drawFrame(ctx, timeline, time, assets, style);
    },
    [timeline, assets, style],
  );

  useEffect(() => {
    paint(t);
  }, [paint, t]);

  useEffect(() => {
    track('clip_preview_ready', { voice: voice ? 'recorded' : 'captions-only' });
  }, [voice]);

  useEffect(() => {
    audioRef.current = voice ? new Audio(voice.url) : null;
    return () => audioRef.current?.pause();
  }, [voice]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (!clock.current) return;
      const now = clock.current.startT + (performance.now() - clock.current.startedAt) / 1000;
      if (now >= timeline.duration) {
        setT(timeline.duration - 0.001);
        setPlaying(false);
        return;
      }
      setT(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, timeline.duration]);

  const play = (from: number) => {
    const start = from >= timeline.duration - 0.05 ? 0 : from;
    clock.current = { startT: start, startedAt: performance.now() };
    const audio = audioRef.current;
    if (audio && voice && start < voice.seconds) {
      audio.currentTime = start;
      void audio.play().catch(() => undefined);
    }
    setT(start);
    setPlaying(true);
  };
  const pause = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  return (
    <div className="clip-frame">
      <canvas ref={canvasRef} width={540} height={960} role="img" aria-label="Preview of your 9 by 16 clip" />
      <div className="player-bar">
        <button type="button" onClick={() => (playing ? pause() : play(t))} aria-label={playing ? 'Pause preview' : 'Play preview'}>
          <Icon name={playing ? 'pause' : 'play'} size={20} />
        </button>
        <time aria-label="Preview position">{`0:${String(Math.floor(t)).padStart(2, '0')}`}</time>
        <input
          type="range"
          min={0}
          max={timeline.duration}
          step={0.05}
          value={t}
          aria-label="Scrub preview"
          onChange={(e) => {
            pause();
            setT(Number(e.target.value));
          }}
        />
        <time>{`0:${timeline.duration}`}</time>
      </div>
    </div>
  );
}

type RecorderState = { kind: 'idle' } | { kind: 'requesting' } | { kind: 'recording'; startedAt: number } | { kind: 'denied' } | { kind: 'failed'; message: string };

function VoiceoverControl({ voice, onChange }: { voice: Voice | null; onChange: (v: Voice | null) => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RecorderState>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (state.kind !== 'recording') return;
    const id = window.setInterval(() => {
      const s = (performance.now() - state.startedAt) / 1000;
      setElapsed(s);
      if (s >= VOICEOVER_MAX_SECONDS) recorder.current?.stop();
    }, 100);
    return () => window.clearInterval(id);
  }, [state]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState({ kind: 'failed', message: 'This browser cannot record audio. Your clip works fine with captions only.' });
      return;
    }
    setState({ kind: 'requesting' });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState({ kind: 'denied' });
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: rec.mimeType });
      try {
        const context = new AudioContext({ sampleRate: 48_000 });
        const buffer = await context.decodeAudioData(await blob.arrayBuffer());
        await context.close();
        if (voice) URL.revokeObjectURL(voice.url);
        onChange({ blob, url: URL.createObjectURL(blob), buffer, seconds: Math.min(buffer.duration, VOICEOVER_MAX_SECONDS) });
        setState({ kind: 'idle' });
      } catch {
        setState({ kind: 'failed', message: 'That recording could not be read. Try again, or keep captions only.' });
      }
    };
    rec.start();
    setElapsed(0);
    setState({ kind: 'recording', startedAt: performance.now() });
  };

  const remove = () => {
    if (voice) URL.revokeObjectURL(voice.url);
    onChange(null);
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      <button type="button" className="row-button" style={{ border: 0 }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="circle" aria-hidden="true">
          <Icon name="mic" />
        </span>
        <span className="grow">
          <strong style={{ display: 'block' }}>{voice ? `Voiceover · ${voice.seconds.toFixed(1)} s` : 'Add voiceover'}</strong>
          <span className="muted small">Optional · up to {VOICEOVER_MAX_SECONDS} sec · stays on this device</span>
        </span>
        <Icon name="chevron" />
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px', display: 'grid', gap: 10 }}>
          <p className="muted small" style={{ margin: 0 }}>
            Try a one-line hook: “Not sure what to pass? Here's my rack.” Your voice plays from the start of the clip.
          </p>
          {state.kind === 'recording' ? (
            <>
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${(elapsed / VOICEOVER_MAX_SECONDS) * 100}%` }} />
              </div>
              <button type="button" className="primary-action" onClick={() => recorder.current?.stop()}>
                <Icon name="stop" /> Stop · {Math.floor(elapsed)}s
              </button>
            </>
          ) : (
            <button type="button" className={voice ? 'secondary-action' : 'primary-action'} onClick={start} disabled={state.kind === 'requesting'}>
              <Icon name="mic" /> {voice ? 'Re-record' : state.kind === 'requesting' ? 'Waiting for microphone…' : 'Record'}
            </button>
          )}
          {voice && state.kind !== 'recording' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <audio src={voice.url} controls style={{ flex: 1, minWidth: 0 }} />
              <button type="button" className="icon-button" aria-label="Delete voiceover" onClick={remove}>
                <Icon name="trash" />
              </button>
            </div>
          )}
          {state.kind === 'denied' && (
            <p className="notice small" style={{ margin: 0 }}>
              Microphone access is off. Your clip works fine with captions only, or allow the microphone in your browser settings.
            </p>
          )}
          {state.kind === 'failed' && <p className="notice small" style={{ margin: 0 }}>{state.message}</p>}
        </div>
      )}
    </div>
  );
}

type ExportState = { kind: 'idle' } | { kind: 'rendering'; progress: number } | { kind: 'ready'; result: ExportResult } | { kind: 'failed'; message: string };

function ExportActions({
  timeline,
  assets,
  style,
  voice,
  shareUrl,
  fileName,
}: {
  timeline: ClipTimeline;
  assets: RenderAssets;
  style: CaptionStyle;
  voice: Voice | null;
  shareUrl: string;
  fileName: string;
}) {
  const [state, setState] = useState<ExportState>({ kind: 'idle' });
  const [status, setStatus] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Any edit invalidates a finished render.
  useEffect(() => setState({ kind: 'idle' }), [timeline, style, voice]);

  const render = async (): Promise<ExportResult | null> => {
    if (state.kind === 'ready') return state.result;
    const controller = new AbortController();
    abort.current = controller;
    setStatus(null);
    setState({ kind: 'rendering', progress: 0 });
    track('clip_render_started', { voice: Boolean(voice) });
    try {
      const result = await exportClip({
        timeline,
        assets,
        style,
        voice: voice?.buffer ?? null,
        fileName,
        signal: controller.signal,
        onProgress: (progress) => setState({ kind: 'rendering', progress }),
      });
      track('clip_render_succeeded', { ms: result.elapsedMs, bytes: result.blob.size, video: result.videoCodec, audio: result.audioCodec });
      setState({ kind: 'ready', result });
      return result;
    } catch (e) {
      if (e instanceof ExportCancelled) {
        setState({ kind: 'idle' });
        setStatus('Render cancelled.');
      } else {
        track('clip_render_failed', { reason: (e as Error).message.slice(0, 120) });
        setState({ kind: 'failed', message: (e as Error).message });
      }
      return null;
    }
  };

  const share = async () => {
    const result = await render();
    if (!result) return;
    const text = `What would you pass? Play this rack: ${shareUrl}`;
    if (navigator.canShare?.({ files: [result.file] })) {
      track('share_handoff_opened', { method: 'share-sheet' });
      try {
        await navigator.share({ files: [result.file], title: 'Daily Rack', text });
        setStatus('Handed off to the app you picked.');
      } catch (e) {
        setStatus((e as Error).name === 'AbortError' ? 'Share cancelled. Your clip is still ready.' : 'The share sheet could not open. Try Save video.');
      }
      return;
    }
    download(result);
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setStatus('This browser cannot share video directly, so the clip is downloading and the rack link is copied.');
  };

  const save = async () => {
    const result = await render();
    if (!result) return;
    download(result);
    setStatus(`Download started: ${result.file.name}`);
  };

  const download = (result: ExportResult) => {
    track('clip_save_started', { method: 'download' });
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus('Rack link copied.');
    } catch {
      setStatus(`Rack link: ${shareUrl}`);
    }
  };

  const supported = canExportMp4();
  const busy = state.kind === 'rendering';

  return (
    <div className="sticky-actions in-flow">
      {state.kind === 'rendering' && (
        <div style={{ display: 'grid', gap: 6 }} role="status" aria-live="polite">
          <div className="progress">
            <span style={{ width: `${Math.round(state.progress * 100)}%` }} />
          </div>
          <p className="status small">Making your video… {Math.round(state.progress * 100)}%</p>
        </div>
      )}
      {state.kind === 'failed' && <ErrorPanel message={state.message} onRetry={() => void render()} />}
      {!supported && (
        <p className="notice small" style={{ margin: 0 }}>
          This browser cannot make video files. Open the app in the latest Safari or Chrome to export.
        </p>
      )}
      {status && (
        <p className="status small" role="status">
          {status}
        </p>
      )}
      {busy ? (
        <button type="button" className="secondary-action" onClick={() => abort.current?.abort()}>
          Cancel
        </button>
      ) : (
        <>
          <button type="button" className="primary-action" onClick={share} disabled={!supported}>
            <Icon name="share" /> Share clip
          </button>
          <button type="button" className="secondary-action" onClick={save} disabled={!supported}>
            <Icon name="download" /> Save video
          </button>
          <button type="button" className="text-button" onClick={copyLink}>
            Copy rack link
          </button>
        </>
      )}
    </div>
  );
}
