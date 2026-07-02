'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Check,
  FlaskConical,
  LibraryBig,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type {
  AiWorkflow,
  WorkflowCatalogTool,
  WorkflowDryRunResult,
  WorkflowRunResult,
  WorkflowTemplate,
} from '@/lib/types';
import {
  buildSteps,
  stepInputToText,
  validateStep,
  type DraftStep,
  type StepIssue,
} from '@/lib/workflows';
import { Button } from '@/components/ui/button';

/**
 * Vista del BUILDER DE FLUJOS de Zora (workflows builder, LAW-67). Se monta dentro del dock de IA como una
 * vista alterna al chat. Permite: instalar plantillas de la biblioteca (galería), listar/crear/editar/borrar
 * flujos, componer pasos desde el catálogo de herramientas del agente (marcando las de escritura, validando
 * inline contra el esquema), probar en seco (dry-run: solo lecturas) y lanzarlos. Respeta el gate HITL del
 * backend: si un run devuelve `requires_confirmation`, muestra las escrituras pendientes y ofrece relanzar
 * con `allowWrites=true` (acción humana explícita = misma confianza que confirmar en el chat del agente).
 *
 * Todo va contra `/ai/workflows*`. Solo staff con IA (el dock ya lo garantiza antes de montarse).
 */

type EditorState = {
  id: string | null;
  name: string;
  description: string;
  steps: DraftStep[];
};

/** Resultado mostrado en el panel de traza: un run real (con su flujo) o una prueba en seco (dry-run). */
type ResultView = {
  title: string;
  result: {
    status: string;
    stepResults: WorkflowRunResult['stepResults'];
    pendingWrites: WorkflowRunResult['pendingWrites'];
  };
  workflow: AiWorkflow | null;
  dryRun: boolean;
};

const EMPTY_EDITOR: EditorState = { id: null, name: '', description: '', steps: [] };

