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
import { getDemoRuntime } from '@/api/client';
import { useDemoSession } from '@/auth/DemoSession';
import { TOUR_STORAGE_KEY } from '@/lib/tourStorage';

export type TourStepId =
  | 'inbox'
  | 'high-delta'
  | 'maker'
  | 'checker-role'
  | 'checker-approve'
  | 'audit'
  | 'replay'
  | 'agent';

type TourSignal =
  | 'row-open'
  | 'awaitingChecker'
  | 'checkerRole'
  | 'terminal'
  | 'auditWritten'
  | 'replayStripped'
  | 'requiresHuman';

type TourStep = {
  id: TourStepId;
  title: string;
  body: string;
  target: string | null;
  action?: 'click';
  signal?: TourSignal;
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
  canNext: boolean;
  missing: boolean;
  waitingHint: string | null;
  nextLabel: string;
  start: () => void;
  skip: () => void;
  back: () => void;
  next: () => void;
  restart: () => void;
};

const STEPS: TourStep[] = [
  {
    id: 'inbox',
    title: 'Inbox',
    body: 'Book vs custodian breaks. Delta is computed on the server.',
    target: '[data-tour="high-delta"]',
  },
  {
    id: 'high-delta',
    title: 'High-delta row',
    body: 'Open an exception-review break over the dual-control threshold.',
    target: '[data-tour="high-delta"]',
    action: 'click',
    signal: 'row-open',
  },
  {
    id: 'maker',
    title: 'Maker accept',
    body: 'Accept as maker. Remediation does not write yet.',
    target: '[data-testid="action-accept_adjustment"]',
    action: 'click',
    signal: 'awaitingChecker',
  },
  {
    id: 'checker-role',
    title: 'Switch role',
    body: 'High-delta writes need a second human. Switch to checker.',
    target: '[data-testid="role-checker"]',
    action: 'click',
    signal: 'checkerRole',
  },
  {
    id: 'checker-approve',
    title: 'Checker approve',
    body: 'Second accept. The tool gateway writes with an audit row.',
    target: '[data-testid="action-accept_adjustment"]',
    action: 'click',
    signal: 'terminal',
  },
  {
    id: 'audit',
    title: 'Audit',
    body: 'Two humans plus remediation.written for this session.',
    target: '[data-testid="audit-search"]',
    signal: 'auditWritten',
  },
  {
    id: 'replay',
    title: 'Replay',
    body: 'Immutable workflow version. The card that was shown.',
    target: '[data-testid="replay-stripped"]',
    signal: 'replayStripped',
  },
  {
    id: 'agent',
    title: 'Propose write',
    body: 'Canned resolve_break on A-214. Policy must return requires_human — no silent write.',
    target: '[data-testid="agent-chip-write"]',
    action: 'click',
    signal: 'requiresHuman',
  },
];

const MISSING_MS = 20_000;
const TourContext = createContext<TourContextValue | null>(null);

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readStore(): StoredTour | null {
  try {
    const raw = localStorage.getItem(TOUR_STORAGE_KEY);
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
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(next));
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

function queryTarget(selector: string | null): HTMLElement | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  return el instanceof HTMLElement ? el : null;
}

function targetExists(selector: string | null): boolean {
  return queryTarget(selector) != null;
}

function targetEnabled(selector: string | null): boolean {
  const el = queryTarget(selector);
  if (!el) return false;
  if ('disabled' in el && (el as HTMLButtonElement).disabled) return false;
  return true;
}

function signalMet(step: TourStep, pathname: string, last: SignetSessionTourDetail | null): boolean {
  switch (step.signal) {
    case 'row-open':
      return Boolean(sessionFromPath(pathname));
    case 'awaitingChecker':
      return Boolean(last?.awaitingChecker);
    case 'checkerRole':
      return getDemoRuntime().role === 'checker';
    case 'terminal':
      return Boolean(last?.terminal);
    case 'auditWritten':
      return Boolean(document.querySelector('[data-event-type="remediation.written"]'));
    case 'replayStripped': {
      const el = document.querySelector('[data-testid="replay-stripped"]');
      if (!(el instanceof HTMLElement)) return false;
      const text = el.textContent ?? '';
      return text.trim().length > 2 && !text.includes('"binding"');
    }
    case 'requiresHuman': {
      const el = document.querySelector('[data-testid="agent-verdict"]');
      return el instanceof HTMLElement && el.getAttribute('data-decision') === 'requires_human';
    }
    default:
      return false;
  }
}

