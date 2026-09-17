import { Link, useLocation } from 'react-router-dom';

export default function NotFoundPage() {
  const location = useLocation();
  const path = `${location.pathname}${location.search}`;

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">404</p>
          <h1>Not found</h1>
          <p className="lede">No Signet route for this path. The kernel was not called.</p>
        </div>
      </header>

      <section className="panel" role="status">
        <p className="panel__stamp">Request</p>
        <p className="mono">{path || '/'}</p>
        <p className="help" style={{ marginTop: 12 }}>
          If you expected a session, open the inbox and pick a row.
        </p>
        <div className="row" style={{ marginTop: 16 }}>
          <Link className="btn btn--gold" to="/">
            Inbox
          </Link>
          <Link className="btn" to="/agent">
            Agent
          </Link>
          <a className="btn" href="/docs">
            Docs
          </a>
        </div>
      </section>
    </>
  );
}
