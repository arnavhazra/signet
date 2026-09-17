import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, getLastRequestId, sessionPathFromApproval } from '@/api/client';
import type { AgentProposeRequest, AgentProposeResponse, JsonObject, JsonValue } from '@/api/types';
import FactTable from '@/components/FactTable';
import { toUserMessage } from '@/lib/errors';
import { SIGNET_LIVE_ORIGIN } from '@/lib/site';

type Tab = 'console' | 'contract';

const SAMPLE_TEXT = 'Resolve the book vs custodian break on A-214';

export default function AgentPage() {
  const [tab, setTab] = useState<Tab>('console');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentProposeResponse | null>(null);
  const [lastBody, setLastBody] = useState<AgentProposeRequest>({ text: SAMPLE_TEXT });
  const [requestId, setRequestId] = useState<string | null>(null);

  async function propose() {
    const body: AgentProposeRequest = { text: text.trim() || SAMPLE_TEXT };
    setBusy(true);
    setError(null);
    setLastBody(body);
    try {
      const next = await api.proposeAgent(body);
      setResult(next);
      setRequestId(getLastRequestId());
    } catch (err) {
      setResult(null);
      setError(toUserMessage(err, 'operator'));
      setRequestId(getLastRequestId());
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void propose();
  }

  function onPromptKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void propose();
    }
  }

  const sessionHref = result ? sessionPathFromApproval(result.sessionId, result.approvalUrl) : null;
  const proposalFacts = useMemo(() => proposalRows(result?.proposal), [result]);
  const policyFacts = useMemo(() => policyRows(result?.policy), [result]);
  const curl = buildCurl(lastBody);
  const mcpConfig = buildMcpConfig();

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">Agent</p>
          <h1>Propose</h1>
          <p className="lede">Agents propose. Policy decides. Writes never skip dual control.</p>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Agent console">
        <button
          type="button"
          role="tab"
          id="tab-console"
          className={`tabs__tab${tab === 'console' ? ' is-active' : ''}`}
          aria-selected={tab === 'console'}
          aria-controls="panel-console"
          onClick={() => setTab('console')}
        >
          Console
        </button>
        <button
          type="button"
          role="tab"
          id="tab-contract"
          className={`tabs__tab${tab === 'contract' ? ' is-active' : ''}`}
          aria-selected={tab === 'contract'}
          aria-controls="panel-contract"
          onClick={() => setTab('contract')}
        >
          Contract
        </button>
      </div>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      {tab === 'console' ? (
        <div className="grid-2" role="tabpanel" id="panel-console" aria-labelledby="tab-console">
          <div className="stack">
            <form className="panel" onSubmit={onSubmit}>
              <p className="panel__stamp">Prompt</p>
              <div className="field">
                <label htmlFor="agent-prompt">Free text</label>
                <textarea
                  id="agent-prompt"
                  className="textarea"
                  data-testid="agent-prompt"
                  rows={6}
                  value={text}
                  placeholder={SAMPLE_TEXT}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={onPromptKey}
                  spellCheck={false}
                />
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn btn--gold" type="submit" data-testid="agent-propose" disabled={busy}>
                  {busy ? 'Proposing…' : 'Propose'}
                </button>
                <p className="help">⌘/Ctrl + Enter</p>
              </div>
            </form>

            <section className="panel">
              <p className="panel__stamp">Typed proposal</p>
              {result ? (
                proposalFacts.length ? (
                  <FactTable facts={proposalFacts} />
                ) : (
                  <p className="empty">No typed fields on this proposal.</p>
                )
              ) : (
                <p className="empty">Submit a prompt. The kernel returns intent, account, and params.</p>
              )}
            </section>
          </div>

          <div className="stack">
            <section
              className={`panel verdict verdict--${decisionTone(result?.decision)}`}
              data-testid="agent-verdict"
              aria-live="polite"
            >
              <p className="panel__stamp">Policy verdict</p>
              {result ? (
                <>
                  <p className="verdict__label">{decisionLabel(result.decision)}</p>
                  <p className="help">{decisionCopy(result.decision)}</p>
                  {policyFacts.length ? <FactTable facts={policyFacts} /> : null}
                  <FactTable
                    facts={[
                      { label: 'auditEventId', value: result.auditEventId ?? '—' },
                      { label: 'X-Request-Id', value: requestId ?? '—' },
                    ]}
                  />
                  {sessionHref ? (
                    <p className="help" style={{ marginTop: 12 }}>
                      <Link to={sessionHref}>Open session</Link>
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="empty">requires_human · denied · auto_executed</p>
              )}
            </section>
          </div>
        </div>
      ) : (
        <div className="grid-2" role="tabpanel" id="panel-contract" aria-labelledby="tab-contract">
          <section className="panel">
            <p className="panel__stamp">curl</p>
            <p className="help">Same call against production. Cookie from the demo auth endpoint.</p>
            <CopyBlock text={curl} testId="agent-curl" />
          </section>
          <section className="panel">
            <p className="panel__stamp">MCP client</p>
            <p className="help">Streamable HTTP. Point a client at the live kernel.</p>
            <CopyBlock text={mcpConfig} testId="agent-mcp" />
          </section>
        </div>
      )}
    </>
  );
}

