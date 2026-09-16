/**
 * Presentation helpers for the SDUI renderer.
 * No exception math, no brackets, no binding evaluation — display only.
 */
import type { ApprovalAction, ApprovalField, ChoiceOption, JsonObject, JsonValue } from '@/api/types';

/** Keys the renderer may use for presentation. Everything else (including bindings) is ignored. */
const CONTROL_KEYS = new Set([
  'options',
  'choices',
  'fields',
  'facts',
  'actions',
  'trueLabel',
  'falseLabel',
  'onLabel',
  'offLabel',
  'label',
  'min',
  'max',
  'step',
  'unit',
  'placeholder',
  'precision',
  'summary',
  'body',
  'description',
  'helperText',
  'title',
  'columns',
  'required',
  'items',
  'summaryFields',
]);

const BINDING_KEYS = new Set([
  'binding',
  'bindings',
  'filter_value',
  'filter_bracket',
  'query_token',
]);

export function optionLabel(option: ChoiceOption, index: number): string {
  return option.label ?? option.title ?? String(option.value ?? option.id ?? `Option ${index + 1}`);
}

export function optionValue(option: ChoiceOption, index: number): JsonValue {
  if (option.value !== undefined) return option.value;
  if (option.id !== undefined) return option.id;
  return index;
}

export function readChoiceOptions(config: JsonObject): ChoiceOption[] {
  const raw = config.options ?? config.choices ?? config.items;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item === 'object') as ChoiceOption[];
}

export function readActions(config: JsonObject): ApprovalAction[] {
  const raw = config.actions ?? config.options ?? config.choices;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item === 'object') as ApprovalAction[];
}

export function actionLabel(action: ApprovalAction, index: number): string {
  return action.label ?? action.title ?? String(action.value ?? action.id ?? `Action ${index + 1}`);
}

export function actionValue(action: ApprovalAction, index: number): JsonValue {
  if (action.value !== undefined) return action.value;
  if (action.id !== undefined) return action.id;
  return index;
}

export type Fact = { label: string; value: JsonValue };

function fieldToFact(field: ApprovalField, index: number): Fact {
  const label = field.label ?? field.name ?? field.key ?? `Field ${index + 1}`;
  return { label, value: field.value ?? null };
}

export function readPresentationFacts(config: JsonObject): Fact[] {
  if (Array.isArray(config.fields)) {
    return (config.fields as ApprovalField[])
      .filter((item) => item && typeof item === 'object')
      .map(fieldToFact);
  }
  if (config.facts && typeof config.facts === 'object' && !Array.isArray(config.facts)) {
    return Object.entries(config.facts as JsonObject).map(([label, value]) => ({ label, value }));
  }

  const facts: Fact[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (CONTROL_KEYS.has(key) || BINDING_KEYS.has(key)) continue;
    if (value !== null && typeof value === 'object') continue;
    facts.push({ label: key, value });
  }
  return facts;
}

export function readHelperText(config: JsonObject, fallback?: string): string | undefined {
  if (typeof config.helperText === 'string' && config.helperText) return config.helperText;
  if (typeof config.description === 'string' && config.description) return config.description;
  return fallback;
}

export function readSummary(config: JsonObject): string | undefined {
  if (typeof config.summary === 'string' && config.summary) return config.summary;
  if (typeof config.body === 'string' && config.body) return config.body;
  return undefined;
}

export function formatDisplay(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function isNumericValue(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

export function toggleTrueLabel(config: JsonObject): string {
  if (typeof config.trueLabel === 'string') return config.trueLabel;
  if (typeof config.onLabel === 'string') return config.onLabel;
  return 'On';
}

export function toggleFalseLabel(config: JsonObject): string {
  if (typeof config.falseLabel === 'string') return config.falseLabel;
  if (typeof config.offLabel === 'string') return config.offLabel;
  return 'Off';
}

export function readNumberConfig(config: JsonObject): {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
} {
  return {
    min: typeof config.min === 'number' ? config.min : undefined,
    max: typeof config.max === 'number' ? config.max : undefined,
    step: typeof config.step === 'number' ? config.step : undefined,
    unit: typeof config.unit === 'string' ? config.unit : undefined,
    placeholder: typeof config.placeholder === 'string' ? config.placeholder : undefined,
  };
}

export function isTerminalStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'completed' || normalized === 'failed';
}

export function statusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (!normalized || normalized === 'idle') return 'Ready';
  if (normalized === 'awaiting_input') return 'Waiting on you';
  if (normalized === 'completed') return 'Completed';
  if (normalized === 'failed' || normalized === 'error') return 'Failed';
  if (normalized === 'created' || normalized === 'active') return 'Running DAG';
  return status;
}

export function statusTone(status: string): 'ok' | 'bad' | 'wait' | 'idle' {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'completed') return 'ok';
  if (normalized === 'failed' || normalized === 'error') return 'bad';
  if (!status || normalized === 'idle') return 'idle';
  return 'wait';
}

export function artifactKicker(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'approval_card') return 'Human decision';
  if (normalized === 'choice_cards') return 'Choice';
  if (normalized === 'toggle') return 'Toggle';
  if (normalized === 'numeric_input') return 'Numeric input';
  return type || 'artifact';
}
