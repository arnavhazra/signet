import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  api,
  asJsonObject,
  isSessionSnapshot,
  unwrapList,
} from '@/api/client';
import { toUserMessage } from '@/lib/errors';
import { usePageTitle } from '@/lib/pageTitle';
import type {
  ActiveWorkflow,
  AdminWorkflow,
  JsonValue,
  SessionSnapshot,
  WorkflowStep,
} from '@/api/types';
import ArtifactRenderer, { nodeFromSession, nodeFromStep } from '@/components/artifacts/ArtifactRenderer';
import RendererKit from '@/components/RendererKit';
import StatusPill from '@/components/StatusPill';

const EMPTY_DEFINITION = `{
  "nodes": []
}`;

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('workflow');
  const [workflows, setWorkflows] = useState<AdminWorkflow[]>([]);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [definitionText, setDefinitionText] = useState(EMPTY_DEFINITION);
  const [inputsText, setInputsText] = useState('{}');
  const [preview, setPreview] = useState<unknown>(null);
  const [active, setActive] = useState<ActiveWorkflow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listReady, setListReady] = useState(false);
  usePageTitle('Admin');

  const refreshList = useCallback(async () => {
    const data = await api.listWorkflows();
    setWorkflows(unwrapList<AdminWorkflow>(data).filter((item) => typeof item.id === 'string'));
    setListReady(true);
    setError(null);
  }, []);

  useEffect(() => {
    void refreshList().catch((err: unknown) => setError(toMessage(err)));
  }, [refreshList]);

  useEffect(() => {
    const onRole = () => {
      void refreshList().catch((err: unknown) => setError(toMessage(err)));
    };
    window.addEventListener('signet:role', onRole);
    return () => window.removeEventListener('signet:role', onRole);
  }, [refreshList]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setError(null);
    void api
      .getWorkflow(selectedId)
      .then((workflow) => {
        if (cancelled) return;
        applyWorkflow(workflow);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function applyWorkflow(workflow: AdminWorkflow) {
    setSlug(typeof workflow.slug === 'string' ? workflow.slug : '');
    setName(typeof workflow.name === 'string' ? workflow.name : '');
    if (workflow.definition !== undefined) {
      setDefinitionText(JSON.stringify(workflow.definition, null, 2));
    }
  }

  async function createWorkflow() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const definition = parseJson(definitionText, 'definition');
      const created = await api.createWorkflow({ slug, name, definition });
      await refreshList();
      if (created?.id) setParams({ workflow: created.id });
      setNotice('Workflow created.');
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function previewWorkflow() {
    if (!selectedId) {
      setError('Select or create a workflow before previewing.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const inputs = asJsonObject(parseJson(inputsText, 'preview inputs'));
      const result = await api.previewWorkflow(selectedId, { inputs });
      setPreview(result);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function publishWorkflow() {
    if (!selectedId) {
      setError('Select or create a workflow before publishing.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.publishWorkflow(selectedId);
      setNotice('Published. Runtime clients see the stripped contract.');
      await refreshList();
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function fetchStripped() {
    if (!slug) {
      setError('Set a slug to fetch the runtime contract.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const contract = await api.getActiveWorkflow(slug);
      setActive(contract);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const previewNodes = nodesFromPreview(preview);

  return (
    <>
      <header className="stage__head">
        <div>
          <p className="kicker">Admin console</p>
          <h1>Workflow publish</h1>
          <p className="lede">Catalog, lint, publish. Switch role to admin — the demo cookie is the credential.</p>
        </div>
        <button className="btn" type="button" onClick={() => void refreshList()} disabled={busy}>
          Refresh list
        </button>
      </header>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="banner banner--warn">{notice}</p> : null}

      <div className="grid-2">
        <div className="stack">
          <section className="panel">
            <p className="panel__stamp">Catalog</p>
            {!listReady ? (
              <p className="empty">
                <span className="spin" aria-hidden="true" /> Loading catalog…
              </p>
            ) : workflows.length === 0 ? (
              <p className="empty">No workflows. Seed the database or create one below.</p>
            ) : (
              <ul className="workflow-list">
                {workflows.map((workflow) => (
                  <li key={workflow.id}>
                    <button
                      type="button"
                      className={workflow.id === selectedId ? 'is-selected' : undefined}
                      data-testid={`workflow-${typeof workflow.slug === 'string' ? workflow.slug : workflow.id}`}
                      onClick={() => setParams({ workflow: workflow.id })}
                    >
                      <strong>{typeof workflow.name === 'string' ? workflow.name : workflow.id}</strong>
                      <div className="help">
                        {[workflow.slug, workflow.id, workflow.status]
                          .filter((part) => typeof part === 'string' && part)
                          .join(' · ')}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <p className="admin-flag">Definition JSON — bindings may be present</p>
            <p className="panel__stamp">Definition</p>
            <div className="stack">
              <div className="row">
                <div className="field field--grow">
                  <label htmlFor="wf-slug">Slug</label>
                  <input id="wf-slug" value={slug} onChange={(event) => setSlug(event.target.value)} />
                </div>
                <div className="field field--grow">
                  <label htmlFor="wf-name">Name</label>
                  <input id="wf-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="wf-def">Workflow JSON</label>
                <textarea
                  id="wf-def"
                  className="textarea"
                  spellCheck={false}
                  value={definitionText}
                  onChange={(event) => setDefinitionText(event.target.value)}
                />
              </div>
              <div className="row">
                <button className="btn btn--gold" type="button" disabled={busy || !slug || !name} onClick={() => void createWorkflow()}>
                  Create
                </button>
                <button className="btn" type="button" disabled={busy || !selectedId} onClick={() => void publishWorkflow()}>
                  Publish
                </button>
              </div>
            </div>
          </section>

          <section className="panel">
            <p className="panel__stamp">Preview inputs</p>
            <p className="help">Dry-run against this version. Lint errors surface here before publish.</p>
            <div className="field mt">
              <label htmlFor="wf-inputs">Inputs JSON</label>
              <textarea
                id="wf-inputs"
                className="textarea textarea--short"
                spellCheck={false}
                value={inputsText}
                onChange={(event) => setInputsText(event.target.value)}
              />
            </div>
            <div className="row mt">
              <button className="btn btn--gold" type="button" disabled={busy} onClick={() => void previewWorkflow()}>
                Preview
              </button>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <p className="panel__stamp">Artifact preview</p>
            <p className="help">Renderer only. Binding keys are ignored by artifact components.</p>
            {previewNodes.length > 0 ? (
              <div className="stack mt-lg">
                {previewNodes.map((node) => (
                  <ArtifactRenderer
                    key={node.id}
                    node={node}
                    disabled
                    onSubmit={() => undefined}
                  />
                ))}
              </div>
            ) : preview ? (
              <pre className="json-view">{JSON.stringify(preview, null, 2)}</pre>
            ) : (
              <p className="empty">Run preview to render whatever the kernel returns.</p>
            )}
          </section>

          <section className="panel">
            <p className="panel__stamp">Runtime contract</p>
            <p className="help">
              Runtime contract after <span className="mono">strip_bindings</span>. Compare with the
              admin JSON: <span className="mono">binding</span> is present there and absent here.
            </p>
            <div className="row mt">
              <button className="btn" type="button" disabled={busy || !slug} onClick={() => void fetchStripped()} data-testid="fetch-stripped">
                Fetch stripped contract
              </button>
              {active ? <StatusPill status={`v${active.version}`} /> : null}
            </div>
            {active ? (
              <div className="stack mt-lg" data-testid="stripped-contract">
                <Factish workflow={active} />
                <pre className="json-view">{JSON.stringify(active, null, 2)}</pre>
                {active.steps?.map((step) => (
                  <ArtifactRenderer
                    key={step.questionId}
                    node={nodeFromStep(step)}
                    disabled
                    onSubmit={() => undefined}
                  />
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <details className="frame mt-xl">
        <summary>Renderer kit</summary>
        <div className="frame__body">
          <RendererKit />
        </div>
      </details>
    </>
  );
}

function Factish({ workflow }: { workflow: ActiveWorkflow }) {
  return (
    <p className="help">
      {workflow.name} · {workflow.slug} · {workflow.workflowId} · version {workflow.version}
    </p>
  );
}

function nodesFromPreview(preview: unknown) {
  if (!preview) return [];
  if (isSessionSnapshot(preview) && preview.currentNode) {
    return [nodeFromSession(preview.currentNode)];
  }
  if (typeof preview === 'object' && preview) {
    const rec = preview as Record<string, unknown>;
    if (rec.currentNode && typeof rec.currentNode === 'object') {
      const node = rec.currentNode as SessionSnapshot['currentNode'];
      if (node) return [nodeFromSession(node)];
    }
    const steps = rec.steps;
    if (Array.isArray(steps)) {
      return (steps as WorkflowStep[])
        .filter((step) => step && typeof step === 'object' && typeof step.questionId === 'string')
        .map(nodeFromStep);
    }
  }
  return [];
}

function parseJson(text: string, label: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function toMessage(err: unknown): string {
  return toUserMessage(err, 'admin');
}
