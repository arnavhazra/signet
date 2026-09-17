import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, ensureDemoSession, getLastRequestId } from '@/api/client';
import { toUserMessage } from '@/lib/errors';
import { signetMeta } from '@/lib/meta';

const DEMO_ROLES = ['operator', 'checker', 'auditor', 'admin'] as const;
type DemoRole = (typeof DEMO_ROLES)[number];

export default function AppShell() {
  const navigate = useNavigate();
  const meta = signetMeta();
  const [health, setHealth] = useState<'unknown' | 'ok' | 'bad'>('unknown');
  const [healthHint, setHealthHint] = useState<string | null>(null);
  const [role, setRole] = useState<DemoRole>('operator');
  const [roleBusy, setRoleBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
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
    let cancelled = false;
    void (async () => {
      await ensureDemoSession('operator');
      if (!cancelled) {
        try {
          const me = await api.authMe();
          if (DEMO_ROLES.includes(me.role as DemoRole)) setRole(me.role as DemoRole);
        } catch {
          /* cookie optional; API key still works locally */
        }
        await ping();
      }
    })();
    const timer = window.setInterval(() => {
      void ping();
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ping]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('signet:role', { detail: { role } }));
  }, [role]);

  async function switchRole(next: DemoRole) {
    setRoleBusy(true);
    try {
      await ensureDemoSession(next);
      setRole(next);
    } catch (err) {
      setHealthHint(toUserMessage(err, 'operator'));
    } finally {
      setRoleBusy(false);
    }
  }

  async function resetDemo() {
    if (!window.confirm('Reset demo data for this visitor?')) return;
    setResetBusy(true);
    try {
      await api.resetDemo();
      setHealthHint(null);
      navigate('/');
      window.dispatchEvent(new Event('signet:demo-reset'));
    } catch (err) {
      setHealthHint(toUserMessage(err, 'operator'));
    } finally {
      setResetBusy(false);
    }
  }

  const healthLabel = health === 'ok' ? 'Kernel reachable' : health === 'bad' ? 'Kernel is down' : 'Checking kernel';

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
          <p className="brand__sub">Exception console</p>
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
              <span className={`led ${health === 'ok' ? 'is-ok' : health === 'bad' ? 'is-bad' : ''}`} />
              {healthLabel}
            </div>
            {health === 'bad' && healthHint ? <p className="health__hint">{healthHint}</p> : null}
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
                className={`btn btn--small ${role === item ? 'btn--gold' : ''}`}
                disabled={roleBusy}
                data-testid={`role-${item}`}
                onClick={() => void switchRole(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            className="btn btn--wide"
            type="button"
            data-testid="reset-demo"
            disabled={resetBusy}
            onClick={() => void resetDemo()}
          >
            {resetBusy ? 'Resetting…' : 'Reset demo'}
          </button>
        </div>
      </aside>
      <div className="stage" id="main" tabIndex={-1}>
        {health === 'bad' ? (
          <p className="banner banner--error" role="alert">
            {healthHint}
          </p>
        ) : null}
        <Outlet />
      </div>
    </div>
  );
}
