import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, unwrapAudit } from '@/api/client';
import type { AuditEvent } from '@/api/types';
import AuditLog from '@/components/AuditLog';
import { auditGroup, auditKind, type AuditKindGroup } from '@/lib/audit';
import { toUserMessage } from '@/lib/errors';

const FILTERS: { id: 'all' | AuditKindGroup; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'agent', label: 'Agent' },
  { id: 'human', label: 'Human' },
  { id: 'write', label: 'Remediation' },
];

export default function AuditPage() {
  const [params] = useSearchParams();
  const sessionFromQuery = params.get('session') ?? '';
  const [accountId, setAccountId] = useState('');
  const [eventType, setEventType] = useState('');
  const [sessionId, setSessionId] = useState(sessionFromQuery);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionFromQuery) setSessionId(sessionFromQuery);
  }, [sessionFromQuery]);

  useEffect(() => {
    if (!sessionFromQuery) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void api
      .searchAudit({ sessionId: sessionFromQuery })
      .then((raw) => {
        if (!cancelled) setEvents(unwrapAudit(raw));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setEvents(null);
          setError(toUserMessage(err, 'auditor'));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionFromQuery]);

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
  const visible = useMemo(() => {
    if (!events) return null;
    if (filter === 'all') return events;
    return events.filter((event, index) => auditGroup(auditKind(event, index)) === filter);
  }, [events, filter]);

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">Audit</p>
          <h1>Search</h1>
          <p className="lede">Read-only. Agent, human, and remediation writes stay distinct.</p>
        </div>
      </header>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="panel" data-testid="audit-search" onSubmit={(event) => void search(event)}>
        <p className="panel__stamp">Filters</p>
        <div className="row chips" role="group" aria-label="Event kind">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`btn btn--small ${filter === item.id ? 'btn--gold' : ''}`}
              data-testid={`audit-filter-${item.id}`}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
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
        {visible ? (
          visible.length === 0 ? (
            <section className="panel">
              <p className="empty">No events for these filters.</p>
            </section>
          ) : (
            <AuditLog events={visible} />
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
