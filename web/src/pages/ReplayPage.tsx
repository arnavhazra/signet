import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { SessionReplay } from '@/api/types';
import Citations from '@/components/Citations';
import FactTable from '@/components/FactTable';
import StatusPill from '@/components/StatusPill';
import { toUserMessage } from '@/lib/errors';
import { usePageTitle } from '@/lib/pageTitle';
import { sessionAnswerFacts, sessionHeading } from '@/lib/sessionChrome';

export default function ReplayPage() {
  const { id = '' } = useParams();
  const [replay, setReplay] = useState<SessionReplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const heading = replay ? sessionHeading(replay.accumulatedAnswers, replay.slug) : 'Replay';
  usePageTitle(heading);

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

  const facts = useMemo(
    () => sessionAnswerFacts(replay?.accumulatedAnswers, replay?.derived),
    [replay?.accumulatedAnswers, replay?.derived],
  );

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
          <h1>{heading}</h1>
          <p className="lede lede--mono">{id}</p>
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
              <p className="panel__stamp">Facts</p>
              {facts.length ? <FactTable facts={facts} /> : <p className="empty">No account facts on this replay.</p>}
              <p className="help mt">
                {replay.slug} · v{replay.version} · {replay.createdAt}
              </p>
            </section>
            <Citations value={replay.citations} />
          </div>
        </div>
      ) : null}
    </>
  );
}
