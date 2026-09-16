import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api, ensureDemoSession } from '@/api/client';
import { toUserMessage } from '@/lib/errors';

const DEMO_ROLES = ['operator', 'checker', 'auditor', 'admin'] as const;
type DemoRole = (typeof DEMO_ROLES)[number];

export default function AppShell() {
  const [health, setHealth] = useState<'unknown' | 'ok' | 'bad'>('unknown');
  const [healthHint, setHealthHint] = useState<string | null>(null);
  const [role, setRole] = useState<DemoRole>('operator');
  const [roleBusy, setRoleBusy] = useState(false);

  const ping = useCallback(async () => {
    try {
      await api.health();
      setHealth('ok');
      setHealthHint(null);
    } catch (err) {
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
          <NavLink to="/audit" className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}>
            Audit
          </NavLink>
          <NavLink to="/admin" className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}>
            Admin
          </NavLink>
        </nav>
        <div className="rail__foot">
          <div className="health" role="status">
            <span className={`led ${health === 'ok' ? 'is-ok' : health === 'bad' ? 'is-bad' : ''}`} />
            {health === 'ok' ? 'Kernel reachable' : health === 'bad' ? 'Kernel is down' : 'Checking kernel'}
          </div>
          {health === 'bad' && healthHint ? <p className="health__hint">{healthHint}</p> : null}
          <p className="health__hint">Role</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {DEMO_ROLES.map((item) => (
              <button
                key={item}
                type="button"
                className={`btn ${role === item ? 'btn--gold' : ''}`}
                disabled={roleBusy}
                data-testid={`role-${item}`}
                onClick={() => void switchRole(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </aside>
      <div className="stage" id="main">
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
