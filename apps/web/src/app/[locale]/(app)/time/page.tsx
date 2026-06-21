'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useTimeEntries } from '@/lib/hooks';
import { Link } from '@/i18n/navigation';
import { formatDate, formatMoney } from '@/lib/format';
import { LogTimeDialog } from '@/components/lexora/log-time-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { TimeEntryItem } from '@/lib/types';

/** "1h 30m" / "45m" / "2h" a partir de minutos. */
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/**
 * Captura de tiempo sin fricción. Dos focos para reducir el tiempo no registrado y el no facturado:
 * "Mi día" (repaso de lo fichado hoy) y "Sin facturar" (tiempo aún no llevado a factura, agrupado por
 * expediente, con enlace para emitir). Registro rápido desde el botón (y desde ⌘K → Tiempo).
 */
export default function TimePage() {
  const t = useTranslations('time');
  const locale = useLocale();
  // Fecha local (no UTC): toISOString() puede devolver el día siguiente cerca de medianoche.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;

  const dayQuery = useTimeEntries({ mine: true, date: today });
  const unbilledQuery = useTimeEntries({ unbilled: true });

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
        </div>
        <LogTimeDialog />
      </div>

      {/* Mi día */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            {t('today')}
          </h2>
          {dayQuery.data && (
            <span className="text-[13px] text-muted-foreground">
              {fmtDuration(dayQuery.data.totalMinutes)} ·{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(dayQuery.data.totalFee, dayQuery.data.currency, locale)}
              </span>
            </span>
          )}
        </div>
        {dayQuery.isLoading && <Skeleton className="h-28 w-full rounded-xl" />}
        {dayQuery.isError && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {t('loadError')}
          </p>
        )}
        {!dayQuery.isLoading && !dayQuery.isError && (dayQuery.data?.entries.length ?? 0) === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t('todayEmpty')}
            </CardContent>
          </Card>
        )}
        {!dayQuery.isLoading && (dayQuery.data?.entries.length ?? 0) > 0 && (
          <Card className="overflow-hidden">
            <TimeRows entries={dayQuery.data!.entries} currency={dayQuery.data!.currency} />
          </Card>
        )}
      </section>

      {/* Sin facturar */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            {t('unbilled')}
          </h2>
          {unbilledQuery.data && unbilledQuery.data.entries.length > 0 && (
            <span className="text-[13px] text-muted-foreground">
              {t('unbilledTotal')}{' '}
              <span className="font-semibold text-[var(--brand)] tabular-nums">
                {formatMoney(unbilledQuery.data.totalFee, unbilledQuery.data.currency, locale)}
              </span>
            </span>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground">{t('unbilledHint')}</p>
        {unbilledQuery.isLoading && <Skeleton className="h-28 w-full rounded-xl" />}
        {unbilledQuery.isError && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {t('loadError')}
          </p>
        )}
        {!unbilledQuery.isLoading &&
          !unbilledQuery.isError &&
          (unbilledQuery.data?.entries.length ?? 0) === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('unbilledEmpty')}
              </CardContent>
            </Card>
          )}
        {!unbilledQuery.isLoading && (unbilledQuery.data?.entries.length ?? 0) > 0 && (
          <UnbilledByMatter
            entries={unbilledQuery.data!.entries}
            currency={unbilledQuery.data!.currency}
          />
        )}
      </section>
    </div>
  );
}

function TimeRows({ entries, currency }: { entries: TimeEntryItem[]; currency: string }) {
  const t = useTranslations('time');
  const locale = useLocale();
  return (
    <table className="w-full table-fixed text-[13px]">
      <caption className="sr-only">{t('today')}</caption>
      <thead>
        <tr className="border-b text-[10.5px] uppercase tracking-wide text-[var(--text-subtle)]">
          <th scope="col" className="w-[42%] px-4 py-2.5 text-left font-semibold">
            {t('description')}
          </th>
          <th scope="col" className="px-4 py-2.5 text-left font-semibold">
            {t('matter')}
          </th>
          <th scope="col" className="px-4 py-2.5 text-right font-semibold">
            {t('colDuration')}
          </th>
          <th scope="col" className="px-4 py-2.5 text-right font-semibold">
            {t('colAmount')}
          </th>
          <th scope="col" className="w-[96px] px-4 py-2.5 text-right font-semibold">
            {t('colStatus')}
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id} className="border-b last:border-0">
            <td className="truncate px-4 py-2.5" title={e.description}>
              {e.description}
            </td>
            <td
              className="truncate px-4 py-2.5 font-mono text-[11px] text-[var(--text-subtle)]"
              title={e.matter?.reference ?? undefined}
            >
              {e.matter?.reference ?? '—'}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
              {fmtDuration(e.minutes)}
            </td>
            <td className="px-4 py-2.5 text-right font-medium tabular-nums">
              {formatMoney(e.fee, currency, locale)}
            </td>
            <td className="px-4 py-2.5 text-right">
              {e.billed ? (
                <Badge variant="success">{t('billedBadge')}</Badge>
              ) : (
                <Badge variant="warning">{t('unbilledBadge')}</Badge>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UnbilledByMatter({ entries, currency }: { entries: TimeEntryItem[]; currency: string }) {
  const t = useTranslations('time');
  const locale = useLocale();

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { reference: string; title: string; minutes: number; fee: number; items: TimeEntryItem[] }
    >();
    for (const e of entries) {
      const key = e.matter?.id ?? 'none';
      const g = map.get(key) ?? {
        reference: e.matter?.reference ?? '—',
        title: e.matter?.title ?? '—',
        minutes: 0,
        fee: 0,
        items: [],
      };
      g.minutes += e.minutes;
      g.fee += Number(e.fee);
      g.items.push(e);
      map.set(key, g);
    }
    return [...map.entries()].map(([id, g]) => ({ id, ...g }));
  }, [entries]);

  const headerContent = (g: (typeof groups)[number], { link }: { link: boolean }) => (
    <>
      <span className="min-w-0">
        <span className="font-mono text-[11px] text-[var(--text-subtle)]">{g.reference}</span>
        <span className="ml-2 truncate text-[13px] font-medium">{g.title}</span>
      </span>
      <span className="shrink-0 text-[13px] text-muted-foreground">
        {fmtDuration(g.minutes)} ·{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {formatMoney(g.fee.toFixed(2), currency, locale)}
        </span>
        {link && <span className="ml-2 text-[var(--brand)]">{t('invoice')} →</span>}
      </span>
    </>
  );

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <Card key={g.id} className="overflow-hidden">
          {g.id !== 'none' ? (
            <Link
              href={`/matters/${g.id}?tab=costs`}
              className="flex w-full items-center justify-between gap-3 border-b bg-accent/40 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {headerContent(g, { link: true })}
            </Link>
          ) : (
            <div className="flex w-full items-center justify-between gap-3 border-b bg-accent/40 px-4 py-2.5 text-left">
              {headerContent(g, { link: false })}
            </div>
          )}
          <table className="w-full table-fixed text-[12.5px] text-muted-foreground">
            <caption className="sr-only">{g.title}</caption>
            <thead>
              <tr className="border-b text-[10.5px] uppercase tracking-wide text-[var(--text-subtle)]">
                <th scope="col" className="w-[60%] px-4 py-2 text-left font-semibold">
                  {t('description')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  {t('colDuration')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  {t('workedAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="truncate px-4 py-2" title={e.description}>
                    {e.description}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtDuration(e.minutes)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatDate(e.workedAt, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
