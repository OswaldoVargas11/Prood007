'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useClients, useMatters } from '@/lib/hooks';
import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ReceiptText } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
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
        // "Facturado" DESGLOSADO por moneda: las facturas del expediente pueden ser de monedas distintas
        // (EUR/USD/DOP); sumarlas como una sola daría una cifra sin sentido. El SALDO, en cambio, es mono-
        // moneda por expediente (honorarios/costes en la moneda del despacho; las facturas no mueven saldo).
        const billedByCcy = new Map<string, number>();
        for (const e of q.data.entries) {
          if (e.type === 'INVOICE')
            billedByCcy.set(e.currency, (billedByCcy.get(e.currency) ?? 0) + Number(e.amount));
        }
        const billedTotal = [...billedByCcy.values()].reduce((a, b) => a + b, 0); // solo para ordenar
        return {
          matter,
          currency: q.data.currency, // moneda del saldo
          balance: Number(q.data.balance),
          billedByCcy,
          billedTotal,
          movements: q.data.entries.length,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.billedTotal - a.billedTotal);
  }, [ledgerQueries, matters]);

  // Resumen DESGLOSADO por moneda: facturado agregado por moneda de factura; saldo por moneda de expediente.
  const summary = useMemo(() => {
    const billedByCcy = new Map<string, number>();
    const balanceByCcy = new Map<string, number>();
    let movements = 0;
    for (const r of rows) {
      for (const [c, v] of r.billedByCcy) billedByCcy.set(c, (billedByCcy.get(c) ?? 0) + v);
      balanceByCcy.set(r.currency, (balanceByCcy.get(r.currency) ?? 0) + r.balance);
      movements += r.movements;
    }
    const fmtList = (m: Map<string, number>) => {
      const list = [...m.entries()].sort((a, b) => b[1] - a[1]);
      return list.length
        ? list.map(([c, v]) => formatMoney(v, c, locale))
        : [formatMoney(0, 'EUR', locale)];
    };
    return { movements, billed: fmtList(billedByCcy), balance: fmtList(balanceByCcy) };
  }, [rows, locale]);

  /** "Facturado" del expediente, por moneda (unido por « · »); « — » si no hay facturas. */
  const rowBilled = (billedByCcy: Map<string, number>) =>
    billedByCcy.size
      ? [...billedByCcy.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([c, v]) => formatMoney(v, c, locale))
          .join(' · ')
      : '—';

  const loading =
    mattersQuery.isLoading || (matters.length > 0 && ledgerQueries.some((q) => q.isLoading));
  const isError = mattersQuery.isError;
  // Fallo de algún ledger por expediente: los expedientes sí cargan, pero faltan sus movimientos,
  // así que los totales/saldos mostrados están incompletos. Se avisa sin bloquear la vista.
  const partialError = matters.length > 0 && ledgerQueries.some((q) => q.isError);

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {loading && <Skeleton className="h-64 w-full rounded-xl" />}
      {isError && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {t('loadError')}
        </p>
      )}

      {!loading && !isError && (
        <>
          {partialError && (
            <p
              role="alert"
              className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-3 py-2 text-[12.5px] text-foreground"
            >
              {t('partialError')}
            </p>
          )}
          {/* Resumen del despacho (importes desglosados por moneda) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi label={t('totalBilled')} values={summary.billed} />
            <Kpi label={t('totalBalance')} values={summary.balance} accent />
            <Kpi label={t('totalMovements')} values={[String(summary.movements)]} />
          </div>

          {/* Tabla por expediente */}
          {rows.length === 0 ? (
            <div className="rounded-xl border bg-card shadow-sm">
              <EmptyState icon={ReceiptText} title={t('empty')} />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <table className="w-full table-fixed text-[12.5px]">
                <caption className="sr-only">{t('title')}</caption>
                <thead>
                  <tr className="border-b text-[10.5px] uppercase tracking-wide text-[var(--text-subtle)]">
                    <th scope="col" className="w-[40%] px-4 py-2.5 text-left font-semibold">
                      {t('colMatter')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-left font-semibold">
                      {t('colClient')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                      {t('colBilled')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                      {t('colBalance')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.matter.id}
                      className="border-b transition-colors last:border-0 hover:bg-accent/60"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/matters/${r.matter.id}`}
                          className="block min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="truncate text-[13px] font-medium hover:underline">
                            {r.matter.title}
                          </div>
                          <div className="font-mono text-[11px] text-[var(--text-subtle)]">
                            {r.matter.reference}
                          </div>
                        </Link>
                      </td>
                      <td
                        className="truncate px-4 py-3 text-muted-foreground"
                        title={clientName.get(r.matter.clientId) ?? '—'}
                      >
                        {clientName.get(r.matter.clientId) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {rowBilled(r.billedByCcy)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatMoney(r.balance, r.currency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
