import FactTable from '@/components/FactTable';
import type { ApprovalAction, JsonObject, JsonValue } from '@/api/types';
import { actionLabel, actionValue, readPresentationFacts, readSummary } from '@/lib/presentation';

type Props = {
  config: JsonObject;
  actions: ApprovalAction[];
  disabled?: boolean;
  disableAccept?: boolean;
  onSubmit: (value: JsonValue) => void;
};

function isAcceptAction(action: ApprovalAction, index: number): boolean {
  const value = String(actionValue(action, index)).toLowerCase();
  const variant = (action.variant ?? action.id ?? '').toString().toLowerCase();
  return (
    value.includes('accept') ||
    value.includes('approve') ||
    variant.includes('accept') ||
    variant.includes('approve')
  );
}

export default function ApprovalCard({ config, actions, disabled, disableAccept, onSubmit }: Props) {
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
            disabled={disabled || disableAccept}
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
            const acceptBlocked = Boolean(disableAccept && isAcceptAction(action, index));
            return (
              <button
                key={String(action.id ?? actionValue(action, index))}
                type="button"
                className={`btn ${tone}`}
                disabled={disabled || acceptBlocked}
                data-testid={`action-${String(actionValue(action, index))}`}
                title={acceptBlocked ? 'Operator cannot Accept on checker node' : undefined}
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
