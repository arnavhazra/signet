import { useState } from 'react';
import type { AuditEvent } from '@/api/types';
import { auditGroup, explainAudit } from '@/lib/audit';
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
        Agent proposals, human decisions, and remediation writes are distinct rows. Raw event types stay one click
        away.
      </p>
      {events.length === 0 ? (
        <p className="empty">No audit events returned for this session.</p>
      ) : (
        <>
          <ol className="audit-list">
            {events.map((event, index) => {
              const view = explainAudit(event, index);
              const group = auditGroup(view.rawType);
              return (
                <li
                  key={view.id}
                  className={`audit-list__item is-${group}`}
                  data-audit-kind={group}
                  data-event-type={view.rawType}
                >
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
                const group = auditGroup(view.rawType);
                const detail = event.detail !== undefined ? event.detail : event.payload;
                return (
                  <li key={`raw-${view.id}`} data-audit-kind={group} data-event-type={view.rawType}>
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
