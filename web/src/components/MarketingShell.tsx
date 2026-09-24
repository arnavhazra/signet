import { Link, NavLink, Outlet } from 'react-router-dom';

export default function MarketingShell() {
  return (
    <div className="mkt">
      <header className="mkt__bar">
        <Link className="mkt__brand" to="/">
          <span className="brand__glyph" aria-hidden="true">
            S
          </span>
          <span>Signet</span>
        </Link>
        <nav className="mkt__nav" aria-label="Product">
          <NavLink to="/pricing" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            Pricing
          </NavLink>
          <NavLink to="/signup" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            Start trial
          </NavLink>
          <NavLink to="/login" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            Log in
          </NavLink>
          <Link className="btn btn--gold btn--small" to="/inbox">
            Open console
          </Link>
        </nav>
      </header>
      <main className="mkt__main" id="main">
        <Outlet />
      </main>
      <footer className="mkt__foot">
        <p>
          Simulated micro-SaaS shell around a real action kernel. No email is sent. No card is charged.
        </p>
      </footer>
    </div>
  );
}