function CopyBlock({ text, testId }: { text: string; testId: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="copyblock">
      <pre className="json-view" data-testid={testId}>
        {text}
      </pre>
      <button className="btn btn--ghost" type="button" onClick={() => void onCopy()}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function buildCurl(body: AgentProposeRequest): string {
  const payload = JSON.stringify(body);
  return [
    `curl -sS -c cookies -b cookies \\`,
    `  '${SIGNET_LIVE_ORIGIN}/v1/auth/demo?role=operator'`,
    ``,
    `curl -sS -c cookies -b cookies \\`,
    `  -X POST '${SIGNET_LIVE_ORIGIN}/v1/agent/propose' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${payload}'`,
  ].join('\n');
}

function buildMcpConfig(): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        signet: {
          type: 'http',
          url: `${SIGNET_LIVE_ORIGIN}/mcp`,
        },
      },
    },
    null,
    2,
  )}\n`;
}

function decisionLabel(decision: string | undefined): string {
  const key = (decision ?? '').trim().toLowerCase();
  if (key === 'requires_human') return 'Requires human';
  if (key === 'denied') return 'Denied';
  if (key === 'auto_executed') return 'Auto executed';
  return decision?.trim() ? decision : '—';
}

function decisionCopy(decision: string | undefined): string {
  const key = (decision ?? '').trim().toLowerCase();
  if (key === 'requires_human') return 'Write-class intent. Session opened for maker-checker.';
  if (key === 'denied') return 'Unknown or disallowed intent. No side effect.';
  if (key === 'auto_executed') return 'Read-class intent served and audited.';
  return 'Policy response from the kernel.';
}

function decisionTone(decision: string | undefined): 'idle' | 'wait' | 'bad' | 'ok' {
  const key = (decision ?? '').trim().toLowerCase();
  if (key === 'requires_human') return 'wait';
  if (key === 'denied') return 'bad';
  if (key === 'auto_executed') return 'ok';
  return 'idle';
}

function proposalRows(proposal: AgentProposeResponse['proposal'] | undefined): { label: string; value: JsonValue }[] {
  if (!proposal) return [];
  const rows: { label: string; value: JsonValue }[] = [];
  for (const key of ['intent', 'accountId', 'rationale', 'text'] as const) {
    const value = proposal[key];
    if (value !== undefined && value !== null && value !== '') rows.push({ label: key, value });
  }
  if (proposal.params && typeof proposal.params === 'object') {
    rows.push({ label: 'params', value: JSON.stringify(proposal.params) });
  }
  return rows;
}

function policyRows(policy: AgentProposeResponse['policy'] | undefined): { label: string; value: JsonValue }[] {
  if (!policy) return [];
  const preferred = ['rule', 'threshold', 'delta'];
  const rows: { label: string; value: JsonValue }[] = [];
  const used = new Set<string>();
  for (const key of preferred) {
    const value = policy[key];
    if (value !== undefined && value !== null && value !== '') {
      rows.push({ label: key, value });
      used.add(key);
    }
  }
  for (const [key, value] of Object.entries(policy as JsonObject)) {
    if (used.has(key)) continue;
    if (value !== null && typeof value === 'object') continue;
    rows.push({ label: key, value });
  }
  return rows;
}
