type SignetMeta = {
  version: string;
  commit: string;
  tests: number;
};

const fallback: SignetMeta = { version: '0.2.0', commit: 'dev', tests: 0 };

export function signetMeta(): SignetMeta {
  try {
    return typeof __SIGNET_META__ === 'object' && __SIGNET_META__ ? __SIGNET_META__ : fallback;
  } catch {
    return fallback;
  }
}
