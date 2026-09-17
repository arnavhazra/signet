import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'signet.tour.v1';

export type TourStepId =
  | 'inbox'
  | 'high-delta'
  | 'maker'
  | 'checker-role'
  | 'checker-approve'
  | 'audit'
  | 'replay'
  | 'agent';

type TourStep = {
  id: TourStepId;
  title: string;
  body: string;
  target: string | null;
  action?: 'click';
  wait?: 'awaiting_checker' | 'checker-role' | 'terminal';
};

type StoredTour = {
  stepId: TourStepId;
  sessionId: string | null;
  status: 'in_progress' | 'done' | 'skipped';
};

type TourContextValue = {
  active: boolean;
  step: TourStep;
  stepIndex: number;
  stepCount: number;
  sessionId: string | null;
  resumable: boolean;
  start: () => void;
  skip: () => void;
  back: () => void;
  next: () => void;
};

const STEPS: TourStep[] = [
  {
    id: 'inbox',
    title: 'Inbox',
    body: 'Book vs custodian breaks. Delta is computed on the server.',
    target: '[data-testid="inbox-table"]',
  },
  {
    id: 'high-delta',
    title: 'High-delta row',
    body: 'Open a break over the dual-control threshold.',
    target: '[data-tour="high-delta"]',
    action: 'click',
  },
  {
    id: 'maker',
    title: 'Maker accept',
    body: 'Accept as maker. Remediation does not write yet.',
    target: '[data-testid="action-accept_adjustment"]',
    action: 'click',
    wait: 'awaiting_checker',
  },
  {
    id: 'checker-role',
    title: 'Switch role',
    body: 'High-delta writes need a second human. Switch to checker.',
    target: '[data-testid="role-checker"]',
    action: 'click',
    wait: 'checker-role',
  },
  {
    id: 'checker-approve',
    title: 'Checker approve',
    body: 'Second accept. The tool gateway writes with an audit row.',
    target: '[data-testid="action-accept_adjustment"]',
    action: 'click',
    wait: 'terminal',
  },
  {
    id: 'audit',
    title: 'Audit',
    body: 'Two humans plus remediation.written for this session.',
    target: '[data-testid="audit-search"]',
  },
  {
    id: 'replay',
    title: 'Replay',
    body: 'Immutable workflow version. The card that was shown.',
    target: '[data-testid="replay-stripped"]',
  },
  {
    id: 'agent',
    title: 'Agent console',
    body: 'Propose a write. Policy opens a session or denies. No silent write.',
    target: '[data-testid="agent-prompt"]',
  },
];

const TourContext = createContext<TourContextValue | null>(null);

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readStore(): StoredTour | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTour>;
    if (!parsed || typeof parsed !== 'object') return null;
    const stepId = STEPS.some((step) => step.id === parsed.stepId) ? (parsed.stepId as TourStepId) : 'inbox';
    return {
      stepId,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      status: parsed.status === 'done' || parsed.status === 'skipped' ? parsed.status : 'in_progress',
    };
  } catch {
    return null;
  }
}

function writeStore(next: StoredTour): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

function parseTourParam(raw: string | null): number | null {
  if (!raw) return null;
  const byId = STEPS.findIndex((step) => step.id === raw);
  if (byId >= 0) return byId;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1 && n <= STEPS.length) return n - 1;
  }
  return null;
}

function sessionFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/sessions\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function hrefFor(step: TourStep, sessionId: string | null): string {
  const url = new URL(window.location.origin);
  switch (step.id) {
    case 'inbox':
    case 'high-delta':
      url.pathname = '/';
      break;
    case 'maker':
    case 'checker-role':
    case 'checker-approve':
      url.pathname = sessionId ? `/sessions/${encodeURIComponent(sessionId)}` : '/';
      break;
    case 'audit':
      url.pathname = '/audit';
      if (sessionId) url.searchParams.set('session', sessionId);
      break;
    case 'replay':
      url.pathname = sessionId ? `/sessions/${encodeURIComponent(sessionId)}/replay` : '/';
      break;
    case 'agent':
      url.pathname = '/agent';
      break;
  }
  return `${url.pathname}${url.search}`;
}

function withTourParam(href: string, stepId: TourStepId): string {
  const url = new URL(href, window.location.origin);
  url.searchParams.set('tour', stepId);
  return `${url.pathname}${url.search}`;
}

