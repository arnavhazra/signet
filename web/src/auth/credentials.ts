const STORAGE_KEY = 'forge.runtime.credentials.v1';

export type Credentials = {
  apiKey: string;
  jwt: string;
};

/**
 * Public interview-demo runtime key (also in runtime/.env.example).
 * Hardcoded so the first Operator click works without opening Credentials.
 * Production would inject this via env / a secret manager — never a public constant.
 */
export const DEMO_RUNTIME_KEY = 'demo-runtime-key';

/**
 * Interview-demo admin JWT for GET /admin/*.
 * Signed with the well-known local secret `dev-jwt-secret-change-me` (runtime/.env.example),
 * role=admin, ~400-day expiry. Production would mint this from an IdP — do not ship long-lived admin JWTs.
 */
export const DEMO_ADMIN_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLWFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzg5NDEyODQ1LCJleHAiOjE4MjM5NzI4NDV9.kN-gBhPCieA98utGrt4-9Zv-Vp8A6iaPZ_9_yUrb0Ck';

function demoCredentials(): Credentials {
  const envKey = typeof import.meta.env.VITE_API_KEY === 'string' ? import.meta.env.VITE_API_KEY.trim() : '';
  const envJwt =
    typeof import.meta.env.VITE_DEMO_ADMIN_JWT === 'string' ? import.meta.env.VITE_DEMO_ADMIN_JWT.trim() : '';
  return {
    apiKey: envKey || DEMO_RUNTIME_KEY,
    jwt: envJwt,
  };
}

function readStored(): Partial<Credentials> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(next: Credentials): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('forge-credentials'));
}

function fillGaps(stored: Partial<Credentials> | null): Credentials {
  const demo = demoCredentials();
  return {
    apiKey: typeof stored?.apiKey === 'string' && stored.apiKey.trim() ? stored.apiKey.trim() : demo.apiKey,
    jwt: typeof stored?.jwt === 'string' && stored.jwt.trim() ? stored.jwt.trim() : demo.jwt,
  };
}

/** Seed demo key + admin JWT on first load (or if a previous save left blanks). */
export function ensureDemoCredentials(): Credentials {
  const demo = demoCredentials();
  try {
    const stored = readStored();
    const next = fillGaps(stored);
    const needsWrite =
      stored === null || typeof stored.apiKey !== 'string' || !stored.apiKey.trim();
    if (needsWrite) persist(next);
    return next;
  } catch {
    return demo;
  }
}

export function readCredentials(): Credentials {
  return fillGaps(readStored());
}

export function writeCredentials(next: Credentials): void {
  persist({
    apiKey: next.apiKey.trim(),
    jwt: next.jwt.trim(),
  });
}

export function restoreDemoCredentials(): Credentials {
  const demo = demoCredentials();
  try {
    persist(demo);
  } catch {
    /* private mode — still return the in-memory demo pair */
  }
  return demo;
}

export function subscribeCredentials(listener: () => void): () => void {
  window.addEventListener('forge-credentials', listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener('forge-credentials', listener);
    window.removeEventListener('storage', listener);
  };
}
