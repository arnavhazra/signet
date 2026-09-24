import { Link } from 'react-router-dom';
import { usePageTitle } from '@/lib/pageTitle';

export default function LandingPage() {
  usePageTitle('Signet');

  return (
    <div className="mkt-land">
      <p className="mkt-land__eyebrow">Governed action kernel</p>
      <h1 className="mkt-land__title">Signet</h1>
      <p className="mkt-land__lede">
        Ingest exceptions, halt for human control, write only through an audited tool gateway.
      </p>
      <div className="mkt-beats" role="list">
        <div className="mkt-beat" role="listitem">
          <p className="mkt-beat__label">Ingest</p>
          <p>Book vs custodian events become a versioned session. Delta is derived on the server.</p>
        </div>
        <div className="mkt-beat" role="listitem">
          <p className="mkt-beat__label">Halt</p>
          <p>High-delta writes wait for maker, then checker. Agents propose; they do not write.</p>
        </div>
        <div className="mkt-beat" role="listitem">
          <p className="mkt-beat__label">Audited write</p>
          <p>Tools persist only with an audit row. The kernel acts with oversight.</p>
        </div>
      </div>
      <div className="row mkt-land__cta">
        <Link className="btn btn--gold" to="/inbox" data-testid="open-console">
          Open console
        </Link>
      </div>
      <p className="help mkt-land__note">
        Opening the console mints a per-visitor demo cookie and seeds this org’s inbox. No sign-in.
      </p>
    </div>
  );
}
