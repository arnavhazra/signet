import { usePageTitle } from '@/lib/pageTitle';

const CONTACT_EMAIL = 'work.arvhaz@gmail.com';

export default function PricingPage() {
  usePageTitle('Pricing');

  return (
    <div className="mkt-page">
      <header className="mkt-page__head">
        <p className="kicker">Pricing</p>
        <h1>Get in touch</h1>
        <p className="lede">Tell us about your desk. We will follow up by email.</p>
      </header>

      <section className="mkt-contact" data-testid="pricing-contact">
        <a className="btn btn--gold" href={`mailto:${CONTACT_EMAIL}`} data-testid="pricing-mailto">
          Email {CONTACT_EMAIL}
        </a>
        <p className="help mt">
          <a className="mono" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>
    </div>
  );
}
