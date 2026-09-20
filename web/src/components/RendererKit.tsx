import { useState } from 'react';
import ArtifactRenderer, { type RenderableNode } from '@/components/artifacts/ArtifactRenderer';
import type { JsonValue } from '@/api/types';

const KIT: RenderableNode[] = [
  {
    id: 'kit-choice',
    title: 'How should this node proceed?',
    artifactType: 'choice_cards',
    helperText: 'Options are painted from config. The client does not rank or filter them.',
    config: {
      options: [
        { id: 'adjust', label: 'Post adjustment', description: 'Kernel will invoke the write tool.' },
        { id: 'reject', label: 'Reject exception', description: 'Kernel will close the event.' },
        { id: 'more', label: 'Request more data', description: 'Kernel will re-enter investigation.' },
      ],
    },
  },
  {
    id: 'kit-toggle',
    title: 'Mark as material',
    artifactType: 'toggle',
    helperText: 'Boolean only. Thresholds live on the server.',
    config: { falseLabel: 'Not material', trueLabel: 'Material' },
  },
  {
    id: 'kit-numeric',
    title: 'Override quantity',
    artifactType: 'numeric_input',
    helperText: 'Numeric entry with tabular figures. No reconciliation math in the browser.',
    config: { unit: 'qty' },
  },
  {
    id: 'kit-approval',
    title: 'Approve remediation',
    artifactType: 'approval_card',
    helperText: 'Facts are server-authored fields. Qty values are displayed, not subtracted.',
    config: {
      fields: [
        { label: 'Account', value: 'A-100' },
        { label: 'Security', value: 'US0378331005' },
        { label: 'Book qty', value: 10000 },
        { label: 'Custodian qty', value: 9850 },
      ],
      actions: [
        { id: 'approve', label: 'Approve', variant: 'approve' },
        { id: 'reject', label: 'Reject', variant: 'reject' },
      ],
    },
  },
];

export default function RendererKit() {
  const [last, setLast] = useState<{ id: string; value: JsonValue } | null>(null);

  return (
    <section className="panel">
      <p className="admin-flag">Admin renderer kit — local smoke, not an operator session</p>
      <p className="panel__stamp">Artifact types</p>
      <p className="help">
        Keyboard: arrows on choice cards, Space on the switch, Tab/Enter on approval actions.
        Submissions stay in this panel.
      </p>
      {last ? (
        <p className="help mt">
          Last local value from <span className="mono">{last.id}</span>:{' '}
          <span className="mono">{JSON.stringify(last.value)}</span>
        </p>
      ) : null}
      <div className="stack mt-lg">
        {KIT.map((node) => (
          <div key={node.id} className="panel panel--inset">
            <ArtifactRenderer
              node={node}
              onSubmit={(value) => setLast({ id: node.id, value })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
