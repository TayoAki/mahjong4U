import type { Alignment, PublicPuzzle, Section, Suggestion, AlternatePass, ReviewState } from '@daily-rack/core';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface Progress {
  streak: number;
  bestStreak: number;
  racksSolved: number;
  strongPasses: number;
  milestone: boolean;
  today: string;
  playedToday: boolean;
  week: { day: string; done: boolean }[];
  sections: { label: string; count: number }[];
}

export interface Daily {
  contentDay: string;
  serverTime: string;
  nextPublicationAt: string;
  puzzle: PublicPuzzle | null;
  attemptId: string | null;
  progress: Progress | null;
}

export interface SplitResponse {
  revisionId: string;
  eligibleAttemptCount: number;
  syntheticAttemptCount: number;
  minimumSampleMet: boolean;
  threshold: number;
  computedAt: string;
  rows: { tileInstanceId: string; count: number; rate: number }[];
}

export interface ResultResponse {
  attempt: { id: string; revisionId: string; sectionId: string; tileInstanceIds: string[]; createdAt: string; isDaily: boolean };
  puzzle: PublicPuzzle;
  section: Section;
  suggestion: Suggestion;
  suggestedSection: Section;
  alternates: AlternatePass[];
  alignment: Alignment;
  alignmentCopy: string;
  split: SplitResponse;
  poster: { sectionId: string; tileInstanceIds: string[] } | null;
  progress: Progress;
  review: ReviewState;
}

export interface SharedRack {
  linkId: string;
  puzzle: PublicPuzzle;
  posterPassPublished: boolean;
  isTodaysRack: boolean;
  attemptId: string | null;
}

export interface AppConfig {
  brand: string;
  publicBaseUrl: string | null;
  splitThreshold: number;
  timeZone: string;
}

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'You seem to be offline. Check your connection and try again.', true);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = data?.error ?? {};
    const { code, message, retryable, ...extra } = error;
    throw new ApiError(res.status, code ?? 'unknown', message ?? 'Something went wrong.', Boolean(retryable), extra);
  }
  return data as T;
}

let sessionPromise: Promise<unknown> | null = null;

/** Creates (or reuses) the guest session cookie once per page load. */
export function ensureSession(): Promise<unknown> {
  sessionPromise ??= request('POST', '/v1/guest-sessions').catch((error) => {
    sessionPromise = null;
    throw error;
  });
  return sessionPromise;
}

export const api = {
  config: () => request<AppConfig>('GET', '/v1/config'),
  daily: () => request<Daily>('GET', '/v1/daily'),
  submit: (body: { revisionId: string; sectionId: string; tileInstanceIds: string[]; idempotencyKey: string; shareToken?: string }) =>
    request<{ attemptId: string; revisionId: string }>('POST', '/v1/attempts', body),
  result: (attemptId: string) => request<ResultResponse>('GET', `/v1/attempts/${encodeURIComponent(attemptId)}/result`),
  progress: () => request<Progress>('GET', '/v1/me/progress'),
  createShareLink: (attemptId: string, publishPass: boolean) =>
    request<{ id: string; token: string; path: string; url: string | null }>('POST', '/v1/share-links', { attemptId, publishPass }),
  sharedRack: (token: string) => request<SharedRack>('GET', `/v1/share-links/${encodeURIComponent(token)}`),
  deleteMe: () => request<{ deleted: boolean }>('DELETE', '/v1/me', undefined, { 'x-confirm-delete': 'delete-my-data' }),
};

let configPromise: Promise<AppConfig> | null = null;
export function getConfig(): Promise<AppConfig> {
  configPromise ??= api.config().catch(() => ({ brand: 'Daily Rack', publicBaseUrl: null, splitThreshold: 30, timeZone: 'America/New_York' }));
  return configPromise;
}
