'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, Loader2, RotateCcw } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  downloadPlaybookReviewPdf,
  usePlaybookReview,
  useRetryPlaybookFindings,
} from '@/lib/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { PlaybookFinding } from '@/lib/types';

/**
 * Informe de una revisión de playbook: un bloque por regla con el veredicto (cumple / desviación /
 * ausente), el análisis, la CITA literal resaltada en su contexto y la redacción alternativa sugerida
 * (posición preferida del despacho). Sondea mientras queden reglas PENDING y exporta a PDF.
 */
export default function PlaybookReviewPage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const t = useTranslations('playbooks');

  const { data: review, isLoading } = usePlaybookReview(reviewId);
  const retry = useRetryPlaybookFindings(reviewId);

  const pendingCount = useMemo(
    () => (review?.findings ?? []).filter((f) => f.status === 'PENDING').length,
    [review?.findings],
  );
  const failedCount = useMemo(
    () => (review?.findings ?? []).filter((f) => f.status === 'FAILED').length,
    [review?.findings],
  );
  const done = useMemo(
    () => (review?.findings ?? []).filter((f) => f.status === 'DONE'),
    [review?.findings],
  );

  if (isLoading || !review) {
    return (
      <div className="mx-auto max-w-[900px] space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      <div>
        <Link href="/playbooks" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('title')}
        </Link>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{review.documentName}</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              {review.playbookName}
              <span className="mx-1.5">·</span>
              {t('summary', {
                compliant: done.filter((f) => f.outcome === 'COMPLIANT').length,
                deviations: done.filter((f) => f.outcome === 'DEVIATION').length,
                missing: done.filter((f) => f.outcome === 'MISSING').length,
              })}
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-[var(--brand)]">
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('reviewing', { count: pendingCount })}
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
              onClick={() =>
                void downloadPlaybookReviewPdf(reviewId, `revision-${review.documentName}.pdf`)
              }
            >
              <Download className="mr-1.5 size-3.5" /> {t('downloadPdf')}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {review.findings.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
      </div>
    </div>
  );
}

function FindingCard({ finding: f }: { finding: PlaybookFinding }) {
  const t = useTranslations('playbooks');

  // Resalta la cita dentro del contexto: el snippet es SUBSTRING literal del contexto guardado.
  const highlighted = useMemo(() => {
    if (!f.context || !f.snippet) return null;
    const idx = f.context.indexOf(f.snippet);
    if (idx < 0) return { before: f.context, hit: '', after: '' };
    return {
      before: f.context.slice(0, idx),
      hit: f.snippet,
      after: f.context.slice(idx + f.snippet.length),
    };
  }, [f.context, f.snippet]);

  return (
    <Card className="space-y-3 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium">{f.topic}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {t('severityLabel')}: {t(`severity.${f.severity}`)}
            {f.confidence && (
              <>
                <span className="mx-1.5">·</span>
                {t('confidenceLabel')}: {t(`confidence.${f.confidence}`)}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {f.dealBreaker && (
            <Badge className="bg-red-600 text-white">{t('dealBreakerBadge')}</Badge>
          )}
          <OutcomeBadge finding={f} />
        </div>
      </div>

      {f.status === 'FAILED' ? (
        <p className="text-[13px] text-red-600">{findingErrorLabel(t, f.error)}</p>
      ) : f.status === 'PENDING' ? (
        <Skeleton className="h-8 w-full max-w-[420px]" />
      ) : (
        <>
          {f.analysis && <p className="text-[13.5px] leading-relaxed">{f.analysis}</p>}
          {f.outcome === 'MISSING' && (
            <p className="text-[12.5px] italic text-muted-foreground">{t('missingHint')}</p>
          )}
          {highlighted && (
            <div>
              <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">
                {t('citation')}
                {f.charStart != null && (
                  <span className="ml-1 font-normal">
                    ({t('offsets', { start: f.charStart, end: f.charEnd ?? 0 })})
                  </span>
                )}
              </p>
              <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-[12.5px] leading-relaxed">
                <span className="text-muted-foreground">…{highlighted.before}</span>
                <mark className="rounded-sm bg-amber-200/70 px-0.5 py-px font-medium text-foreground dark:bg-amber-500/30">
                  {highlighted.hit}
                </mark>
                <span className="text-muted-foreground">{highlighted.after}…</span>
              </div>
            </div>
          )}
          {f.outcome !== 'COMPLIANT' && f.preferredText && (
            <div>
              <p className="mb-1.5 text-[12.5px] font-medium text-[var(--brand)]">
                {t('suggestedText')}
              </p>
              <p className="whitespace-pre-wrap rounded-md border border-dashed border-border bg-[var(--surface-1)] p-3 text-[12.5px] leading-relaxed">
                {f.preferredText}
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function OutcomeBadge({ finding: f }: { finding: PlaybookFinding }) {
  const t = useTranslations('playbooks');
  if (f.status === 'PENDING') return <Badge variant="outline">{t('pendingRule')}</Badge>;
  if (f.status === 'FAILED' || !f.outcome) {
    return (
      <Badge variant="outline" className="text-red-600">
        {t('errors.generic')}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        f.outcome === 'COMPLIANT' && 'text-emerald-600',
        f.outcome === 'DEVIATION' && 'text-amber-600',
        f.outcome === 'MISSING' && 'text-muted-foreground',
      )}
    >
      {t(`outcome.${f.outcome}`)}
    </Badge>
  );
}

/** Etiquetas de error con claves LITERALES (compatibles con tools/i18n-check.mjs). */
function findingErrorLabel(
  t: ReturnType<typeof useTranslations<'playbooks'>>,
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
    case 'reviewError':
      return t('errors.reviewError');
    default:
      return t('errors.generic');
  }
}
