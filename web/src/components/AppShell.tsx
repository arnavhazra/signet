import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api, getLastRequestId, retryDemoSession } from '@/api/client';
import { DEMO_ROLES, useDemoSession } from '@/auth/DemoSession';
import { toUserMessage } from '@/lib/errors';
import { signetMeta } from '@/lib/meta';

export default function AppShell() {
  const demo = useDemoSession();
  const meta = signetMeta();
  const [health, setHealth] = useState<'unknown' | 'ok' | 'bad'>('unknown');
  const [healthHint, setHealthHint] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const ping = useCallback(async () => {
    const started = performance.now();
    try {
      await api.health();
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

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="rail">
        <div className="brand">
          <div className="brand__mark">
            <span className="brand__glyph" aria-hidden="true">
              S
            </span>
            <p className="brand__title">Signet</p>
          </div>
          <p className="brand__sub">Governed action kernel</p>
        </div>
        <nav className="nav" aria-label="Primary">
          <div className="nav__label">Work</div>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}>
            Inbox
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
          <div className="nav__label nav__label--next">Reference</div>
          <a className="nav__link" href="/docs" target="_blank" rel="noreferrer">
            Docs
          </a>
        </nav>
        <div className="rail__foot">
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
              <span title="pytest count at build">{meta.tests} tests</span>
            </p>
            <a className="syscard__link" href="/openapi.json">
              openapi.json
            </a>
          </div>
          <p className="health__hint">Role</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {DEMO_ROLES.map((item) => (
              <button
                key={item}
                type="button"
                className={`btn btn--small ${demo.role === item ? 'btn--gold' : ''}`}
                disabled={demo.roleBusy || demo.status !== 'ready'}
                data-testid={`role-${item}`}
                onClick={() => void demo.switchRole(item)}
              >
                {item}
              </button>
            ))}
          </div>
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