function waitingCopy(step: TourStep, runtimeStatus: string): string {
  if (runtimeStatus === 'pending' || runtimeStatus === 'warming') return 'Kernel warming…';
  switch (step.id) {
    case 'inbox':
    case 'high-delta':
      return 'Waiting for an open high-delta exception-review row…';
    case 'maker':
      return 'Waiting for the maker accept control…';
    case 'checker-role':
      return 'Waiting for the checker role control…';
    case 'checker-approve':
      return 'Waiting for the checker accept control…';
    case 'audit':
      return 'Waiting for remediation.written on this session…';
    case 'replay':
      return 'Waiting for the stripped replay contract…';
    case 'agent':
      return 'Waiting for Propose write…';
    default:
      return 'Waiting for that control…';
  }
}

export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const demo = useDemoSession();
  const urlIndex = parseTourParam(new URLSearchParams(location.search).get('tour'));
  const stored = readStore();
  const [active, setActive] = useState(urlIndex != null);
  const [stepIndex, setStepIndex] = useState(urlIndex ?? 0);
  const [sessionId, setSessionId] = useState<string | null>(
    stored?.sessionId ?? sessionFromPath(location.pathname),
  );
  const [targetPresent, setTargetPresent] = useState(false);
  const [humanReady, setHumanReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const actingRef = useRef(false);
  const advancingRef = useRef(false);
  const autoRetryRef = useRef(0);
  const missingSinceRef = useRef<number | null>(null);
  const stepIndexRef = useRef(stepIndex);
  const sessionRef = useRef(sessionId);
  const lastSessionRef = useRef<SignetSessionTourDetail | null>(null);
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
      if (index < 0 || advancingRef.current) return;
      if (index >= STEPS.length) {
        advancingRef.current = true;
        setActive(false);
        persist({ status: 'done', stepId: 'agent', sessionId: sid });
        navigate(dropTourParam(location.pathname, location.search), { replace: true });
        return;
      }
      advancingRef.current = true;
      const nextStep = STEPS[index];
      persist({ status: 'in_progress', stepId: nextStep.id, sessionId: sid });
      navigate(withTourParam(hrefFor(nextStep, sid), nextStep.id), { replace: true });
    },
    [location.pathname, location.search, navigate, persist],
  );

  useEffect(() => {
    advancingRef.current = false;
    missingSinceRef.current = null;
    setMissing(false);
    setHumanReady(false);
  }, [stepIndex]);

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
    const onSession = (event: Event) => {
      const detail = (event as CustomEvent<SignetSessionTourDetail>).detail;
      lastSessionRef.current = detail;
      if (detail.sessionId) {
        setSessionId(detail.sessionId);
        persist({ sessionId: detail.sessionId });
      }
    };
    const onReset = (event: Event) => {
      const source = (event as CustomEvent<{ source?: string }>).detail?.source;
      if (source === 'tour') return;
      setActive(false);
      setSessionId(null);
      setStepIndex(0);
      lastSessionRef.current = null;
    };
    window.addEventListener('signet:session', onSession);
    window.addEventListener('signet:demo-reset', onReset);
    return () => {
      window.removeEventListener('signet:session', onSession);
      window.removeEventListener('signet:demo-reset', onReset);
    };
  }, [persist]);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const current = STEPS[stepIndexRef.current];
      const present = !current.target || targetExists(current.target);
      setTargetPresent(present);
      const kernelReady = getDemoRuntime().status === 'ready';
      if (!present) {
        if (!kernelReady || demo.resetBusy) {
          missingSinceRef.current = null;
          setMissing(false);
        } else {
          if (missingSinceRef.current == null) missingSinceRef.current = Date.now();
          const waited = Date.now() - missingSinceRef.current;
          if (waited >= MISSING_MS) setMissing(true);
        }
      } else {
        missingSinceRef.current = null;
        setMissing(false);
      }
      if (!current.signal) return;
      if (!signalMet(current, window.location.pathname, lastSessionRef.current)) return;
      if (current.id === 'agent') {
        setHumanReady(true);
        return;
      }
      goToIndex(stepIndexRef.current + 1, sessionRef.current);
    };
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [active, demo.resetBusy, goToIndex, location.pathname, stepIndex]);

  const skip = useCallback(() => {
    setActive(false);
    persist({ status: 'skipped', stepId: step.id, sessionId: sessionRef.current });
    navigate(dropTourParam(location.pathname, location.search), { replace: true });
  }, [location.pathname, location.search, navigate, persist, step.id]);

  const runStart = useCallback(async () => {
    lastSessionRef.current = null;
    setSessionId(null);
    setStepIndex(0);
    setHumanReady(false);
    setMissing(false);
    missingSinceRef.current = null;
    setActive(true);
    navigate(withTourParam('/', 'inbox'), { replace: true });
    try {
      await demo.resetImmediate();
      persist({ status: 'in_progress', stepId: 'inbox', sessionId: null });
    } catch {
      persist({ status: 'in_progress', stepId: 'inbox', sessionId: null });
    }
  }, [demo, navigate, persist]);

  const start = useCallback(() => {
    autoRetryRef.current = 0;
    void runStart();
  }, [runStart]);

  const restart = useCallback(() => {
    autoRetryRef.current = 0;
    void runStart();
  }, [runStart]);

  useEffect(() => {
    if (!active || !missing) return;
    if (autoRetryRef.current >= 1) return;
    const id = STEPS[stepIndexRef.current]?.id;
    if (sessionRef.current && (id === 'maker' || id === 'checker-role' || id === 'checker-approve')) return;
    autoRetryRef.current = 1;
    void runStart();
  }, [active, missing, runStart]);

  const back = useCallback(() => {
    goToIndex(Math.max(0, stepIndex - 1));
  }, [goToIndex, stepIndex]);

  const next = useCallback(() => {
    const current = STEPS[stepIndex];
    let sid = sessionRef.current;
    if (current.id === 'agent' && humanReady) {
      goToIndex(STEPS.length, sid);
      return;
    }
    if (!current.target || !targetEnabled(current.target)) return;
    if (current.action === 'click' && current.target) {
      const el = queryTarget(current.target);
      if (el) {
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
    if (current.signal) return;
    goToIndex(stepIndex + 1, sid);
  }, [goToIndex, humanReady, stepIndex]);

  useEffect(() => {
    if (!active) return;
    const current = STEPS[stepIndex];
    const onClick = (event: MouseEvent) => {
      if (actingRef.current || !current.target) return;
      const node = event.target;
      if (!(node instanceof Element) || !node.closest(current.target)) return;
      const sid =
        node.closest('[data-session-id]')?.getAttribute('data-session-id') ??
        queryTarget(current.target)?.getAttribute('data-session-id');
      if (sid) setSessionId(sid);
      if (current.signal) return;
      goToIndex(stepIndex + 1, sid ?? sessionRef.current);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active, goToIndex, stepIndex]);

  const last = stepIndex === STEPS.length - 1;
  const canNext = Boolean((!step.target || targetEnabled(step.target)) && (step.id !== 'agent' || !humanReady || last));
  const nextLabel = last ? (humanReady ? 'Done' : 'Propose write') : 'Next';
  const waitingHint =
    !targetPresent || (step.signal && step.id !== 'agent' && !signalMet(step, location.pathname, lastSessionRef.current))
      ? waitingCopy(step, demo.status)
      : step.id === 'agent' && !humanReady
        ? 'Click Propose write, then wait for requires_human.'
        : null;

  const value = useMemo<TourContextValue>(
    () => ({
      active,
      step,
      stepIndex,
      stepCount: STEPS.length,
      sessionId,
      resumable,
      canNext: Boolean(canNext && targetPresent),
      missing,
      waitingHint: missing ? null : waitingHint,
      nextLabel,
      start,
      skip,
      back,
      next,
      restart,
    }),
    [
      active,
      back,
      canNext,
      missing,
      next,
      nextLabel,
      restart,
      resumable,
      sessionId,
      skip,
      start,
      step,
      stepIndex,
      targetPresent,
      waitingHint,
    ],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour requires TourProvider');
  return ctx;
}

export { clearTourStorage } from '@/lib/tourStorage';

export default function Tour() {
  const { active, step, stepIndex, stepCount, skip, back, next, restart, canNext, missing, waitingHint, nextLabel } =
    useTour();
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
        data-testid="tour-dialog"
        style={cardPlacement(rect)}
      >
        <p className="tour__progress">
          {stepIndex + 1} / {stepCount}
        </p>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">{step.body}</p>
        {missing ? (
          <p className="help">Target missing. Reset and restart — do not wait on a dead overlay.</p>
        ) : waitingHint ? (
          <p className="help">{waitingHint}</p>
        ) : null}
        <div className="tour__actions">
          <button className="btn btn--ghost" type="button" data-testid="tour-skip" onClick={skip}>
            Skip
          </button>
          <button className="btn" type="button" data-testid="tour-back" onClick={back} disabled={stepIndex === 0}>
            Back
          </button>
          {missing ? (
            <button className="btn btn--gold" type="button" data-testid="tour-reset" onClick={restart}>
              Reset and restart
            </button>
          ) : (
            <button className="btn btn--gold" type="button" data-testid="tour-next" onClick={next} disabled={!canNext}>
              {nextLabel}
            </button>
          )}
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
