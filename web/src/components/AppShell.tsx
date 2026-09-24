import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api, getLastRequestId, pingKernel, retryDemoSession, unwrapInbox } from '@/api/client';
import type { DemoAccount, InboxItem } from '@/api/types';
import { DEMO_ROLES, useDemoSession } from '@/auth/DemoSession';
import CommandPalette from '@/components/CommandPalette';
import { toUserMessage } from '@/lib/errors';
import { inboxCounts, rememberInbox } from '@/lib/inbox';
import { signetMeta } from '@/lib/meta';

export default function AppShell() {
  const demo = useDemoSession();
  const location = useLocation();
  const meta = signetMeta();
  const [health, setHealth] = useState<'unknown' | 'ok' | 'bad'>('unknown');
  const [healthHint, setHealthHint] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [footOpen, setFootOpen] = useState(false);

  const ping = useCallback(async () => {
    const started = performance.now();
    try {
      await pingKernel();
      setLatencyMs(Math.round(performance.now() - started));
      setRequestId(getLastRequestId());
      setHealth('ok');
      setHealthHint(null);
    } catch (err) {
      setLatencyMs(null);
      setRequestId(getLastRequestId());
      setHealth('bad');
      setHealthHint(toUserMessage(err, 'operator'));
    }
  }, []);

  const refreshInbox = useCallback(async () => {
    if (demo.status !== 'ready') return;
    const data = await api.listInbox();
    const items = unwrapInbox(data);
    setInboxItems(items);
    rememberInbox(items);
  }, [demo.status]);

  const refreshAccount = useCallback(async () => {
    if (demo.status !== 'ready') return;
    try {
      const next = await api.getDemoAccount();
      setAccount(next);
    } catch {
      setAccount(null);
    }
  }, [demo.status]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (demo.status === 'failed') {
        void retryDemoSession().catch(() => {
          /* keep kernel-down */
        });
        return;
      }
      if (demo.status === 'ready') void ping();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [demo.status, ping]);

  useEffect(() => {
    if (demo.status === 'ready') void ping();
  }, [demo.status, ping]);

  useEffect(() => {
    void refreshInbox().catch(() => {
      /* badges stay stale */
    });
  }, [refreshInbox, location.pathname]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount, location.pathname]);

  useEffect(() => {
    const onChange = () => {
      void refreshInbox().catch(() => {
        /* badges stay stale */
      });
      void refreshAccount();
    };
    window.addEventListener('signet:demo-reset', onChange);
    window.addEventListener('signet:role', onChange);
    return () => {
      window.removeEventListener('signet:demo-reset', onChange);
      window.removeEventListener('signet:role', onChange);
    };
  }, [refreshAccount, refreshInbox]);

  const warming = demo.status === 'pending' || demo.status === 'warming';
  const down = demo.status === 'failed' || (demo.status === 'ready' && health === 'bad');
  const healthLabel = warming
    ? 'Kernel warming…'
    : down
      ? 'Kernel is down'
      : health === 'ok'
        ? 'Kernel reachable'
        : 'Checking kernel';
  const bannerText = warming
    ? 'Kernel warming…'
    : demo.status === 'failed'
      ? 'Kernel is down'
      : health === 'bad'
        ? healthHint
        : null;
  const bannerTone = warming ? 'warn' : bannerText ? 'error' : null;
  const counts = inboxCounts(inboxItems);
  const orgLabel = account?.orgName?.trim() || 'Demo org';

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="rail">
        <Link className="brand" to="/" data-testid="brand-home">
          <div className="brand__mark">
            <span className="brand__glyph" aria-hidden="true">
              S
            </span>
            <p className="brand__title">Signet</p>
          </div>
          <p className="brand__sub">Governed action kernel</p>
        </Link>
        <nav className="nav" aria-label="Primary">
          <div className="nav__label">Work</div>
          <NavLink to="/inbox" end className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}>
            Inbox
            {counts.open > 0 || counts.awaiting > 0 ? (
              <span className="nav__badges" aria-hidden="true">
                {counts.open > 0 ? (
                  <span className="nav__badge" title="Open">
                    {counts.open}
                  </span>
                ) : null}
                {counts.awaiting > 0 ? (
                  <span className="nav__badge nav__badge--wait" title="Awaiting checker">
                    {counts.awaiting}
                  </span>
                ) : null}
              </span>
            ) : null}
          </NavLink>
          <NavLink to="/agent" className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}>
            Agent
          </NavLink>
          <NavLink to="/audit" className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}>
            Audit
          </NavLink>
          <NavLink to="/admin" className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}>
            Admin
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}>
            Settings
          </NavLink>
          <div className="nav__label nav__label--next">Reference</div>
          <a className="nav__link" href="/docs" target="_blank" rel="noreferrer">
            Docs
          </a>
        </nav>
        <button
          className="btn btn--ghost rail__foot-toggle"
          type="button"
          aria-expanded={footOpen}
          data-testid="rail-foot-toggle"
          onClick={() => setFootOpen((prev) => !prev)}
        >
          {footOpen ? 'Hide console tools' : 'Console tools'}
        </button>
        <div className={`rail__foot${footOpen ? ' is-open' : ''}`}>
          <div className="syscard" data-testid="system-card">
            <div className="health" role="status">
              <span className={`led ${warming ? 'is-wait' : health === 'ok' && !down ? 'is-ok' : down ? 'is-bad' : ''}`} />
              {healthLabel}
            </div>
            {down && healthHint && demo.status === 'ready' ? <p className="health__hint">{healthHint}</p> : null}
            <p className="syscard__meta">
              <span>{latencyMs != null ? `${latencyMs}ms` : '—'}</span>
              <span className="mono" title={requestId ?? undefined}>
                {requestId ? requestId.slice(0, 8) : '—'}
              </span>
              <span className="mono" title={`v${meta.version}`}>
                {meta.commit}
              </span>
              <span title="pytest count at build">pytest at build · {meta.tests}</span>
            </p>
            <a className="syscard__link" href="/openapi.json">
              openapi.json
            </a>
          </div>
          <div className="identity">
            <p className="identity__org" data-testid="rail-org">
              {orgLabel}
            </p>
            <p className="identity__sim">Simulated demo</p>
            <p className="identity__meta">{demo.role}</p>
            <p className="identity__hint">Demo impersonation — not SSO</p>
            <div className="role-switch" role="radiogroup" aria-label="Role">
              {DEMO_ROLES.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={demo.role === item}
                  className={`btn btn--small role-switch__btn${demo.role === item ? ' is-selected btn--gold' : ''}`}
                  disabled={demo.roleBusy || demo.status !== 'ready'}
                  data-testid={`role-${item}`}
                  onClick={() => void demo.switchRole(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <CommandPalette items={inboxItems} />
          <button
            className="btn btn--wide"
            type="button"
            data-testid="reset-demo"
            disabled={demo.resetBusy || demo.status !== 'ready'}
            onClick={demo.openResetConfirm}
          >
            {demo.resetBusy ? 'Resetting…' : 'Reset demo'}
          </button>
        </div>
      </aside>
      <div className="stage" id="main" tabIndex={-1}>
        {bannerTone === 'warn' && bannerText ? (
          <p className="banner banner--warn" role="status">
            {bannerText}
          </p>
        ) : null}
        {bannerTone === 'error' && bannerText ? (
          <p className="banner banner--error" role="alert">
            {bannerText}
          </p>
        ) : null}
        <Outlet />
      </div>
    </div>
  );
}
