import FactTable from '@/components/FactTable';
import type { ApprovalAction, JsonObject, JsonValue } from '@/api/types';
import { actionLabel, actionValue, readPresentationFacts, readSummary } from '@/lib/presentation';

type Props = {
  config: JsonObject;
  actions: ApprovalAction[];
  disabled?: boolean;
  onSubmit: (value: JsonValue) => void;
};

export default function ApprovalCard({ config, actions, disabled, onSubmit }: Props) {
  const facts = readPresentationFacts(config);
  const summary = readSummary(config);

  return (
    <div className="ticket">
      {summary ? <p className="help">{summary}</p> : null}
      <FactTable facts={facts} />
      <div className="ticket__actions">
        {actions.length === 0 ? (
          <button
            type="button"
            className="btn btn--gold"
            disabled={disabled}
            onClick={() => onSubmit('submitted')}
          >
            Advance
          </button>
        ) : (
          actions.map((action, index) => {
            const variant = (action.variant ?? action.id ?? '').toString().toLowerCase();
            const tone =
              variant.includes('reject') || variant.includes('deny')
                ? 'is-reject'
                : variant.includes('approve') || variant.includes('accept')
                  ? 'is-approve'
                  : '';
            return (
              <button
                key={String(action.id ?? actionValue(action, index))}
                type="button"
                className={`btn ${tone}`}
                disabled={disabled}
                onClick={() => onSubmit(actionValue(action, index))}
              >
                {actionLabel(action, index)}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
