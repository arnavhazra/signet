import { useId, useRef } from 'react';
import type { ChoiceOption, JsonValue } from '@/api/types';
import { optionLabel, optionValue } from '@/lib/presentation';

type Props = {
  legend: string;
  options: ChoiceOption[];
  value: JsonValue | undefined;
  onChange: (next: JsonValue) => void;
  disabled?: boolean;
};

export default function ChoiceCards({ legend, options, value, onChange, disabled }: Props) {
  const labelId = useId();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = options.findIndex((option, index) =>
    Object.is(optionValue(option, index), value),
  );

  function selectIndex(index: number) {
    if (options.length === 0 || disabled) return;
    const clamped = (index + options.length) % options.length;
    onChange(optionValue(options[clamped], clamped));
    buttonRefs.current[clamped]?.focus();
  }

  function move(offset: number) {
    const current = selectedIndex < 0 ? 0 : selectedIndex;
    selectIndex(current + offset);
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className="choice-grid"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          selectIndex(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          selectIndex(options.length - 1);
        }
      }}
    >
      <span id={labelId} className="visually-hidden">
        {legend}
      </span>
      {options.length === 0 ? (
        <p className="help">Kernel sent no options for this card.</p>
      ) : (
        options.map((option, index) => {
          const optionVal = optionValue(option, index);
          const selected = Object.is(optionVal, value);
          return (
            <button
              key={String(option.id ?? optionVal ?? index)}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              className={selected ? 'choice is-selected' : 'choice'}
              disabled={disabled}
              tabIndex={selected || (selectedIndex < 0 && index === 0) ? 0 : -1}
              onClick={() => onChange(optionVal)}
            >
              <span className="choice__label">{optionLabel(option, index)}</span>
              {option.description || option.helperText ? (
                <span className="choice__desc">{option.description ?? option.helperText}</span>
              ) : null}
            </button>
          );
        })
      )}
    </div>
  );
}
