import { readCredentials } from '@/auth/credentials';
import type {
  ActiveWorkflow,
  AdminWorkflow,
  AdvanceRequest,
  AuditEvent,
  AuditQuery,
  CreateWorkflowRequest,
  ExceptionEvent,
  InboxItem,
  JsonObject,
  PreviewRequest,
  SessionReplay,
  SessionSnapshot,
} from '@/api/types';

export class ApiError extends Error {
  status: number;
  body: unknown;
  requestId: string | null;
  code: string | null;

  constructor(message: string, status: number, body: unknown, requestId: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.requestId = requestId;
    this.code = extractErrorCode(body);
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Vite dev uses a same-origin proxy (see vite.config.ts).
 * Production builds with empty VITE_API_URL stay same-origin.
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

  if (!configured) return '';

  if (typeof window === 'undefined') return configured;
  try {
    const api = new URL(configured, window.location.origin);
    if (isLoopbackHost(api.hostname) && isLoopbackHost(window.location.hostname)) {
      api.hostname = window.location.hostname;
    }
    if (api.origin === window.location.origin) return '';
    return api.origin;
  } catch {
    return configured;
  }
}

let lastRequestId: string | null = null;

export function getLastRequestId(): string | null {
  return lastRequestId;
}

function headerRequestId(res: Response): string | null {
  return res.headers.get('X-Request-Id') ?? res.headers.get('x-request-id');
}

type AuthMode = 'admin' | 'runtime' | 'none';

function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) search.set(key, value.trim());
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

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
  if (auth === 'runtime' && creds.apiKey.trim()) {
    headers['X-API-Key'] = creds.apiKey.trim();
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError('Kernel unreachable', 0, err);
  }

  const requestId = headerRequestId(res);
  lastRequestId = requestId;

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
    throw new ApiError(message, res.status, data, requestId);
  }

  return data as T;
}

function extractErrorCode(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.error === 'string' && rec.error.trim()) return rec.error;
  if (typeof rec.code === 'string' && rec.code.trim()) return rec.code;
  return null;
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
    for (const key of ['items', 'workflows', 'data', 'results', 'events']) {
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

export function extractLintIssues(data: unknown): { errors: string[]; warnings: string[] } {
  if (!data || typeof data !== 'object') return { errors: [], warnings: [] };
  const rec = data as Record<string, unknown>;
  const lint =
    rec.lint && typeof rec.lint === 'object' && !Array.isArray(rec.lint)
      ? (rec.lint as Record<string, unknown>)
      : rec;
  return {
    errors: issueList(lint.errors ?? rec.issues),
    warnings: issueList(lint.warnings ?? rec.warnings),
  };
}

function issueList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string' && item.trim()) return item;
      if (item && typeof item === 'object' && 'message' in item) {
        const message = (item as { message: unknown }).message;
        if (typeof message === 'string' && message.trim()) return message;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
}

export const api = {
  health: () => request<unknown>('GET', '/health', 'none'),

  demoAuth: (role = 'operator') => request<unknown>('GET', `/v1/auth/demo${queryString({ role })}`, 'none'),

  authMe: () => request<{ sub: string; role: string; via: string }>('GET', '/v1/auth/me', 'runtime'),

  listInbox: () => request<unknown>('GET', '/v1/inbox', 'runtime'),

  searchAudit: (query: AuditQuery) =>
    request<unknown>(
      'GET',
      `/v1/audit${queryString({
        accountId: query.accountId,
        eventType: query.eventType,
        sessionId: query.sessionId,
      })}`,
      'runtime',
    ),

  getReplay: (id: string) =>
    request<SessionReplay>('GET', `/v1/sessions/${encodeURIComponent(id)}/replay`, 'runtime'),

  listWorkflows: () => request<unknown>('GET', '/admin/workflows', 'admin'),

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
    request<unknown>('POST', `/admin/workflows/${encodeURIComponent(id)}/publish`, 'admin'),

  getActiveWorkflow: (slug: string) =>
    request<ActiveWorkflow>('GET', `/v1/workflows/${encodeURIComponent(slug)}/active`, 'runtime'),

  injectException: (body: ExceptionEvent) =>
    request<unknown>('POST', '/v1/events/exceptions', 'runtime', body),

  getSession: (id: string) =>
    request<SessionSnapshot>('GET', `/v1/sessions/${encodeURIComponent(id)}`, 'runtime'),

  advanceSession: (id: string, body: AdvanceRequest) =>
    request<unknown>('POST', `/v1/sessions/${encodeURIComponent(id)}/advance`, 'runtime', body),

  getAudit: (id: string) =>
    request<unknown>('GET', `/v1/sessions/${encodeURIComponent(id)}/audit`, 'runtime'),
};

export async function ensureDemoSession(role = 'operator'): Promise<void> {
  try {
    await api.demoAuth(role);
  } catch {
    /* Cookie auth is optional; X-API-Key fallback still works locally. */
  }
}

export function unwrapInbox(data: unknown): InboxItem[] {
  return unwrapList<InboxItem>(data).filter((item) => item && typeof item.sessionId === 'string');
}

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

export function sessionConcurrencyToken(snapshot: SessionSnapshot | null): string | undefined {
  if (!snapshot) return undefined;
  return snapshot.updatedAt || snapshot.expectedUpdatedAt;
}
