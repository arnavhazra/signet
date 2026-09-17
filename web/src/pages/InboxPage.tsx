import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, unwrapInbox } from '@/api/client';
import type { InboxItem } from '@/api/types';
import StatusPill from '@/components/StatusPill';
import { useTour } from '@/components/Tour';
import { toUserMessage } from '@/lib/errors';
import { formatAge, formatDisplay, formatSigned, inboxStatus } from '@/lib/presentation';

const FRAME_KEY = 'signet.inbox.frame';

export default function InboxPage() {
  const navigate = useNavigate();
  const { active, resumable, start } = useTour();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [frameOpen, setFrameOpen] = useState(readFrameOpen);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    const data = await api.listInbox();
    setItems(unwrapInbox(data));
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refresh().catch((err: unknown) => {
      if (!cancelled) {
        setError(toUserMessage(err, 'operator'));
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const onReset = () => {
      setReady(false);
      void refresh().catch((err: unknown) => {
        setError(toUserMessage(err, 'operator'));
        setReady(true);
      });
    };
    window.addEventListener('signet:demo-reset', onReset);
    return () => window.removeEventListener('signet:demo-reset', onReset);
  }, [refresh]);

  async function onRefresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await refresh();
    } catch (err) {
      setError(toUserMessage(err, 'operator'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function openSession(id: string) {
    navigate(`/sessions/${encodeURIComponent(id)}`);
  }

  function onFrameToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    const open = event.currentTarget.open;
    setFrameOpen(open);
    try {
      localStorage.setItem(FRAME_KEY, open ? '1' : '0');
    } catch {
      /* private mode */
    }
  }

  const tourRowId = pickTourRow(items);

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">Inbox</p>
          <h1>Exception review</h1>
          <p className="lede">Book vs custodian breaks. Click a row to decide.</p>
        </div>
        <div className="row">
          {active ? null : (
            <button className="btn btn--gold" type="button" data-testid="start-tour" onClick={start}>
              {resumable ? 'Continue tour' : 'Start tour'}
            </button>
          )}
          <button className="btn" type="button" onClick={() => void onRefresh()} disabled={busy}>
            Refresh
          </button>
        </div>
      </header>

      <details className="frame" open={frameOpen} onToggle={onFrameToggle}>
        <summary>What this kernel does</summary>
        <ol className="thesis">
          <li>
            <strong>Ingest.</strong> Book vs custodian events become a versioned session. Delta is not computed here.
          </li>
          <li>
            <strong>Halt.</strong> High-delta writes wait for maker, then checker.
          </li>
          <li>
            <strong>Write.</strong> Tools persist only with an audit row. Replay is the frozen card.
          </li>
        </ol>
      </details>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="panel panel--flush" aria-busy={!ready}>
        <p className="panel__stamp">Queue</p>
        {!ready ? (
          <InboxSkeleton />
        ) : items.length === 0 ? (
          <p className="empty">No exceptions in queue.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table" data-testid="inbox-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>CUSIP</th>
                  <th className="num">Book</th>
                  <th className="num">Custodian</th>
                  <th className="num">Delta</th>
                  <th>Age</th>
                  <th>Status</th>
                  <th>Workflow</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = inboxStatus(item.status, item.awaitingChecker);
                  const delta = Number(item.delta);
                  return (
                    <tr
                      key={item.sessionId}
                      className="inbox-row"
                      tabIndex={0}
                      data-testid="inbox-row"
                      data-session-id={item.sessionId}
                      data-delta={Number.isFinite(delta) ? String(delta) : ''}
                      data-status={status}
                      data-account={item.accountId}
                      data-tour={item.sessionId === tourRowId ? 'high-delta' : undefined}
                      onClick={() => openSession(item.sessionId)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openSession(item.sessionId);
                        }
                      }}
                    >
                      <td className="mono">{item.accountId}</td>
                      <td className="mono">{item.securityId}</td>
                      <td className="num">{formatDisplay(item.bookQty)}</td>
                      <td className="num">{formatDisplay(item.custodianQty)}</td>
                      <td className={`num delta ${delta > 0 ? 'is-pos' : delta < 0 ? 'is-neg' : ''}`}>
                        {Number.isFinite(delta) ? formatSigned(delta) : '—'}
                      </td>
                      <td className="mono">{formatAge(item.createdAt)}</td>
                      <td>
                        <StatusPill status={status} />
                      </td>
                      <td className="mono">{item.workflowSlug || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function InboxSkeleton() {
  return (
    <div className="table-wrap" aria-hidden="true">
      <table className="data-table data-table--skel">
        <thead>
          <tr>
            {['Account', 'CUSIP', 'Book', 'Custodian', 'Delta', 'Age', 'Status', 'Workflow'].map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: 8 }, (__, col) => (
                <td key={col}>
                  <span className="skel" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="visually-hidden">Loading inbox…</p>
    </div>
  );
}

function readFrameOpen(): boolean {
  try {
    return localStorage.getItem(FRAME_KEY) !== '0';
  } catch {
    return true;
  }
}

function pickTourRow(items: InboxItem[]): string | null {
  if (items.length === 0) return null;
  const score = (item: InboxItem) => {
    const status = inboxStatus(item.status, item.awaitingChecker);
    const open = status === 'open' ? 1 : 0;
    const over = Math.abs(Number(item.delta)) >= 100 ? 1 : 0;
    return open * 2 + over;
  };
  const ranked = [...items].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff) return diff;
    return Math.abs(Number(b.delta)) - Math.abs(Number(a.delta));
  });
  return ranked[0].sessionId;
}
