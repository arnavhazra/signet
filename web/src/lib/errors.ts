import { ApiError } from '@/api/client';

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 0) return true;
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === 'TypeError' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed') ||
    msg.includes('cors')
  );
}

export function toUserMessage(
  err: unknown,
  surface: 'operator' | 'admin' | 'auditor' = 'operator',
): string {
  if (isNetworkFailure(err)) return 'Kernel unreachable.';

  if (err instanceof ApiError) {
    if (err.status === 403) {
      if (surface === 'auditor' || /auditor|read-only|readonly|forbidden/i.test(err.message)) {
        return 'Forbidden. Auditor role is read-only.';
      }
      if (surface === 'admin') {
        return 'Forbidden. Switch role to admin.';
      }
      return err.message || 'Forbidden.';
    }
    if (err.status === 401) {
      if (surface === 'admin') {
        return 'Unauthorized. Switch role to admin.';
      }
      return 'Unauthorized.';
    }
    if (err.status === 404) {
      if (/session/i.test(err.message)) return 'Session not found.';
      if (/workflow/i.test(err.message)) return 'Workflow not found. Publish a definition first.';
      if (/inbox/i.test(err.message)) return 'Inbox is not available yet.';
      return err.message;
    }
    if (err.status === 409 || err.code === 'CONFLICT') {
      return 'Conflict. This session changed — reloaded latest state. Retry if needed.';
    }
    if (err.status === 429) {
      return 'Rate limited. Wait a few seconds and retry.';
    }
    if (err.status === 503) return 'Kernel not ready.';
    return err.message;
  }
  if (err instanceof Error && err.message.trim()) {
    if (/cors|access-control/i.test(err.message)) return 'Kernel unreachable.';
    return err.message;
  }
  return 'Request failed.';
}

export function issuesFromError(err: unknown): string[] {
  if (!(err instanceof ApiError) || !err.body || typeof err.body !== 'object') return [];
  const rec = err.body as Record<string, unknown>;
  const raw = rec.issues ?? rec.errors;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'message' in item) {
        const message = (item as { message: unknown }).message;
        return typeof message === 'string' ? message : null;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
}
