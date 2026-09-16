import type { JsonValue } from '@/api/types';
import { formatDisplay } from '@/lib/presentation';

type Props = {
  value: unknown;
};

export default function Citations({ value }: Props) {
  const items = normalize(value);

  return (
    <section className="panel" aria-labelledby="citations-heading">
      <p className="panel__stamp panel__stamp--server" id="citations-heading">
        Citations · server-derived
      </p>
      <p className="help">
        Record ids attached by the <span className="mono">attach_citations</span> tool. This client
        does not fetch or join ledgers.
      </p>
      {items.length === 0 ? (
        <p className="empty">No citations on this snapshot yet.</p>
      ) : (
        <ul className="cite-list">
          {items.map((item) => (
            <li key={item.key}>
              <div className="cite-list__src">{item.title}</div>
              {item.meta ? <div className="cite-list__meta">{item.meta}</div> : null}
              {item.detail ? (
                <div className="cite-list__meta">{item.detail}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function normalize(value: unknown): { key: string; title: string; meta?: string; detail?: string }[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry, index) => citeFromUnknown(entry, index));
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, JsonValue>).map(([key, val], index) => ({
      key: key || String(index),
      title: key,
      detail: formatDisplay(val),
    }));
  }
  return [{ key: '0', title: String(value) }];
}

function citeFromUnknown(
  entry: unknown,
  index: number,
): { key: string; title: string; meta?: string; detail?: string } {
  if (typeof entry === 'string' || typeof entry === 'number') {
    return { key: String(index), title: String(entry) };
  }
  if (!entry || typeof entry !== 'object') {
    return { key: String(index), title: `Citation ${index + 1}` };
  }
  const rec = entry as Record<string, JsonValue | undefined>;
  const title =
    prettySource(stringish(rec.source)) ??
    stringish(rec.label) ??
    stringish(rec.title) ??
    stringish(rec.ref) ??
    `Citation ${index + 1}`;
  const metaParts = [
    stringish(rec.recordId),
    stringish(rec.rowId),
    stringish(rec.id) && stringish(rec.id) !== stringish(rec.recordId) ? stringish(rec.id) : null,
    stringish(rec.timestamp) ?? stringish(rec.asOf),
    stringish(rec.uri),
  ].filter(Boolean);
  return {
    key: stringish(rec.recordId) ?? stringish(rec.id) ?? String(index),
    title,
    meta: metaParts.length > 0 ? metaParts.join(' · ') : undefined,
  };
}

function prettySource(source: string | null): string | null {
  if (!source) return null;
  if (source === 'book_ledger') return 'Book ledger';
  if (source === 'custodian_feed') return 'Custodian feed';
  return source.replace(/_/g, ' ');
}

function stringish(value: JsonValue | undefined): string | null {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number') return String(value);
  return null;
}
