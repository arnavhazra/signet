import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, unwrapInbox } from '@/api/client';
import type { InboxItem } from '@/api/types';
import StatusPill from '@/components/StatusPill';
import { toUserMessage } from '@/lib/errors';
import { formatAge, formatDisplay, formatSigned, inboxStatus } from '@/lib/presentation';

export default function InboxPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
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

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">Inbox</p>
          <h1>Exception review</h1>
          <p className="lede">Book vs custodian breaks. Click a row to decide.</p>
        </div>
        <div className="row">
          <button className="btn" type="button" onClick={() => void onRefresh()} disabled={busy}>
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="panel panel--flush">
        <p className="panel__stamp">Queue</p>
        {!ready ? (
          <p className="empty">
            <span className="spin" aria-hidden="true" /> Loading inbox…
          </p>
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
