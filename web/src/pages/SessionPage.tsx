import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ApiError,
  api,
  getLastRequestId,
  isSessionSnapshot,
  sessionConcurrencyToken,
  unwrapAudit,
} from '@/api/client';
import type { AuditEvent, JsonObject, JsonValue, SessionSnapshot } from '@/api/types';
import ArtifactRenderer, { nodeFromSession } from '@/components/artifacts/ArtifactRenderer';
import AuditLog from '@/components/AuditLog';
import Citations from '@/components/Citations';
import FactTable from '@/components/FactTable';
import StatusPill from '@/components/StatusPill';
import { toUserMessage } from '@/lib/errors';
import { isTerminalStatus } from '@/lib/presentation';

export default function SessionPage() {
  const { id = '' } = useParams();
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const inFlight = useRef(false);

  const loadSession = useCallback(async (sessionId: string) => {
    const next = await api.getSession(sessionId);
    setSnapshot(next);
    setRequestId(getLastRequestId());
    try {
      const raw = await api.getAudit(sessionId);
      setAudit(unwrapAudit(raw));
      setRequestId(getLastRequestId() ?? getLastRequestId());
    } catch {
      if (isTerminalStatus(next.status)) setAudit([]);
    }
    return next;
  }, []);

  useEffect(() => {
    if (!id) {
      setSnapshot(null);
      setAudit(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void loadSession(id).catch((err: unknown) => {
      if (!cancelled) setError(toUserMessage(err, 'operator'));
    });
    return () => {
      cancelled = true;
    };
  }, [id, loadSession]);

  const awaitingHuman = Boolean(snapshot?.currentNode);
  const terminal = snapshot ? isTerminalStatus(snapshot.status) : false;
  const checker = Boolean(snapshot?.awaitingChecker) || snapshot?.status === 'awaiting_checker';

  useEffect(() => {
    if (!id || !snapshot || awaitingHuman || terminal) return;
    const timer = window.setInterval(() => {
      void loadSession(id).catch((err: unknown) => setError(toUserMessage(err, 'operator')));
    }, 800);
    return () => window.clearInterval(timer);
  }, [id, snapshot, awaitingHuman, terminal, loadSession]);

  async function advance(value: JsonValue) {
    if (!snapshot?.currentNode || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const questionKey = snapshot.currentNode.questionId || snapshot.currentNode.id;
      const expectedUpdatedAt = sessionConcurrencyToken(snapshot);
      const posted = await api.advanceSession(snapshot.sessionId, {
        inputs: { [questionKey]: value },
        ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
      });
      setRequestId(getLastRequestId());
      const next = isSessionSnapshot(posted) ? posted : await loadSession(snapshot.sessionId);
      setSnapshot(next);
      const raw = await api.getAudit(snapshot.sessionId);
      setAudit(unwrapAudit(raw));
      setRequestId(getLastRequestId());
      if (isTerminalStatus(next.status)) {
        setNotice(outcomeNotice(value, next.status));
      } else if (next.awaitingChecker || next.status === 'awaiting_checker') {
        setNotice('Maker accepted. Waiting on checker.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        try {
          await loadSession(snapshot.sessionId);
        } catch {
          /* keep conflict message */
        }
      }
      setError(toUserMessage(err, 'operator'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const derivedFacts = useMemo(() => primitiveFacts(snapshot?.derived), [snapshot?.derived]);

  useEffect(() => {
    if (!snapshot) return;
    window.dispatchEvent(
      new CustomEvent('signet:session', {
        detail: {
          sessionId: snapshot.sessionId,
          status: snapshot.status,
          awaitingChecker: Boolean(snapshot.awaitingChecker) || snapshot.status === 'awaiting_checker',
          terminal: isTerminalStatus(snapshot.status),
        },
      }),
    );
  }, [snapshot]);

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">
            <Link to="/">Inbox</Link>
            <span aria-hidden="true"> / </span>
            Decision
          </p>
          <h1>Exception {id ? id.slice(0, 8) : ''}</h1>
          <p className="lede">Accept, reject, or request more data. High-delta items need a checker.</p>
        </div>
        <div className="row">
          <StatusPill status={snapshot?.status ?? 'idle'} />
          {id ? (
            <Link className="btn" to={`/sessions/${encodeURIComponent(id)}/replay`} data-testid="replay-link">
              Replay
            </Link>
          ) : null}
        </div>
      </header>

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
          <section className={`panel${checker ? ' panel--checker' : ''}`} aria-live="polite">
            <p className="panel__stamp">{checker ? 'Checker' : 'Current node'}</p>
            {snapshot?.currentNode ? (
              <>
                {checker ? <p className="help">Second control. Maker already accepted.</p> : null}
                <ArtifactRenderer
                  key={snapshot.currentNode.id}
                  node={nodeFromSession(snapshot.currentNode)}
                  disabled={busy}
                  onSubmit={(value) => void advance(value)}
                />
              </>
            ) : terminal ? (
              <p className="empty">
                Session {snapshot?.status}. No human node.
              </p>
            ) : snapshot ? (
              <p className="empty">
                <span className="spin" aria-hidden="true" /> Running…
              </p>
            ) : (
              <p className="empty">Loading session…</p>
            )}
          </section>

          {audit !== null ? <AuditLog events={audit} /> : null}
        </div>

        <div className="stack">
          {snapshot ? (
            <section className="panel">
              <p className="panel__stamp">Session</p>
              <FactTable
                facts={[
                  { label: 'sessionId', value: snapshot.sessionId },
                  { label: 'workflowId', value: snapshot.workflowId },
                  { label: 'version', value: snapshot.version },
                  { label: 'status', value: snapshot.status },
                  { label: 'X-Request-Id', value: requestId ?? '—' },
                ]}
              />
            </section>
          ) : (
            <section className="panel">
              <p className="panel__stamp">Session</p>
              <p className="empty">No snapshot yet.</p>
            </section>
          )}
          <Citations value={snapshot?.citations} />
          {derivedFacts.length > 0 ? (
            <section className="panel">
              <p className="panel__stamp panel__stamp--server">Derived</p>
              <FactTable facts={derivedFacts} />
            </section>
          ) : snapshot ? (
            <section className="panel">
              <p className="panel__stamp panel__stamp--server">Derived</p>
              <p className="empty">No primitive derived fields.</p>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}

function outcomeNotice(value: JsonValue, status: string): string {
  if (value === 'accept_adjustment' || value === 'accept' || value === 'approve') {
    return 'Accepted. Remediation is written through the tool gateway.';
  }
  if (value === 'reject' || value === 'deny') {
    return 'Rejected. No remediation.';
  }
  if (value === 'request_more_data' || status === 'pending_more_data') {
    return 'Parked for more data.';
  }
  return `Session ${status}.`;
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
