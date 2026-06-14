'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useMatters } from '@/lib/hooks';
import { useRouter } from '@/i18n/navigation';
import { docStatusVariant, formatBytes, mimeLabel } from '@/lib/doc-status';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Matter, MatterDocument } from '@/lib/types';

/**
 * Vista global de documentos del despacho. El backend solo expone documentos POR EXPEDIENTE
 * (`GET /documents/by-matter/:id`), así que agregamos en el cliente con useQueries sobre los
 * expedientes (Tanda A: solo frontend, sin mock). Una lista plana enlaza a la ficha de cada documento.
 */
export default function DocumentsOverviewPage() {
  const t = useTranslations('documentsOverview');
  const tStatus = useTranslations('documents.status');
  const locale = useLocale();
  const router = useRouter();

  const mattersQuery = useMatters({ pageSize: 100 });
  const matters = useMemo<Matter[]>(() => mattersQuery.data?.items ?? [], [mattersQuery.data]);

  const docQueries = useQueries({
    queries: matters.map((m) => ({
      queryKey: ['documents', m.id],
      queryFn: () => api.get<MatterDocument[]>(`/documents/by-matter/${m.id}`),
      enabled: matters.length > 0,
    })),
  });

  const rows = useMemo(() => {
    const out: { matter: Matter; doc: MatterDocument }[] = [];
    docQueries.forEach((q, i) => {
      const matter = matters[i];
      if (!matter || !q.data) return;
      for (const doc of q.data) out.push({ matter, doc });
    });
    return out.sort((a, b) => b.doc.createdAt.localeCompare(a.doc.createdAt));
  }, [docQueries, matters]);

  const loading =
    mattersQuery.isLoading || (matters.length > 0 && docQueries.some((q) => q.isLoading));
  const isError = mattersQuery.isError;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
      </div>

      {loading && <Skeleton className="h-64 w-full rounded-xl" />}
      {isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}

      {!loading && !isError && rows.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      )}

      {!loading && !isError && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {rows.map(({ matter, doc }) => {
            const top = doc.versions[0];
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => router.push(`/matters/${matter.id}/documents/${doc.id}`)}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60"
              >
                <span className="flex size-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-[var(--danger-soft)] font-mono text-[9px] font-bold text-[var(--danger)]">
                  {top ? mimeLabel(top.mimeType) : '—'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{doc.name}</div>
                  <div className="font-mono text-[11px] text-[var(--text-subtle)]">
                    {matter.reference}
                    {top ? ` · v${top.version} · ${formatBytes(top.sizeBytes)}` : ''}
                  </div>
                </div>
                <span className="hidden text-[11.5px] text-[var(--text-subtle)] sm:inline">
                  {formatDate(doc.createdAt, locale)}
                </span>
                {top && (
                  <Badge variant={docStatusVariant(top.reviewStatus)}>
                    {tStatus(top.reviewStatus)}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
