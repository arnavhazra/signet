import type { AuditEvent, JsonValue } from '@/api/types';
import { formatDisplay } from '@/lib/presentation';

export type AuditView = {
  id: string;
  headline: string;
  detail: string;
  when: string | null;
  rawType: string;
  rawPayload: JsonValue | undefined;
};

function stringish(value: JsonValue | undefined): string | null {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function payloadObject(event: AuditEvent): Record<string, JsonValue | undefined> | null {
  const raw = event.payload ?? event.detail;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, JsonValue | undefined>;
}

function toolName(event: AuditEvent): string | null {
  const payload = payloadObject(event);
  return payload ? stringish(payload.tool) : null;
}

export function auditKind(event: AuditEvent, index: number): string {
  return (
    stringish(event.eventType) ??
    stringish(event.type) ??
    stringish(event.event) ??
    stringish(event.action) ??
    `Event ${index + 1}`
  );
}

export function explainAudit(event: AuditEvent, index: number): AuditView {
  const kind = auditKind(event, index);
  const payload = payloadObject(event);
  const tool = toolName(event);
  const when =
    stringish(event.createdAt) ??
    stringish(event.at) ??
    stringish(event.timestamp) ??
    stringish(event.ts);
  const id = stringish(event.id) ?? String(index);

  let headline = kind;
  let detail = '';

  switch (kind) {
    case 'session.created':
      headline = 'Event ingested';
      detail = 'The kernel opened a versioned session for this exception.';
      break;
    case 'dag.halt':
      headline = 'DAG halted for a human';
      detail = 'Logic nodes finished (delta + citations). Execution stopped on the approval card — you are the human in the loop.';
      break;
    case 'input.received':
      headline = 'Human decision recorded';
      detail = 'Your answer was stored against this workflow version. The engine then resumed.';
      break;
    case 'session.advanced':
      headline = 'Kernel resumed';
      detail = payload?.status === 'completed'
        ? 'Post-decision logic finished. Session is complete.'
        : 'The DAG continued from the halt node.';
      break;
    case 'session.completed':
      headline = 'Session completed';
      detail = 'No further human node. Outcome and audit rows are durable in Postgres.';
      break;
    case 'tool.invoked':
      headline = tool ? `Tool invoked: ${tool}` : 'Tool gateway invoked';
      detail =
        tool === 'write_remediation'
          ? 'Allowlisted write. An audit row is inserted before any remediation can persist.'
          : tool === 'attach_citations'
            ? 'Server attached book and custodian record citations. The client did not look them up.'
            : tool === 'close_exception'
              ? 'Allowlisted close. No books-side remediation is written on this path.'
              : 'Allowlisted tool call. Unknown tools are denied and produce no side effect.';
      break;
    case 'tool.completed':
      headline = tool ? `Tool finished: ${tool}` : 'Tool finished';
      detail = 'Gateway returned; session derived state was updated on the server.';
      break;
    case 'tool.denied':
      headline = 'Tool blocked';
      detail = 'The named tool is not on the allowlist. No side effect was written.';
      break;
    case 'remediation.written':
      headline = 'Remediation written';
      detail = payload?.auditEventId
        ? `Books-side row persisted with a hard FK to audit ${String(payload.auditEventId)}. There is no silent write path.`
        : 'Books-side row persisted. Remediation rows require an audit event id.';
      break;
    default:
      headline = kind.replace(/[._]/g, ' ');
      detail = payload ? formatDisplay(payload) : 'Recorded by the kernel.';
  }

  return {
    id,
    headline,
    detail,
    when,
    rawType: kind,
    rawPayload: event.payload ?? event.detail,
  };
}