export function AiWorkflowsView() {
  const t = useTranslations('ai.workflows');
  const [view, setView] = useState<'list' | 'gallery'>('list');
  const [workflows, setWorkflows] = useState<AiWorkflow[] | null>(null);
  const [catalog, setCatalog] = useState<WorkflowCatalogTool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [result, setResult] = useState<ResultView | null>(null);
  // Galería de plantillas.
  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null);
  const [query, setQuery] = useState('');
  const [installingKey, setInstallingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.get<AiWorkflow[]>('/ai/workflows');
      setWorkflows(list);
    } catch {
      setWorkflows([]);
      setError(t('error'));
    }
  }, [t]);

  useEffect(() => {
    void load();
    api
      .get<WorkflowCatalogTool[]>('/ai/workflows/catalog')
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, [load]);

  const openGallery = useCallback(() => {
    setError(null);
    setView('gallery');
    if (templates === null) {
      api
        .get<WorkflowTemplate[]>('/ai/workflows/templates')
        .then(setTemplates)
        .catch(() => {
          setTemplates([]);
          setError(t('error'));
        });
    }
  }, [templates, t]);

  function startCreate() {
    setError(null);
    setEditor({ ...EMPTY_EDITOR, steps: [{ tool: '', inputText: '' }] });
  }

  function startEdit(wf: AiWorkflow) {
    setError(null);
    setEditor({
      id: wf.id,
      name: wf.name,
      description: wf.description ?? '',
      steps: wf.steps.map((s) => ({ tool: s.tool, inputText: stepInputToText(s.input) })),
    });
  }

  async function install(tpl: WorkflowTemplate) {
    setError(null);
    setInstallingKey(tpl.key);
    try {
      await api.post(`/ai/workflows/templates/${tpl.key}/install`);
      await load();
      setView('list');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setInstallingKey(null);
    }
  }

  async function save() {
    if (!editor) return;
    setError(null);
    const name = editor.name.trim();
    if (!name) {
      setError(t('errNoName'));
      return;
    }
    if (editor.steps.length === 0) {
      setError(t('errNoSteps'));
      return;
    }
    const built = buildSteps(editor.steps);
    if (!built.ok) {
      const n = built.index + 1;
      setError(built.error === 'no_tool' ? t('errNoTool', { n }) : t('errInput', { n }));
      return;
    }
    setSaving(true);
    const body = { name, description: editor.description.trim() || undefined, steps: built.steps };
    try {
      if (editor.id) await api.put(`/ai/workflows/${editor.id}`, body);
      else await api.post('/ai/workflows', body);
      setEditor(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setSaving(false);
    }
  }

  async function dryRun() {
    if (!editor) return;
    setError(null);
    const built = buildSteps(editor.steps);
    if (!built.ok) {
      const n = built.index + 1;
      setError(built.error === 'no_tool' ? t('errNoTool', { n }) : t('errInput', { n }));
      return;
    }
    setDryRunning(true);
    try {
      const res = await api.post<WorkflowDryRunResult>('/ai/workflows/dry-run', {
        steps: built.steps,
      });
      setResult({
        title: editor.name.trim() || t('dryRunTitle'),
        result: res,
        workflow: null,
        dryRun: true,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setDryRunning(false);
    }
  }

  async function remove(id: string) {
    setConfirmDeleteId(null);
    try {
      await api.del(`/ai/workflows/${id}`);
      setWorkflows((prev) => prev?.filter((w) => w.id !== id) ?? null);
    } catch {
      setError(t('error'));
    }
  }

  async function launch(wf: AiWorkflow, allowWrites: boolean) {
    setError(null);
    setRunningId(wf.id);
    try {
      const res = await api.post<WorkflowRunResult>(`/ai/workflows/${wf.id}/run`, { allowWrites });
      setResult({ title: wf.name, result: res, workflow: wf, dryRun: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setRunningId(null);
    }
  }

  // ── Resultado de una ejecución o prueba en seco ───────────────────────────
  if (result) {
    return (
      <RunResult
        title={result.title}
        result={result.result}
        catalog={catalog}
        dryRun={result.dryRun}
        rerunning={result.workflow ? runningId === result.workflow.id : false}
        onConfirmWrites={result.workflow ? () => void launch(result.workflow!, true) : undefined}
        onClose={() => setResult(null)}
      />
    );
  }

  // ── Galería de plantillas ─────────────────────────────────────────────────
  if (view === 'gallery') {
    return (
      <TemplateGallery
        templates={templates}
        catalog={catalog}
        query={query}
        onQuery={setQuery}
        installingKey={installingKey}
        error={error}
        onInstall={install}
        onBack={() => {
          setView('list');
          setError(null);
        }}
      />
    );
  }

  // ── Editor de flujo (crear / editar) ──────────────────────────────────────
  if (editor) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-semibold">{editor.id ? t('editTitle') : t('newTitle')}</p>
        </div>
        <label className="mb-1 text-[11px] font-medium text-muted-foreground">{t('name')}</label>
        <input
          value={editor.name}
          onChange={(e) => setEditor({ ...editor, name: e.target.value })}
          placeholder={t('namePlaceholder')}
          className="mb-3 rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--brand-line)]"
        />
        <label className="mb-1 text-[11px] font-medium text-muted-foreground">
          {t('description')}
        </label>
        <input
          value={editor.description}
          onChange={(e) => setEditor({ ...editor, description: e.target.value })}
          placeholder={t('descriptionPlaceholder')}
          className="mb-3 rounded-lg border border-border bg-[var(--surface-1)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--brand-line)]"
        />

        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{t('stepsLabel')}</p>
        <div className="space-y-2">
          {editor.steps.map((step, i) => {
            const tool = catalog.find((c) => c.name === step.tool);
            const issue = catalog.length > 0 ? validateStep(step, catalog) : null;
            const required = tool?.inputSchema?.required ?? [];
            return (
              <div key={i} className="rounded-lg border border-border bg-[var(--surface-1)] p-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">{i + 1}.</span>
                  <select
                    value={step.tool}
                    onChange={(e) => {
                      const steps = [...editor.steps];
                      steps[i] = { ...steps[i], tool: e.target.value };
                      setEditor({ ...editor, steps });
                    }}
                    className="min-w-0 flex-1 rounded-md border border-border bg-card px-1.5 py-1 text-[12px] outline-none focus:border-[var(--brand-line)]"
                  >
                    <option value="">{t('pickTool')}</option>
                    {catalog.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                        {c.isWrite ? ' ✎' : ''}
                      </option>
                    ))}
                  </select>
                  {tool?.isWrite && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      {t('writeBadge')}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={t('removeStep')}
                    onClick={() =>
                      setEditor({ ...editor, steps: editor.steps.filter((_, j) => j !== i) })
                    }
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-[var(--danger)]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {tool && (
                  <p className="mt-1 px-1 text-[11px] leading-snug text-muted-foreground">
                    {tool.description}
                  </p>
                )}
                {required.length > 0 && (
                  <p className="mt-1 px-1 font-mono text-[10.5px] text-muted-foreground/80">
                    {t('schemaRequired', { fields: required.join(', ') })}
                  </p>
                )}
                <textarea
                  value={step.inputText}
                  onChange={(e) => {
                    const steps = [...editor.steps];
                    steps[i] = { ...steps[i], inputText: e.target.value };
                    setEditor({ ...editor, steps });
                  }}
                  placeholder={t('inputPlaceholder')}
                  rows={2}
                  spellCheck={false}
                  className="mt-1.5 w-full rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] outline-none focus:border-[var(--brand-line)]"
                />
                {issue && step.tool && (
                  <p className="mt-1 px-1 text-[11px] font-medium text-[var(--danger)]">
                    {issueMessage(issue, t)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() =>
            setEditor({ ...editor, steps: [...editor.steps, { tool: '', inputText: '' }] })
          }
          className="mt-2 flex items-center gap-1.5 self-start rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[12px] text-muted-foreground hover:border-[var(--brand-line)] hover:text-[var(--brand)]"
        >
          <Plus className="size-3.5" />
          {t('addStep')}
        </button>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground/80">{t('inputHint')}</p>

        {error && <p className="mt-2 text-[12px] text-[var(--danger)]">{error}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void save()} disabled={saving || dryRunning}>
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {t('save')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void dryRun()}
            disabled={saving || dryRunning || editor.steps.length === 0}
          >
            {dryRunning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FlaskConical className="size-3.5" />
            )}
            {t('dryRun')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditor(null)}
            disabled={saving || dryRunning}
          >
            {t('cancel')}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
          {t('dryRunHint')}
        </p>
      </div>
    );
  }

  // ── Lista de flujos ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('listTitle')}
        </p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={openGallery}>
            <LibraryBig className="size-3.5" />
            {t('gallery')}
          </Button>
          <Button size="sm" variant="outline" onClick={startCreate}>
            <Plus className="size-3.5" />
            {t('new')}
          </Button>
        </div>
      </div>

      {error && <p className="mb-2 text-[12px] text-[var(--danger)]">{error}</p>}

      {workflows === null ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : workflows.length === 0 ? (
        <div className="flex flex-col items-center px-2 py-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
            <Workflow className="size-5" />
          </span>
          <p className="mt-3 text-[14px] font-semibold">{t('emptyTitle')}</p>
          <p className="mt-1 max-w-[34ch] text-[12.5px] leading-relaxed text-muted-foreground">
            {t('emptyHint')}
          </p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={openGallery}>
              <LibraryBig className="size-3.5" />
              {t('gallery')}
            </Button>
            <Button size="sm" variant="outline" onClick={startCreate}>
              <Plus className="size-3.5" />
              {t('new')}
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {workflows.map((wf) => (
            <li
              key={wf.id}
              className="rounded-xl border border-border/70 bg-[var(--surface-1)] px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{wf.name}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {t('stepCount', { n: wf.steps.length })}
                  </p>
                  {wf.description && (
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground/90">
                      {wf.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    aria-label={t('run')}
                    onClick={() => void launch(wf, false)}
                    disabled={runningId === wf.id}
                    className="rounded-md p-1.5 text-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-50"
                  >
                    {runningId === wf.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Play className="size-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={t('edit')}
                    onClick={() => startEdit(wf)}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('delete')}
                    onClick={() => setConfirmDeleteId(wf.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-[var(--danger)]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              {confirmDeleteId === wf.id && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-[var(--danger-soft)] px-2 py-1.5">
                  <span className="text-[12px] text-[var(--danger)]">{t('deleteConfirm')}</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void remove(wf.id)}
                      className="rounded-md bg-[var(--danger)] px-2 py-0.5 text-[11px] font-medium text-white"
                    >
                      {t('delete')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-md border px-2 py-0.5 text-[11px]"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Mensaje inline para un problema de validación de un paso. */
function issueMessage(issue: StepIssue, t: ReturnType<typeof useTranslations>): string {
  switch (issue.kind) {
    case 'no_tool':
      return t('pickTool');
    case 'unknown_tool':
      return t('valUnknownTool');
    case 'not_json':
      return t('valNotJson');
    case 'not_object':
      return t('valNotObject');
    case 'missing_required':
      return t('valMissingRequired', { fields: issue.fields.join(', ') });
  }
}

/** Galería de plantillas instalables: buscar por caso de uso, previsualizar pasos e instalar. */
function TemplateGallery({
  templates,
  catalog,
  query,
  onQuery,
  installingKey,
  error,
  onInstall,
  onBack,
}: {
  templates: WorkflowTemplate[] | null;
  catalog: WorkflowCatalogTool[];
  query: string;
  onQuery: (q: string) => void;
  installingKey: string | null;
  error: string | null;
  onInstall: (tpl: WorkflowTemplate) => void;
  onBack: () => void;
}) {
  const t = useTranslations('ai.workflows');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!templates) return [];
    if (!q) return templates;
    return templates.filter((tpl) =>
      [tpl.name, tpl.useCase, tpl.description, tpl.category].some((f) =>
        f.toLowerCase().includes(q),
      ),
    );
  }, [templates, query]);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">{t('galleryTitle')}</p>
        <Button size="sm" variant="ghost" onClick={onBack}>
          <X className="size-3.5" />
          {t('backToList')}
        </Button>
      </div>
      <p className="mb-2 text-[11.5px] leading-snug text-muted-foreground">{t('galleryHint')}</p>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t('gallerySearch')}
          className="w-full rounded-lg border border-border bg-[var(--surface-1)] py-1.5 pl-8 pr-2.5 text-[13px] outline-none focus:border-[var(--brand-line)]"
        />
      </div>

      {error && <p className="mb-2 text-[12px] text-[var(--danger)]">{error}</p>}

      {templates === null ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-2 py-8 text-center text-[12.5px] text-muted-foreground">
          {t('galleryEmpty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((tpl) => (
            <li
              key={tpl.key}
              className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">{tpl.name}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">{tpl.useCase}</p>
                </div>
                {tpl.jurisdiction && (
                  <span className="shrink-0 rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand)]">
                    {tpl.jurisdiction === 'es' ? t('jurisdictionEs') : t('jurisdictionDo')}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground/90">
                {tpl.description}
              </p>

              <p className="mt-2 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground/80">
                {t('stepsPreview')}
              </p>
              <ol className="mt-1 space-y-0.5">
                {tpl.steps.map((s, i) => {
                  const isWrite = catalog.find((c) => c.name === s.tool)?.isWrite ?? false;
                  return (
                    <li key={i} className="flex items-center gap-1.5 text-[11.5px]">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                        {s.tool}
                      </span>
                      {isWrite && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          {t('writeBadge')}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>

              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                <span className="font-medium text-foreground/80">{t('confirmsLabel')}:</span>{' '}
                {tpl.confirms}
              </p>

              <div className="mt-2.5">
                <Button
                  size="sm"
                  onClick={() => onInstall(tpl)}
                  disabled={installingKey === tpl.key}
                >
                  {installingKey === tpl.key ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  {installingKey === tpl.key ? t('installing') : t('install')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Panel de resultado de una ejecución o prueba en seco: traza de pasos + gate HITL para escrituras. */
function RunResult({
  title,
  result,
  catalog,
  dryRun,
  rerunning,
  onConfirmWrites,
  onClose,
}: {
  title: string;
  result: {
    status: string;
    stepResults: WorkflowRunResult['stepResults'];
    pendingWrites: WorkflowRunResult['pendingWrites'];
  };
  catalog: WorkflowCatalogTool[];
  dryRun: boolean;
  rerunning: boolean;
  onConfirmWrites?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('ai.workflows');
  const statusLabel =
    result.status === 'completed'
      ? t('statusCompleted')
      : result.status === 'failed'
        ? t('statusFailed')
        : t('statusPending');
  const statusClass =
    result.status === 'completed'
      ? 'text-emerald-700 dark:text-emerald-400'
      : result.status === 'failed'
        ? 'text-[var(--danger)]'
        : 'text-amber-700 dark:text-amber-400';

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">
            {dryRun && <FlaskConical className="mr-1 inline size-3.5 align-[-2px]" />}
            {title}
          </p>
          <p className={`text-[11.5px] font-medium ${statusClass}`}>
            {dryRun ? `${t('dryRunTitle')} · ${statusLabel}` : statusLabel}
          </p>
        </div>
        <button
          type="button"
          aria-label={t('close')}
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {dryRun && (
        <p className="mb-2 text-[11px] leading-snug text-muted-foreground/80">{t('dryRunHint')}</p>
      )}

      <ol className="space-y-1.5">
        {result.stepResults.map((s, i) => {
          const isWrite = catalog.find((c) => c.name === s.tool)?.isWrite ?? false;
          return (
            <li key={i} className="rounded-lg border border-border bg-[var(--surface-1)] p-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{s.tool}</span>
                {isWrite && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    {t('writeBadge')}
                  </span>
                )}
                <span
                  className={`shrink-0 text-[11px] font-medium ${
                    s.status === 'completed'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : s.status === 'failed'
                        ? 'text-[var(--danger)]'
                        : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {s.status === 'completed'
                    ? t('stepOk')
                    : s.status === 'failed'
                      ? t('stepError')
                      : t('stepPending')}
                </span>
              </div>
              {dryRun && s.status === 'requires_confirmation' ? (
                <p className="mt-1 px-1 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                  {t('dryRunStops')}
                </p>
              ) : (
                s.output && (
                  <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded bg-card px-2 py-1 text-[11px] text-muted-foreground">
                    {s.output}
                  </pre>
                )
              )}
            </li>
          );
        })}
      </ol>

      {!dryRun &&
        result.status === 'requires_confirmation' &&
        result.pendingWrites.length > 0 &&
        onConfirmWrites && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="size-3.5" />
              {t('pendingTitle')}
            </p>
            <ul className="mt-1 space-y-0.5">
              {result.pendingWrites.map((p, i) => (
                <li key={i} className="text-[12px] text-amber-900 dark:text-amber-200">
                  • {p.summary}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={onConfirmWrites} disabled={rerunning}>
                {rerunning ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                {t('confirmRun')}
              </Button>
              <Button size="sm" variant="outline" onClick={onClose} disabled={rerunning}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}
