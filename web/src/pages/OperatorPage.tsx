import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  api,
  extractSessionId,
  isSessionSnapshot,
  unwrapAudit,
} from '@/api/client';
import type { AuditEvent, ExceptionEvent, JsonObject, JsonValue, SessionSnapshot } from '@/api/types';
import ArtifactRenderer, { nodeFromSession } from '@/components/artifacts/ArtifactRenderer';
import AuditLog from '@/components/AuditLog';
import Citations from '@/components/Citations';
import FactTable from '@/components/FactTable';
import StatusPill from '@/components/StatusPill';
import { toUserMessage } from '@/lib/errors';
import { isTerminalStatus } from '@/lib/presentation';

function syntheticException(): ExceptionEvent {
  return {
    accountId: 'A-100',
    securityId: 'US0378331005',
    bookQty: 10000,
    custodianQty: 9850,
    asOf: new Date().toISOString().slice(0, 10),
    source: `forge-operator-${crypto.randomUUID()}`,
  };
}

type Phase = 'idle' | 'running' | 'halt' | 'done' | 'failed';

function phaseOf(snapshot: SessionSnapshot | null): Phase {
  if (!snapshot) return 'idle';
  if (snapshot.status === 'failed') return 'failed';
  if (isTerminalStatus(snapshot.status)) return 'done';
  if (snapshot.currentNode) return 'halt';
  return 'running';
}

