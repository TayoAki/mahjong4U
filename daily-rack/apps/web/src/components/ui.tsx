import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { spokenLabel } from '@daily-rack/core';
import { tileSvg } from '../tiles/tileArt.ts';

const svgCache = new Map<string, string>();
function cachedSvg(faceCode: string): string {
  let svg = svgCache.get(faceCode);
  if (!svg) {
    svg = tileSvg(faceCode);
    svgCache.set(faceCode, svg);
  }
  return svg;
}

export function Tile({ faceCode, flat = false }: { faceCode: string; flat?: boolean }) {
  return <span className={`tile${flat ? ' flat' : ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: cachedSvg(faceCode) }} />;
}

export function TileButton({
  faceCode,
  label,
  onClick,
  disabled,
  badge,
}: {
  faceCode: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button type="button" className="tile-button" aria-label={label} onClick={onClick} disabled={disabled}>
      <Tile faceCode={faceCode} />
      {badge && <span className="lock">{badge}</span>}
    </button>
  );
}

export function MiniTiles({ faceCodes, label }: { faceCodes: string[]; label: string }) {
  return (
    <div className="mini-rack" role="img" aria-label={`${label}: ${faceCodes.map(spokenLabel).join(', ')}`}>
      {faceCodes.map((f, i) => (
        <Tile key={`${f}-${i}`} faceCode={f} flat />
      ))}
    </div>
  );
}

export function TopBar({ title, back, right }: { title: string; back?: string | (() => void); right?: ReactNode }) {
  const navigate = useNavigate();
  const onBack = typeof back === 'function' ? back : back ? () => navigate(back) : undefined;
  return (
    <header className="topbar">
      {onBack ? (
        <button type="button" className="icon-button" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
      ) : (
        <span />
      )}
      <h1>{title}</h1>
      {right ?? <span />}
    </header>
  );
}

export function BottomNav({ active }: { active: 'today' | 'you' }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      <Link to="/today" aria-current={active === 'today' ? 'page' : undefined}>
        <Icon name="home" />
        Today
      </Link>
      <Link to="/you" aria-current={active === 'you' ? 'page' : undefined}>
        <Icon name="user" />
        You
      </Link>
    </nav>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ReviewNotice({ reviewed }: { reviewed: boolean }) {
  if (reviewed) return null;
  return (
    <p className="notice warn small" role="note">
      Practice rack: this suggestion has not been reviewed by a teacher yet.
    </p>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="center-block" role="status" aria-live="polite">
      <p className="muted">{label}…</p>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <p style={{ margin: 0 }}>{message}</p>
      {onRetry && (
        <button type="button" className="text-button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

type IconName = 'back' | 'help' | 'sort' | 'arrow' | 'mic' | 'share' | 'play' | 'pause' | 'flame' | 'leaf' | 'home' | 'user' | 'chevron' | 'stop' | 'trash' | 'download';

const PATHS: Record<IconName, ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.5 9.3a2.6 2.6 0 015 .9c0 1.8-2.5 2.2-2.5 3.8" />
      <circle cx="12" cy="17.2" r="0.6" fill="currentColor" />
    </>
  ),
  sort: <path d="M4 7h16M7 12h10M10 17h4" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" />
    </>
  ),
  share: <path d="M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6" />,
  download: <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />,
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" />,
  pause: <path d="M8 5v14M16 5v14" strokeWidth="3" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />,
  flame: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.5-5.4 3.7-8.3.5 1.8 1.6 2.9 2.7 3.4.1-2.6 1.4-5 3.6-6.4-.4 2.8.8 4.6 2 6.2 1.2 1.6 1.9 3 1.9 5 0 3.7-3.1 6.3-7.4 6.3z" fill="currentColor" stroke="none" />,
  leaf: <path d="M5 19c8 0 14-6 14-15C10 4 5 9 5 16v3zm0 0c3-5 6-8 10-10" />,
  home: <path d="M4 11l8-6.5 8 6.5V20H4z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </>
  ),
  trash: <path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" />,
};

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
