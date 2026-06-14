'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMatters } from '@/lib/hooks';
import { MATTER_STATUSES } from '@/lib/matter-status';
import { formatDate } from '@/lib/format';
import type { MatterStatus } from '@/lib/types';
import { StatusBadge } from '@/components/lexora/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

export default function MattersPage() {
  const t = useTranslations('matters');
  const tStatus = useTranslations('matters.status');
  const locale = useLocale();
  const [status, setStatus] = useState<MatterStatus | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch, isFetching } = useMatters({
    page,
    pageSize: PAGE_SIZE,
    status,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function pick(s: MatterStatus | undefined) {
    setStatus(s);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {/* Filtro por estado */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={status === undefined} onClick={() => pick(undefined)}>
          {t('filterAll')}
        </FilterChip>
        {MATTER_STATUSES.map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => pick(s)}>
            {tStatus(s)}
          </FilterChip>
        ))}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('col.reference')}</th>
              <th className="px-4 py-3 font-medium">{t('col.title')}</th>
              <th className="px-4 py-3 font-medium">{t('col.type')}</th>
              <th className="px-4 py-3 font-medium">{t('col.status')}</th>
              <th className="px-4 py-3 font-medium">{t('col.opened')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td colSpan={5} className="px-4 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              !isError &&
              data?.items.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-accent"
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/matters/${m.id}`}
                      className="font-medium text-[var(--brand)] hover:underline"
                    >
                      {m.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/matters/${m.id}`} className="hover:underline">
                      {m.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.type}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {formatDate(m.openedAt, locale)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {isError && (
          <div className="space-y-2 p-8 text-center">
            <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {t('retry')}
            </Button>
          </div>
        )}

        {!isLoading && !isError && data?.items.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">{t('empty')}</div>
        )}
      </Card>

      {!isError && data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">{t('pageOf', { page, pages: totalPages })}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-transparent bg-[var(--brand-soft)] text-[var(--brand)]'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
