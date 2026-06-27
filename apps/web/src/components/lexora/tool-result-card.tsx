'use client';

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FolderSearch,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

export type ToolCardData = { tool: string; result: unknown; isError: boolean };

/** Nombre legible de cada herramienta (para la cabecera de la tarjeta). */
const LABELS: Record<string, string> = {
  search_matters: 'Expedientes',
  list_matters_by_status: 'Expedientes',
  get_matter: 'Expediente',
  get_matter_timeline: 'Cronología del expediente',
  find_client: 'Clientes',
  get_client_detail: 'Ficha de cliente',
  list_open_tasks: 'Tareas y plazos',
  list_documents: 'Documentos',
  firm_overview: 'Panorámica del despacho',
  search_firm_knowledge: 'Búsqueda en documentos',
  legal_research: 'Fuentes jurídicas',
  check_conflict_of_interest: 'Conflicto de interés',
  create_task: 'Tarea creada',
  create_client: 'Cliente dado de alta',
  create_matter: 'Expediente abierto',
  create_template: 'Plantilla creada',
  draft_and_save_document: 'Documento guardado',
  apply_presentation_to_matter: 'Checklist aplicado',
};

function asArray(r: Record<string, unknown>): { items: Record<string, unknown>[]; key: string } {
  for (const key of [
    'items',
    'results',
    'matters',
    'clients',
    'events',
    'hits',
    'tasks',
    'documents',
  ]) {
    const v = r[key];
    if (Array.isArray(v)) return { items: v as Record<string, unknown>[], key };
  }
  return { items: [], key: '' };
}

function rowLabel(it: Record<string, unknown>): string {
  return String(
    it.reference ?? it.refLabel ?? it.title ?? it.name ?? it.fullName ?? it.titulo ?? '—',
  );
}

const cardCx =
  'rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[13px]';

/**
 * Tarjeta de resultado de una herramienta del agente (Generative UI): en vez de volcar JSON, presenta
 * el resultado de forma legible. Casos específicos de alto valor (conflicto = semáforo) + un render
 * genérico inteligente (listas, confirmaciones pendientes, resúmenes) para el resto. Tema claro/oscuro.
 */
export function ToolResultCard({ data, loading }: { data: ToolCardData; loading?: boolean }) {
  const label = LABELS[data.tool] ?? data.tool;

  if (loading) {
    return (
      <div className={`${cardCx} flex items-center gap-2 text-muted-foreground`}>
        <Loader2 className="size-3.5 animate-spin" />
        <span className="text-[12px]">{label}…</span>
      </div>
    );
  }

  const r = (typeof data.result === 'object' && data.result ? data.result : {}) as Record<
    string,
    unknown
  >;

  if (data.isError) {
    return (
      <div className={`${cardCx} flex items-center gap-2 text-[var(--danger)]`}>
        <AlertTriangle className="size-3.5" />
        <span>{String(r.message ?? r.error ?? 'La herramienta falló')}</span>
      </div>
    );
  }

  // Pendiente de confirmación (HITL): la acción de escritura NO se ha ejecutado.
  if (r.status === 'requires_confirmation') {
    return (
      <div
        className={`${cardCx} flex items-start gap-2 border-amber-400/40 bg-amber-50 dark:bg-amber-950/30`}
      >
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="font-medium text-amber-800 dark:text-amber-300">
            Pendiente de tu confirmación
          </p>
          <p className="text-amber-900/90 dark:text-amber-200/90">{String(r.summary ?? '')}</p>
        </div>
      </div>
    );
  }

  // Conflicto de interés: semáforo.
  if (data.tool === 'check_conflict_of_interest') {
    const conflict = Boolean(r.hasConflict);
    return (
      <div
        className={`${cardCx} flex items-start gap-2 ${conflict ? 'border-[var(--danger)]/40' : 'border-emerald-500/40'}`}
      >
        {conflict ? (
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
        ) : (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        <div>
          <p
            className={`font-medium ${conflict ? 'text-[var(--danger)]' : 'text-emerald-700 dark:text-emerald-400'}`}
          >
            {conflict ? 'Conflicto detectado' : 'Sin conflicto'}
          </p>
          {typeof r.summary === 'string' && <p className="text-muted-foreground">{r.summary}</p>}
        </div>
      </div>
    );
  }

  // Confirmación de creación (escritura ejecutada).
  if (r.created === true || r.found === false) {
    return (
      <div className={`${cardCx} flex items-center gap-2`}>
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>
          <span className="font-medium">{label}</span>
          {r.reference ? ` · ${String(r.reference)}` : r.name ? ` · ${String(r.name)}` : ''}
        </span>
      </div>
    );
  }

  // Listas (expedientes, clientes, hits, eventos…): cabecera + primeras filas.
  const { items } = asArray(r);
  if (items.length > 0) {
    const Icon = data.tool === 'search_firm_knowledge' ? FolderSearch : FileText;
    return (
      <div className={cardCx}>
        <div className="mb-1 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Icon className="size-3.5 text-[var(--brand)]" />
          <span>
            {label} · {items.length}
          </span>
        </div>
        <ul className="space-y-0.5">
          {items.slice(0, 6).map((it, i) => (
            <li key={i} className="truncate">
              {rowLabel(it)}
              {it.status ? (
                <span className="text-muted-foreground"> · {String(it.status)}</span>
              ) : null}
            </li>
          ))}
          {items.length > 6 && (
            <li className="text-[12px] text-muted-foreground">+{items.length - 6} más</li>
          )}
        </ul>
      </div>
    );
  }

  // Genérico: muestra resumen/mensaje si lo hay; si no, una línea discreta de "consulté X".
  const summary = r.summary ?? r.message ?? r.note;
  return (
    <div className={`${cardCx} flex items-center gap-2 text-muted-foreground`}>
      <Wrench className="size-3.5 shrink-0 text-[var(--brand)]" />
      <span className="truncate">
        <span className="font-medium text-foreground">{label}</span>
        {summary ? ` · ${String(summary)}` : ''}
      </span>
    </div>
  );
}
