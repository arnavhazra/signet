/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_API_KEY: string;
  readonly VITE_DEMO_ADMIN_JWT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __SIGNET_META__: {
  version: string;
  commit: string;
  tests: number;
};

interface SignetSessionTourDetail {
  sessionId: string;
  status: string;
  awaitingChecker: boolean;
  terminal: boolean;
}

interface WindowEventMap {
  'signet:session': CustomEvent<SignetSessionTourDetail>;
  'signet:role': CustomEvent<{ role: string }>;
  'signet:demo-reset': Event;
}
