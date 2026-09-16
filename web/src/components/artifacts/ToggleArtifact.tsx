import { useId } from 'react';
import { toggleFalseLabel, toggleTrueLabel } from '@/lib/presentation';
import type { JsonObject } from '@/api/types';

type Props = {
  config: JsonObject;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

export default function ToggleArtifact({ config, value, onChange, disabled }: Props) {
  const labelId = useId();
  const off = toggleFalseLabel(config);
  const on = toggleTrueLabel(config);

  return (
    <div className="toggle-row">
      <span className={value ? 'toggle-row__label' : 'toggle-row__label is-on'} id={`${labelId}-off`}>
        {off}
      </span>
      <button
        type="button"
        className="toggle"
        role="switch"
        aria-checked={value}
        aria-labelledby={`${labelId}-off ${labelId}-on`}
        disabled={disabled}
        onClick={() => onChange(!value)}
      >
        <span className="visually-hidden">{value ? on : off}</span>
      </button>
      <span className={value ? 'toggle-row__label is-on' : 'toggle-row__label'} id={`${labelId}-on`}>
        {on}
      </span>
    </div>
  );
}
