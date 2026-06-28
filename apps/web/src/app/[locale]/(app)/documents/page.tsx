'use client';

import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useMatters } from '@/lib/hooks';
import { Link } from '@/i18n/navigation';
import { docStatusVariant, formatBytes, mimeLabel } from '@/lib/doc-status';
import { formatDate } from '@/lib/format';
import { FileText, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
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

  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        ({ matter, doc }) =>
          doc.name.toLowerCase().includes(q) || matter.reference.toLowerCase().includes(q),
      )
    : rows;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader
        eyebrow={
          !loading && !isError
            ? `${rows.length} ${rows.length === 1 ? 'documento' : 'documentos'}`
            : undefined
        }
        title={t('title')}
        subtitle={t('subtitle')}
      />

      {loading && <Skeleton className="h-64 w-full rounded-xl" />}
      {isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}

      {!loading && !isError && rows.length === 0 && (
        <div className="rounded-xl border bg-card shadow-sm">
          <EmptyState
            icon={FileText}
            title={t('empty')}
            description={t('emptyHint')}
            action={
              <Button asChild size="sm" variant="outline">
                <Link href="/matters">{t('emptyCta')}</Link>
              </Button>
            }
          />
        </div>
      )}

      {!loading && !isError && rows.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="pl-9"
          />
        </div>
      )}

      {!loading && !isError && rows.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
          {t('noResults', { q: query.trim() })}
        </div>
      )}

      {!loading && !isError && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {filtered.map(({ matter, doc }) => {
            const top = doc.versions[0];
            return (
              <Link
                key={doc.id}
                href={`/matters/${matter.id}/documents/${doc.id}`}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left outline-none transition-colors last:border-b-0 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
