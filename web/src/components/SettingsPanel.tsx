import { useEffect, useId, useState } from 'react';
import {
  readCredentials,
  restoreDemoCredentials,
  writeCredentials,
  type Credentials,
} from '@/auth/credentials';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SettingsPanel({ open, onClose }: Props) {
  const titleId = useId();
  const [form, setForm] = useState<Credentials>(() => readCredentials());

  useEffect(() => {
    if (open) setForm(readCredentials());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <p className="kicker">Local demo auth</p>
        <h2 id={titleId}>Credentials</h2>
        <p className="lede">
          Optional local keys. The live console uses a demo cookie instead.
        </p>
        <form
          className="stack"
          style={{ marginTop: 20 }}
          onSubmit={(event) => {
            event.preventDefault();
            writeCredentials(form);
            onClose();
          }}
        >
          <div className="field">
            <label htmlFor="api-key">Runtime API key</label>
            <input
              id="api-key"
              name="apiKey"
              autoComplete="off"
              spellCheck={false}
              value={form.apiKey}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, apiKey: event.target.value }))
              }
            />
            <p className="help">Sent as X-API-Key on /v1/*. Default is the public demo key.</p>
          </div>
          <div className="field">
            <label htmlFor="admin-jwt">Admin JWT</label>
            <textarea
              id="admin-jwt"
              name="jwt"
              className="textarea"
              style={{ minHeight: 120 }}
              autoComplete="off"
              spellCheck={false}
              value={form.jwt}
              onChange={(event) => setForm((prev) => ({ ...prev, jwt: event.target.value }))}
            />
            <p className="help">
              Sent as Authorization Bearer on /admin/*. Demo token matches JWT_SECRET in
              .env.example. Production would inject this from an IdP.
            </p>
          </div>
          <div className="row">
            <button className="btn btn--gold" type="submit">
              Save
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setForm(restoreDemoCredentials());
              }}
            >
              Restore demo defaults
            </button>
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
