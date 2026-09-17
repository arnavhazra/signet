import { isDemoRole, type DemoRole } from '@/auth/demo';
import type {
  ActiveWorkflow,
  AdminWorkflow,
  AdvanceRequest,
  AgentPolicy,
  AgentProposal,
  AgentProposeRequest,
  AgentProposeResponse,
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

type AuthMode = 'session' | 'none';

function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) search.set(key, value.trim());
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export type DemoRuntimeStatus = 'pending' | 'warming' | 'ready' | 'failed';

export type DemoRuntime = {
  status: DemoRuntimeStatus;
  role: DemoRole;
  error: string | null;
};

type DemoListener = () => void;

const HEALTH_BUDGET_MS = 45_000;
const HEALTH_GAP_MS = 1_500;

const demoListeners = new Set<DemoListener>();
let demoRuntime: DemoRuntime = { status: 'pending', role: 'operator', error: null };
let bootPromise: Promise<void> | null = null;

export function getDemoRuntime(): DemoRuntime {
  return demoRuntime;
}

export function subscribeDemoRuntime(listener: DemoListener): () => void {
  demoListeners.add(listener);
  return () => {
    demoListeners.delete(listener);
  };
}

function setDemoRuntime(patch: Partial<DemoRuntime>): void {
  demoRuntime = { ...demoRuntime, ...patch };
  demoListeners.forEach((listener) => listener());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

type AuthMe = { sub: string; role: string; via: string; orgId?: string };

function isCookiePrincipal(me: AuthMe): me is AuthMe & { role: DemoRole } {
  return me.via === 'cookie' && isDemoRole(me.role);
}

async function waitForHealth(): Promise<void> {
  const started = Date.now();
  setDemoRuntime({ status: 'warming', error: null });
  let last: unknown = null;
  while (Date.now() - started < HEALTH_BUDGET_MS) {
    try {
      await request<unknown>('GET', '/health', 'none');
      return;
    } catch (err) {
      last = err;
      await sleep(HEALTH_GAP_MS);
    }
  }
  throw last instanceof ApiError ? last : new ApiError('Kernel unreachable', 0, last);
}

async function readCookieMe(): Promise<AuthMe | null> {
  try {
    const me = await request<AuthMe>('GET', '/v1/auth/me', 'none');
    if (isCookiePrincipal(me)) return me;
    return null;
  } catch {
    return null;
  }
}

async function mintDemoCookie(role: DemoRole): Promise<AuthMe> {
  await request<unknown>('GET', `/v1/auth/demo${queryString({ role })}`, 'none');
  const me = await readCookieMe();
  if (!me) {
    throw new ApiError('Demo session failed', 0, null);
  }
  return me;
}

async function boot(): Promise<void> {
  try {
    await waitForHealth();
    const existing = await readCookieMe();
    if (existing && isDemoRole(existing.role)) {
      setDemoRuntime({ status: 'ready', role: existing.role, error: null });
      emitRole(existing.role);
      return;
    }
    const minted = await mintDemoCookie(demoRuntime.role);
    setDemoRuntime({ status: 'ready', role: minted.role as DemoRole, error: null });
    emitRole(minted.role as DemoRole);
  } catch (err) {
    const message = err instanceof Error && err.message.trim() ? err.message : 'Kernel is down';
    setDemoRuntime({ status: 'failed', error: message });
    throw err instanceof ApiError ? err : new ApiError(message, 0, err);
  }
}

function emitRole(role: DemoRole): void {
  window.dispatchEvent(new CustomEvent('signet:role', { detail: { role } }));
}

export function startDemoSession(): Promise<void> {
  if (!bootPromise) {
    bootPromise = boot().catch((err) => {
      bootPromise = null;
      throw err;
    });
  }
  return bootPromise;
}

export async function waitForDemoSession(): Promise<void> {
  try {
    await startDemoSession();
  } catch {
    throw new ApiError('Kernel is down', 0, null);
  }
  if (demoRuntime.status !== 'ready') {
    throw new ApiError('Kernel is down', 0, null);
  }
}

export async function retryDemoSession(): Promise<void> {
  bootPromise = null;
  setDemoRuntime({ status: 'pending', error: null });
  await startDemoSession();
}

/**
 * Mint or refresh the demo cookie for an explicit role switch.
 * Does not remint on its own — callers must invoke this.
 * Always re-emits `signet:role`, even when the role is unchanged.
 */
export async function switchDemoRole(role: DemoRole): Promise<void> {
  await waitForDemoSession();
  const me = await mintDemoCookie(role);
  const next = isDemoRole(me.role) ? me.role : role;
  setDemoRuntime({ status: 'ready', role: next, error: null });
  emitRole(next);
}

export async function resetDemoVisitor(): Promise<void> {
  await waitForDemoSession();
  await mintDemoCookie('operator');
  setDemoRuntime({ status: 'ready', role: 'operator', error: null });
  emitRole('operator');
  await request<unknown>('POST', '/v1/demo/reset', 'session');
}

/** @deprecated Use startDemoSession / switchDemoRole. Kept so older call sites compile during the swap. */
export async function ensureDemoSession(role?: DemoRole): Promise<void> {
  if (!role) {
    await waitForDemoSession();
    return;
  }
  await switchDemoRole(role);
}

async function request<T>(method: string, path: string, auth: AuthMode, body?: unknown): Promise<T> {
  if (auth === 'session') {
    await waitForDemoSession();
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  // Cookie only. Never attach X-API-Key or a baked admin JWT — production would
  // fall through to the shared org (or 401 against a different JWT_SECRET).
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

function looksLikeStack(text: string): boolean {
  return (
    /Traceback \(most recent call last\)/i.test(text) ||
    /^\s*at \S+/m.test(text) ||
    /File ".*", line \d+/i.test(text)
  );
}

function sanitizeErrorText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return 'Request failed.';
  if (looksLikeStack(trimmed)) {
    const line = trimmed
      .split('\n')
      .map((part) => part.trim())
      .find(
        (part) =>
          part &&
          !/^traceback/i.test(part) &&
          !/^file "/i.test(part) &&
          !/^at /i.test(part) &&
          !/^\/.*:\d+/i.test(part),
      );
    return (line || 'Request failed.').slice(0, 200);
  }
  return trimmed.split('\n')[0].slice(0, 400);
}

function extractErrorMessage(data: unknown): string | null {
  if (typeof data === 'string' && data.trim()) return sanitizeErrorText(data);
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.message === 'string' && rec.message.trim()) return sanitizeErrorText(rec.message);
  if (typeof rec.detail === 'string' && rec.detail.trim()) return sanitizeErrorText(rec.detail);
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
    if (parts.length) return sanitizeErrorText(parts.join('; '));
  }
  if (typeof rec.title === 'string' && rec.title.trim()) return sanitizeErrorText(rec.title);
  if (typeof rec.error === 'string' && rec.error.trim() && !/^[A-Z0-9_]+$/.test(rec.error)) {
    return sanitizeErrorText(rec.error);
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

  authMe: () => request<AuthMe>('GET', '/v1/auth/me', 'none'),

  listInbox: () => request<unknown>('GET', '/v1/inbox', 'session'),

  searchAudit: (query: AuditQuery) =>
    request<unknown>(
      'GET',
      `/v1/audit${queryString({
        accountId: query.accountId,
        eventType: query.eventType,
        sessionId: query.sessionId,
      })}`,
      'session',
    ),

  getReplay: (id: string) =>
    request<SessionReplay>('GET', `/v1/sessions/${encodeURIComponent(id)}/replay`, 'session'),

  listWorkflows: () => request<unknown>('GET', '/admin/workflows', 'session'),

  createWorkflow: (body: CreateWorkflowRequest) =>
    request<AdminWorkflow>('POST', '/admin/workflows', 'session', body),

  getWorkflow: (id: string) =>
    request<AdminWorkflow>('GET', `/admin/workflows/${encodeURIComponent(id)}`, 'session'),

  previewWorkflow: (id: string, body: PreviewRequest) =>
    request<unknown>('POST', `/admin/workflows/${encodeURIComponent(id)}/preview`, 'session', body),

  publishWorkflow: (id: string) =>
    request<unknown>('POST', `/admin/workflows/${encodeURIComponent(id)}/publish`, 'session'),

  getActiveWorkflow: (slug: string) =>
    request<ActiveWorkflow>('GET', `/v1/workflows/${encodeURIComponent(slug)}/active`, 'session'),

  injectException: (body: ExceptionEvent) =>
    request<unknown>('POST', '/v1/events/exceptions', 'session', body),

  getSession: (id: string) =>
    request<SessionSnapshot>('GET', `/v1/sessions/${encodeURIComponent(id)}`, 'session'),

  advanceSession: (id: string, body: AdvanceRequest) =>
    request<unknown>('POST', `/v1/sessions/${encodeURIComponent(id)}/advance`, 'session', body),

  getAudit: (id: string) =>
    request<unknown>('GET', `/v1/sessions/${encodeURIComponent(id)}/audit`, 'session'),

  proposeAgent: async (body: AgentProposeRequest) => {
    const data = await request<unknown>('POST', '/v1/agent/propose', 'session', body);
    return normalizeAgentPropose(data);
  },

  resetDemo: () => request<unknown>('POST', '/v1/demo/reset', 'session'),
};

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

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(rec: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

export function normalizeAgentPropose(data: unknown): AgentProposeResponse {
  const rec = readRecord(data);
  const policyRec = readRecord(rec.policy);
  const proposalRec = readRecord(rec.proposal);
  let sessionId = readString(rec, 'sessionId', 'session_id');
  const approvalUrl = readString(rec, 'approvalUrl', 'approval_url');
  if (!sessionId && approvalUrl) {
    const match = approvalUrl.match(/\/sessions\/([^/?#]+)/);
    if (match) sessionId = decodeURIComponent(match[1]);
  }
  return {
    decision: String(rec.decision ?? ''),
    policy: policyRec as AgentPolicy,
    sessionId,
    approvalUrl,
    auditEventId: readString(rec, 'auditEventId', 'audit_event_id'),
    proposal: proposalRec as AgentProposal,
  };
}

export function sessionPathFromApproval(sessionId: string | null, approvalUrl: string | null): string | null {
  if (approvalUrl) {
    try {
      const url = new URL(approvalUrl, window.location.origin);
      return `${url.pathname}${url.search}`;
    } catch {
      if (approvalUrl.startsWith('/')) return approvalUrl;
    }
  }
  if (sessionId) return `/sessions/${encodeURIComponent(sessionId)}`;
  return null;
}
