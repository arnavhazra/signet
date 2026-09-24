import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, extractSessionId, isSessionSnapshot, unwrapInbox } from '@/api/client';
import type { ExceptionEvent, InboxItem } from '@/api/types';
import { useDemoSession } from '@/auth/DemoSession';
import StatusPill from '@/components/StatusPill';
import { useTour } from '@/components/Tour';
import { toUserMessage } from '@/lib/errors';
import { filterInbox, INBOX_CHIPS, pickTourRow, rememberInbox, type InboxChip } from '@/lib/inbox';
import { usePageTitle } from '@/lib/pageTitle';
import { formatAge, formatDisplay, formatSigned, inboxStatus } from '@/lib/presentation';

const FRAME_KEY = 'signet.inbox.frame';
const VISITED_KEY = 'signet.inbox.visited';

export default function InboxPage() {
  const navigate = useNavigate();
  const demo = useDemoSession();
  const { active, resumable, start } = useTour();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [chip, setChip] = useState<InboxChip>('all');
  const [frameOpen, setFrameOpen] = useState(readFrameOpen);
  const inFlight = useRef(false);
  usePageTitle('Inbox');

  const refresh = useCallback(async () => {
    const data = await api.listInbox();
    const next = unwrapInbox(data);
    setItems(next);
    rememberInbox(next);
    setReady(true);
  }, []);

  useEffect(() => {
    if (demo.status === 'failed') {
      setReady(true);
      return;
    }
    if (demo.status !== 'ready') return;
    let cancelled = false;
    setReady(false);
    void refresh().catch((err: unknown) => {
      if (!cancelled) {
        setError(toUserMessage(err, 'operator'));
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [demo.status, refresh]);

  useEffect(() => {
    const onReset = () => {
      setReady(false);
      setError(null);
      void refresh().catch((err: unknown) => {
        setError(toUserMessage(err, 'operator'));
        setReady(true);
      });
    };
    window.addEventListener('signet:demo-reset', onReset);
    return () => window.removeEventListener('signet:demo-reset', onReset);
  }, [refresh]);

  const visible = filterInbox(items, chip);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== 'j' && event.key !== 'k') return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[data-modal], [data-testid="tour-dialog"]')) return;
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="inbox-row"]'));
      if (rows.length === 0) return;
      event.preventDefault();
      const current = document.activeElement instanceof HTMLElement ? rows.indexOf(document.activeElement) : -1;
      let next = event.key === 'j' ? current + 1 : current - 1;
      if (current < 0) next = event.key === 'j' ? 0 : rows.length - 1;
      next = Math.max(0, Math.min(rows.length - 1, next));
      rows[next]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

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

  async function injectMismatch() {
    if (inFlight.current) return;
    if (demo.role === 'auditor') {
      setError('Auditor role is read-only. Switch role to inject.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const accountId = `A-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const event: ExceptionEvent = {
      accountId,
      securityId: 'US0378331005',
      bookQty: 10000,
      custodianQty: 9850,
      asOf: new Date().toISOString().slice(0, 10),
      source: `queue-inject-${crypto.randomUUID()}`,
    };
    try {
      const posted = await api.injectException(event);
      await refresh();
      const id = isSessionSnapshot(posted) ? posted.sessionId : extractSessionId(posted);
      if (id) navigate(`/sessions/${encodeURIComponent(id)}`);
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
  const showResetCta = ready && demo.status === 'ready' && (items.length === 0 || !tourRowId);
  const injectDisabled = busy || demo.status !== 'ready' || demo.role === 'auditor';

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">Inbox</p>
          <h1>Exception review</h1>
          <p className="lede">Book vs custodian breaks. The kernel acts with oversight.</p>
        </div>
        <div className="row">
          {active ? null : (
            <button className="btn btn--gold" type="button" data-testid="start-tour" onClick={start}>
              {resumable ? 'Continue tour' : 'Start tour'}
            </button>
          )}
          <button
            className="btn"
            type="button"
            data-testid="inbox-inject"
            onClick={() => void injectMismatch()}
            disabled={injectDisabled}
            title={demo.role === 'auditor' ? 'Auditor cannot inject' : undefined}
          >
            New mismatch
          </button>
          <button className="btn" type="button" onClick={() => void onRefresh()} disabled={busy || demo.status !== 'ready'}>
            Refresh
          </button>
        </div>
      </header>

      <details className="frame" open={frameOpen} onToggle={onFrameToggle}>
        <summary>What this kernel does</summary>
        <ol className="thesis">
          <li>
            <strong>Ingest.</strong> Book vs custodian events become a versioned session. Delta is derived on the server.
          </li>
          <li>
            <strong>Halt.</strong> High-delta writes wait for maker, then checker. Agents propose; they do not write.
          </li>
          <li>
            <strong>Audited write.</strong> Tools persist only with an audit row. The kernel acts with oversight.
          </li>
        </ol>
      </details>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      {showResetCta ? (
        <p className="banner banner--warn" role="status">
          {items.length === 0
            ? 'No exceptions in queue.'
            : 'No open high-delta exception-review row.'}{' '}
          Reset the demo to reseed, or inject a new mismatch.
          <button className="btn btn--small" type="button" onClick={demo.openResetConfirm}>
            Reset demo
          </button>
          <button
            className="btn btn--small"
            type="button"
            data-testid="inbox-inject-cta"
            onClick={() => void injectMismatch()}
            disabled={injectDisabled}
            title={demo.role === 'auditor' ? 'Auditor cannot inject' : undefined}
          >
            New mismatch
          </button>
        </p>
      ) : null}

      <section className="panel panel--flush" aria-busy={!ready}>
        <p className="panel__stamp">Queue</p>
        <div className="chip-row" role="group" aria-label="Queue filters">
          {INBOX_CHIPS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`btn btn--small${chip === item.id ? ' btn--gold' : ''}`}
              data-testid={`inbox-filter-${item.id}`}
              aria-pressed={chip === item.id}
              onClick={() => setChip(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {!ready ? (
          <InboxSkeleton />
        ) : items.length === 0 ? (
          <p className="empty">No exceptions in queue.</p>
        ) : visible.length === 0 ? (
          <p className="empty">No rows for this filter.</p>
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
                {visible.map((item) => {
                  const status = inboxStatus(item.status, item.awaitingChecker);
                  const delta = Number(item.delta);
                  return (
                    <tr
                      key={item.sessionId}
                      className="inbox-row"
                      role="link"
                      tabIndex={0}
                      data-testid="inbox-row"
                      data-session-id={item.sessionId}
                      data-delta={Number.isFinite(delta) ? String(delta) : ''}
                      data-status={status}
                      data-account={item.accountId}
                      data-workflow={item.workflowSlug}
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
    const explicit = localStorage.getItem(FRAME_KEY);
    if (explicit === '1') return true;
    if (explicit === '0') return false;
    const visited = localStorage.getItem(VISITED_KEY);
    if (!visited) {
      localStorage.setItem(VISITED_KEY, '1');
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
