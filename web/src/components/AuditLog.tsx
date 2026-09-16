import { useState } from 'react';
import type { AuditEvent } from '@/api/types';
import { explainAudit } from '@/lib/audit';
import { formatDisplay } from '@/lib/presentation';

type Props = {
  events: AuditEvent[];
};

export default function AuditLog({ events }: Props) {
  const [rawOpen, setRawOpen] = useState(false);

  return (
    <section className="panel" aria-labelledby="audit-heading">
      <p className="panel__stamp" id="audit-heading">
        Audit trail
      </p>
      <p className="help">
        Plain English of what the kernel recorded. Raw event types stay one click away for the
        engineering walkthrough.
      </p>
      {events.length === 0 ? (
        <p className="empty">No audit events returned for this session.</p>
      ) : (
        <>
          <ol className="audit-list">
            {events.map((event, index) => {
              const view = explainAudit(event, index);
              return (
                <li key={view.id}>
                  <div className="audit-list__headline">{view.headline}</div>
                  <div className="audit-list__meta">
                    {[view.when, view.rawType].filter(Boolean).join(' · ')}
                  </div>
                  <p className="audit-list__plain">{view.detail}</p>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ marginTop: 12 }}
            aria-expanded={rawOpen}
            onClick={() => setRawOpen((open) => !open)}
          >
            {rawOpen ? 'Hide raw events' : 'Show raw events'}
          </button>
          {rawOpen ? (
            <ol className="audit-list audit-list--raw">
              {events.map((event, index) => {
                const view = explainAudit(event, index);
                const detail = event.detail !== undefined ? event.detail : event.payload;
                return (
                  <li key={`raw-${view.id}`}>
                    <div className="mono">{view.rawType}</div>
                    <div className="audit-list__meta">{view.when ?? '—'}</div>
                    {detail !== undefined ? (
                      <pre className="json-view">{formatDisplay(detail)}</pre>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
}
