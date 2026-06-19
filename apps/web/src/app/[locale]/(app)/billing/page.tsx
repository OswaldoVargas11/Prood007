'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useClients, useMatters } from '@/lib/hooks';
import { useRouter } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { Matter, MatterLedger } from '@/lib/types';

/**
 * Vista global de facturación del despacho. El ledger es POR EXPEDIENTE
 * (`GET /ledger/matter/:id`); agregamos en el cliente con useQueries (Tanda A: solo frontend, sin mock).
 * Resumen del despacho + tabla por expediente que enlaza a la pestaña Costes de cada ficha.
 */
export default function BillingOverviewPage() {
  const t = useTranslations('billingOverview');
  const locale = useLocale();
  const router = useRouter();

  const mattersQuery = useMatters({ pageSize: 100 });
  const clientsQuery = useClients({ pageSize: 100 });
  const matters = useMemo<Matter[]>(() => mattersQuery.data?.items ?? [], [mattersQuery.data]);

  const clientName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clientsQuery.data?.items ?? []) map.set(c.id, c.name);
    return map;
  }, [clientsQuery.data]);

  const ledgerQueries = useQueries({
    queries: matters.map((m) => ({
      queryKey: ['ledger', m.id],
      queryFn: () => api.get<MatterLedger>(`/ledger/matter/${m.id}`),
      enabled: matters.length > 0,
    })),
  });

  const rows = useMemo(() => {
    return ledgerQueries
      .map((q, i) => {
        const matter = matters[i];
        if (!matter || !q.data) return null;
        const billed = q.data.entries
          .filter((e) => e.type === 'INVOICE')
          .reduce((acc, e) => acc + Number(e.amount), 0);
        return {
          matter,
          currency: q.data.currency,
          balance: Number(q.data.balance),
          billed,
          movements: q.data.entries.length,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.billed - a.billed);
  }, [ledgerQueries, matters]);

  // Resumen DESGLOSADO por moneda: no se pueden sumar EUR/USD/DOP en un único total (igual que el panel).
  const summary = useMemo(() => {
    const byCcy = new Map<string, { billed: number; balance: number }>();
    let movements = 0;
    for (const r of rows) {
      const e = byCcy.get(r.currency) ?? { billed: 0, balance: 0 };
      e.billed += r.billed;
      e.balance += r.balance;
      byCcy.set(r.currency, e);
      movements += r.movements;
    }
    const list = [...byCcy.entries()].sort((a, b) => b[1].billed - a[1].billed);
    return {
      movements,
      billed: list.length
        ? list.map(([c, v]) => formatMoney(v.billed, c, locale))
        : [formatMoney(0, 'EUR', locale)],
      balance: list.length
        ? list.map(([c, v]) => formatMoney(v.balance, c, locale))
        : [formatMoney(0, 'EUR', locale)],
    };
  }, [rows, locale]);

  const loading =
    mattersQuery.isLoading || (matters.length > 0 && ledgerQueries.some((q) => q.isLoading));
  const isError = mattersQuery.isError;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
      </div>

      {loading && <Skeleton className="h-64 w-full rounded-xl" />}
      {isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}

      {!loading && !isError && (
        <>
          {/* Resumen del despacho (importes desglosados por moneda) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi label={t('totalBilled')} values={summary.billed} />
            <Kpi label={t('totalBalance')} values={summary.balance} accent />
            <Kpi label={t('totalMovements')} values={[String(summary.movements)]} />
          </div>

          {/* Tabla por expediente */}
          {rows.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
              {t('empty')}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-3 border-b px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                <span>{t('colMatter')}</span>
                <span>{t('colClient')}</span>
                <span className="text-right">{t('colBilled')}</span>
                <span className="text-right">{t('colBalance')}</span>
              </div>
              {rows.map((r) => (
                <button
                  key={r.matter.id}
                  type="button"
                  onClick={() => router.push(`/matters/${r.matter.id}`)}
                  className="grid w-full grid-cols-[1.6fr_1fr_1fr_1fr] items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{r.matter.title}</div>
                    <div className="font-mono text-[11px] text-[var(--text-subtle)]">
                      {r.matter.reference}
                    </div>
                  </div>
                  <span className="truncate text-[12.5px] text-muted-foreground">
                    {clientName.get(r.matter.clientId) ?? '—'}
                  </span>
                  <span className="text-right text-[12.5px] tabular-nums">
                    {formatMoney(r.billed, r.currency, locale)}
                  </span>
                  <span className="text-right text-[12.5px] font-semibold tabular-nums">
                    {formatMoney(r.balance, r.currency, locale)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11.5px] text-[var(--text-subtle)]">{t('hint')}</p>
        </>
      )}
    </div>
  );
}

/** KPI con uno o varios importes (desglose multi-moneda); con una sola moneda se ve como un número grande. */
function Kpi({ label, values, accent }: { label: string; values: string[]; accent?: boolean }) {
  const multi = values.length > 1;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-[11.5px] text-[var(--text-subtle)]">{label}</div>
      <div className={cn('mt-1 space-y-0.5', accent && 'text-[var(--brand)]')}>
        {values.map((v, i) => (
          <div
            key={i}
            className={cn(
              'font-semibold tabular-nums tracking-tight',
              multi ? 'text-[17px]' : 'text-[24px]',
            )}
          >
            {v}
          </div>
        ))}
      </div>
    </div>
  );
}
