import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, unwrapAudit } from '@/api/client';
import type { AuditEvent } from '@/api/types';
import AuditLog from '@/components/AuditLog';
import { auditGroup, auditKind, type AuditKindGroup } from '@/lib/audit';
import { toUserMessage } from '@/lib/errors';
import { usePageTitle } from '@/lib/pageTitle';

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
  usePageTitle('Audit');

  useEffect(() => {
    if (sessionFromQuery) setSessionId(sessionFromQuery);
  }, [sessionFromQuery]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    const query = sessionFromQuery ? { sessionId: sessionFromQuery } : {};
    void api
      .searchAudit(query)
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
          <h1>Trail</h1>
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
        <div className="row row--end mt">
          <div className="field field--grow">
            <label htmlFor="audit-account">Account</label>
            <input
              id="audit-account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field field--grow">
            <label htmlFor="audit-type">Event type</label>
            <input
              id="audit-type"
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
              placeholder="remediation.written"
              autoComplete="off"
            />
          </div>
          <div className="field field--wide">
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
          <p className="help mt">
            Open <Link to={`/sessions/${encodeURIComponent(linked)}`}>session</Link>
            {' · '}
            <Link to={`/sessions/${encodeURIComponent(linked)}/replay`}>replay</Link>
          </p>
        ) : null}
      </form>

      <div className="mt">
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
            <p className="empty">{busy ? 'Loading trail…' : 'No audit events yet.'}</p>
          </section>
        )}
      </div>
    </>
  );
}
