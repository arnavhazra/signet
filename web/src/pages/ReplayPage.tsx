import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { SessionReplay } from '@/api/types';
import Citations from '@/components/Citations';
import FactTable from '@/components/FactTable';
import StatusPill from '@/components/StatusPill';
import { toUserMessage } from '@/lib/errors';

export default function ReplayPage() {
  const { id = '' } = useParams();
  const [replay, setReplay] = useState<SessionReplay | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    void api
      .getReplay(id)
      .then((data) => {
        if (!cancelled) setReplay(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toUserMessage(err, 'operator'));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">
            <Link to="/">Inbox</Link>
            <span aria-hidden="true"> / </span>
            <Link to={`/sessions/${encodeURIComponent(id)}`}>Decision</Link>
            <span aria-hidden="true"> / </span>
            Replay
          </p>
          <h1>Replay {id ? id.slice(0, 8) : ''}</h1>
          <p className="lede">Immutable workflow version and the stripped contract this operator saw.</p>
        </div>
        {replay ? <StatusPill status={`v${replay.version}`} /> : null}
      </header>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      {!replay && !error ? (
        <p className="empty">
          <span className="spin" aria-hidden="true" /> Loading replay…
        </p>
      ) : null}

      {replay ? (
        <div className="grid-2">
          <div className="stack">
            <section className="panel">
              <p className="panel__stamp">Stripped contract</p>
              <pre
                className="json-view"
                data-testid="replay-stripped"
                data-has-binding={JSON.stringify(replay.stripped).includes('"binding"') ? '1' : '0'}
              >
                {JSON.stringify(replay.stripped, null, 2)}
              </pre>
            </section>
          </div>
          <div className="stack">
            <section className="panel">
              <p className="panel__stamp">Version</p>
              <FactTable
                facts={[
                  { label: 'workflowId', value: replay.workflowId },
                  { label: 'slug', value: replay.slug },
                  { label: 'version', value: replay.version },
                  { label: 'createdAt', value: replay.createdAt },
                ]}
              />
            </section>
            <Citations value={replay.citations} />
            <section className="panel">
              <p className="panel__stamp">Stored answers</p>
              <pre className="json-view">{JSON.stringify(replay.accumulatedAnswers ?? {}, null, 2)}</pre>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
