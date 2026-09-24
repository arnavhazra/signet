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
          <Link className="btn btn--gold btn--small" to="/inbox" data-testid="nav-open-console">
            Open console
          </Link>
        </nav>
      </header>
      <main className="mkt__main" id="main">
        <Outlet />
      </main>
      <footer className="mkt__foot">
        <p>Ops console around a real action kernel. Opening the console seeds a per-visitor demo org.</p>
      </footer>
    </div>
  );
}
