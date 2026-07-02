'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, Loader2, Plus, RotateCcw, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  downloadTabularExport,
  useAddTabularColumn,
  useRemoveTabularColumn,
  useRetryTabularCells,
  useTabularReview,
} from '@/lib/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { TabularCell, TabularColumn, TabularRowDoc } from '@/lib/types';

/**
 * Tabla de una revisión tabular: documentos (filas) × columnas en lenguaje natural. Cada celda muestra
 * su estado (extrayendo / dato / "no consta" / error) y al pulsarla se abre el panel con la CITA: el
 * fragmento fuente resaltado dentro de su contexto. La página sondea mientras queden celdas PENDING.
 */
export default function TabularReviewPage() {
  const { id, reviewId } = useParams<{ id: string; reviewId: string }>();
  const t = useTranslations('tabularReview');

  const { data: review, isLoading } = useTabularReview(reviewId);
  const addColumn = useAddTabularColumn(reviewId);
  const removeColumn = useRemoveTabularColumn(reviewId);
  const retry = useRetryTabularCells(reviewId);

  const [selected, setSelected] = useState<{
    cell: TabularCell;
    doc: TabularRowDoc;
    column: TabularColumn;
  } | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [columnDraft, setColumnDraft] = useState('');

  const cellByKey = useMemo(() => {
    const map = new Map<string, TabularCell>();
    for (const c of review?.cells ?? []) map.set(`${c.documentId}:${c.columnId}`, c);
    return map;
  }, [review?.cells]);

  const failedCount = useMemo(
    () => (review?.cells ?? []).filter((c) => c.status === 'FAILED').length,
    [review?.cells],
  );
  const pendingCount = useMemo(
    () => (review?.cells ?? []).filter((c) => c.status === 'PENDING').length,
    [review?.cells],
  );

  function submitColumn() {
    const label = columnDraft.trim();
    if (label.length < 2) return;
    addColumn.mutate(label, {
      onSuccess: () => {
        setColumnDraft('');
        setAddingColumn(false);
      },
    });
  }

  if (isLoading || !review) {
    return (
      <div className="mx-auto max-w-[1320px] space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <div>
        <Link
          href={`/matters/${id}/tabular-reviews`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('title')}
        </Link>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{review.title}</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              {t('summaryLine', { docs: review.documents.length, cols: review.columns.length })}
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-[var(--brand)]">
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('extracting', { count: pendingCount })}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {failedCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => retry.mutate()}
                disabled={retry.isPending}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                {t('retryFailed', { count: failedCount })}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void downloadTabularExport(reviewId, 'csv', `${review.title}.csv`)}
            >
              <Download className="mr-1.5 size-3.5" /> CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void downloadTabularExport(reviewId, 'xlsx', `${review.title}.xlsx`)}
            >
              <Download className="mr-1.5 size-3.5" /> XLSX
            </Button>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="min-w-[220px] px-4 py-2 font-medium">{t('documentHeader')}</th>
                {review.columns.map((col) => (
                  <th key={col.id} className="min-w-[180px] px-4 py-2 font-medium">
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <button
                        type="button"
                        aria-label={t('removeColumn')}
                        onClick={() => removeColumn.mutate(col.id)}
                        className="rounded-sm p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  </th>
                ))}
                <th className="w-[44px] px-2 py-2">
                  {addingColumn ? (
                    <div className="flex min-w-[220px] items-center gap-1.5">
                      <Input
                        autoFocus
                        value={columnDraft}
                        onChange={(e) => setColumnDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            submitColumn();
                          }
                          if (e.key === 'Escape') setAddingColumn(false);
                        }}
                        placeholder={t('columnPlaceholder')}
                        maxLength={200}
                        className="h-8"
                      />
                      <Button size="sm" onClick={submitColumn} disabled={addColumn.isPending}>
                        {t('addColumn')}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={t('addColumn')}
                      onClick={() => setAddingColumn(true)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {review.documents.map((doc) => (
                <tr key={doc.id} className="border-b border-border last:border-0">
                  <td className="max-w-[280px] truncate px-4 py-2 font-medium">{doc.name}</td>
                  {review.columns.map((col) => {
                    const cell = cellByKey.get(`${doc.id}:${col.id}`);
                    return (
                      <td key={col.id} className="px-2 py-1.5 align-top">
                        <CellView
                          cell={cell}
                          onClick={() => cell && setSelected({ cell, doc, column: col })}
                        />
                      </td>
                    );
                  })}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <CitationSheet selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function CellView({ cell, onClick }: { cell: TabularCell | undefined; onClick: () => void }) {
  const t = useTranslations('tabularReview');
  if (!cell || cell.status === 'PENDING') {
    return <Skeleton className="h-7 w-full max-w-[160px]" />;
  }
  if (cell.status === 'FAILED') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-md px-2 py-1 text-left text-[12.5px] text-red-600 hover:bg-muted/60"
      >
        {cellErrorLabel(t, cell.error)}
      </button>
    );
  }
  if (cell.notFound) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-md px-2 py-1 text-left text-[12.5px] italic text-muted-foreground hover:bg-muted/60"
      >
        {t('notFound')}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md px-2 py-1 text-left text-[13px] hover:bg-muted/60"
      title={cell.value ?? undefined}
    >
      <span className="line-clamp-2">{cell.value}</span>
    </button>
  );
}

function CitationSheet({
  selected,
  onClose,
}: {
  selected: { cell: TabularCell; doc: TabularRowDoc; column: TabularColumn } | null;
  onClose: () => void;
}) {
  const t = useTranslations('tabularReview');
  const cell = selected?.cell;

  // Resalta la cita dentro del contexto: el snippet es SUBSTRING literal del contexto guardado.
  const highlighted = useMemo(() => {
    if (!cell?.context || !cell.snippet) return null;
    const idx = cell.context.indexOf(cell.snippet);
    if (idx < 0) return { before: cell.context, hit: '', after: '' };
    return {
      before: cell.context.slice(0, idx),
      hit: cell.snippet,
      after: cell.context.slice(idx + cell.snippet.length),
    };
  }, [cell?.context, cell?.snippet]);

  return (
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex flex-col overflow-y-auto sm:max-w-lg">
        {selected && cell && (
          <>
            <SheetHeader className="pb-2">
              <SheetTitle>{selected.column.label}</SheetTitle>
              <SheetDescription className="truncate">{selected.doc.name}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-5 pb-6">
              {cell.status === 'FAILED' ? (
                <p className="text-[13.5px] text-red-600">{cellErrorLabel(t, cell.error)}</p>
              ) : cell.notFound ? (
                <>
                  <p className="text-[15px] font-medium italic text-muted-foreground">
                    {t('notFound')}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground">{t('notFoundHint')}</p>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-[15px] font-medium">{cell.value}</p>
                    {cell.confidence && (
                      <Badge variant="outline" className="mt-1.5">
                        {t('confidenceLabel')}: {confidenceLabel(t, cell.confidence)}
                      </Badge>
                    )}
                  </div>
                  {highlighted && (
                    <div>
                      <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">
                        {t('citation')}
                        {cell.charStart != null && (
                          <span className="ml-1 font-normal">
                            ({t('offsets', { start: cell.charStart, end: cell.charEnd ?? 0 })})
                          </span>
                        )}
                      </p>
                      <div className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-[12.5px] leading-relaxed">
                        <span className="text-muted-foreground">…{highlighted.before}</span>
                        <mark className="rounded-sm bg-amber-200/70 px-0.5 py-px font-medium text-foreground dark:bg-amber-500/30">
                          {highlighted.hit}
                        </mark>
                        <span className="text-muted-foreground">{highlighted.after}…</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Etiquetas de error con claves LITERALES (compatibles con tools/i18n-check.mjs). */
function cellErrorLabel(
  t: ReturnType<typeof useTranslations<'tabularReview'>>,
  code: string | null,
): string {
  switch (code) {
    case 'notExtractable':
      return t('errors.notExtractable');
    case 'noText':
      return t('errors.noText');
    case 'quotaExceeded':
      return t('errors.quotaExceeded');
    case 'citationNotFound':
      return t('errors.citationNotFound');
    case 'badResponse':
      return t('errors.badResponse');
    case 'documentNotFound':
      return t('errors.documentNotFound');
    default:
      return t('errors.generic');
  }
}

function confidenceLabel(
  t: ReturnType<typeof useTranslations<'tabularReview'>>,
  confidence: 'alta' | 'media' | 'baja',
): string {
  switch (confidence) {
    case 'alta':
      return t('confidence.alta');
    case 'media':
      return t('confidence.media');
    default:
      return t('confidence.baja');
  }
}
