'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth';
import { useAuditLog } from '@/lib/hooks';
import { activityLabel } from '@/lib/activity';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function AuditPage() {
  const t = useTranslations('audit');
  const locale = useLocale();
  const { hasRole } = useAuth();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useAuditLog(page, 50);

  if (!hasRole('FIRM_ADMIN')) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center text-sm text-muted-foreground">
        {t('notAuthorized')}
      </div>
    );
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
      </div>

      {isLoading && <Skeleton className="h-72 w-full rounded-xl" />}
      {isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}

      {data && (
        <>
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="grid grid-cols-[150px_1fr_1.4fr_auto] gap-3 border-b px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              <span>{t('colDate')}</span>
              <span>{t('colActor')}</span>
              <span>{t('colAction')}</span>
              <span>{t('colEntity')}</span>
            </div>
            {data.items.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>
            )}
            {data.items.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[150px_1fr_1.4fr_auto] items-center gap-3 border-b px-4 py-2.5 text-[12.5px] last:border-b-0"
              >
                <span className="font-mono text-[11px] text-[var(--text-subtle)]">
                  {formatDateTime(e.createdAt, locale)}
                </span>
                <span className="truncate font-medium">{e.actorName}</span>
                <span className="truncate text-muted-foreground">{activityLabel(e.action)}</span>
                <span className="truncate font-mono text-[10.5px] text-[var(--text-subtle)]">
                  {e.entityType}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
            <span>{t('pageOf', { page: data.page, pages })}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('prev')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
