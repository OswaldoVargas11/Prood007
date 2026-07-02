'use client';

import { useEffect, useState } from 'react';
import { FileText, Briefcase, UserSearch, Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Citation, ResolvedCitation } from '@/lib/types';

/**
 * Panel lateral que abre la FUENTE de una cita [n] del agente. Pide la fuente a `/ai/citations/resolve`
 * (que aplica los permisos del usuario: nunca devuelve nada que su rol/tenant no pueda ver). Para
 * documentos resalta el fragmento citado dentro de su contexto; para expedientes/clientes muestra la
 * ficha. Se superpone dentro del dock del chat.
 */
export function CitationPanel({ citation, onClose }: { citation: Citation; onClose: () => void }) {
  const [data, setData] = useState<ResolvedCitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    const params = new URLSearchParams({ kind: citation.kind, refId: citation.refId });
    if (citation.quote) params.set('quote', citation.quote);
    api
      .get<ResolvedCitation>(`/ai/citations/resolve?${params.toString()}`)
      .then((r) => {
        if (active) setData(r);
      })
      .catch(() => {
        if (active) setError('No se pudo abrir la fuente (o no tienes acceso a ella).');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [citation]);

  const Icon =
    citation.kind === 'document' ? FileText : citation.kind === 'client' ? UserSearch : Briefcase;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-card animate-in slide-in-from-right duration-150">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
            <Icon className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">
              Fuente de la cita [{citation.n}]
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{citation.label}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 text-[13px]">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-[12.5px] text-[var(--danger)]">{error}</p>
        ) : data ? (
          <CitationBody data={data} />
        ) : null}
      </div>
    </div>
  );
}

function CitationBody({ data }: { data: ResolvedCitation }) {
  if (data.kind === 'document') {
    return (
      <div className="space-y-2">
        <Field label="Documento" value={data.label} />
        {data.matter && <Field label="Expediente" value={data.matter} />}
        {data.context ? (
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Fragmento citado
            </p>
            <p className="rounded-lg border border-border bg-[var(--surface-1)] p-2.5 leading-relaxed">
              <Highlighted context={data.context} highlight={data.highlight} />
            </p>
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            No se pudo localizar el fragmento exacto en el documento (puede ser un PDF/imagen sin
            texto extraíble).
          </p>
        )}
      </div>
    );
  }
  if (data.kind === 'matter') {
    return (
      <div className="space-y-1.5">
        <Field label="Expediente" value={data.reference} />
        <Field label="Asunto" value={data.title} />
        <Field label="Estado" value={data.status} />
        {data.client && <Field label="Cliente" value={data.client} />}
        {data.opposingParty && <Field label="Parte contraria" value={data.opposingParty} />}
        {data.court && <Field label="Juzgado" value={data.court} />}
        {data.caseNumber && <Field label="Nº de autos" value={data.caseNumber} />}
        {data.proceduralPhase && <Field label="Fase" value={data.proceduralPhase} />}
        {data.lawyer && <Field label="Letrado" value={data.lawyer} />}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Field label="Cliente" value={data.name} />
      {data.taxId && <Field label="Identificador fiscal" value={data.taxId} />}
      <Field label="Expedientes" value={String(data.matterCount)} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{value}</span>
    </div>
  );
}

/** Pinta el contexto con la cita resaltada usando los offsets devueltos por el servidor. */
function Highlighted({
  context,
  highlight,
}: {
  context: string;
  highlight: { start: number; end: number } | null;
}) {
  if (!highlight) return <>{context}</>;
  const { start, end } = highlight;
  return (
    <>
      {context.slice(0, start)}
      <mark className="rounded bg-[var(--brand-soft)] px-0.5 text-foreground">
        {context.slice(start, end)}
      </mark>
      {context.slice(end)}
    </>
  );
}
