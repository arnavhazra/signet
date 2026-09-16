import { DEMO_RUNTIME_KEY, readCredentials } from '@/auth/credentials';
import type {
  ActiveWorkflow,
  AdminWorkflow,
  AdvanceRequest,
  AuditEvent,
  CreateWorkflowRequest,
  ExceptionEvent,
  JsonObject,
  PreviewRequest,
  SessionSnapshot,
} from '@/api/types';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Vite dev uses a same-origin proxy (see vite.config.ts) so the browser never
 * trips CORS or localhost vs 127.0.0.1. Production builds call VITE_API_URL.
 */
export function getBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

  if (import.meta.env.DEV) {
    if (!configured) return '';
    try {
      const api = new URL(configured);
      if (isLoopbackHost(api.hostname) && (api.port === '8000' || api.port === '')) {
        return '';
      }
    } catch {
      return '';
    }
  }

  const raw = configured || 'http://localhost:8000';
  if (typeof window === 'undefined') return raw;
  try {
    const api = new URL(raw, window.location.origin);
    if (isLoopbackHost(api.hostname) && isLoopbackHost(window.location.hostname)) {
      api.hostname = window.location.hostname;
    }
    if (api.origin === window.location.origin) return '';
    return api.origin;
  } catch {
    return raw;
  }
}

type AuthMode = 'admin' | 'runtime' | 'none';

async function request<T>(
  method: string,
  path: string,
  auth: AuthMode,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const creds = readCredentials();

  if (auth === 'admin' && creds.jwt.trim()) {
    headers.Authorization = `Bearer ${creds.jwt.trim()}`;
  }
  if (auth === 'runtime') {
    // Never omit this header in the demo. An empty saved key still falls back to the public demo key.
    headers['X-API-Key'] = creds.apiKey.trim() || DEMO_RUNTIME_KEY;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    const why = err instanceof Error && err.message ? err.message : 'network error';
    throw new ApiError(`Kernel unreachable (${why})`, 0, err);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message = extractErrorMessage(data) ?? `${method} ${path} failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

function extractErrorMessage(data: unknown): string | null {
  if (typeof data === 'string' && data.trim()) return data.slice(0, 400);
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.message === 'string' && rec.message.trim()) return rec.message;
  if (typeof rec.detail === 'string' && rec.detail.trim()) return rec.detail;
  if (Array.isArray(rec.detail)) {
    const parts = rec.detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item && typeof (item as { msg: unknown }).msg === 'string') {
          return (item as { msg: string }).msg;
        }
        return null;
      })
      .filter((part): part is string => Boolean(part));
    if (parts.length) return parts.join('; ');
  }
  if (typeof rec.title === 'string' && rec.title.trim()) return rec.title;
  if (typeof rec.error === 'string' && rec.error.trim() && !/^[A-Z0-9_]+$/.test(rec.error)) {
    return rec.error;
  }
  return null;
}

export function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    for (const key of ['items', 'workflows', 'data', 'results']) {
      const value = rec[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

export function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.sessionId === 'string' && typeof rec.status === 'string';
}

export function extractSessionId(payload: unknown): string | null {
  if (isSessionSnapshot(payload)) return payload.sessionId;
  if (!payload || typeof payload !== 'object') return null;
  const rec = payload as Record<string, unknown>;
  if (typeof rec.sessionId === 'string') return rec.sessionId;
  if (typeof rec.session_id === 'string') return rec.session_id;
  if (rec.session && typeof rec.session === 'object') {
    const nested = rec.session as Record<string, unknown>;
    if (typeof nested.sessionId === 'string') return nested.sessionId;
    if (typeof nested.session_id === 'string') return nested.session_id;
  }
  return null;
}

export const api = {
  health: () => request<unknown>('GET', '/health', 'none'),

  listWorkflows: () =>
    request<unknown>('GET', '/admin/workflows', 'admin'),

  createWorkflow: (body: CreateWorkflowRequest) =>
    request<AdminWorkflow>('POST', '/admin/workflows', 'admin', body),

  getWorkflow: (id: string) =>
    request<AdminWorkflow>('GET', `/admin/workflows/${encodeURIComponent(id)}`, 'admin'),

  previewWorkflow: (id: string, body: PreviewRequest) =>
    request<unknown>(
      'POST',
      `/admin/workflows/${encodeURIComponent(id)}/preview`,
      'admin',
      body,
    ),

  publishWorkflow: (id: string) =>
    request<unknown>(
      'POST',
      `/admin/workflows/${encodeURIComponent(id)}/publish`,
      'admin',
    ),

  getActiveWorkflow: (slug: string) =>
    request<ActiveWorkflow>(
      'GET',
      `/v1/workflows/${encodeURIComponent(slug)}/active`,
      'runtime',
    ),

  injectException: (body: ExceptionEvent) =>
    request<unknown>('POST', '/v1/events/exceptions', 'runtime', body),

  getSession: (id: string) =>
    request<SessionSnapshot>('GET', `/v1/sessions/${encodeURIComponent(id)}`, 'runtime'),

  advanceSession: (id: string, body: AdvanceRequest) =>
    request<unknown>(
      'POST',
      `/v1/sessions/${encodeURIComponent(id)}/advance`,
      'runtime',
      body,
    ),

  getAudit: (id: string) =>
    request<unknown>('GET', `/v1/sessions/${encodeURIComponent(id)}/audit`, 'runtime'),
};

export function unwrapAudit(data: unknown): AuditEvent[] {
  if (Array.isArray(data)) return data as AuditEvent[];
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    for (const key of ['events', 'items', 'entries', 'audit', 'data']) {
      const value = rec[key];
      if (Array.isArray(value)) return value as AuditEvent[];
    }
  }
  return [];
}

export function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}
