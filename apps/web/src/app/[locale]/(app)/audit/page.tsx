'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useAuditLog } from '@/lib/hooks';
import { activityLabel, entityLabel } from '@/lib/activity';
import { formatDateTime } from '@/lib/format';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export default function AuditPage() {
  const t = useTranslations('audit');
  const locale = useLocale();
  const { hasRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const { data, isLoading, isError } = useAuditLog(page, 50);

  function goPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.replace(`${pathname}?${params.toString()}`);
  }

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
      <PageHeader
        eyebrow={data ? `${data.total} ${data.total === 1 ? 'evento' : 'eventos'}` : undefined}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      {isLoading && <Skeleton className="h-72 w-full rounded-xl" />}
      {isError && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {t('loadError')}
        </p>
      )}

      {data && (
        <>
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <table className="w-full table-fixed text-[12.5px]">
              <caption className="sr-only">{t('title')}</caption>
              <thead>
                <tr className="border-b text-left text-[10.5px] uppercase tracking-wide text-[var(--text-subtle)]">
                  <th scope="col" className="w-[150px] px-4 py-2.5 font-semibold">
                    {t('colDate')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    {t('colActor')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    {t('colAction')}
                  </th>
                  <th scope="col" className="w-[160px] px-4 py-2.5 font-semibold">
                    {t('colEntity')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      {t('empty')}
                    </td>
                  </tr>
                )}
                {data.items.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] tabular-nums text-[var(--text-subtle)]">
                      {formatDateTime(e.createdAt, locale)}
                    </td>
                    <td className="truncate px-4 py-2.5 font-medium" title={e.actorName}>
                      {e.actorName}
                    </td>
                    <td
                      className="truncate px-4 py-2.5 text-muted-foreground"
                      title={activityLabel(e.action)}
                    >
                      {activityLabel(e.action)}
                    </td>
                    <td
                      className="truncate px-4 py-2.5 text-[11.5px] text-[var(--text-subtle)]"
                      title={entityLabel(e.entityType)}
                    >
                      {entityLabel(e.entityType)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
            <span>{t('pageOf', { page: data.page, pages })}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => goPage(page - 1)}
              >
                {t('prev')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pages}
                onClick={() => goPage(page + 1)}
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
