import { useState } from 'react';
import type { AuditEvent } from '@/api/types';
import { AUDIT_PHASES, auditGroup, auditPhaseHit, explainAudit, sortAuditChronological } from '@/lib/audit';
import { formatDisplay } from '@/lib/presentation';

type Props = {
  events: AuditEvent[];
};

export default function AuditLog({ events }: Props) {
  const [rawOpen, setRawOpen] = useState(false);
  const chronological = sortAuditChronological(events);
  const phases = auditPhaseHit(events);

  return (
    <section className="panel" aria-labelledby="audit-heading">
      <p className="panel__stamp" id="audit-heading">
        Audit trail
      </p>
      <p className="help">
        Ingest → halt → agent/human → remediation.written. Raw event types stay one click away.
      </p>
      {events.length === 0 ? (
        <p className="empty">No audit events returned for this session.</p>
      ) : (
        <>
          <ol className="audit-axis" aria-label="Trace">
            {AUDIT_PHASES.map((phase) => (
              <li
                key={phase.id}
                className={`${phases[phase.id] ? 'is-on' : ''}${phase.id === 'write' ? ' is-write' : ''}`}
              >
                <span className="audit-axis__dot" />
                {phase.label}
              </li>
            ))}
          </ol>
          <ol className="audit-list">
            {chronological.map((event, index) => {
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
                  <div className="audit-list__meta">{[view.when, view.rawType].filter(Boolean).join(' · ')}</div>
                  <p className="audit-list__plain">{view.detail}</p>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="btn btn--ghost mt"
            aria-expanded={rawOpen}
            onClick={() => setRawOpen((open) => !open)}
          >
            {rawOpen ? 'Hide raw events' : 'Show raw events'}
          </button>
          {rawOpen ? (
            <ol className="audit-list audit-list--raw">
              {chronological.map((event, index) => {
                const view = explainAudit(event, index);
                const group = auditGroup(view.rawType);
                const detail = event.detail !== undefined ? event.detail : event.payload;
                return (
                  <li key={`raw-${view.id}`} data-audit-kind={group} data-event-type={view.rawType}>
                    <div className="mono">{view.rawType}</div>
                    <div className="audit-list__meta">{view.when ?? '—'}</div>
                    {detail !== undefined ? <pre className="json-view">{formatDisplay(detail)}</pre> : null}
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
