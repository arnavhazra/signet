import { useCallback, useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { DemoAccount, DemoPlan, DemoUsage } from '@/api/types';
import { useDemoSession } from '@/auth/DemoSession';
import { DEMO_PLANS, planLabel } from '@/lib/demoAccount';
import { toUserMessage } from '@/lib/errors';
import { usePageTitle } from '@/lib/pageTitle';

type Tab = 'profile' | 'billing' | 'usage' | 'danger';

export default function SettingsPage() {
  const demo = useDemoSession();
  const [tab, setTab] = useState<Tab>('profile');
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [usage, setUsage] = useState<DemoUsage | null>(null);
  const [me, setMe] = useState<{ sub: string; role: string; orgId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  usePageTitle('Settings');

  const refresh = useCallback(async () => {
    if (demo.status !== 'ready') return;
    const [nextAccount, nextUsage, nextMe] = await Promise.all([
      api.getDemoAccount().catch(() => null),
      api.getDemoUsage().catch(() => null),
      api.authMe().catch(() => null),
    ]);
    setAccount(nextAccount);
    setUsage(nextUsage);
    setMe(nextMe);
  }, [demo.status]);

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(toUserMessage(err, 'operator')));
  }, [refresh]);

  async function setPlan(plan: DemoPlan) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const email = account?.email?.trim() || 'demo@signet.local';
      const orgName = account?.orgName?.trim() || 'Simulated org';
      const next = await api.upsertDemoAccount({ email, orgName, plan });
      setAccount(next);
      setNotice(`Plan set to ${planLabel(plan)}. Simulated. No card is charged.`);
      setPortalOpen(false);
    } catch (err) {
      setError(toUserMessage(err, 'operator'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">Settings</p>
          <h1>Org & billing</h1>
          <p className="lede">Simulated account surfaces on this demo cookie. Ops copy only.</p>
        </div>
      </header>

      <p className="banner banner--warn" role="status">
        Simulated. No email is sent. No card is charged.
      </p>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="banner banner--ok" role="status">
          {notice}
        </p>
      ) : null}

      <div className="tabs" role="tablist" aria-label="Settings">
        {(
          [
            ['profile', 'Profile'],
            ['billing', 'Billing'],
            ['usage', 'Usage'],
            ['danger', 'Danger'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`tabs__tab${tab === id ? ' is-active' : ''}`}
            aria-selected={tab === id}
            data-testid={`settings-tab-${id}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'profile' ? (
        <section className="panel" data-testid="settings-profile">
          <p className="panel__stamp">Profile</p>
          <dl className="mkt-facts">
            <div>
              <dt>Email</dt>
              <dd className="mono">{account?.email ?? '—'}</dd>
            </div>
            <div>
              <dt>Org name</dt>
              <dd>{account?.orgName ?? '—'}</dd>
            </div>
            <div>
              <dt>orgId</dt>
              <dd className="mono">{account?.orgId ?? me?.orgId ?? '—'}</dd>
            </div>
            <div>
              <dt>Role (demo)</dt>
              <dd className="mono">{me?.role ?? demo.role}</dd>
            </div>
            <div>
              <dt>Confirmed</dt>
              <dd>{account ? (account.confirmed ? 'yes' : 'no') : '—'}</dd>
            </div>
          </dl>
          <p className="help mt">
            Account fields upsert on this demo cookie from Settings. Console routes stay open without signup.
          </p>
        </section>
      ) : null}

      {tab === 'billing' ? (
        <section className="panel" data-testid="settings-billing">
          <p className="panel__stamp">Billing</p>
          <p className="banner banner--warn" role="status">
            No Stripe. This portal only flips the plan enum.
          </p>
          <p className="help">
            Current plan: <strong>{planLabel(account?.plan)}</strong>
          </p>
          <div className="mkt-tiers mkt-tiers--compact mt">
            {DEMO_PLANS.map((tier) => (
              <div key={tier.id} className="mkt-tier">
                <p className="mkt-tier__name">{tier.name}</p>
                <p className="help">{tier.blurb}</p>
                <button
                  className={`btn btn--wide mt${account?.plan === tier.id ? ' btn--gold' : ''}`}
                  type="button"
                  disabled={busy || demo.status !== 'ready' || account?.plan === tier.id}
                  data-testid={`settings-plan-${tier.id}`}
                  onClick={() => void setPlan(tier.id)}
                >
                  {account?.plan === tier.id ? 'Current' : `Switch to ${tier.name}`}
                </button>
              </div>
            ))}
          </div>
          <div className="row mt-lg">
            <button
              className="btn"
              type="button"
              data-testid="billing-portal"
              disabled={busy || demo.status !== 'ready'}
              onClick={() => setPortalOpen((prev) => !prev)}
            >
              {portalOpen ? 'Close portal' : 'Open billing portal'}
            </button>
          </div>
          {portalOpen ? (
            <div className="panel panel--inset mt" data-testid="billing-portal-panel">
              <p className="panel__stamp">Simulated portal</p>
              <p className="help">Pick a plan. Same upsert as the cards above. No card is charged.</p>
              <div className="row mt">
                {DEMO_PLANS.map((tier) => (
                  <button
                    key={tier.id}
                    className="btn btn--small"
                    type="button"
                    disabled={busy}
                    onClick={() => void setPlan(tier.id)}
                  >
                    {tier.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'usage' ? (
        <section className="panel" data-testid="settings-usage">
          <p className="panel__stamp">Usage</p>
          <p className="help">Real counts for this org. Soft cap copy only — not enforcement theater.</p>
          {usage ? (
            <dl className="mkt-facts mt">
              <div>
                <dt>Sessions</dt>
                <dd className="mono">{usage.sessions}</dd>
              </div>
              <div>
                <dt>agent.proposed</dt>
                <dd className="mono">{usage.agentProposed}</dd>
              </div>
              <div>
                <dt>remediation.written</dt>
                <dd className="mono">{usage.remediationsWritten}</dd>
              </div>
            </dl>
          ) : (
            <p className="empty">Usage unavailable until the demo account API is live.</p>
          )}
          <p className="help mt">Soft cap: stay under interview-demo volume. Excess is not blocked.</p>
        </section>
      ) : null}

      {tab === 'danger' ? (
        <section className="panel" data-testid="settings-danger">
          <p className="panel__stamp">Danger</p>
          <p className="help">Clears this visitor’s queue and tour. You become operator again.</p>
          <button
            className="btn mt"
            type="button"
            data-testid="settings-reset"
            disabled={demo.resetBusy || demo.status !== 'ready'}
            onClick={demo.openResetConfirm}
          >
            {demo.resetBusy ? 'Resetting…' : 'Reset demo'}
          </button>
        </section>
      ) : null}
    </>
  );
}
