import { useId } from 'react';
import { readNumberConfig } from '@/lib/presentation';
import type { JsonObject } from '@/api/types';

type Props = {
  config: JsonObject;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  invalid?: boolean;
};

export default function NumericInput({ config, value, onChange, disabled, invalid }: Props) {
  const id = useId();
  const spec = readNumberConfig(config);

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        Value
      </label>
      <div className="numeric">
        <input
          id={id}
          className="num"
          inputMode="decimal"
          type="number"
          min={spec.min}
          max={spec.max}
          step={spec.step ?? 'any'}
          placeholder={spec.placeholder}
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {spec.unit ? <span className="numeric__unit">{spec.unit}</span> : null}
      </div>
    </div>
  );
}
