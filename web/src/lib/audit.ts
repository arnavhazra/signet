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

export type AuditKindGroup = 'agent' | 'human' | 'write' | 'other';

export function auditGroup(kind: string): AuditKindGroup {
  const key = kind.trim().toLowerCase();
  if (key.startsWith('agent.')) return 'agent';
  if (key === 'human.decision' || key === 'input.received') return 'human';
  if (key === 'remediation.written') return 'write';
  return 'other';
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
  const actor = stringish(event.actor);
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
      headline = 'Session opened';
      detail = 'Exception ingested into a versioned workflow session.';
      break;
    case 'dag.halt':
      headline = 'Waiting on human';
      detail = 'Server finished logic nodes and halted on the current card.';
      break;
    case 'human.decision':
      headline = actor ? `Decision · ${actor}` : 'Decision recorded';
      detail = 'Answer stored against this workflow version.';
      break;
    case 'input.received':
      headline = 'Decision recorded';
      detail = 'Answer stored against this workflow version.';
      break;
    case 'session.advanced':
      headline = 'Session advanced';
      detail =
        payload?.status === 'completed' ? 'Post-decision logic finished.' : 'DAG resumed from the halt node.';
      break;
    case 'session.completed':
      headline = 'Session completed';
      detail = 'No further human node.';
      break;
    case 'tool.invoked':
      headline = tool ? `Tool invoked: ${tool}` : 'Tool invoked';
      detail =
        tool === 'write_remediation'
          ? 'Allowlisted write. Audit row required before remediation persists.'
          : tool === 'attach_citations'
            ? 'Server attached book and custodian citations.'
            : tool === 'close_exception'
              ? 'Exception closed. No remediation written.'
              : 'Allowlisted tool call.';
      break;
    case 'tool.completed':
      headline = tool ? `Tool finished: ${tool}` : 'Tool finished';
      detail = 'Gateway returned; derived state updated.';
      break;
    case 'tool.denied':
      headline = 'Tool blocked';
      detail = 'Tool is not on the allowlist. No side effect.';
      break;
    case 'remediation.written':
      headline = 'Remediation written';
      detail = payload?.auditEventId
        ? `Persisted with audit ${String(payload.auditEventId)}.`
        : 'Books-side row persisted.';
      break;
    case 'agent.proposed':
      headline = 'Agent proposed';
      detail = 'Typed proposal recorded. Policy decides; the agent does not write.';
      break;
    case 'agent.denied':
      headline = 'Agent denied';
      detail = 'Unknown or disallowed intent. No side effect.';
      break;
    case 'agent.executed':
    case 'agent.auto_executed':
      headline = 'Agent served';
      detail = 'Read-class intent returned directly and audited.';
      break;
    default:
      headline = kind.replace(/[._]/g, ' ');
      detail = payload ? formatDisplay(payload) : 'Recorded by the kernel.';
  }

  return {
    id,
    headline,
    detail,
    when: [when, actor].filter(Boolean).join(' · ') || null,
    rawType: kind,
    rawPayload: event.payload ?? event.detail,
  };
}