export default function OperatorPage() {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get('session');
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<ExceptionEvent | null>(null);
  const inFlight = useRef(false);
  const preview: ExceptionEvent = posted ?? {
    accountId: 'A-100',
    securityId: 'US0378331005',
    bookQty: 10000,
    custodianQty: 9850,
    asOf: new Date().toISOString().slice(0, 10),
    source: 'forge-operator',
  };

  const loadSession = useCallback(async (id: string) => {
    const next = await api.getSession(id);
    setSnapshot(next);
    try {
      const raw = await api.getAudit(id);
      setAudit(unwrapAudit(raw));
    } catch {
      if (isTerminalStatus(next.status)) setAudit([]);
    }
    return next;
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setSnapshot(null);
      setAudit(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void loadSession(sessionId).catch((err: unknown) => {
      if (!cancelled) setError(toUserMessage(err, 'operator'));
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, loadSession]);

  const awaitingHuman = Boolean(snapshot?.currentNode);
  const terminal = snapshot ? isTerminalStatus(snapshot.status) : false;
  const phase = phaseOf(snapshot);

  useEffect(() => {
    if (!sessionId || !snapshot || awaitingHuman || terminal) return;
    const timer = window.setInterval(() => {
      void loadSession(sessionId).catch((err: unknown) => setError(toUserMessage(err, 'operator')));
    }, 800);
    return () => window.clearInterval(timer);
  }, [sessionId, snapshot, awaitingHuman, terminal, loadSession]);

  async function injectMismatch() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setAudit(null);
    const event = syntheticException();
    setPosted(event);
    try {
      const posted = await api.injectException(event);
      if (isSessionSnapshot(posted)) {
        setSnapshot(posted);
        setParams({ session: posted.sessionId });
        const raw = await api.getAudit(posted.sessionId);
        setAudit(unwrapAudit(raw));
        if (posted.currentNode) {
          setNotice('Event ingested. The DAG halted on the approval card.');
        }
        return;
      }
      const id = extractSessionId(posted);
      if (!id) {
        throw new Error(
          'Exception accepted but the response did not include sessionId. Check the orchestrator payload.',
        );
      }
      setParams({ session: id });
      const next = await loadSession(id);
      if (next.currentNode) {
        setNotice(
          'Event ingested. The DAG halted on the approval card.',
        );
      }
    } catch (err) {
      setError(toUserMessage(err, 'operator'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function advance(value: JsonValue) {
    if (!snapshot?.currentNode || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const questionKey = snapshot.currentNode.questionId || snapshot.currentNode.id;
      const posted = await api.advanceSession(snapshot.sessionId, {
        inputs: { [questionKey]: value },
      });
      const next = isSessionSnapshot(posted) ? posted : await loadSession(snapshot.sessionId);
      setSnapshot(next);
      const raw = await api.getAudit(snapshot.sessionId);
      setAudit(unwrapAudit(raw));
      if (next.status === 'completed') {
        const accepted = value === 'accept_adjustment';
        setNotice(
          accepted
            ? 'Adjustment accepted. The kernel wrote a remediation that cannot exist without an audit row — there is no silent write path.'
            : 'Session completed. Check the audit trail for which tools ran (reject / more-data paths do not write a remediation).',
        );
      }
    } catch (err) {
      setError(toUserMessage(err, 'operator'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const derivedFacts = useMemo(
    () => primitiveFacts(snapshot?.derived),
    [snapshot?.derived],
  );

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">Operator console</p>
          <h1>Exception review</h1>
          <p className="lede">Exception review. Inject an event, decide on the card, read the audit trail.</p>
        </div>
        <div className="row">
          <StatusPill status={snapshot?.status ?? 'idle'} />
          <button className="btn btn--gold" type="button" onClick={() => void injectMismatch()} disabled={busy}>
            {busy && phase !== 'halt' ? 'Working…' : 'Inject mismatch'}
          </button>
        </div>
      </header>

      <ol className="thesis" aria-label="What this kernel does">
        <li>
          <strong>Event in.</strong> Inject posts book vs custodian quantities. The client does not subtract them.
        </li>
        <li>
          <strong>DAG on the server.</strong> Delta, citations, and the halt node are computed in Postgres-backed session state.
        </li>
        <li>
          <strong>You decide.</strong> Accept writes a remediation with a hard FK to an audit row. Reject writes nothing to the books.
        </li>
      </ol>

      <ol className="phase" aria-label="Demo steps">
          <PhaseStep n={1} label="Event ingested" active={phase !== 'idle'} current={false} />
        <PhaseStep n={2} label="DAG ran on server" active={phase === 'halt' || phase === 'done' || phase === 'failed'} current={phase === 'running'} />
        <PhaseStep n={3} label="Waiting on you" active={phase === 'halt' || phase === 'done' || phase === 'failed'} current={phase === 'halt'} />
        <PhaseStep n={4} label="Audited write" active={phase === 'done' || phase === 'failed'} current={false} />
      </ol>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}
      {notice && !error ? (
        <p className="banner banner--ok" role="status">
          {notice}
        </p>
      ) : null}

      <div className="grid-2">
        <div className="stack">
          <section className="panel">
            <p className="panel__stamp">Synthetic exception</p>
            <p className="help">
              Posted as-is to <span className="mono">POST /v1/events/exceptions</span>. Quantities are
              not reconciled in the browser. Each inject is a new event (unique source), so you can
              run the loop more than once.
            </p>
            <FactTable
              facts={[
                { label: 'accountId', value: preview.accountId },
                { label: 'securityId', value: preview.securityId },
                { label: 'bookQty', value: preview.bookQty },
                { label: 'custodianQty', value: preview.custodianQty },
                { label: 'asOf', value: preview.asOf },
              ]}
            />
          </section>

          <section className="panel" aria-live="polite">
            <p className="panel__stamp">Current node</p>
            {snapshot?.currentNode ? (
              <>
                <p className="help" style={{ marginBottom: 12 }}>
                  Facts on the card are server-derived. This client only paints them.
                </p>
                <ArtifactRenderer
                  key={snapshot.currentNode.id}
                  node={nodeFromSession(snapshot.currentNode)}
                  disabled={busy}
                  onSubmit={(value) => void advance(value)}
                />
              </>
            ) : terminal ? (
              <p className="empty">
                Session {snapshot?.status}. The kernel is no longer waiting on a human node.
                {snapshot?.status === 'completed'
                  ? ' Read the audit trail for the write (or the close) that followed your decision.'
                  : ''}
              </p>
            ) : snapshot ? (
              <p className="empty">
                <span className="spin" aria-hidden="true" /> DAG is running logic nodes on the server…
              </p>
            ) : (
              <p className="empty">
                No active session. Click <strong>Inject mismatch</strong> — the demo runtime key is
                already loaded. You do not need Swap keys for this path.
              </p>
            )}
          </section>

          {audit !== null ? <AuditLog events={audit} /> : null}
        </div>

        <div className="stack">
          {snapshot ? (
            <section className="panel">
              <p className="panel__stamp">Session</p>
              <p className="help">
                Replay key is workflow version + session. Asking &ldquo;why did this form look like
                that?&rdquo; means re-running this immutable definition.
              </p>
              <FactTable
                facts={[
                  { label: 'sessionId', value: snapshot.sessionId },
                  { label: 'workflowId', value: snapshot.workflowId },
                  { label: 'version', value: snapshot.version },
                  { label: 'status', value: snapshot.status },
                ]}
              />
            </section>
          ) : (
            <section className="panel">
              <p className="panel__stamp">What you will see</p>
              <p className="help">
                After inject: an approval card, a server-derived quantity delta, citations, then an audit trail.
              </p>
            </section>
          )}
          <Citations value={snapshot?.citations} />
          {derivedFacts.length > 0 ? (
            <section className="panel">
              <p className="panel__stamp panel__stamp--server">Server-derived</p>
              <p className="help">
                Opaque kernel state returned on the snapshot. Displayed as sent — this client does not
                recompute a delta or attach citations.
              </p>
              <FactTable facts={derivedFacts} />
            </section>
          ) : snapshot ? (
            <section className="panel">
              <p className="panel__stamp panel__stamp--server">Server-derived</p>
              <p className="empty">No primitive derived fields on this snapshot yet.</p>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}

function PhaseStep({
  n,
  label,
  active,
  current,
}: {
  n: number;
  label: string;
  active: boolean;
  current: boolean;
}) {
  return (
    <li className={current ? 'is-current' : active ? 'is-done' : undefined}>
      <span className="phase__n">{n}</span>
      {label}
    </li>
  );
}

function primitiveFacts(value: JsonObject | undefined): { label: string; value: JsonObject[string] }[] {
  if (!value) return [];
  return Object.entries(value)
    .filter(([key, item]) => {
      if (key === 'filters' || key === 'query') return false;
      return item === null || typeof item !== 'object';
    })
    .map(([label, item]) => ({ label, value: item }));
}
