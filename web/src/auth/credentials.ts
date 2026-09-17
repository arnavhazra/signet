const STORAGE_KEY = 'forge.runtime.credentials.v1';

export type Credentials = {
  apiKey: string;
  jwt: string;
};

/**
 * Optional local override. The SPA authenticates with the demo cookie, not this key.
 * Sending it on the public demo joins the shared org — do not default it into fetches.
 */
export const DEMO_RUNTIME_KEY = 'demo-runtime-key';

function demoCredentials(): Credentials {
  const envKey = typeof import.meta.env.VITE_API_KEY === 'string' ? import.meta.env.VITE_API_KEY.trim() : '';
  return {
    apiKey: envKey,
    jwt: '',
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
    apiKey: typeof stored?.apiKey === 'string' ? stored.apiKey.trim() : demo.apiKey,
    jwt: typeof stored?.jwt === 'string' ? stored.jwt.trim() : '',
  };
}

export function ensureDemoCredentials(): Credentials {
  const demo = demoCredentials();
  try {
    const stored = readStored();
    return fillGaps(stored);
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
    /* private mode */
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
