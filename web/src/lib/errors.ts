import { ApiError, getBaseUrl } from '@/api/client';

function kernelStartHint(): string {
  const target = getBaseUrl() || `${window.location.protocol}//${window.location.host} (Vite proxy → :8000)`;
  return `Cannot reach the kernel at ${target}. From runtime/: source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000  (Supabase URL in .env; do not set TESTING=1.)`;
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 0) return true;
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === 'TypeError' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed')
  );
}

export function toUserMessage(err: unknown, surface: 'operator' | 'admin' = 'operator'): string {
  if (isNetworkFailure(err)) return kernelStartHint();

  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      if (surface === 'admin') {
        return `${err.message} Admin routes need a JWT with role=admin. Restore demo defaults under Swap keys, or paste ADMIN_JWT from python -m app.seed (must match JWT_SECRET).`;
      }
      return `${err.message} The demo runtime key should already be set. Under Swap keys, click Restore demo defaults — do not leave the API key blank.`;
    }
    if (err.status === 404) {
      if (/exception-review/i.test(err.message) || /workflow/i.test(err.message)) {
        return `${err.message} From runtime/: python -m app.seed  then retry.`;
      }
      if (/session/i.test(err.message)) {
        return `${err.message} Inject a mismatch to start a new session.`;
      }
    }
    if (err.status === 409) {
      return `${err.message} This session is already finished. Inject a mismatch to open a new one.`;
    }
    if (err.status === 429) {
      return `${err.message} This demo key is limited to 30 writes/minute. Wait a few seconds and retry.`;
    }
    return err.message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return 'Request failed.';
}
