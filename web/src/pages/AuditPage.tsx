import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrapAudit } from '@/api/client';
import type { AuditEvent } from '@/api/types';
import AuditLog from '@/components/AuditLog';
import { toUserMessage } from '@/lib/errors';

export default function AuditPage() {
  const [accountId, setAccountId] = useState('');
  const [eventType, setEventType] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const raw = await api.searchAudit({ accountId, eventType, sessionId });
      setEvents(unwrapAudit(raw));
    } catch (err) {
      setEvents(null);
      setError(toUserMessage(err, 'auditor'));
    } finally {
      setBusy(false);
    }
  }

  const linked = sessionId.trim();

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">Audit</p>
          <h1>Search</h1>
          <p className="lede">Read-only. Filter by account, event type, or session.</p>
        </div>
      </header>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="panel" onSubmit={(event) => void search(event)}>
        <p className="panel__stamp">Filters</p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="audit-account">Account</label>
            <input
              id="audit-account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="audit-type">Event type</label>
            <input
              id="audit-type"
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
              placeholder="remediation.written"
              autoComplete="off"
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="audit-session">Session</label>
            <input
              id="audit-session"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button className="btn btn--gold" type="submit" disabled={busy}>
            {busy ? 'Searching…' : 'Search'}
          </button>
        </div>
        {linked ? (
          <p className="help" style={{ marginTop: 12 }}>
            Open <Link to={`/sessions/${encodeURIComponent(linked)}`}>session</Link>
            {' · '}
            <Link to={`/sessions/${encodeURIComponent(linked)}/replay`}>replay</Link>
          </p>
        ) : null}
      </form>

      <div style={{ marginTop: 16 }}>
        {events ? (
          events.length === 0 ? (
            <section className="panel">
              <p className="empty">No events for these filters.</p>
            </section>
          ) : (
            <AuditLog events={events} />
          )
        ) : (
          <section className="panel">
            <p className="empty">Run a search.</p>
          </section>
        )}
      </div>
    </>
  );
}
