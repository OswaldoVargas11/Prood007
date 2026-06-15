'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useTimeEntries } from '@/lib/hooks';
import { useRouter } from '@/i18n/navigation';
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
  const today = new Date().toISOString().slice(0, 10);

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
        {dayQuery.isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}
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
        {unbilledQuery.isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}
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
    <div>
      {entries.map((e) => (
        <div
          key={e.id}
          className="grid grid-cols-[1.6fr_0.8fr_0.7fr_0.8fr_auto] items-center gap-3 border-b px-4 py-2.5 text-[13px] last:border-b-0"
        >
          <span className="truncate">{e.description}</span>
          <span className="truncate font-mono text-[11px] text-[var(--text-subtle)]">
            {e.matter?.reference ?? '—'}
          </span>
          <span className="text-right tabular-nums text-muted-foreground">
            {fmtDuration(e.minutes)}
          </span>
          <span className="text-right font-medium tabular-nums">
            {formatMoney(e.fee, currency, locale)}
          </span>
          <span className="text-right">
            {e.billed ? (
              <Badge variant="success">{t('billedBadge')}</Badge>
            ) : (
              <Badge variant="warning">{t('unbilledBadge')}</Badge>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function UnbilledByMatter({ entries, currency }: { entries: TimeEntryItem[]; currency: string }) {
  const t = useTranslations('time');
  const locale = useLocale();
  const router = useRouter();

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

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <Card key={g.id} className="overflow-hidden">
          <button
            type="button"
            onClick={() => g.id !== 'none' && router.push(`/matters/${g.id}?tab=costs`)}
            className="flex w-full items-center justify-between gap-3 border-b bg-accent/40 px-4 py-2.5 text-left transition-colors hover:bg-accent/70"
          >
            <span className="min-w-0">
              <span className="font-mono text-[11px] text-[var(--text-subtle)]">{g.reference}</span>
              <span className="ml-2 truncate text-[13px] font-medium">{g.title}</span>
            </span>
            <span className="shrink-0 text-[13px] text-muted-foreground">
              {fmtDuration(g.minutes)} ·{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(g.fee.toFixed(2), currency, locale)}
              </span>
              <span className="ml-2 text-[var(--brand)]">{t('invoice')} →</span>
            </span>
          </button>
          <div>
            {g.items.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[1.8fr_0.6fr_0.7fr] items-center gap-3 border-b px-4 py-2 text-[12.5px] text-muted-foreground last:border-b-0"
              >
                <span className="truncate">{e.description}</span>
                <span className="text-right tabular-nums">{fmtDuration(e.minutes)}</span>
                <span className="text-right tabular-nums">{formatDate(e.workedAt, locale)}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
