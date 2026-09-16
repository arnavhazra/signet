import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '@/api/client';
import SettingsPanel from '@/components/SettingsPanel';
import { toUserMessage } from '@/lib/errors';

export default function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [health, setHealth] = useState<'unknown' | 'ok' | 'bad'>('unknown');
  const [healthHint, setHealthHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        await api.health();
        if (!cancelled) {
          setHealth('ok');
          setHealthHint(null);
        }
      } catch (err) {
        if (!cancelled) {
          setHealth('bad');
          setHealthHint(toUserMessage(err, 'operator'));
        }
      }
    }

    void ping();
    const timer = window.setInterval(() => {
      void ping();
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

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
            <p className="brand__title">
              Signet
            </p>
          </div>
          <p className="brand__sub">Governed HITL workflow kernel — not Addison</p>
        </div>
        <nav className="nav" aria-label="Primary">
          <div className="nav__label">Consoles</div>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}>
            Operator
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
          {health === 'bad' && healthHint ? (
            <p className="health__hint">{healthHint}</p>
          ) : (
            <p className="health__hint">Demo API key is preloaded. Swap keys only if you need another credential.</p>
          )}
          <button type="button" className="btn btn--ghost btn--wide" onClick={() => setSettingsOpen(true)}>
            Swap keys
          </button>
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
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
