import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, startDemoSession } from '@/api/client';
import type { DemoAccount, DemoPlan } from '@/api/types';
import { clearPendingPlan, planLabel, readPendingPlan } from '@/lib/demoAccount';
import { toUserMessage } from '@/lib/errors';
import { usePageTitle } from '@/lib/pageTitle';

type Mode = 'signup' | 'login';

type Props = {
  mode: Mode;
};

export default function AuthAccountPage({ mode }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  usePageTitle(mode === 'signup' ? 'Start trial' : 'Log in');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedOrg = orgName.trim();
    if (!trimmedEmail || !trimmedOrg) {
      setError('Email and org name are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await startDemoSession();
      const pending = readPendingPlan();
      const plan: DemoPlan = pending ?? 'operator';
      const created = await api.upsertDemoAccount({
        email: trimmedEmail,
        orgName: trimmedOrg,
        plan,
      });
      clearPendingPlan();
      setAccount(created);
    } catch (err) {
      setError(toUserMessage(err, 'operator'));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!account?.confirmToken) return;
    setBusy(true);
    setError(null);
    try {
      const confirmed = await api.confirmDemoAccount(account.confirmToken);
      setAccount(confirmed);
    } catch (err) {
      setError(toUserMessage(err, 'operator'));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'signup' ? 'Start trial' : 'Log in';
  const lede =
    mode === 'signup'
      ? 'Simulated account on this visitor’s demo org. No email is sent.'
      : 'Same form as signup. Upserts the simulated account for this cookie. No email is sent.';
  const pendingPlan = readPendingPlan();

  return (
    <div className="mkt-page mkt-page--narrow">
      <header className="mkt-page__head">
        <p className="kicker">{mode === 'signup' ? 'Trial' : 'Account'}</p>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </header>

      <p className="banner banner--warn" role="status">
        Simulated. No email is sent. No card is charged.
      </p>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      {!account ? (
        <form className="panel" onSubmit={onSubmit} data-testid="auth-form">
          <p className="panel__stamp">Credentials</p>
          <div className="stack">
            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                data-testid="auth-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="auth-org">Org name</label>
              <input
                id="auth-org"
                type="text"
                autoComplete="organization"
                data-testid="auth-org"
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                required
              />
            </div>
            {mode === 'signup' && pendingPlan ? (
              <p className="help">
                Pending plan from checkout: <span className="mono">{planLabel(pendingPlan)}</span>
              </p>
            ) : null}
            <div className="row">
              <button className="btn btn--gold" type="submit" data-testid="auth-submit" disabled={busy}>
                {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Continue'}
              </button>
              <Link className="btn" to={mode === 'signup' ? '/login' : '/signup'}>
                {mode === 'signup' ? 'Log in' : 'Start trial'}
              </Link>
            </div>
          </div>
        </form>
      ) : (
        <section className="panel" data-testid="auth-confirm">
          <p className="panel__stamp">Confirm token</p>
          <p className="help">No email is sent. Token is shown here for the simulated magic link.</p>
          <p className="mono mkt-token" data-testid="confirm-token">
            {account.confirmToken}
          </p>
          <Factish account={account} />
          <div className="row mt">
            {!account.confirmed ? (
              <button
                className="btn btn--gold"
                type="button"
                data-testid="auth-confirm-btn"
                disabled={busy}
                onClick={() => void onConfirm()}
              >
                {busy ? 'Confirming…' : 'Confirm account'}
              </button>
            ) : (
              <p className="banner banner--ok" role="status">
                Confirmed.
              </p>
            )}
            <button
              className="btn btn--gold"
              type="button"
              data-testid="auth-open-console"
              onClick={() => navigate('/inbox')}
            >
              Open console
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Factish({ account }: { account: DemoAccount }) {
  return (
    <dl className="mkt-facts">
      <div>
        <dt>Email</dt>
        <dd className="mono">{account.email}</dd>
      </div>
      <div>
        <dt>Org</dt>
        <dd>{account.orgName}</dd>
      </div>
      <div>
        <dt>Plan</dt>
        <dd>{planLabel(account.plan)}</dd>
      </div>
      <div>
        <dt>orgId</dt>
        <dd className="mono">{account.orgId}</dd>
      </div>
    </dl>
  );
}

export function SignupPage() {
  return <AuthAccountPage mode="signup" />;
}

export function LoginPage() {
  return <AuthAccountPage mode="login" />;
}
