import type { JsonValue } from '@/api/types';
import { formatDisplay, isNumericValue } from '@/lib/presentation';

type Props = {
  facts: { label: string; value: JsonValue }[];
};

export default function FactTable({ facts }: Props) {
  if (facts.length === 0) return null;

  return (
    <dl className="facts">
      {facts.map((fact) => (
        <div key={fact.label} style={{ display: 'contents' }}>
          <dt>{humanize(fact.label)}</dt>
          <dd className={isNumericValue(fact.value) ? 'num' : undefined}>
            {formatDisplay(fact.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}