function dropTourParam(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete('tour');
  const q = params.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const urlIndex = parseTourParam(new URLSearchParams(location.search).get('tour'));
  const stored = readStore();
  const [active, setActive] = useState(urlIndex != null);
  const [stepIndex, setStepIndex] = useState(urlIndex ?? 0);
  const [sessionId, setSessionId] = useState<string | null>(
    stored?.sessionId ?? sessionFromPath(location.pathname),
  );
  const actingRef = useRef(false);
  const stepIndexRef = useRef(stepIndex);
  const sessionRef = useRef(sessionId);
  stepIndexRef.current = stepIndex;
  sessionRef.current = sessionId;

  const step = STEPS[stepIndex] ?? STEPS[0];
  const resumable = stored?.status === 'in_progress';

  const persist = useCallback((patch: Partial<StoredTour>) => {
    const prev = readStore();
    writeStore({
      stepId: (patch.stepId ?? prev?.stepId ?? 'inbox') as TourStepId,
      sessionId: patch.sessionId === undefined ? (prev?.sessionId ?? sessionRef.current) : patch.sessionId,
      status: patch.status ?? prev?.status ?? 'in_progress',
    });
  }, []);

  const goToIndex = useCallback(
    (index: number, sid: string | null = sessionRef.current) => {
      if (index < 0) return;
      if (index >= STEPS.length) {
        setActive(false);
        persist({ status: 'done', stepId: 'agent', sessionId: sid });
        navigate(dropTourParam(location.pathname, location.search), { replace: true });
        return;
      }
      const nextStep = STEPS[index];
      persist({ status: 'in_progress', stepId: nextStep.id, sessionId: sid });
      navigate(withTourParam(hrefFor(nextStep, sid), nextStep.id), { replace: true });
    },
    [location.pathname, location.search, navigate, persist],
  );

  useEffect(() => {
    if (urlIndex == null) return;
    setActive(true);
    setStepIndex(urlIndex);
    persist({ status: 'in_progress', stepId: STEPS[urlIndex].id });
  }, [persist, urlIndex]);

  useEffect(() => {
    const fromPath = sessionFromPath(location.pathname);
    if (fromPath && fromPath !== sessionRef.current) {
      setSessionId(fromPath);
      persist({ sessionId: fromPath });
    }
  }, [location.pathname, persist]);

  useEffect(() => {
    if (!active) return;
    if (step.id !== 'high-delta') return;
    const sid = sessionFromPath(location.pathname);
    if (!sid) return;
    goToIndex(stepIndex + 1, sid);
  }, [active, goToIndex, location.pathname, step.id, stepIndex]);

  useEffect(() => {
    if (!active) return;
    const onSession = (event: Event) => {
      const detail = (event as CustomEvent<SignetSessionTourDetail>).detail;
      if (detail.sessionId) {
        setSessionId(detail.sessionId);
        persist({ sessionId: detail.sessionId });
      }
      const current = STEPS[stepIndexRef.current];
      const sid = detail.sessionId || sessionRef.current;
      if (current.id === 'maker' && detail.awaitingChecker) goToIndex(stepIndexRef.current + 1, sid);
      else if (current.id === 'maker' && detail.terminal) {
        goToIndex(
          STEPS.findIndex((item) => item.id === 'audit'),
          sid,
        );
      } else if (current.id === 'checker-approve' && detail.terminal) {
        goToIndex(stepIndexRef.current + 1, sid);
      }
    };
    const onRole = (event: Event) => {
      const role = (event as CustomEvent<{ role: string }>).detail.role;
      const current = STEPS[stepIndexRef.current];
      if (current.id === 'checker-role' && role === 'checker') {
        goToIndex(stepIndexRef.current + 1, sessionRef.current);
      }
    };
    window.addEventListener('signet:session', onSession);
    window.addEventListener('signet:role', onRole);
    return () => {
      window.removeEventListener('signet:session', onSession);
      window.removeEventListener('signet:role', onRole);
    };
  }, [active, goToIndex, persist]);

  const skip = useCallback(() => {
    setActive(false);
    persist({ status: 'skipped', stepId: step.id, sessionId: sessionRef.current });
    navigate(dropTourParam(location.pathname, location.search), { replace: true });
  }, [location.pathname, location.search, navigate, persist, step.id]);

  const start = useCallback(() => {
    const saved = readStore();
    const resume = saved?.status === 'in_progress' ? STEPS.findIndex((item) => item.id === saved.stepId) : 0;
    const index = resume >= 0 ? resume : 0;
    const sid = saved?.sessionId ?? sessionRef.current;
    if (sid) setSessionId(sid);
    setActive(true);
    persist({ status: 'in_progress', stepId: STEPS[index].id, sessionId: sid });
    navigate(withTourParam(hrefFor(STEPS[index], sid), STEPS[index].id), { replace: true });
  }, [navigate, persist]);

  const back = useCallback(() => {
    goToIndex(Math.max(0, stepIndex - 1));
  }, [goToIndex, stepIndex]);

  const next = useCallback(() => {
    const current = STEPS[stepIndex];
    let sid = sessionRef.current;
    if (current.action === 'click' && current.target) {
      const el = document.querySelector(current.target);
      if (el instanceof HTMLElement) {
        const fromEl =
          el.getAttribute('data-session-id') ?? el.closest('[data-session-id]')?.getAttribute('data-session-id');
        if (fromEl) {
          sid = fromEl;
          setSessionId(fromEl);
        }
        actingRef.current = true;
        el.click();
        actingRef.current = false;
      }
    }
    if (current.wait || current.id === 'high-delta') return;
    goToIndex(stepIndex + 1, sid);
  }, [goToIndex, stepIndex]);

  useEffect(() => {
    if (!active) return;
    const current = STEPS[stepIndex];
    const onClick = (event: MouseEvent) => {
      if (actingRef.current || !current.target) return;
      const node = event.target;
      if (!(node instanceof Element) || !node.closest(current.target)) return;
      const sid =
        node.closest('[data-session-id]')?.getAttribute('data-session-id') ??
        document.querySelector(current.target)?.getAttribute('data-session-id');
      if (sid) setSessionId(sid);
      if (current.wait || current.id === 'high-delta') return;
      goToIndex(stepIndex + 1, sid ?? sessionRef.current);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active, goToIndex, stepIndex]);

  const value = useMemo<TourContextValue>(
    () => ({
      active,
      step,
      stepIndex,
      stepCount: STEPS.length,
      sessionId,
      resumable,
      start,
      skip,
      back,
      next,
    }),
    [active, back, next, resumable, sessionId, skip, start, step, stepIndex],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour requires TourProvider');
  return ctx;
}

export default function Tour() {
  const { active, step, stepIndex, stepCount, skip, back, next } = useTour();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, skip]);

  useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }
    let scrolled = false;
    const measure = () => {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.target);
      if (!(el instanceof HTMLElement)) {
        setRect(null);
        return;
      }
      const nextRect = el.getBoundingClientRect();
      setRect(nextRect);
      if (!scrolled) {
        const visible = nextRect.top >= 72 && nextRect.bottom <= window.innerHeight - 96;
        if (!visible) {
          el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        }
        scrolled = true;
      }
    };
    measure();
    const timer = window.setInterval(measure, 200);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, reduced, step.id, step.target]);

  useEffect(() => {
    if (!active) return;
    cardRef.current?.focus();
  }, [active, step.id]);

  if (!active) return null;

  const last = stepIndex === stepCount - 1;
  const missing = Boolean(step.target && !rect);
  const spotStyle = rect
    ? {
        top: Math.max(8, rect.top - 6),
        left: Math.max(8, rect.left - 6),
        width: rect.width + 12,
        height: rect.height + 12,
      }
    : undefined;

  return (
    <div className={`tour${reduced ? ' tour--static' : ''}`}>
      {rect ? <div className="tour__spot" style={spotStyle} /> : <div className="tour__dim" />}
      <div
        ref={cardRef}
        className="tour__card"
        role="dialog"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        style={cardPlacement(rect)}
      >
        <p className="tour__progress">
          {stepIndex + 1} / {stepCount}
        </p>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">{step.body}</p>
        {missing ? <p className="help">Waiting for that control…</p> : null}
        <div className="tour__actions">
          <button className="btn btn--ghost" type="button" onClick={skip}>
            Skip
          </button>
          <button className="btn" type="button" onClick={back} disabled={stepIndex === 0}>
            Back
          </button>
          <button className="btn btn--gold" type="button" onClick={next}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

function cardPlacement(rect: DOMRect | null): CSSProperties {
  const width = Math.min(360, window.innerWidth - 24);
  if (window.innerWidth < 960) {
    return { position: 'fixed', left: 12, right: 12, bottom: 12, width: 'auto' };
  }
  if (!rect) {
    return { position: 'fixed', left: 12, bottom: 12, width };
  }
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  if (rect.bottom + 220 < window.innerHeight) {
    return { position: 'fixed', top: rect.bottom + 12, left, width };
  }
  if (rect.top > 220) {
    return { position: 'fixed', top: Math.max(12, rect.top - 200), left, width };
  }
  return { position: 'fixed', left: 12, bottom: 12, width };
}
