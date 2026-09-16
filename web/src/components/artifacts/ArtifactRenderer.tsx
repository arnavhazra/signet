/**
 * SDUI artifact renderer.
 * Maps artifactType → presentational controls and posts the user's value.
 * Does not evaluate bindings, brackets, or exception math.
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { ArtifactType, JsonObject, JsonValue, SessionNode, WorkflowStep } from '@/api/types';
import ApprovalCard from '@/components/artifacts/ApprovalCard';
import ChoiceCards from '@/components/artifacts/ChoiceCards';
import NumericInput from '@/components/artifacts/NumericInput';
import ToggleArtifact from '@/components/artifacts/ToggleArtifact';
import {
  artifactKicker,
  readActions,
  readChoiceOptions,
  readHelperText,
} from '@/lib/presentation';

export type RenderableNode = {
  id: string;
  title: string;
  artifactType: ArtifactType;
  config: JsonObject;
  helperText?: string;
  required?: boolean;
};

type Props = {
  node: RenderableNode;
  disabled?: boolean;
  submitLabel?: string;
  onSubmit: (value: JsonValue) => void;
};

export function nodeFromSession(node: SessionNode): RenderableNode {
  return {
    id: node.id,
    title: node.title,
    artifactType: node.artifactType,
    config: node.config ?? {},
    helperText: node.helperText,
    required: node.required,
  };
}

export function nodeFromStep(step: WorkflowStep): RenderableNode {
  return {
    id: step.questionId,
    title: step.title,
    artifactType: step.artifactType,
    config: step.config ?? {},
    helperText: step.helperText,
    required: step.required,
  };
}

export default function ArtifactRenderer({
  node,
  disabled,
  submitLabel = 'Advance',
  onSubmit,
}: Props) {
  const config = node.config ?? {};
  const helper = readHelperText(config, node.helperText);
  const type = String(node.artifactType ?? '');

  if (type === 'approval_card') {
    return (
      <article className="artifact">
        <header>
          <p className="kicker">{artifactKicker(type)}</p>
          <h2 className="artifact__title">{node.title}</h2>
          {helper ? <p className="help">{helper}</p> : null}
        </header>
        <ApprovalCard
          config={config}
          actions={readActions(config)}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      </article>
    );
  }

  return (
    <InteractiveArtifact
      node={node}
      type={type}
      helper={helper}
      disabled={disabled}
      submitLabel={submitLabel}
      onSubmit={onSubmit}
    />
  );
}

function InteractiveArtifact({
  node,
  type,
  helper,
  disabled,
  submitLabel,
  onSubmit,
}: {
  node: RenderableNode;
  type: string;
  helper?: string;
  disabled?: boolean;
  submitLabel: string;
  onSubmit: (value: JsonValue) => void;
}) {
  const config = node.config ?? {};
  const options = useMemo(() => readChoiceOptions(config), [node.config]);
  const [choice, setChoice] = useState<JsonValue | undefined>(undefined);
  const [on, setOn] = useState(false);
  const [numeric, setNumeric] = useState('');

  let body: ReactNode;
  let canSubmit = true;
  let submitValue: JsonValue = null;

  if (type === 'choice_cards') {
    body = (
      <ChoiceCards
        legend={node.title}
        options={options}
        value={choice}
        onChange={setChoice}
        disabled={disabled}
      />
    );
    canSubmit = choice !== undefined;
    submitValue = choice ?? null;
  } else if (type === 'toggle') {
    body = (
      <ToggleArtifact config={config} value={on} onChange={setOn} disabled={disabled} />
    );
    submitValue = on;
  } else if (type === 'numeric_input') {
    const parsed = numeric.trim() === '' ? Number.NaN : Number(numeric);
    const invalid = numeric.trim() !== '' && Number.isNaN(parsed);
    body = (
      <NumericInput
        config={config}
        value={numeric}
        onChange={setNumeric}
        disabled={disabled}
        invalid={invalid}
      />
    );
    canSubmit = numeric.trim() !== '' && !Number.isNaN(parsed);
    submitValue = parsed;
  } else {
    body = (
      <div className="unsupported">
        Unsupported artifact type <span className="mono">{type || 'unknown'}</span>. The client
        will not interpret it.
      </div>
    );
    canSubmit = false;
  }

  return (
    <form
      className="artifact"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit || disabled) return;
        onSubmit(submitValue);
      }}
    >
      <header>
        <p className="kicker">{artifactKicker(type)}</p>
        <h2 className="artifact__title">{node.title}</h2>
        {helper ? <p className="help">{helper}</p> : null}
      </header>
      {body}
      <div className="row">
        <button className="btn btn--gold" type="submit" disabled={disabled || !canSubmit}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
