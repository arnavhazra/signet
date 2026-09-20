import type { JsonObject, JsonValue } from '@/api/types';

export function jsonString(value: JsonValue | undefined): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function sessionWorkflowSlug(answers: JsonObject | undefined, fallback?: string): string {
  return jsonString(answers?.workflowSlug) || (fallback ?? '');
}

/** Account · CUSIP · workflow — session/replay title. */
export function sessionHeading(answers: JsonObject | undefined, workflowSlug?: string): string {
  const account = jsonString(answers?.accountId);
  const cusip = jsonString(answers?.securityId);
  const workflow = sessionWorkflowSlug(answers, workflowSlug);
  return [account, cusip, workflow].filter(Boolean).join(' · ') || 'Exception';
}

export function sessionAnswerFacts(
  answers: JsonObject | undefined,
  derived?: JsonObject,
): { label: string; value: JsonValue }[] {
  const facts: { label: string; value: JsonValue }[] = [];
  const keys = ['accountId', 'securityId', 'bookQty', 'custodianQty', 'asOf'] as const;
  if (answers) {
    for (const key of keys) {
      if (answers[key] !== undefined) facts.push({ label: key, value: answers[key] });
    }
  }
  const delta = derived?.delta ?? answers?.delta;
  if (delta !== undefined) facts.push({ label: 'delta', value: delta });
  return facts;
}
