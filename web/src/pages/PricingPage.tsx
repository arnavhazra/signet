import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, startDemoSession } from '@/api/client';
import type { DemoPlan } from '@/api/types';
import { DEMO_PLANS, planLabel, writePendingPlan } from '@/lib/demoAccount';
import { toUserMessage } from '@/lib/errors';
import { useFocusTrap } from '@/lib/focusTrap';
import { usePageTitle } from '@/lib/pageTitle';

export default function PricingPage() {
  const navigate = useNavigate();
  const [checkoutPlan, setCheckoutPlan] = useState<DemoPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const close = () => {
    if (!busy) setCheckoutPlan(null);
  };
  useFocusTrap(Boolean(checkoutPlan), dialogRef, close);
  usePageTitle('Pricing');

  async function confirmCheckout() {
    if (!checkoutPlan) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const me = await api.authMe().catch(() => null);
      if (me?.via === 'cookie') {
        await startDemoSession();
        await api.upsertDemoAccount({
          email: 'demo@signet.local',
          orgName: 'Simulated org',
          plan: checkoutPlan,
        });
        setNotice(`Plan set to ${planLabel(checkoutPlan)}. Simulated. No card is charged.`);
        setCheckoutPlan(null);
        return;
      }
      writePendingPlan(checkoutPlan);
      setCheckoutPlan(null);
      navigate('/signup');
    } catch (err) {
      setError(toUserMessage(err, 'operator'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mkt-page">
      <header className="mkt-page__head">
        <p className="kicker">Pricing</p>
        <h1>Three tiers. Same kernel.</h1>
        <p className="lede">Checkout flips a plan enum on this visitor’s demo org.</p>
      </header>

      <p className="banner banner--warn" role="status" data-testid="pricing-sim-banner">
        Simulated. No card is charged.
      </p>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="banner banner--ok" role="status">
          {notice}{' '}
          <Link to="/settings">Open settings</Link>
        </p>
      ) : null}

      <div className="mkt-tiers">
        {DEMO_PLANS.map((tier) => (
          <section key={tier.id} className="mkt-tier" data-testid={`plan-${tier.id}`}>
            <p className="mkt-tier__name">{tier.name}</p>
            <p className="mkt-tier__price">{tier.price}</p>
            <p className="help">{tier.blurb}</p>
            <button
              className="btn btn--gold btn--wide mt"
              type="button"
              data-testid={`checkout-${tier.id}`}
              onClick={() => setCheckoutPlan(tier.id)}
            >
              Choose {tier.name}
            </button>
          </section>
        ))}
      </div>

      {checkoutPlan ? (
        <div className="confirm-backdrop" data-modal="checkout" onClick={close}>
          <div
            ref={dialogRef}
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
            data-testid="checkout-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="checkout-title">Simulated checkout</h2>
            <p>
              Set plan to <strong>{planLabel(checkoutPlan)}</strong>. No card is charged. If this
              browser has no demo cookie yet, you will continue to signup.
            </p>
            <div className="row confirm-actions">
              <button
                className="btn btn--gold"
                type="button"
                data-testid="checkout-confirm"
                disabled={busy}
                onClick={() => void confirmCheckout()}
              >
                {busy ? 'Saving…' : 'Confirm plan'}
              </button>
              <button className="btn" type="button" disabled={busy} onClick={close}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
